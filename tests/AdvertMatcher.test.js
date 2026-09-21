/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { AdvertMatcher } from '../core/AdvertMatcher.js';
import { CvDocument } from '../domain/CvDocument.js';
import { RecoveredCv } from '../domain/RecoveredCv.js';

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
    expect(evidence('APIs')).toBe('inSkillsOnly');
  });

  test('a term the CV does not claim is absent, and stays absent', () => {
    expect(evidence('CoreML')).toBe('absent');
    expect(evidence('async/await')).toBe('absent');
  });

  test('an answer names where it was found', () => {
    expect(evidenceFor('Swift', matched).where).toBe('Cortado Mobile Solutions');
    expect(evidenceFor('APIs', matched).where).toBe('the skills list');
    expect(evidenceFor('CoreML', matched).where).toBeNull();
  });
});

// The skills list claimed TDD and Clean Architecture while no role said where either was practised, so an advert asking
// for them found a listed word and no claim behind it (#54). The candidate practised both on the Cortado MDM iOS client,
// and the Cortado role says so; this holds the published profile to it.
describe('a practice the skills list claims is evidenced in the prose of a role', () => {
  const PRACTICES = ['TDD', 'Clean Architecture'];
  const published = () => JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'));

  // The profile as a parser that lost nothing would recover it: what the CV says, with no layout in between. Whether
  // the print keeps what it says is the recovery tests' question, not this one.
  const placed = (json) => {
    const document = new CvDocument(json);
    const field = (value) => RecoveredCv.field(value, -1);
    const recovered = new RecoveredCv({
      identity: { name: field(document.identity.name), title: field(document.identity.title) },
      profile: document.profile,
      experience: document.experience.map((job) => ({
        title: field(job.title),
        employer: field(job.company),
        bodyText: [job.summary, ...job.highlights].filter(Boolean).join(' ')
      })),
      skills: document.skills.map((group) => ({
        category: group.category,
        items: group.items.map((item) => item.name)
      })),
      certifications: document.certifications.map((entry) => ({ text: entry.name }))
    });
    const terms = PRACTICES.map((term) => ({ term, required: true }));
    return AdvertMatcher.match(terms, recovered, document).terms;
  };

  test.each(PRACTICES)(
    '%s is in the prose of the Cortado role, not only in the skills list',
    (term) => {
      expect(evidenceFor(term, placed(published()))).toEqual(
        expect.objectContaining({ evidence: 'inProse', where: 'Cortado Mobile Solutions' })
      );
    }
  );

  test('a role that stops naming them leaves them claimed in the skills list only', () => {
    const json = published();
    for (const job of json.relevant_experience) {
      job.highlights = job.highlights.map((line) =>
        line.replace(/\bTDD\b|Clean Architecture/g, '')
      );
    }

    for (const term of PRACTICES) {
      expect(evidenceFor(term, placed(json)).evidence).toBe('inSkillsOnly');
    }
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

// A German advert's words were read with an ASCII pattern, and broke at every umlaut and ß: "frühestmöglichen" came
// out as "fr", "hestm" and "glichen", "Hauptstraße" as "Hauptstra" (#305). They are read whole.
describe('a German advert', () => {
  const advert = [
    'Senior iOS Entwickler (m/w/d)',
    '',
    'Anforderungen:',
    '- Erfahrung mit SwiftUI und Barrierefreiheit',
    '- Testautomatisierung und Qualitätssicherung',
    '',
    'Bitte nennen Sie Ihren frühestmöglichen Eintrittstermin. Hauptstraße 1, 10115 Berlin.'
  ].join('\n');

  test('is read in whole words, umlauts and ß included, and yields no fragment of one', () => {
    const terms = AdvertMatcher.extractTerms(advert, 60).terms.map(({ term }) => term);
    const words = terms.flatMap((term) => term.split(' '));

    expect(words).toEqual(
      expect.arrayContaining(['Qualitätssicherung', 'frühestmöglichen', 'Hauptstraße'])
    );
    for (const fragment of ['fr', 'hestm', 'glichen', 'Hauptstra', 'Qualit', 'tssicherung']) {
      expect(words).not.toContain(fragment);
    }
  });

  test('a word in a script without ASCII letters is a word, and a number is not', () => {
    expect(AdvertMatcher.keeps('Опыт', ['Опыт'])).toBe(true);
    expect(AdvertMatcher.keeps('10115', ['10115'])).toBe(false);
    expect(AdvertMatcher.keeps('3–5', ['3–5'])).toBe(false);
  });
});
