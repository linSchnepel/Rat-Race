import chalk from 'chalk';
import type { CompanyRecord, JobRecord } from '../core/types.js';
import { formatSalary } from "../utils/salary.ts";
import { evaluateAlerts } from '../core/alerts.ts';

import alerts from "../../data/alerts.json" with { type: "json" };
import { sounds } from '../utils/audio.ts';

const DIVIDER = chalk.gray('─'.repeat(72));

export function render(jobs: JobRecord[]): void {
  if (jobs.length === 0) return;

  console.log('\n' + chalk.bold.green(`✦ ${jobs.length} new job${jobs.length === 1 ? '' : 's'} found\n`));

  //sounds["newJob" as keyof typeof sounds]?.();
  for (const job of jobs) {
    renderJob(job);
  }
}

function renderJob(job: JobRecord): void {
  const triggeredSounds = evaluateAlerts(job, alerts.rules);
  const highestPriority = triggeredSounds.at(-1); // last rule = highest priority
  if (highestPriority) {
    sounds[highestPriority as keyof typeof sounds]?.();
  }

  const companyStr = chalk.bold.white(job.company);
  const titleStr = chalk.bold.yellow(job.title);
  const isStandout = highestPriority && highestPriority !== 'newJob' ? true : false;
  console.log(`${companyStr}  ${chalk.gray('—')}  ${titleStr}` + (isStandout ? chalk.red(' ★') : ''));

  const locationStr = job.isRemote
    ? chalk.green('Remote') + (job.locationRaw ? chalk.gray(` · ${job.locationRaw}`) : '')
    : chalk.gray(job.locationRaw || 'Location unknown');
  console.log(`  ${locationStr}`);

  const salaryStr = job.salary ? formatSalary(job.salary) : 'Salary unknown';
  console.log(`  ${chalk.gray(salaryStr)}`);

  // Meta row
  const meta: string[] = [];
  if (job.employmentType) meta.push(job.employmentType);
  if (job.experience) meta.push(job.experience.raw);
  if (job.easyApply) meta.push(chalk.cyan('Easy Apply'));
  if (job.isBoosted) meta.push(chalk.dim('Promoted'));
  if (job.applicantCount) meta.push(chalk.dim(job.applicantCount));
  if (job.postedAge) meta.push(chalk.dim(job.postedAge));
  if (meta.length > 0) {
    console.log(`  ${meta.join(chalk.gray(' · '))}`);
  }

  if (job.skillsStandout.length > 0) {
    const standoutStr = job.skillsStandout.map((s) => chalk.red.bold(s)).join(chalk.gray(', '));
    console.log(`  ${chalk.gray('Standout:')} ${standoutStr}`);
  }

  const nonStandout = job.skillsMatched.filter((s) => !job.skillsStandout.includes(s));
  if (nonStandout.length > 0) {
    const matchedStr = nonStandout.map((s) => chalk.blue(s)).join(chalk.gray(', '));
    console.log(`  ${chalk.gray('Skills:')} ${matchedStr}`);
  }

  console.log(`  ${chalk.underline.gray(job.url)}`);
  // TODO: requires modern OSC 8. Must switch to windows terminal.
  // const osc8Link = `\x1b]8;;${job.url}\x1b\\${job.url}\x1b]8;;\x1b\\`;
  // console.log(`  ${chalk.cyan(osc8Link)}`);

  console.log(DIVIDER);
}

export function renderCompanies(companies: CompanyRecord[]): void {
  console.info(chalk.cyan(`\n ${companies.length} new compan${companies.length === 1 ? 'y' : 'ies'} found\n`));

  for (const c of companies) {
    console.log(`  ${c.companyName}`);
    console.log(`  ${chalk.underline.gray(c.jobBoardUrl)}`);
    console.log(DIVIDER);
  }
}