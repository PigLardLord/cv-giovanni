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
      new Set([
        'identity',
        'experience',
        'education',
        'skills',
        'spokenLanguages',
        'certifications'
      ])
    );
    expect(unlisted(diff)).toEqual([]);
  });

  // A degree's period is graded since #200, and nothing names it here: the walker finds it because it is in the diff.
  test.each(['degree', 'period'])(
    'the check finds a graded field the section leaves out: education 1, %s',
    (field) => {
      const diff = downgrade(diffOf(fixture('clean-english')), 'partial');
      const listed = section(diff).replace(
        new RegExp(`^- education 1, ${field}: partial.*$`, 'm'),
        ''
      );

      expect(
        losses(diff).filter(({ path, verdict }) => !listed.includes(`- ${label(path)}: ${verdict}`))
      ).toEqual([{ path: ['education', 0, field], verdict: 'partial' }]);
    }
  );
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

  // A degree's period is graded as its school line prints it and weighs nothing (#200): a print that lost it is
  // named with what was written, and the points do not move.
  test("a degree's lost period is named, and said to cost nothing", () => {
    const text = fixture('clean-english');
    const diff = diffOf(text.replace(`${pisa.school} · ${pisa.period}`, pisa.school));

    expect(diff.education[0].period).toBe('lost');
    expect(section(diff)).toContain(
      `- education 1, period: lost, not scored — written "${pisa.period}"; nothing recovered`
    );
    expect(AtsScore.compose(diff).points).toBe(AtsScore.compose(diffOf(text)).points);
  });

  test("a degree's period recovered as other dates is named with both", () => {
    const diff = diffOf(fixture('clean-english').replace(pisa.period, '2015 – 2017'));

    expect(diff.education[0].period).toBe('wrong');
    expect(section(diff)).toContain(
      `- education 1, period: wrong, not scored — written "${pisa.period}"; recovered "2015 – 2017"`
    );
  });

  test('a lost field says nothing came back', () => {
    const diff = diffOf(fixture('header-footer-dropped'));

    expect(diff.identity.email).toBe('lost');
    expect(section(diff)).toContain(
      `- email: lost — written "${document.identity.email}"; nothing recovered`
    );
  });

  // A certification is graded as its line prints, "Name – Issuer (year)", and listed, but carries no weight: the
  // fidelity band's parts were set before certifications were compared, and weighing them is a decision of its own.
  test('a certification cut short is named, and said to cost nothing', () => {
    const [android] = document.certifications;
    const printed = `${android.name} – ${android.issuer} (${android.year})`;
    const text = fixture('page-print-nerd');
    const diff = diffOf(text.replace(printed, android.name));

    expect(text).toContain(printed);
    expect(diff.certifications[0].name).toBe('partial');
    expect(section(diff)).toContain(
      `- certifications 1, name: partial, not scored — written "${printed}"; recovered "${android.name}"`
    );
    expect(AtsScore.compose(diff).points).toBe(AtsScore.compose(diffOf(text)).points);
  });

  // Whether a loss is said to cost nothing is checked against the number itself: each field is lost on its own, and
  // the line says "not scored" exactly when the points did not move.
  test('a loss is said to cost nothing exactly when losing it moves no point', () => {
    const clean = diffOf(fixture('clean-english'));
    const full = AtsScore.compose(clean).points;
    const everything = downgrade(clean, 'partial');
    const listed = section(everything);
    const lose = (path) => {
      const diff = structuredClone(clean);
      const at = path.slice(0, -1).reduce((node, key) => node[key], diff);
      at[path[path.length - 1]] = 'lost';
      return diff;
    };

    const misread = losses(everything)
      .filter(({ path }) => {
        const costs = AtsScore.compose(lose(path)).points < full;
        const said = listed.includes(`- ${label(path)}: partial, not scored — `);
        return costs === said;
      })
      .map(({ path }) => path.join('.'));

    expect(misread).toEqual([]);
    expect(listed).toContain('- title: partial, not scored — ');
    expect(listed).toContain('- education 1, degree: partial — ');
    expect(listed).toContain('- education 1, period: partial, not scored — ');
  });

  test('a clean document still says so', () => {
    expect(section(diffOf(fixture('clean-english')))).toMatch(
      /Nothing\. Every field the document writes came back/
    );
  });
});

// The per-artefact table's Fidelity column read the role titles alone, so a degree graded partial left it "exact".
describe("the table's Fidelity column reads every field the fidelity band scores", () => {
  const clean = diffOf(fixture('clean-english'));
  const fidelity = (diff) => AtsReport.row({ artefact: 'x.pdf', diff }).split('|')[4].trim();
  const set = (part, index, field, verdict) => ({
    ...clean,
    [part]: clean[part].map((entry, at) => (at === index ? { ...entry, [field]: verdict } : entry))
  });

  test('a clean document reads exact', () => {
    expect(fidelity(clean)).toBe('exact');
  });

  test.each([
    ['experience', 1, 'employer', 'wrong'],
    ['experience', 2, 'highlights', 'partial'],
    ['education', 0, 'degree', 'partial'],
    ['education', 1, 'school', 'lost'],
    ['skills', 3, 'category', 'partial'],
    ['spokenLanguages', 2, 'level', 'lost']
  ])('%s %i %s graded %s reads as that', (part, index, field, verdict) => {
    expect(fidelity(set(part, index, field, verdict))).toBe(verdict);
  });
});
