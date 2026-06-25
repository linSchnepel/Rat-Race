'use strict';

const { app, Notification } = require('electron');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = __dirname;
const LAST_RUN_PATH = path.join(PROJECT_ROOT, 'data', 'last_run.json');

const nodeExecutable = execSync('where node', { encoding: 'utf8' })
  .trim().split('\n')[0].trim();

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.ratrace.jobfinder');
  maybeRunScraper();
});

app.on('window-all-closed', () => {}); // prevent default quit, we control it

function maybeRunScraper() {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf8'));
    if (lastRun.date === today && lastRun.status === 'success') {
      console.log('Already ran successfully today, exiting.');
      app.quit();
      return;
    }
  } catch {
    // No last_run.json yet — first run
  }

  runScraper();
}

function runScraper() {
  const scraperProcess = spawn(
    nodeExecutable,
    [
      path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(PROJECT_ROOT, 'dist', 'src', 'index.js'),
    ],
    {
      env: { ...process.env, RAT_RACE_ROOT: PROJECT_ROOT },
      stdio: 'pipe',
    }
  );

  scraperProcess.stdout.on('data', (d) => process.stdout.write(d));
  scraperProcess.stderr.on('data', (d) => process.stderr.write(d));

  scraperProcess.on('close', (code) => {
    if (code === 0) {
      notify('Rat Race', 'Done — check today\'s results.');
    } else {
      notify('Rat Race', `Something went wrong (code ${code}). Check with your developer.`);
    }
    app.quit();
  });

  scraperProcess.on('error', (err) => {
    console.error('Failed to start scraper:', err);
    notify('Rat Race', 'Failed to start. Check with your developer.');
    app.quit();
  });
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}