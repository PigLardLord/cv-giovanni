import { readFileSync } from 'node:fs';

// The screen audit judges a measurement as the browser took it, and rounds it only where it reports it: 45.4px is
// not within 44px ±1 (the code review of #108). Its page expressions are strings handed to Chrome, so no unit test
// runs them; this reads them instead. The code review of #118 found the footer button's height rounded in the
// page, where 42.6px came back as 43px and passed the 43px floor the Download link is held to (#109).
const source = readFileSync(new URL('../scripts/audit-screen.mjs', import.meta.url), 'utf8');

const expression = (name) => {
  const start = source.indexOf(`const ${name} = \``);
  if (start === -1) throw new Error(`scripts/audit-screen.mjs declares no ${name}`);
  return source.slice(start, source.indexOf('`;', start));
};

describe('the screen audit hands its judges what the page measured', () => {
  test.each([
    ['downloadLinks', /height: box\.height/],
    ['footerButtons', /getBoundingClientRect\(\)\.height/]
  ])('%s measures a height and rounds nothing', (name, height) => {
    expect(expression(name)).toMatch(height);
    expect(expression(name)).not.toMatch(/Math\.round/);
  });
});
