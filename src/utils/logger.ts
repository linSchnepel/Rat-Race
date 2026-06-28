import chalk from 'chalk';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { projectRoot } from './paths.js';
import { loadConfig } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const config = loadConfig();
const LOG_LEVEL: LogLevel = (config.LOG_LEVEL as LogLevel | undefined) ?? 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[LOG_LEVEL];
}

function timestamp(): string {
  var d = new Date();
  d.setHours(d.getHours() - 5);
  return d.toISOString().slice(11, 19);
}

function writeToFile(level: string, msg: string, extra?: string): void {
  try {
    const logDir = join(projectRoot, 'logs');
    mkdirSync(logDir, { recursive: true });
    const line = `[${new Date().toISOString()}] [${level}] ${msg}${extra ? '\n' + extra : ''}\n`;
    appendFileSync(join(logDir, 'rat-race.log'), line, 'utf8');
  } catch {
    // Never let logging crash the app
  }
}

export const logger = {
  debug(msg: string): void {
    if (shouldLog('debug')) {
      console.debug(chalk.gray(`[${timestamp()}] DEBUG ${msg}`));
      //writeToFile('DEBUG', msg); //TODO: No
    }
  },

  info(msg: string): void {
    if (shouldLog('info')) {
      console.info(chalk.cyan(`[${timestamp()}] INFO  ${msg}`));
      //writeToFile('INFO', msg);
    }
  },

  warn(msg: string): void {
    if (shouldLog('warn')) {
      console.warn(chalk.yellow(`[${timestamp()}] WARN  ${msg}`));
      writeToFile('WARN', msg);
    }
  },

  error(msg: string, err?: unknown): void {
    if (shouldLog('error')) {
      console.error(chalk.red(`[${timestamp()}] ERROR ${msg}`));

      let extra: string | undefined;
      if (err instanceof Error) {
        console.error(chalk.red(`       ${err.message}`));
        extra = err.message;
        if (err.stack && LOG_LEVEL === 'debug') {
          console.error(chalk.gray(err.stack));
          extra = err.stack;
        }
      }

      writeToFile('ERROR', msg, extra);
    }
  },
};