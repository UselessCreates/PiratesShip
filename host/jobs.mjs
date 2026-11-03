
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

const jobs = new Map();

export function createJob(meta = {}) {
  const job = {
    id: `j_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    status: 'running',
    phase: 'starting',
    createdAt: Date.now(),
    events: [],
    logs: [],
    files: [],
    plan: null,
    error: null,
    ...meta,
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()].map((j) => ({
    id: j.id,
    status: j.status,
    phase: j.phase,
    prompt: j.prompt,
    kind: j.kind,
    dir: j.dir,
    createdAt: j.createdAt,
  }));
}

export function emit(job, type, payload = {}) {
  const event = { jobId: job.id, type, ts: Date.now(), ...payload };
  job.events.push(event);
  if (job.events.length > 4000) job.events.splice(0, 1000);
  if (type === 'log') job.logs.push(event);
  bus.emit('event', event);
  return event;
}

export function log(job, level, text) {
  return emit(job, 'log', { level, text });
}

export function phase(job, name, label) {
  job.phase = name;
  return emit(job, 'phase', { name, label: label || name });
}

export function waitForApproval(job) {
  return new Promise((resolve) => {
    job._approve = (value) => {
      job._approve = null;
      resolve(value);
    };
  });
}

export function approveJob(id, accepted, note = '') {
  const job = jobs.get(id);
  if (!job || !job._approve) return false;
  job._approve({ accepted, note });
  return true;
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  job.status = 'cancelled';
  try {
    job.controller?.abort();
  } catch {}
  emit(job, 'error', { message: 'Cancelled.' });
  return true;
}

export function finishJob(job, result) {
  job.status = 'done';
  job.result = result;
  emit(job, 'done', result);
}
