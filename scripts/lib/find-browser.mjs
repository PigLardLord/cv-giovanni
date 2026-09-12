import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * A Chrome or Chromium binary, or null when there is none: `CHROME_PATH` first, then the usual install
 * locations, the Playwright cache, and finally PATH. An audit that finds none must exit 2 and check
 * nothing, because an audit that did not run must never read as a pass.
 * @returns {string|null} The binary to run
 */
export function findBrowser() {
  const named = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  const paths = [
    process.env.CHROME_PATH,
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...[
      'chrome-linux64/chrome',
      'chrome-linux/chrome',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium'
    ].flatMap((suffix) => {
      const cache = join(homedir(), '.cache', 'ms-playwright');
      if (!existsSync(cache)) return [];
      try {
        return execFileSync('ls', [cache], { encoding: 'utf8' })
          .split('\n')
          .filter((entry) => entry.startsWith('chromium-'))
          .map((entry) => join(cache, entry, suffix));
      } catch {
        return [];
      }
    })
  ].filter(Boolean);

  for (const candidate of paths) {
    if (existsSync(candidate)) return candidate;
  }
  for (const name of named) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {
      /* keep looking */
    }
  }
  return null;
}
