'use strict';

const { app, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = app.isPackaged
  ? path.join(path.dirname(process.execPath), '..')
  : __dirname;
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
    const lastRunTime = new Date(lastRun.completedAt ? `${lastRun.date}T${lastRun.completedAt}` : lastRun.date);
    const hoursSince = (Date.now() - lastRunTime.getTime()) / (1000 * 60 * 60);

    if (hoursSince < 3 && lastRun.status === 'success') { //TODO: config?
      console.log('Ran less than 3 hours ago, exiting.');
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
      path.join(__dirname, 'dist', 'src', 'index.js')
    ).href);
    await run();
    notify('Rat Race', "Job finder complete. Check today's results.");
  } catch (err) {
    writeLog(`Scraper error: ${err instanceof Error ? err.stack : String(err)}`);
    notify('Rat Race', 'Something went wrong. Check with your developer.');
  }
}

process.on('uncaughtException', (err) => {
  writeLog(`Uncaught exception: ${err.stack}`);
  notify('Rat Race', 'Something went wrong. Check with your developer.');
});

process.on('unhandledRejection', (reason) => {
  writeLog(`Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
  notify('Rat Race', 'Something went wrong. Check with your developer.');
});

function writeLog(msg) {
  try {
    const logDir = path.join(PROJECT_ROOT, 'logs');
    require('fs').mkdirSync(logDir, { recursive: true });
    require('fs').appendFileSync(
      path.join(logDir, 'rat-race.log'),
      `[${new Date().toISOString()}] ${msg}\n`,
      'utf8'
    );
  } catch {}
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    setTimeout(() => app.quit(), 3000);
  } else {
    app.quit();
  }
}