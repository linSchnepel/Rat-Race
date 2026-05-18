import chalk from 'chalk';
import type { JobRecord } from '../core/types.js';

const DIVIDER = chalk.gray('─'.repeat(72));

/**
 * Render a list of fresh jobs to stdout with ANSI color formatting.
 */
export function render(jobs: JobRecord[]): void {
  if (jobs.length === 0) return;

  console.log('\n' + chalk.bold.green(`✦ ${jobs.length} new job${jobs.length === 1 ? '' : 's'} found\n`));

  for (const job of jobs) {
    renderJob(job);
  }
}

function renderJob(job: JobRecord): void {
  // Header: company — title
  const companyStr = chalk.bold.white(job.company);
  const titleStr = chalk.bold.yellow(job.title);
  console.log(`${companyStr}  ${chalk.gray('—')}  ${titleStr}`);

  // Location / remote
  const locationStr = job.isRemote
    ? chalk.green('Remote') + (job.locationRaw ? chalk.gray(` · ${job.locationRaw}`) : '')
    : chalk.gray(job.locationRaw || 'Location unknown');
  console.log(`  ${locationStr}`);

  // Meta row
  const meta: string[] = [];
  if (job.employmentType) meta.push(job.employmentType);
  if (job.experienceLevel) meta.push(job.experienceLevel);
  if (job.easyApply) meta.push(chalk.cyan('Easy Apply'));
  if (job.isBoosted) meta.push(chalk.dim('Promoted'));
  if (job.applicantCount) meta.push(chalk.dim(job.applicantCount));
  if (job.postedAge) meta.push(chalk.dim(job.postedAge));
  if (meta.length > 0) {
    console.log(`  ${meta.join(chalk.gray(' · '))}`);
  }

  // Standout skills (in red as per spec)
  if (job.skillsStandout.length > 0) {
    const standoutStr = job.skillsStandout.map((s) => chalk.red.bold(s)).join(chalk.gray(', '));
    console.log(`  ${chalk.gray('Standout:')} ${standoutStr}`);
  }

  // Matched skills (non-standout)
  const nonStandout = job.skillsMatched.filter((s) => !job.skillsStandout.includes(s));
  if (nonStandout.length > 0) {
    const matchedStr = nonStandout.map((s) => chalk.blue(s)).join(chalk.gray(', '));
    console.log(`  ${chalk.gray('Skills:')} ${matchedStr}`);
  }

  // URL
  console.log(`  ${chalk.underline.gray(job.url)}`);

  console.log(DIVIDER);
}