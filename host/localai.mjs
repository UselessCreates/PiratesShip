
import { run, runStream } from './util.mjs';

const OLLAMA = 'http://127.0.0.1:11434';

export const RECOMMENDED = [
  { id: 'qwen2.5-coder:7b', label: 'Qwen2.5 Coder 7B', size: '~4.7 GB', note: 'Best small model for HTML/CSS/JS output.' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B', size: '~2.0 GB', note: 'Tiny, fast, good for drafts.' },
  { id: 'deepseek-coder-v2:16b', label: 'DeepSeek Coder V2 16B', size: '~8.9 GB', note: 'Stronger code, needs ~10 GB VRAM.' },
  { id: 'qwen2.5-coder:14b', label: 'Qwen2.5 Coder 14B', size: '~9.0 GB', note: 'Best quality that still fits consumer GPUs.' },
];

export async function ollamaInstalled() {
  const r = await run('ollama', ['--version'], { timeoutMs: 10000 });
  return r.code === 0 ? r.out.trim() : null;
}

export async function ollamaStatus() {
  try {
    const res = await fetch(`${OLLAMA}/api/version`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { running: true, version: data.version || 'unknown' };
  } catch {
    return { running: false, version: null };
  }
}

export async function listOllamaModels() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.models || []).map((m) => ({
      id: m.name,
      size: m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '',
      modified: m.modified_at,
    }));
  } catch {
    return [];
  }
}

export async function pullModel(model, onLine) {
  if (!model) throw new Error('Pick a model first.');
  onLine('dim', `ollama pull ${model}`);
  const res = await fetch(`${OLLAMA}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
  }).catch(() => null);
  if (!res || !res.body) {

    const code = await runStream('ollama', ['pull', model], (line, level) => onLine(level === 'err' ? 'warn' : 'dim', line), {
      timeoutMs: 1800000,
    });
    return { ok: code === 0, code };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastPct = -5;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.error) throw new Error(evt.error);
        if (typeof evt.percent === 'number' && evt.percent - lastPct >= 5) {
          lastPct = evt.percent;
          onLine('dim', `${evt.status || 'pulling'} ${evt.percent.toFixed(0)}%`);
        } else if (evt.status && !evt.percent) {
          onLine('dim', evt.status);
        }
      } catch (e) {
        if (String(e.message).match(/error/i)) throw e;
      }
    }
  }
  onLine('ok', `${model} ready`);
  return { ok: true };
}

export async function lmStudioStatus() {
  try {
    const res = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { running: true, models: (data.data || []).map((m) => m.id) };
  } catch {
    return { running: false, models: [] };
  }
}

export async function localSnapshot() {
  const [installed, status, models, lm] = await Promise.all([
    ollamaInstalled(),
    ollamaStatus(),
    listOllamaModels(),
    lmStudioStatus(),
  ]);
  return { ollama: { installed, ...status, models }, lmstudio: lm, recommended: RECOMMENDED };
}
