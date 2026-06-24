'use strict';

const { app, Tray, Menu, nativeImage, Notification } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = __dirname;
const LAST_RUN_PATH = path.join(PROJECT_ROOT, 'data', 'last_run.json');

let tray = null;
let scraperProcess = null;

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Prevent app from appearing in taskbar / dock
  if (process.platform === 'win32') app.setAppUserModelId('com.ratrace.jobfinder');

  tray = new Tray(path.join(PROJECT_ROOT, 'rat-race.ico'));
  tray.setToolTip('Rat Race');

  refreshTray('idle');
  maybeRunScraper();
});

app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  if (scraperProcess) {
    scraperProcess.kill();
    scraperProcess = null;
  }
});

// ─── Scraper ─────────────────────────────────────────────────────────────────

function maybeRunScraper() {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf8'));
    if (lastRun.date === today && lastRun.status === 'success') {
      console.log('Already ran successfully today, skipping.');
      refreshTray('idle');
      return;
    }
  } catch {
    // Initial run. last_run.json has not been created.
  }

  runScraper();
}

function runScraper() {
  if (scraperProcess) return; // already running

  refreshTray('running');

  scraperProcess = spawn(
    process.execPath, // node binary
    [path.join(PROJECT_ROOT, 'dist', 'src', 'index.js')],
    {
      env: {
        ...process.env,
        RAT_RACE_ROOT: PROJECT_ROOT,
      },
      stdio: 'pipe',
    }
  );

  scraperProcess.stdout.on('data', (d) => process.stdout.write(d));
  scraperProcess.stderr.on('data', (d) => process.stderr.write(d));

  scraperProcess.on('close', (code) => {
    scraperProcess = null;

    if (code === 0) {
      refreshTray('idle');
      notify('Rat Race', 'Done. Check today\'s results.');
    } else {
      refreshTray('error');
      notify('Rat Race', `Scraper exited with code ${code}. Check logs.`);
    }
  });

  scraperProcess.on('error', (err) => {
    scraperProcess = null;
    refreshTray('error');
    notify('Rat Race', `Failed to start scraper: ${err.message}`);
  });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function refreshTray(status) {
  let lastRun = null;
  try {
    lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf8'));
  } catch {}

  const statusLabel = { idle: 'Idle', running: 'Running...', error: 'Error' }[status] ?? status;

  const lastRunLabel = lastRun
    ? `Last run: ${lastRun.date} at ${lastRun.completedAt}` // TODO: - ${lastRun.jobCount} jobs
    : 'Never run';

  tray.setToolTip(`Rat Race - ${statusLabel}`);

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Rat Race', enabled: false },
    { label: statusLabel, enabled: false },
    { label: lastRunLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Run now',
      enabled: status !== 'running',
      click: () => runScraper(),
    },
    {
      label: "Open today's results",
      click: () => openTodaysResults(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        if (scraperProcess) scraperProcess.kill();
        app.quit();
      },
    },
  ]));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openTodaysResults() {
  const today = new Date().toISOString().slice(0, 10);
  const htmlPath = path.join(PROJECT_ROOT, 'data', 'pages', `jobs_${today}.html`);
  if (fs.existsSync(htmlPath)) {
    require('electron').shell.openPath(htmlPath);
  } else {
    notify('Rat Race', "No results file for today yet.");
  }
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}