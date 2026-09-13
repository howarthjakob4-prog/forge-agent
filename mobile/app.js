(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const pinInput = $('pin');
  const connectBtn = $('connectBtn');
  const disconnectBtn = $('disconnectBtn');
  const pairCard = $('pairCard');
  const controlCard = $('controlCard');
  const jobCard = $('jobCard');
  const installCard = $('installCard');
  const statusBadge = $('statusBadge');
  const pairMessage = $('pairMessage');
  const projectPath = $('projectPath');
  const task = $('task');
  const model = $('model');
  const runBtn = $('runBtn');
  const stopBtn = $('stopBtn');
  const refreshBtn = $('refreshBtn');
  const jobMeta = $('jobMeta');
  const log = $('log');

  let pin = sessionStorage.getItem('forgeMobilePin') || '';
  let timer = null;

  if (pin) pinInput.value = pin;

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Forge-Pin': pin,
        ...(options.headers || {})
      }
    });
    let body = {};
    try { body = await res.json(); } catch {}
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  function setConnected(connected) {
    pairCard.classList.toggle('hidden', connected);
    controlCard.classList.toggle('hidden', !connected);
    jobCard.classList.toggle('hidden', !connected);
    installCard.classList.toggle('hidden', !connected);
    statusBadge.textContent = connected ? 'Connected' : 'Offline';
    statusBadge.className = `badge ${connected ? 'online' : 'offline'}`;
  }

  function renderStatus(data) {
    projectPath.textContent = data.root || '';
    const job = data.job;
    const running = Boolean(data.running);

    statusBadge.textContent = running ? 'Running' : 'Connected';
    statusBadge.className = `badge ${running ? 'busy' : 'online'}`;
    runBtn.disabled = running;
    stopBtn.disabled = !running;

    if (!job) {
      jobMeta.textContent = 'No task yet.';
      log.textContent = 'Waiting for a task…';
      return;
    }

    const when = job.startedAt ? new Date(job.startedAt).toLocaleString() : '';
    jobMeta.textContent = `${job.state.toUpperCase()} • ${job.model} • ${when}`;
    log.textContent = job.log || 'Task started. Waiting for output…';
    log.scrollTop = log.scrollHeight;
  }

  async function refresh(silent = false) {
    try {
      const data = await api('/api/status');
      setConnected(true);
      renderStatus(data);
      pairMessage.textContent = '';
    } catch (err) {
      if (!silent) pairMessage.textContent = err.message;
      setConnected(false);
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      throw err;
    }
  }

  function startPolling() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => refresh(true).catch(() => {}), 1500);
  }

  connectBtn.addEventListener('click', async () => {
    pin = pinInput.value.trim();
    if (!/^\d{6}$/.test(pin)) {
      pairMessage.textContent = 'Enter the 6-digit PIN shown on your PC.';
      return;
    }
    connectBtn.disabled = true;
    pairMessage.textContent = 'Connecting…';
    try {
      await refresh();
      sessionStorage.setItem('forgeMobilePin', pin);
      startPolling();
    } catch {}
    finally { connectBtn.disabled = false; }
  });

  disconnectBtn.addEventListener('click', () => {
    pin = '';
    sessionStorage.removeItem('forgeMobilePin');
    pinInput.value = '';
    if (timer) clearInterval(timer);
    timer = null;
    setConnected(false);
  });

  runBtn.addEventListener('click', async () => {
    const value = task.value.trim();
    if (!value) return;
    runBtn.disabled = true;
    try {
      await api('/api/run', {
        method: 'POST',
        body: JSON.stringify({ task: value, model: model.value })
      });
      task.value = '';
      await refresh(true);
    } catch (err) {
      alert(err.message);
    } finally {
      runBtn.disabled = false;
    }
  });

  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    try {
      await api('/api/stop', { method: 'POST', body: '{}' });
      await refresh(true);
    } catch (err) {
      alert(err.message);
    }
  });

  refreshBtn.addEventListener('click', () => refresh(true).catch(err => alert(err.message)));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (pin) {
    refresh(true).then(startPolling).catch(() => setConnected(false));
  } else {
    setConnected(false);
  }
})();
