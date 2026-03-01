/**
 * Timestamped console logging utilities.
 * Prefixes every message with [HH:MM:SS.mmm] in local time.
 */

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `[${h}:${m}:${s}.${ms}]`;
}

export function log(...args: unknown[]): void {
  console.log(timestamp(), ...args);
}

export function logWarn(...args: unknown[]): void {
  console.warn(timestamp(), ...args);
}

export function logError(...args: unknown[]): void {
  console.error(timestamp(), ...args);
}

export function logInfo(...args: unknown[]): void {
  console.info(timestamp(), ...args);
}
