import { ExperienceRenderer } from '../renderers/ExperienceRenderer.js';
import { JSDOM } from 'jsdom';
import { fedTheModel } from './support/model.js';

describe('ExperienceRenderer', () => {
  let document;
  let renderer;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="experience"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
    renderer = fedTheModel(new ExperienceRenderer());
  });

  test('holds every hyphenated compound on one line without touching the text', () => {
    const data = {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          location: 'Pisa',
          period: '2015-2018',
          summary: 'B2B sales-automation platform for field sales teams.',
          highlights: ['Built an offline-first architecture in Objective-C.']
        }
      ]
    };

    renderer.render(document, data);

    // A line that breaks at an existing hyphen extracts from the PDF without it:
    // "offline-first" reaches a parser as "offlinefirst" and no search for the
    // canonical spelling finds it.
    const highlight = document.querySelector('.job-highlights li');
    expect(highlight.textContent).toBe('Built an offline-first architecture in Objective-C.');
    expect([...highlight.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      'offline-first',
      'Objective-C'
    ]);

    const summary = document.querySelector('.job-summary');
    expect(summary.textContent).toBe('B2B sales-automation platform for field sales teams.');
    expect([...summary.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      'sales-automation'
    ]);
  });

  // German writes compounds with letters an ASCII class does not know: "Menü-Leiste" split at the ü, so the
  // rule held "Men" and nothing it should, and a line was free to break at the hyphen — which a text
  // extractor then reads as "MenüLeiste" (#251). A compound is letters and digits in any script.
  test('holds a compound whose letters are not ASCII, as it holds offline-first', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          period: 'September 2015 – July 2018',
          summary: 'Die Menü-Leiste im Groß-Projekt.',
          highlights: ['Die App-Übersicht und die Über-Sicht, offline-first.']
        }
      ]
    });

    const summary = document.querySelector('.job-summary');
    expect(summary.textContent).toBe('Die Menü-Leiste im Groß-Projekt.');
    expect([...summary.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      'Menü-Leiste',
      'Groß-Projekt'
    ]);
    expect(
      [...document.querySelectorAll('.job-highlights .no-break')].map((held) => held.textContent)
    ).toEqual(['App-Übersicht', 'Über-Sicht', 'offline-first']);
  });

  // A German compound can be wider than a phone's column: "Augmented-Reality-Anwendungen" ran 74.6px past it at
  // 320px (#249). On a German screen it may break at its hyphens, where a line break costs nothing, since what a
  // reader copies off a screen is the text and not the lines. A closed range may not: broken after its dash it
  // strands the dash, which is the separator #180 forbids. So the renderer says which held run is which.
  test('marks a hyphenated compound as one, and a closed range as held but not a compound', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          period: 'September 2015 – July 2018',
          highlights: ['Augmented-Reality-Anwendungen, 2020–2023, offline-first.']
        }
      ]
    });

    const held = [...document.querySelectorAll('.job-highlights .no-break')].map((span) => [
      span.textContent,
      span.classList.contains('compound')
    ]);
    expect(held).toEqual([
      ['Augmented-Reality-Anwendungen', true],
      ['2020–2023', false],
      ['offline-first', true]
    ]);
  });

  // On a German screen `.no-break.compound` may wrap (#249). That is safe only while nothing but a hyphenated
  // compound carries the class: a separator or a range that gained it would be free to strand its glyph at a
  // line's edge, which #180 forbids. So every other held run is exactly `no-break`.
  test('gives the compound class to nothing but a hyphenated compound', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          period: 'September 2015 – July 2018',
          summary: 'Berlin · Munich, 2014—2016, 14%→83%, offline-first.',
          highlights: ['From its first commit — owned the architecture, 2020–2023.']
        }
      ]
    });

    const kinds = [
      ...document.querySelectorAll('.job-summary .no-break, .job-highlights .no-break')
    ].map((span) => [span.textContent, span.className]);
    expect(kinds).toEqual([
      [' · ', 'no-break'],
      ['2014—2016,', 'no-break'],
      ['14%→83%,', 'no-break'],
      ['offline-first', 'no-break compound'],
      [' — ', 'no-break'],
      ['2020–2023', 'no-break']
    ]);
  });

  // A closed range is one word too: "ezeep Blue for iOS, 2020–" ended a line at Technical Profile's 320px,
  // with "2023" opening the next (#230). The rule against a line ending on a separator is the same rule.
  test('holds a closed range whole, as it holds a hyphenated compound', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          period: 'September 2015 – July 2018',
          highlights: ['ezeep Blue for iOS, 2020–2023: rewrote it in SwiftUI.']
        }
      ]
    });

    const highlight = document.querySelector('.job-highlights li');
    expect(highlight.textContent).toBe('ezeep Blue for iOS, 2020–2023: rewrote it in SwiftUI.');
    expect([...highlight.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      '2020–2023'
    ]);
  });

  // The range above is held by `setProse`, which knows the hyphen and the en dash and not the em dash, so
  // "2014—2016" still reached `holdSeparators` and was held as the dash alone (#232). Every separator the domain
  // names is held the same way when the data writes it with no space: the dash alone is an atomic box a line may
  // still break after, which is the stranded separator #180 forbids.
  test('holds a separator the data wrote without spaces to the words either side of it', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          period: 'September 2015 – July 2018',
          summary: 'Read 2014—2016 as one range.',
          highlights: ['Shipped to Berlin·Munich, 14%→83% covered.']
        }
      ]
    });

    const summary = document.querySelector('.job-summary');
    expect(summary.textContent).toBe('Read 2014—2016 as one range.');
    expect([...summary.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      '2014—2016'
    ]);

    const highlight = document.querySelector('.job-highlights li');
    expect(highlight.textContent).toBe('Shipped to Berlin·Munich, 14%→83% covered.');
    expect([...highlight.querySelectorAll('.no-break')].map((held) => held.textContent)).toEqual([
      'Berlin·Munich,',
      '14%→83%'
    ]);
  });

  // Two separators that took the same word between them are one run and not two: left as two spans they are two
  // atomic boxes side by side, and the boundary between them is a break opportunity like any other, so a line
  // could still open on "—2018".
  test('holds a word two separators share as one run, not as two boxes side by side', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Mobile Developer',
          company: 'Apparound',
          period: 'September 2015 – July 2018',
          summary: 'Ran 2014—2016—2018 throughout.',
          highlights: ['Shipped to Berlin·Munich·Hamburg.']
        }
      ]
    });

    expect(
      [...document.querySelectorAll('.job-summary .no-break')].map((held) => held.textContent)
    ).toEqual(['2014—2016—2018']);
    expect(
      [...document.querySelectorAll('.job-highlights .no-break')].map((held) => held.textContent)
    ).toEqual(['Berlin·Munich·Hamburg.']);
  });

  // "from its first commit" / "— owned" opened a line at Impact Spotlight's 320px (#180).
  test("holds each separator in a role's prose to the words either side of it", () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          period: '2018',
          summary: 'A team of 3–7 engineers.',
          highlights: ['Owner from its first commit — owned the architecture.']
        }
      ]
    });

    expect(
      [...document.querySelectorAll('.job-summary .no-break, .job-highlights .no-break')].map(
        (span) => span.textContent
      )
      // The range is held whole now, dash and both ends: a break after the dash strands it (#230).
    ).toEqual(['3–7', ' — ']);
    expect(document.querySelector('.job-highlights li').textContent).toBe(
      'Owner from its first commit — owned the architecture.'
    );
  });

  test('renders experience entries correctly', () => {
    const data = {
      relevant_experience: [
        {
          title: 'Senior Developer',
          company: 'Tech Corp',
          location: 'San Francisco',
          period: '2020-2023',
          description: 'Led development of mobile apps.'
        },
        {
          title: 'Developer',
          company: 'StartupXYZ',
          location: 'Austin',
          period: '2018-2020',
          description: 'Built web applications.'
        }
      ]
    };

    renderer.render(document, data);

    const experienceDiv = document.getElementById('experience');
    const jobEntries = experienceDiv.querySelectorAll('.job-entry');

    expect(jobEntries).toHaveLength(2);
    expect(jobEntries[0].textContent).toContain('Senior Developer');
    expect(jobEntries[0].textContent).toContain('Tech Corp');
    expect(jobEntries[1].textContent).toContain('StartupXYZ');
  });

  test('handles missing experience data gracefully', () => {
    expect(() => {
      renderer.render(document, {});
    }).not.toThrow();

    expect(() => {
      renderer.render(document, { relevant_experience: null });
    }).not.toThrow();
  });

  test('handles empty experience array', () => {
    renderer.render(document, { relevant_experience: [] });

    const experienceDiv = document.getElementById('experience');
    const jobEntries = experienceDiv.querySelectorAll('.job-entry');
    expect(jobEntries).toHaveLength(0);
  });

  test('renders structured summaries and achievement bullets', () => {
    renderer.render(document, {
      relevant_experience: [
        {
          title: 'Senior Engineer',
          company: 'Acme',
          location: 'Berlin',
          period: '2020–2026',
          summary: 'Enterprise mobile platform.',
          highlights: ['Improved test coverage.', 'Automated releases.']
        }
      ]
    });

    expect(document.querySelector('.job-summary').textContent).toBe('Enterprise mobile platform.');
    expect(
      [...document.querySelectorAll('.job-highlights li')].map((item) => item.textContent)
    ).toEqual(['Improved test coverage.', 'Automated releases.']);
    expect(document.querySelector('.job-description')).toBeNull();
  });

  test('gives each role its length, counted to the month the profile is written as of (#55)', () => {
    renderer.render(document, {
      asOf: '2026-09',
      relevant_experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          location: 'Berlin',
          period: 'August 2018 – Present',
          highlights: []
        },
        { title: 'Intern', company: 'Marte 5', location: 'Livorno', period: '2015', highlights: [] }
      ]
    });

    expect(
      [...document.querySelectorAll('.job-period')].map((period) => period.textContent)
    ).toEqual(['August 2018 – Present (8 years, 2 months)', '2015']);
    // Its own element, so a narrow line breaks between the dates and the length, never inside the length.
    expect(
      [...document.querySelectorAll('.job-period .job-tenure')].map((tenure) => tenure.textContent)
    ).toEqual(['(8 years, 2 months)']);
    // Each unit stays whole, so a column too narrow for the length breaks after the comma, never inside "2 months".
    expect(
      [...document.querySelectorAll('.job-tenure .no-break')].map((unit) => unit.textContent)
    ).toEqual(['8 years', '2 months']);
  });
  // Split at its dash, a period read as two dates: "(2014" / "– 2016)" on screen (#180). Each end is held together, so
  // a line too narrow for the whole period breaks after its dash, the one break that says the range goes on.
  test('holds each end of a period together, so a narrow line breaks it only after its dash', () => {
    renderer.render(document, {
      asOf: '2026-09',
      relevant_experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          period: 'September 2015 – July 2018',
          highlights: []
        },
        { title: 'Intern', company: 'Marte 5', period: '2015', highlights: [] }
      ]
    });

    const periods = [...document.querySelectorAll('.job-period')];
    expect(
      periods.map((period) =>
        [...period.querySelectorAll(':scope > .no-break')].map((end) => end.textContent)
      )
    ).toEqual([['September 2015 –', 'July 2018'], ['2015']]);
    expect(periods.map((period) => period.textContent)).toEqual([
      'September 2015 – July 2018 (2 years, 11 months)',
      '2015'
    ]);
  });
});
