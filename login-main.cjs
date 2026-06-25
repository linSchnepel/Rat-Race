'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = __dirname;
let win = null;
let runnerProcess = null;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 420,
    height: 480,
    resizable: false,
    title: 'Rat Race — Login Setup',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // TODO: change
  win.loadFile(path.join(PROJECT_ROOT, 'login.html'));
  win.on('closed', () => { win = null; });
});

app.on('window-all-closed', () => app.quit());

// ─── Auth flow ────────────────────────────────────────────────────────────────

let queue = [];
let current = null;

ipcMain.on('start-auth', (_, platforms) => {
  queue = [...platforms];
  runNext();
});

ipcMain.on('continue-auth', () => {
  if (runnerProcess) {
    // Signal runner to save and close
    runnerProcess.stdin.write('\n');
  }
});

function runNext() {
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

  // Compile first if needed
  const nodeLocation = require('child_process').execSync('where node', { encoding: 'utf8' }).trim().split('\n')[0].trim();

  runnerProcess = spawn(
    nodeLocation,
    [
      path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(PROJECT_ROOT, 'scripts', 'login-runner.ts'),
      current,
    ],
    {
      env: { ...process.env, RAT_RACE_ROOT: PROJECT_ROOT },
      stdio: ['pipe', 'pipe', 'inherit'],
    }
  );

  //console.log(runnerProcess);

  runnerProcess.on('error', (err) => {
    console.error('Spawn error:', err);
  });


console.log(runnerProcess.stdout);

  runnerProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();

    if (msg.includes('READY_TO_SAVE')) {
      win?.webContents.send('auth-status', {
        platform: current,
        state: 'ready',
        message: 'Logged in',
      });
    }

    if (msg.includes('SAVE_OK')) {
      win?.webContents.send('auth-status', {
        platform: current,
        state: 'done',
        message: '✓ Saved',
      });
      runnerProcess = null;
      runNext();
    }

    if (msg.includes('SAVE_FAILED') || msg.includes('AUTH_FAILED')) {
      win?.webContents.send('auth-status', {
        platform: current,
        state: 'failed',
        message: '✗ Failed',
      });
      runnerProcess = null;
      runNext();
    }
  });

  runnerProcess.on('error', (err) => {
    console.error('Runner error:', err);
    win?.webContents.send('auth-status', {
      platform: current,
      state: 'failed',
      message: '✗ Error',
    });
    runnerProcess = null;
    runNext();
  });
}