import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * True when git would refuse to track the path. `check-ignore` exits 1 when the
 * path is not ignored, which is a normal answer rather than a failure.
 */
function ignored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', path], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('applications stay on this machine', () => {
  // A tailored CV names the company it was written for. This repository is public, so
  // committing one publishes who you applied to and lets any reader enumerate the rest.
  // The rule is only worth anything if the suite enforces it: the alternative is
  // discovering the leak by pushing it.
  test('nothing under applications/ can be committed', () => {
    expect(ignored('applications/some-company/en.json')).toBe(true);
    expect(ignored('applications/some-company/advert.txt')).toBe(true);
    expect(ignored('applications/some-company/out/cv.pdf')).toBe(true);
  });

  // The counterpart, and the reason this test can fail: an ignore rule wide enough to
  // swallow the public profile would pass the assertions above and lose the CV.
  test('the public profile is still tracked', () => {
    expect(ignored('profiles/general/en.json')).toBe(false);
    expect(ignored('config/cv-manifest.json')).toBe(false);
    expect(ignored('index.html')).toBe(false);
  });
});
