import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { JobRecord, CompanyRecord } from '../core/types.js';
import { formatSalary } from '../utils/salary.js';
import { evaluateAlerts } from '../core/alerts.js';
import { projectRoot } from '../utils/paths.js';
import { readFileSync as rfs } from 'fs';

function getAlertsData() {
  return JSON.parse(
    rfs(join(projectRoot, 'data', 'alerts.json'), 'utf8')
  );
}

function getOutputPath(mode: 'jobs' | 'companies', fileAlreadyCreated: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  const outDir = join(projectRoot, 'data', 'pages');
  mkdirSync(outDir, { recursive: true });

  const base = join(outDir, `${mode}_${today}`);
  if (!existsSync(`${base}.html`) || fileAlreadyCreated) {
    return `${base}.html`;
  } else {
    let i = 1;
    while (existsSync(`${base}-${i}.html`)) i++;
    return `${base}-${i}.html`;
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function setupPage(mode: 'jobs' | 'companies'): void {
  if (!process.env.RAT_RACE_ROOT) {
    return;
  }
  
  const outPath = getOutputPath(mode, false);
  const today = new Date().toISOString().slice(0, 10);

  const title = mode === 'jobs'
    ? 'Rat Race - Jobs'
    : 'Rat Race - Companies';

  const accentColor = mode === 'jobs' ? '#facc15' : '#22d3ee';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - ${today}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      padding: 2rem;
      max-width: 860px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #2a2a2a;
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }

    header h1 { font-size: 1.3rem; color: #fff; }
    header .date { font-size: 0.82rem; color: #555; }
    .count { color: ${accentColor}; }

    /* ── Job cards ── */
    .job {
      border: 1px solid #222;
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1rem;
      background: #161616;
    }

    .job.standout { border-color: #7f1d1d; background: #1a1010; }

    .job-header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.3rem 0.5rem; }
    .job-company { font-size: 1rem; font-weight: 600; color: #fff; }
    .job-sep { color: #444; }
    .job-title { font-size: 1rem; font-weight: 600; color: #facc15; }
    .star { color: #ef4444; }

    .job-meta {
      margin-top: 0.5rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem 0.85rem;
      font-size: 0.8rem;
      color: #666;
    }

    .remote { color: #4ade80; }
    .easy { color: #38bdf8; }
    .promoted { color: #444; }

    .skills { margin-top: 0.6rem; font-size: 0.8rem; line-height: 1.6; }
    .skill-label { color: #555; margin-right: 0.3rem; }
    .skill-standout { color: #ef4444; font-weight: 600; }
    .skill-match { color: #60a5fa; }

    .job-url { margin-top: 0.75rem; font-size: 0.78rem; }
    .job-url a { color: #444; text-decoration: underline; word-break: break-all; }
    .job-url a:hover { color: #aaa; }

    /* ── Company cards ── */
    .company {
      border: 1px solid #222;
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1rem;
      background: #161616;
    }

    .company-name { font-size: 1rem; font-weight: 600; color: #fff; }
    .company-url { margin-top: 0.5rem; font-size: 0.78rem; }
    .company-url a { color: #444; text-decoration: underline; word-break: break-all; }
    .company-url a:hover { color: #aaa; }

    /* ── Counter (updated on each append) ── */
    #count { color: ${accentColor}; }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <span class="date">${today} - <span id="count">0</span> ${mode === 'jobs' ? 'jobs' : 'companies'}</span>
  </header>
  <main></main>
  <script>
    // Recount cards on load so count is always accurate
    const cards = document.querySelectorAll('.job, .company');
    document.getElementById('count').textContent = cards.length;
  </script>
</body>
</html>`;

  writeFileSync(outPath, html, 'utf8');
}

// ── Append jobs ───────────────────────────────────────────────────────────────

export function appendJobs(jobs: JobRecord[]): void {
  if (jobs.length === 0) return;

  const outPath = getOutputPath('jobs', true);
  if (!existsSync(outPath)) setupPage('jobs');

  const cards = jobs.map(jobCard).join('\n');
  insertBeforeMain(outPath, cards);
}

// ── Append companies ──────────────────────────────────────────────────────────

export function appendCompanies(companies: CompanyRecord[]): void {
  if (companies.length === 0) return;

  const outPath = getOutputPath('companies', true);
  if (!existsSync(outPath)) setupPage('companies');

  const cards = companies.map(companyCard).join('\n');
  insertBeforeMain(outPath, cards);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function insertBeforeMain(filePath: string, html: string): void {
  const content = readFileSync(filePath, 'utf8');
  const updated = content.replace('</main>', `${html}\n</main>`);
  writeFileSync(filePath, updated, 'utf8');
}

function jobCard(job: JobRecord): string {
  const alerts = getAlertsData();
  const triggered = evaluateAlerts(job, alerts.rules);
  const highestPriority = triggered.at(-1);
  const isStandout = !!highestPriority && highestPriority !== 'newJob';

  const locationHtml = job.isRemote
    ? `<span class="remote">Remote</span>${job.locationRaw ? ` <span>· ${esc(job.locationRaw)}</span>` : ''}`
    : `<span>${esc(job.locationRaw || 'Location unknown')}</span>`;

  const metaParts: string[] = [locationHtml];
  if (job.salary) metaParts.push(`<span>${esc(formatSalary(job.salary))}</span>`);
  if (job.employmentType) metaParts.push(`<span>${esc(job.employmentType)}</span>`);
  if (job.experience) metaParts.push(`<span>${esc(job.experience.raw)}</span>`);
  if (job.easyApply) metaParts.push(`<span class="easy">Easy Apply</span>`);
  if (job.isBoosted) metaParts.push(`<span class="promoted">Promoted</span>`);
  if (job.applicantCount) metaParts.push(`<span class="promoted">${esc(job.applicantCount)}</span>`);
  if (job.postedAge) metaParts.push(`<span class="promoted">${esc(job.postedAge)}</span>`);

  const standoutSkills = job.skillsStandout
    .map(s => `<span class="skill-standout">${esc(s)}</span>`).join(', ');
  const matchedSkills = job.skillsMatched
    .filter(s => !job.skillsStandout.includes(s))
    .map(s => `<span class="skill-match">${esc(s)}</span>`).join(', ');

  return `
  <div class="job${isStandout ? ' standout' : ''}">
    <div class="job-header">
      <span class="job-company">${esc(job.company)}</span>
      <span class="job-sep">-</span>
      <span class="job-title">${esc(job.title)}</span>
      ${isStandout ? '<span class="star">★</span>' : ''}
    </div>
    <div class="job-meta">${metaParts.join('')}</div>
    ${standoutSkills ? `<div class="skills"><span class="skill-label">Standout:</span>${standoutSkills}</div>` : ''}
    ${matchedSkills ? `<div class="skills"><span class="skill-label">Skills:</span>${matchedSkills}</div>` : ''}
    <div class="job-url"><a href="${esc(job.url)}" target="_blank">${esc(job.url)}</a></div>
  </div>`;
}

function companyCard(company: CompanyRecord): string {
  return `
  <div class="company">
    <div class="company-name">${esc(company.companyName)}</div>
    <div class="company-url"><a href="${esc(company.jobBoardUrl)}" target="_blank">${esc(company.jobBoardUrl)}</a></div>
  </div>`;
}

function esc(str: string): string {
  if (!str) {
    return '';
  }
  
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}