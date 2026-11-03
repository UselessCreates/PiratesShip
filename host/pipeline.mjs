
import path from 'node:path';
import fs from 'node:fs';
import { recon, normalizeUrl } from './recon.mjs';
import {
  makePlan,
  runBuild,
  verifyBuild,
  repairBuild,
  ensureLocalAssets,
  modelReady,
  modelLabel,
} from './build.mjs';
import { outputDir, saveSession, config } from './store.mjs';
import { emit, log, phase, waitForApproval, finishJob } from './jobs.mjs';
import { slugify, ensureDir, writeText, truncate } from './util.mjs';

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function runPipeline(job, { prompt, kind = 'site', url = null, autoApprove = false }) {
  job.controller = new AbortController();
  const signal = job.controller.signal;

  const guessUrl = kind === 'site' || kind === 'app' ? normalizeUrl(url || prompt) : url ? normalizeUrl(url) : null;
  const folder = `${stamp()}-${slugify(guessUrl || prompt, 'build')}`;
  const dir = path.join(outputDir(), folder);
  ensureDir(dir);
  job.dir = dir;

  emit(job, 'start', {
    prompt,
    kind,
    url: guessUrl,
    dir,
    folder,
    model: modelLabel(),
    free: !modelReady(),
  });
  log(job, 'info', `Build folder · ${dir}`);

  try {

    phase(job, 'recon', 'Gathering evidence');
    const { dossier, markdown } = await recon({
      target: prompt,
      kind,
      url: guessUrl,
      brief: prompt,
      outDir: dir,
      log: (level, text) => log(job, level, text),
      shots: config().recon.shots,
      pages: config().recon.pages,
      signal,
    });
    if (signal.aborted) throw new Error('Cancelled.');
    emit(job, 'dossier', {
      url: dossier.url,
      rea: dossier.rea ? { ok: dossier.rea.ok, tool: dossier.rea.tool, reason: dossier.rea.reason } : null,
      shots: dossier.shots,
      pages: dossier.pages,
      palette: dossier.palette,
      fonts: dossier.fonts,
      sources: dossier.webIntel.slice(0, 8),
      stats: {
        shots: dossier.shots.length,
        pages: dossier.pages.length,
        palette: dossier.palette.length,
        sources: dossier.webIntel.length,
        requests: dossier.requests,
        seconds: Math.round(dossier.elapsedMs / 1000),
      },
    });
    writeText(path.join(dir, 'recon-summary.md'), markdown);

    phase(job, 'plan', 'Writing the reconstruction plan');
    const plan = await makePlan({
      dossierJson: dossier,
      kind,
      brief: prompt,
      log: (level, text) => log(job, level, text),
      signal,
    });
    writeText(path.join(dir, 'plan.md'), plan);
    emit(job, 'plan', { markdown: plan, path: path.join(dir, 'plan.md') });

    if (!autoApprove) {
      phase(job, 'review', 'Waiting for your go-ahead');
      emit(job, 'ask', { message: 'Review the plan, then build.' });
      const decision = await waitForApproval(job);
      if (!decision || !decision.accepted) {
        job.status = 'cancelled';
        emit(job, 'error', { message: 'Build cancelled at review.' });
        return;
      }
      if (decision.note) log(job, 'info', `Your note: ${decision.note}`);
    }

    phase(job, 'build', 'Building');
    const siteDir = path.join(dir, 'site');
    let files = await runBuild({
      plan,
      dossierJson: dossier,
      kind,
      brief: prompt,
      dir: siteDir,
      log: (level, text) => log(job, level, text),
      signal,
    });
    if (signal.aborted) throw new Error('Cancelled.');
    emit(job, 'files', { files: files.map((f) => ({ path: f.path, bytes: f.content.length })) });

    phase(job, 'verify', 'Verifying the build');
    let check = verifyBuild(siteDir, { dossier });
    for (const p of check.problems) log(job, 'warn', p);
    for (const n of check.notes) log(job, 'dim', n);

    if (!check.ok && modelReady() && check.problems.length) {
      if (signal.aborted) throw new Error('Cancelled.');
      log(job, 'info', 'Asking the model for one repair pass…');
      const fixed = await repairBuild({
        dir: siteDir,
        problems: check.problems,
        log: (level, text) => log(job, level, text),
        signal,
      });
      if (fixed) {
        check = verifyBuild(siteDir, { dossier });
        for (const p of check.problems) log(job, 'warn', `still: ${p}`);
      }
    }

    const healed = ensureLocalAssets(siteDir, dossier, (level, text) => log(job, level, text));
    if (healed.length) {
      check = verifyBuild(siteDir, { dossier });
      for (const p of check.problems) log(job, 'warn', `still: ${p}`);
    }

    const index = path.join(siteDir, 'index.html');
    const result = {
      dir,
      siteDir,
      index: fs.existsSync(index) ? index : null,
      files: files.map((f) => f.path),
      verify: check,
      planPath: path.join(dir, 'plan.md'),
      dossierPath: path.join(dir, '_recon', 'dossier.md'),
      model: modelLabel(),
      free: !modelReady(),
      url: `/out/${encodeURIComponent(folder)}/site/index.html`,
    };
    writeText(
      path.join(dir, 'SESSION.md'),
      `# Session ${job.id}\n\nPrompt: ${prompt}\nKind: ${kind}\nReference: ${guessUrl || 'none'}\nModel: ${result.model}\n\n` +
        `Files: ${result.files.join(', ')}\n\n${truncate(plan, 2000)}\n`
    );
    saveSession({
      id: job.id,
      createdAt: new Date().toISOString(),
      prompt,
      kind,
      url: guessUrl,
      dir,
      model: result.model,
      files: result.files,
    });
    phase(job, 'done', 'Done');
    finishJob(job, result);
  } catch (err) {
    job.status = job.status === 'cancelled' ? 'cancelled' : 'error';
    job.error = err.message;
    emit(job, 'error', { message: err.message || String(err) });
  }
}
