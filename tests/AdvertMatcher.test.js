/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { AdvertMatcher } from '../core/AdvertMatcher.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const recovered = AtsTextParser.parse(
  readFileSync(`${root}tests/fixtures/ats/clean-english.txt`, 'utf8')
);

const advert = `
Role
As an iOS Software Engineer you own the iOS client experience.

Focus
Build and maintain iOS applications using Swift and SwiftUI.
Integrate AI-powered features through backend APIs.
Optimize performance, memory usage, and battery efficiency.

Ideal Experiences
3+ years of iOS development experience using Swift.
Hands-on experience integrating AI-powered features into mobile apps.
Strong understanding of async/await, concurrency, and background tasks.
Exposure to CoreML or light on-device ML.
Familiarity with feature flags or remote configuration systems.

We offer
A competitive salary, flexible hours and a diverse, inclusive team.
Free fruit and a yearly learning budget.
`;

const extract = (limit = 16) => AdvertMatcher.extractTerms(advert, limit);
const evidenceFor = (term, terms) =>
  terms.find((entry) => entry.term.toLowerCase() === term.toLowerCase());

describe('what the advert asks for', () => {
  const { terms } = extract();

  test('the technologies survive tokenising', () => {
    const named = terms.map((entry) => entry.term.toLowerCase());

    expect(named).toContain('swiftui');
    expect(named).toContain('coreml');
    expect(named).toContain('async/await');
  });

  // Requirements sit under their own heading, and the lexicon knows which headings those are.
  test('a term under a requirements heading is marked required', () => {
    expect(evidenceFor('CoreML', terms).required).toBe(true);
    expect(evidenceFor('async/await', terms).required).toBe(true);
  });

  test('the benefits section is not the job', () => {
    const named = terms.map((entry) => entry.term.toLowerCase());

    for (const noise of ['competitive salary', 'flexible hours', 'free fruit', 'learning budget']) {
      expect(named).not.toContain(noise);
    }
  });

  // Sliding a window over one sentence produces six phrasings of one requirement. Kept as
  // they are, they crowd out every other term in the advert — which is what happened the
  // first time this ran against a real one.
  test('one idea appears once, not once per window', () => {
    const named = terms.map((entry) => entry.term.toLowerCase());
    const family = named.filter((term) => term.includes('ai-powered'));

    expect(family).toHaveLength(1);
  });

  test('an empty verb never outranks a technology', () => {
    const named = terms.map((entry) => entry.term.toLowerCase());

    for (const empty of ['build', 'maintain', 'using', 'applications', 'experience']) {
      expect(named).not.toContain(empty);
    }
  });
});

describe('where the CV answers', () => {
  const { terms } = extract();
  const matched = AdvertMatcher.match(terms, recovered).terms;
  const evidence = (term) => evidenceFor(term, matched)?.evidence;

  // The distinction the whole thing exists for. A term in the prose of a role is a claim with
  // a date and an employer attached; the same term in a list is a word.
  test('prose beats a list', () => {
    expect(evidence('Swift')).toBe('inProse');
    expect(evidence('SwiftUI')).toBe('inSkillsOnly');
  });

  test('a term the CV does not claim is absent, and stays absent', () => {
    expect(evidence('CoreML')).toBe('absent');
    expect(evidence('async/await')).toBe('absent');
  });

  test('an answer names where it was found', () => {
    expect(evidenceFor('Swift', matched).where).toBe('Cortado Mobile Solutions');
    expect(evidenceFor('SwiftUI', matched).where).toBe('the skills list');
    expect(evidenceFor('CoreML', matched).where).toBeNull();
  });
});

describe('what counts as a mention', () => {
  // `AI` inside `maintain` is not a mention of artificial intelligence, and a matcher that
  // counts it reports a fit the CV does not have.
  test('a term inside a longer word is not a mention', () => {
    expect(AdvertMatcher.appears('AI', 'we maintain the sailing app')).toBeNull();
    expect(AdvertMatcher.appears('AI', 'the AI features shipped')).toBe('exact');
  });

  test('a curated synonym is reported as one, never as an exact match', () => {
    expect(AdvertMatcher.appears('MDM', 'owned the Mobile Device Management client')).toBe(
      'synonym'
    );
    expect(AdvertMatcher.appears('MDM', 'owned the MDM client')).toBe('exact');
  });

  test('nothing matches by resemblance', () => {
    expect(AdvertMatcher.appears('SwiftUI', 'built it in Swift')).toBeNull();
    expect(AdvertMatcher.appears('CoreML', 'Clean Architecture, MVVM')).toBeNull();
  });
});

describe('the language of the advert', () => {
  test('it is reported, so a mismatch with the CV is visible', () => {
    expect(extract().language.language).toBe('en');
  });
});
