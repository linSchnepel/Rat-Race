'use strict';

const { app, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = __dirname;
const LAST_RUN_PATH = path.join(PROJECT_ROOT, 'data', 'last_run.json');

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.ratrace.jobfinder');
  await maybeRunScraper();
});

app.on('window-all-closed', () => {});

async function maybeRunScraper() {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf8'));
    if (lastRun.date === today && lastRun.status === 'success') {
      console.log('Already ran successfully today, exiting.');
      app.quit();
      return;
    }
  } catch {
    // first run
  }

  await runScraper();
}

async function runScraper() {
  try {
    process.env.RAT_RACE_ROOT = PROJECT_ROOT;
    const { run } = await import(require('url').pathToFileURL(
      path.join(PROJECT_ROOT, 'dist', 'src', 'index.js')
    ).href);
    await run();
    console.log('1');
    notify('Rat Race', "Job finder complete. Check today's results.");
  } catch (err) {
    console.error('Scraper error:', err);
    notify('Rat Race', 'Something went wrong. Check with your developer.');
  }
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    setTimeout(() => app.quit(), 3000);
  } else {
    app.quit();
  }
}