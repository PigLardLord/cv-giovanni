/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { AtsScore } from '../core/AtsScore.js';
import { AtsReport } from '../core/AtsReport.js';

// The report's "What did not come back" listed identity fields, links, invented categories and sections, and nothing
// graded in a role, a degree, a skill category or a language. A degree graded partial cost half a point that neither
// the number nor the prose showed (#186). These tests find every field graded short of recovered by walking the diff
// itself, not by asking the code that lists them, so a field graded and left out of the section fails here.
const root = fileURLToPath(new URL('..', import.meta.url));
const profile = readFileSync(`${root}profiles/general/en.json`, 'utf8');
const document = new CvDocument(JSON.parse(profile));
const fixture = (name) => readFileSync(`${root}tests/fixtures/ats/${name}.txt`, 'utf8');
const diffOf = (text) => RecoveryDiff.diff(document, AtsTextParser.parse(text));

const SHORT = ['partial', 'wrong', 'lost'];

/** Every property of the diff, at any depth, whose value is a verdict short of recovered, with its path. */
const losses = (node, path = []) =>
  Object.entries(node ?? {}).flatMap(([key, value]) => {
    const at = [...path, Array.isArray(node) ? Number(key) : key];
    if (typeof value === 'string')
      return !Array.isArray(node) && SHORT.includes(value) ? [{ path: at, verdict: value }] : [];
    return value && typeof value === 'object' ? losses(value, at) : [];
  });

/** The same diff with every verdict on the ladder replaced by one: a document where everything came back short. */
const downgrade = (node, verdict) => {
  if (Array.isArray(node)) return node.map((child) => downgrade(child, verdict));
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      ['exact', 'normalised', ...SHORT].includes(value) ? verdict : downgrade(value, verdict)
    ])
  );
};

/** How the report names a field: "email", or the section, the entry counted from one, and the field. */
const label = ([part, index, field]) =>
  field === undefined
    ? index
    : `${{ spokenLanguages: 'languages' }[part] ?? part} ${index + 1}, ${field}`;

/** "What did not come back", and nothing of the sections after it. */
const section = (diff) => {
  const markdown = AtsReport.render(AtsScore.compose(diff), [{ artefact: 'x.pdf', diff }]);
  const start = markdown.indexOf('## What did not come back');
  return markdown.slice(start, markdown.indexOf('\n## ', start + 1));
};

const unlisted = (diff) => {
  const listed = section(diff);
  return losses(diff)
    .filter(({ path, verdict }) => !listed.includes(`- ${label(path)}: ${verdict}`))
    .map(({ path, verdict }) => `${path.join('.')}: ${verdict}`);
};

describe('What did not come back names every field graded short of recovered', () => {
  const fixtures = readdirSync(`${root}tests/fixtures/ats`)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => name.slice(0, -'.txt'.length));

  test.each(fixtures)('read from %s', (name) => {
    expect(unlisted(diffOf(fixture(name)))).toEqual([]);
  });

  test('in a document where every graded field came back partial', () => {
    const diff = downgrade(diffOf(fixture('clean-english')), 'partial');

    expect(new Set(losses(diff).map(({ path }) => path[0]))).toEqual(
      new Set(['identity', 'experience', 'education', 'skills', 'spokenLanguages'])
    );
    expect(unlisted(diff)).toEqual([]);
  });

  test('the check finds a graded field the section leaves out', () => {
    const diff = downgrade(diffOf(fixture('clean-english')), 'partial');
    const listed = section(diff).replace(/^- education 1, degree: partial.*$/m, '');

    expect(
      losses(diff).filter(({ path, verdict }) => !listed.includes(`- ${label(path)}: ${verdict}`))
    ).toEqual([{ path: ['education', 0, 'degree'], verdict: 'partial' }]);
  });
});

describe('a field short of recovered is quoted as written and as recovered', () => {
  const [pisa] = document.education;

  test('a degree cut short names both', () => {
    const diff = diffOf(
      fixture('clean-english').replace(pisa.degree, "First Level Professional Master's Programme")
    );

    expect(diff.education[0].degree).toBe('partial');
    expect(section(diff)).toContain(
      `- education 1, degree: partial — written "${pisa.degree}"; recovered "First Level Professional Master's Programme"`
    );
  });

  test('a lost field says nothing came back', () => {
    const diff = diffOf(fixture('header-footer-dropped'));

    expect(diff.identity.email).toBe('lost');
    expect(section(diff)).toContain(
      `- email: lost — written "${document.identity.email}"; nothing recovered`
    );
  });

  test('a clean document still says so', () => {
    expect(section(diffOf(fixture('clean-english')))).toMatch(
      /Nothing\. Every field the document writes came back/
    );
  });
});
