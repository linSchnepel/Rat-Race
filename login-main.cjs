'use strict';

const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = app.isPackaged
  ? path.join(path.dirname(process.execPath), '..')
  : __dirname;
const CONFIG_PATH = path.join(PROJECT_ROOT, 'data', 'config.json');

let win = null;
let resolveContinue = null; // holds the promise resolver waiting for 'continue-auth'

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 600,
    height: 680,
    resizable: false,
    title: 'Rat Race - Setup',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(path.join(__dirname, 'login.html'));
  win.on('closed', () => { win = null; });
});

app.on('window-all-closed', () => app.quit());

// ── Config ────────────────────────────────────────────────────────────────────

ipcMain.handle('load-config', () => {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
});

ipcMain.handle('save-config', (_, config) => {
  try {
    fs.mkdirSync(path.join(PROJECT_ROOT, 'data'), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('save-config error:', err);
    return false;
  }
});

// ── Auth flow ─────────────────────────────────────────────────────────────────

let queue = [];
let current = null;

ipcMain.on('start-auth', (_, platforms) => {
  queue = [...platforms];
  runNext();
});

ipcMain.on('continue-auth', () => {
  if (resolveContinue) {
    resolveContinue();
    resolveContinue = null;
  }
});

function waitForContinue() {
  return new Promise((resolve) => {
    resolveContinue = resolve;
  });
}

async function runNext() {
  if (queue.length === 0) {
    win?.webContents.send('auth-complete');
    return;
  }

  current = queue.shift();
  win?.webContents.send('auth-status', {
    platform: current,
    state: 'running',
    message: 'Opening...',
  });

  try {
    process.env.RAT_RACE_ROOT = PROJECT_ROOT;
    const { runAuth } = await import(require('url').pathToFileURL(
      path.join(__dirname, 'dist', 'scripts', 'login-runner.js')
    ).href);

    const onReady = () => {
      win?.webContents.send('auth-status', {
        platform: current,
        state: 'ready',
        message: 'Logged in',
      });
    };
    await runAuth(current, onReady, waitForContinue);

    win?.webContents.send('auth-status', {
      platform: current,
      state: 'done',
      message: '✓ Saved',
    });
  } catch (err) {
    console.error(`Auth failed for ${current}:`, err);
    win?.webContents.send('auth-status', {
      platform: current,
      state: 'failed',
      message: '✗ Failed',
    });
  }

  runNext();
}