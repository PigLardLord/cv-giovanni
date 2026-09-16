/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { staleTokens, versionedFiles } from '../scripts/lib/version-tokens.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const manifest = JSON.parse(
  readFileSync(new URL('../.agents/harness/ticket-loop.json', import.meta.url))
);

const page = (layouts, script = '20260913-download2') =>
  `<link rel="stylesheet" href="style.css?v=20260913-download2" />
<link rel="stylesheet" href="layouts.css?v=${layouts}" />
<script type="module" defer src="script.js?v=${script}"></script>`;

// The check has to be able to fail, and this is where that is proved (#117).
describe('a versioned file that changes takes a new token', () => {
  test('the page names every file it versions, and each token', () => {
    expect(versionedFiles(page('20260913-download2'))).toEqual([
      { file: 'style.css', token: '20260913-download2' },
      { file: 'layouts.css', token: '20260913-download2' },
      { file: 'script.js', token: '20260913-download2' }
    ]);
  });

  test('an edited stylesheet under its old token is stale, and under a new one is not', () => {
    const before = page('20260913-download2');
    expect(staleTokens({ changed: ['layouts.css'], before, after: before })).toEqual([
      'layouts.css'
    ]);
    expect(
      staleTokens({ changed: ['layouts.css'], before, after: page('20260915-footer1') })
    ).toEqual([]);
  });

  test('a branch that changes no versioned file has nothing stale', () => {
    const before = page('20260913-download2');
    expect(staleTokens({ changed: ['README.md', 'index.html'], before, after: before })).toEqual(
      []
    );
  });

  test('a file the page versions only from this branch on is new, not stale', () => {
    expect(
      staleTokens({
        changed: ['editor.css'],
        before: page('20260913-download2'),
        after: `${page('20260913-download2')}\n<link href="editor.css?v=20260916-editor1" />`
      })
    ).toEqual([]);
  });

  // Against the base branch, the way tests/TicketsCloseByHand.test.js finds it: from where this branch began to the
  // files as they stand, uncommitted edits included, so a forgotten token fails before the commit that forgets it.
  test('on this branch, every versioned file it changed carries a new token', () => {
    const base = manifest.vcs.base_branch;
    const ref = [`origin/${base}`, base].find((candidate) => {
      try {
        git('rev-parse', '--verify', '--quiet', `${candidate}^{commit}`);
        return true;
      } catch {
        return false;
      }
    });
    expect(ref).toBeDefined();
    const began = git('merge-base', ref, 'HEAD');

    expect(
      staleTokens({
        changed: git('diff', '--name-only', began).split('\n').filter(Boolean),
        before: git('show', `${began}:index.html`),
        after: readFileSync(new URL('../index.html', import.meta.url), 'utf8')
      })
    ).toEqual([]);
  });
});
