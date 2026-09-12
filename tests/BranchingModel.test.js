/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// The branching model is GitHub Flow (#44): main is what is published, and no other branch lives long.
// The local guard and AGENTS.md say so together, or one of them is wrong — the guard used to protect
// release/* too, for a model this project never adopted.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('the branching model', () => {
  test('the local guard protects main, and only main', () => {
    expect(JSON.parse(read('.agents/harness/guards.json')).protected).toEqual(['^main$']);
  });

  test('AGENTS.md names the model and the branch the guard protects', () => {
    const agents = read('AGENTS.md');

    expect(agents).toMatch(/\*\*GitHub Flow\*\*/);
    expect(agents).toContain('`.agents/harness/guards.json` protects `^main$`');
  });
});
