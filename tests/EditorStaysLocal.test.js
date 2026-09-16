/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// The editor (#23) writes the CV through the local API, which only npm run serve answers, on this machine.
// Published with the site it could only fail, and it would invite a visitor to try. So the site's assembly
// leaves it out, and checks that it did.
const workflow = readFileSync(new URL('../.github/workflows/gates.yml', import.meta.url), 'utf8');
const EDITOR = ['editor.html', 'editor.js', 'editor.css', 'editor/'];

/** What an assembly would publish of the editor: each path its rsync keeps, and a check it never makes. */
const published = (text) => {
  const rsync =
    text.split('\n').find((line) => /^\s*rsync .*"\$RUNNER_TEMP\/site\/"/.test(line)) || '';
  const excluded = [...rsync.matchAll(/--exclude=(\S+)/g)].map(([, path]) =>
    path.replace(/^'|'$/g, '')
  );
  return [
    ...EDITOR.filter((path) => !excluded.includes(path)).map((path) => `${path} is not excluded`),
    ...(/test ! -e "\$RUNNER_TEMP\/site\/editor\.html"/.test(text)
      ? []
      : ['the assembly never checks that editor.html is absent'])
  ];
};

describe('the editor stays on this machine', () => {
  test('the check finds an assembly that would publish the editor', () => {
    const careless =
      '          rsync -a --exclude=\'.*\' --exclude=node_modules ./ "$RUNNER_TEMP/site/"\n';

    expect(published(careless)).toEqual([
      'editor.html is not excluded',
      'editor.js is not excluded',
      'editor.css is not excluded',
      'editor/ is not excluded',
      'the assembly never checks that editor.html is absent'
    ]);
  });

  test('the site handed to GitHub Pages leaves the editor out', () => {
    expect(published(workflow)).toEqual([]);
  });
});
