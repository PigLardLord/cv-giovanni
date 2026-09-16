/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// The editor (#23) writes the CV through the local API, which only npm run serve answers, on this machine.
// Published with the site it could only fail, and it would invite a visitor to try. So the site's assembly
// leaves it out, and checks that it did.
//
// The cover letter's page (#151) prints the letter a tailored profile under applications/ carries, and only
// npm run serve hands those out. The published profile carries no letter, so published, the page could only
// say there is none. It stays on this machine the same way.
const workflow = readFileSync(new URL('../.github/workflows/gates.yml', import.meta.url), 'utf8');
const LOCAL_PAGES = [
  ['the editor', 'editor.html', ['editor.html', 'editor.js', 'editor.css', 'editor/']],
  ['the cover letter', 'letter.html', ['letter.html', 'letter.js', 'letter.css']]
];

/** What an assembly would publish of a local page: each path its rsync keeps, and a check it never makes. */
const published = (text, page, files) => {
  const rsync =
    text.split('\n').find((line) => /^\s*rsync .*"\$RUNNER_TEMP\/site\/"/.test(line)) || '';
  const excluded = [...rsync.matchAll(/--exclude=(\S+)/g)].map(([, path]) =>
    path.replace(/^'|'$/g, '')
  );
  const absent = new RegExp(`test ! -e "\\$RUNNER_TEMP/site/${page.replace(/\./g, '\\.')}"`);
  return [
    ...files.filter((path) => !excluded.includes(path)).map((path) => `${path} is not excluded`),
    ...(absent.test(text) ? [] : [`the assembly never checks that ${page} is absent`])
  ];
};

describe.each(LOCAL_PAGES)('%s stays on this machine', (what, page, files) => {
  test('the check finds an assembly that would publish it', () => {
    const careless =
      '          rsync -a --exclude=\'.*\' --exclude=node_modules ./ "$RUNNER_TEMP/site/"\n';

    expect(published(careless, page, files)).toEqual([
      ...files.map((path) => `${path} is not excluded`),
      `the assembly never checks that ${page} is absent`
    ]);
  });

  test('the site handed to GitHub Pages leaves it out', () => {
    expect(published(workflow, page, files)).toEqual([]);
  });
});
