#!/usr/bin/env node
'use strict';

// Forge Agent Mobile Companion
// Runs on the desktop and exposes a small, PIN-protected LAN web UI.
// It uses only Node's built-in HTTP modules, so no extra subscription,
// API key, token purchase, or web framework is required.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const HOST = process.env.FORGE_MOBILE_HOST || '0.0.0.0';
const PORT = Number(process.env.FORGE_MOBILE_PORT || 4173);
const ROOT = path.resolve(process.env.FORGE_MOBILE_DIR || process.cwd());
const PUBLIC_DIR = path.join(__dirname, '..', 'mobile');
const PIN = String(process.env.FORGE_MOBILE_PIN || crypto.randomInt(100000, 999999));
const MAX_LOG_CHARS = 120000;

let active = null;
let lastJob = null;

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(body));
}

function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function authorized(req) {
  const supplied = req.headers['x-forge-pin'];
  return typeof supplied === 'string' && supplied === PIN;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 64 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function appendLog(job, chunk) {
  job.log += String(chunk);
  if (job.log.length > MAX_LOG_CHARS) {
    job.log = job.log.slice(-MAX_LOG_CHARS);
  }
}

function safeModel(value) {
  return value === 'gemini' ? 'gemini' : 'deepseek';
}

function startJob(task, model) {
  if (active && active.state === 'running') {
    throw new Error('A Forge task is already running. Stop it or wait for it to finish.');
  }
  if (!task || typeof task !== 'string' || task.trim().length < 2) {
    throw new Error('Task is required.');
  }

  const job = {
    id: crypto.randomUUID(),
    task: task.trim(),
    model: safeModel(model),
    state: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    log: ''
  };

  const args = [path.join(__dirname, 'index.js'), '--no-tui', '--dir', ROOT, '--model', job.model, '--task', job.task];
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  job.pid = child.pid;
  job.child = child;
  active = job;
  lastJob = job;

  child.stdout.on('data', d => appendLog(job, d));
  child.stderr.on('data', d => appendLog(job, d));
  child.on('error', err => appendLog(job, `\n[mobile] ${err.message}\n`));
  child.on('close', code => {
    job.exitCode = code;
    job.finishedAt = new Date().toISOString();
    job.state = job.state === 'stopping' ? 'stopped' : (code === 0 ? 'completed' : 'failed');
    delete job.child;
    if (active && active.id === job.id) active = null;
  });

  return job;
}

function publicJob(job) {
  if (!job) return null;
  const { child, ...safe } = job;
  return safe;
}

function stopJob() {
  if (!active || active.state !== 'running') return false;
  active.state = 'stopping';
  active.child.kill('SIGTERM');
  setTimeout(() => {
    try {
      if (active && active.state === 'stopping' && active.child) active.child.kill('SIGKILL');
    } catch {}
  }, 4000).unref();
  return true;
}

function serveStatic(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!file.startsWith(PUBLIC_DIR)) return text(res, 403, 'Forbidden');

  fs.readFile(file, (err, data) => {
    if (err) return text(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon'
    }[ext] || 'application/octet-stream';
    text(res, 200, data, type);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    if (!authorized(req)) return json(res, 401, { error: 'Invalid or missing Forge Mobile PIN.' });

    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, {
        ok: true,
        root: ROOT,
        running: Boolean(active && active.state === 'running'),
        job: publicJob(active || lastJob)
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/run') {
      try {
        const body = await readBody(req);
        return json(res, 202, { ok: true, job: publicJob(startJob(body.task, body.model)) });
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/stop') {
      return json(res, 200, { ok: stopJob() });
    }

    return json(res, 404, { error: 'Unknown API route.' });
  }

  serveStatic(req, res);
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) out.push(item.address);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log('\nForge Agent Mobile Companion');
  console.log('--------------------------------');
  console.log(`Project folder: ${ROOT}`);
  console.log(`PIN: ${PIN}`);
  console.log(`On this PC: http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`On your phone: http://${ip}:${PORT}`);
  console.log('\nKeep this terminal open while using the phone companion.');
  console.log('Use only on a trusted private network. The PIN protects the control API.\n');
});
