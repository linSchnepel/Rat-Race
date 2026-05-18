import chalk from 'chalk';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';

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
  return new Date().toISOString().slice(11, 19); // HH:MM:SS
}

export const logger = {
  debug(msg: string): void {
    if (shouldLog('debug')) {
      console.debug(chalk.gray(`[${timestamp()}] DEBUG ${msg}`));
    }
  },

  info(msg: string): void {
    if (shouldLog('info')) {
      console.info(chalk.cyan(`[${timestamp()}] INFO  ${msg}`));
    }
  },

  warn(msg: string): void {
    if (shouldLog('warn')) {
      console.warn(chalk.yellow(`[${timestamp()}] WARN  ${msg}`));
    }
  },

  error(msg: string, err?: unknown): void {
    if (shouldLog('error')) {
      console.error(chalk.red(`[${timestamp()}] ERROR ${msg}`));
      if (err instanceof Error) {
        console.error(chalk.red(`       ${err.message}`));
        if (err.stack && LOG_LEVEL === 'debug') {
          console.error(chalk.gray(err.stack));
        }
      }
    }
  },
};