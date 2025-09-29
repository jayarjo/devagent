import { LogLevel } from '../types';

export class Logger {
  log(message: string, level: LogLevel = LogLevel.INFO): void {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    console.log(`[${timestamp}] [${levelUpper}] ${message}`);
  }

  info(message: string): void {
    this.log(message, LogLevel.INFO);
  }

  warn(message: string): void {
    this.log(message, LogLevel.WARN);
  }

  error(message: string): void {
    this.log(message, LogLevel.ERROR);
  }
}