// utils/audio.ts
import { execSync } from 'child_process';

export function beep(frequency = 800, duration = 300): void {
  try {
    execSync(`powershell -c "[console]::beep(${frequency}, ${duration})"`, { stdio: 'ignore' });
  } catch {
    // Silently fail — audio is non-critical
  }
}

export function playTone(tones: Array<[number, number]>): void {
  const script = tones.map(([f, d]) => `[console]::beep(${f}, ${d})`).join(';');
  try {
    execSync(`powershell -c "${script}"`, { stdio: 'ignore' });
  } catch {}
}

export const sounds = {
  newJob:      () => beep(880, 200),
  standout:    () => playTone([[523, 150], [659, 150], [784, 300]]),  // C-E-G ascending
  highSalary:  () => playTone([[784, 150], [784, 150], [1047, 400]]), // G-G-C triumphant
  noResults:   () => beep(300, 500),   // low, long
  authError:   () => playTone([[400, 200], [300, 400]]), // descending = bad
};