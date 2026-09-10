/**
 * @jest-environment node
 *
 * The distinction this whole tool exists for: a term the CV writes and the artefact lost is a
 * layout defect; a term the CV never wrote is a content gap. They belong to different people.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { AdvertMatcher } from '../core/AdvertMatcher.js';
import { AtsReport } from '../core/AtsReport.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const document = new CvDocument(JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8')));
const text = readFileSync(`${root}tests/fixtures/ats/clean-english.txt`, 'utf8');
const recovered = AtsTextParser.parse(text);

const advert = `
Requirements
Swift and SwiftUI for the client.
Experience with Kotlin and Jetpack Compose.
Exposure to CoreML and TensorFlow Lite.
`;

const matched = (cv = recovered) => {
  const { terms, language } = AdvertMatcher.extractTerms(advert);
  return { ...AdvertMatcher.match(terms, cv, document), language };
};
const term = (name, result) => result.terms.find((entry) => entry.term.toLowerCase() === name.toLowerCase());

describe('a gap has two possible causes and they are told apart', () => {
  test('a term the CV writes and the artefact keeps is not a gap at all', () => {
    const swift = term('Swift', matched());

    expect(swift.evidence).toBe('inProse');
    expect(swift.authored).toBe(true);
  });

  // The CV writes Kotlin and Jetpack Compose in its skills; the artefact keeps them, so this
  // is `listed only` rather than a defect. The layout-defect case is the one below.
  test('a term the CV writes but the artefact lost is a layout defect', () => {
    // A parser that saw only the masthead: the skills section never arrived.
    const shredded = AtsTextParser.parse([
      'Giovanni Trovato', 'Senior iOS Engineer / Mobile Platform Owner', '',
      'Professional Experience', '', 'Mobile Software Engineer',
      'Cortado Mobile Solutions · Berlin', 'August 2018 – Present', '',
      'Education', '', 'M.Sc.', 'Pisa · 2015'
    ].join('\n'));
    const kotlin = term('Kotlin', matched(shredded));

    expect(kotlin.evidence).toBe('absent');
    // Written in the profile, missing from the artefact — the renderer is wrong, not the copy.
    expect(kotlin.authored).toBe(true);
  });

  test('a term the CV never wrote is a content gap', () => {
    const coreml = term('CoreML', matched());

    expect(coreml.evidence).toBe('absent');
    expect(coreml.authored).toBe(false);
  });
});

describe('the report separates them, and stops there', () => {
  const result = matched();
  const markdown = AtsReport.advertSection({ ...result, opening: AdvertMatcher.opening(result.terms, text) }).join('\n');

  test('each reading is named', () => {
    expect(markdown).toContain('content gap — not claimed');
    expect(markdown).toMatch(/\*\*\d+ layout defects\*\*/);
    expect(markdown).toMatch(/\*\*\d+ content gaps\*\*/);
  });

  test('a layout defect points at the renderer, a content gap at a person', () => {
    expect(markdown).toMatch(/Fix the renderer, not the copy/);
    expect(markdown).toMatch(/decision for a person, and this tool does not make it/);
  });

  // The boundary between tailoring a CV and fabricating one. A helpful suggestion is how a
  // fabricated CV gets built one line at a time.
  test('it never suggests adding a term the CV does not claim', () => {
    expect(markdown).not.toMatch(/\b(add|consider adding|you should|recommend|suggest|include this)\b/i);
  });

  test('the opening is measured, because a reader deciding whether to continue has not reached the skills', () => {
    expect(markdown).toMatch(/opening fifteen lines|Every required term appears in the opening/);
  });
});

describe('with no advert', () => {
  test('the section says so rather than being empty', () => {
    expect(AtsReport.advertSection(null).join('\n')).toMatch(/No advert was given/);
  });
});
