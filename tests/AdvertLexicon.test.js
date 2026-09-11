import { ADVERT, AdvertLexicon } from '../domain/AdvertLexicon.js';

describe('the lexicon is multilingual by construction', () => {
  // The same shape as SectionLexicon and MONTHS: a language is added by adding entries.
  test('every group knows the same languages', () => {
    const languages = AdvertLexicon.languages();

    expect(languages).toEqual(['de', 'en', 'it']);
    for (const group of ['stopwords', 'boilerplate', 'requirementHeadings', 'offerHeadings']) {
      expect(Object.keys(ADVERT[group]).sort()).toEqual(languages);
    }
  });

  test('a stopword in any language is a stopword', () => {
    for (const word of ['the', 'with', 'der', 'für', 'della', 'anche']) {
      expect(AdvertLexicon.isStopword(word)).toBe(true);
    }
  });

  // The words that would otherwise dominate any frequency ranking, and mean nothing.
  test('a technical term is never a stopword', () => {
    for (const word of ['Swift', 'SwiftUI', 'CoreML', 'Kotlin', 'MDM', 'TestFlight']) {
      expect(AdvertLexicon.isStopword(word)).toBe(false);
    }
  });
});

describe('the furniture of a posting', () => {
  test.each([
    'm/w/d',
    'Vollzeit',
    'Wir bieten',
    'unbefristet',
    'equal opportunity',
    'What we offer',
    'apply now',
    'pari opportunità',
    'tempo pieno'
  ])('%s is boilerplate', (phrase) => {
    expect(AdvertLexicon.isBoilerplate(phrase)).toBe(true);
  });

  test('the work itself is not boilerplate', () => {
    for (const phrase of [
      'Build and maintain iOS applications using Swift and SwiftUI',
      'Optimize performance, memory usage, and battery efficiency'
    ]) {
      expect(AdvertLexicon.isBoilerplate(phrase)).toBe(false);
    }
  });
});

describe('what the advert demands, and what it is selling', () => {
  test.each([
    ['Requirements', 'required'],
    ['Ideal Experiences', 'required'],
    ['Anforderungen', 'required'],
    ['Ihr Profil:', 'required'],
    ['Il tuo profilo', 'required'],
    ['We offer', 'offer'],
    ['Wir bieten', 'offer'],
    ['Benefits', 'offer']
  ])('%s is a %s heading', (line, kind) => {
    expect(AdvertLexicon.headingKind(line)).toBe(kind);
  });

  test('a sentence is not a heading', () => {
    for (const line of [
      'You will build a production-grade iOS application where AI interactions are central.',
      '3+ years of iOS development experience using Swift.'
    ]) {
      expect(AdvertLexicon.headingKind(line)).toBeNull();
    }
  });
});

describe('synonyms are curated, and say so', () => {
  test.each([
    ['MDM', 'Mobile Device Management'],
    ['CI/CD', 'Continuous Integration'],
    ['TDD', 'test-driven development'],
    ['SPM', 'Swift Package Manager']
  ])('%s and %s are the same thing', (a, b) => {
    expect(AdvertLexicon.areSynonyms(a, b)).toBe(true);
  });

  // Nothing is inferred. Two terms that merely look related are not synonyms, because a
  // general engine would need a dependency and would hide its own mistakes.
  test('nothing is a synonym by resemblance', () => {
    expect(AdvertLexicon.areSynonyms('Swift', 'SwiftUI')).toBe(false);
    expect(AdvertLexicon.areSynonyms('Android', 'iOS')).toBe(false);
    expect(AdvertLexicon.areSynonyms('Swift', 'Swift')).toBe(false);
  });
});

describe('the language of the advert', () => {
  // Reported, never corrected. A German advert against an English CV is a finding.
  test.each([
    [
      'en',
      'We are looking for an engineer who will build and maintain the iOS application with Swift and SwiftUI, and who can work with the team on the design of the interface and on the quality of the code we ship to our users.'
    ],
    [
      'de',
      'Wir suchen einen Entwickler, der die iOS Anwendung mit Swift und SwiftUI baut und pflegt, und der mit dem Team an der Gestaltung der Oberfläche und an der Qualität des Codes arbeitet, den wir an unsere Nutzer ausliefern.'
    ],
    [
      'it',
      'Cerchiamo uno sviluppatore che costruisca e mantenga l applicazione iOS con Swift e SwiftUI, e che lavori con il team sulla progettazione della interfaccia e sulla qualità del codice che rilasciamo ai nostri utenti.'
    ]
  ])('%s is recognised', (language, text) => {
    expect(AdvertLexicon.languageOf(text).language).toBe(language);
  });

  test('too little text is no answer rather than a guess', () => {
    expect(AdvertLexicon.languageOf('Senior iOS Engineer')).toBeNull();
    expect(AdvertLexicon.languageOf('')).toBeNull();
  });
});
