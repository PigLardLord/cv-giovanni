/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CvDocument } from '../domain/CvDocument.js';
import { AtsTextParser } from '../core/AtsTextParser.js';
import { RecoveryDiff } from '../core/RecoveryDiff.js';
import { catalogueTranslator } from '../scripts/lib/printed-letter.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const document = new CvDocument(
  JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'))
);
const diffOf = (fixture, options) =>
  RecoveryDiff.diff(
    document,
    AtsTextParser.parse(readFileSync(`${root}tests/fixtures/ats/${fixture}.txt`, 'utf8')),
    options
  );
// How the page writes a count of credits in English: the catalogue's words, with Intl writing the number (#48).
const t = catalogueTranslator({
  cv: JSON.parse(readFileSync(`${root}locales/en/cv.json`, 'utf8'))
});
const words = { locale: 'en', credits: (count) => t('cv:education.credits', { count }) };

describe('the ladder', () => {
  test.each([
    ['Swift', 'Swift', 'exact'],
    ['Swift', 'swift ', 'normalised'],
    ['Clean Architecture', 'Architecture', 'partial'],
    ['Cortado Mobile Solutions', 'Apparound', 'wrong'],
    ['Swift', null, 'lost'],
    ['Swift', '', 'lost']
  ])('%s against %s is %s', (authored, recovered, expected) => {
    expect(RecoveryDiff.verdict(authored, recovered)).toBe(expected);
  });

  test('a normaliser applies per type', () => {
    expect(RecoveryDiff.verdict('+39 329 8484 046', '+393298484046', 'phone')).toBe('normalised');
    expect(RecoveryDiff.verdict('A@B.com', 'a@b.com', 'email')).toBe('normalised');
    expect(RecoveryDiff.verdict('Delivery & platform', 'Delivery and platform', 'skill')).toBe(
      'normalised'
    );
  });

  // `partial` needs a whole-word run, or every short string would be inside every long one.
  test('a fragment is not a partial match', () => {
    expect(RecoveryDiff.verdict('Swift', 'Swi')).toBe('wrong');
    expect(RecoveryDiff.verdict('Architecture & practices', 'Architecture &', 'skill')).toBe(
      'partial'
    );
  });
});

describe('the artefact this repository actually ships', () => {
  const diff = diffOf('clean-english');

  test('everything is recovered, and the phone only differs in its spacing', () => {
    expect(diff.identity).toEqual({
      name: 'exact',
      title: 'exact',
      email: 'exact',
      phone: 'normalised',
      location: 'exact'
    });
  });

  test('every address is in the text layer, not only in an annotation', () => {
    expect(diff.links.every((link) => link.recovered)).toBe(true);
  });

  test('every role keeps its title, employer, period and neighbours', () => {
    expect(diff.experience).toEqual([
      {
        title: 'exact',
        employer: 'exact',
        period: 'exact',
        tripleAdjacent: true,
        highlights: 'exact'
      },
      {
        title: 'exact',
        employer: 'exact',
        period: 'exact',
        tripleAdjacent: true,
        highlights: 'exact'
      },
      {
        title: 'exact',
        employer: 'exact',
        period: 'exact',
        tripleAdjacent: true,
        highlights: 'exact'
      }
    ]);
    expect(diff.roleOrderMonotonic).toBe(true);
  });

  test('every skill stays with its own category', () => {
    expect(diff.skills.every((group) => group.category === 'exact' && group.attached)).toBe(true);
    expect(diff.skills.flatMap((group) => group.lost)).toEqual([]);
  });

  // Nothing came back that the document never wrote. This is the assertion that would catch
  // an interleave, and it cannot be expressed by asking whether a string is present.
  test('nothing was recovered that the document never wrote', () => {
    expect(diff.unexpected).toEqual({ skillCategories: [], roles: 0 });
    expect(diff.sections.missing).toEqual([]);
  });
});

describe('each defect shows up as its own kind of damage', () => {
  test('a torn category is partial, and leaves two categories nobody wrote', () => {
    const diff = diffOf('orphan-category');
    const architecture = diff.skills[diff.skills.length - 1];

    expect(architecture.category).toBe('partial');
    expect(diff.unexpected.skillCategories).toEqual(['Architecture &', 'practices']);
  });

  // The three roles are all present and every string is intact. Only their order is wrong,
  // which is precisely what no `includes()` check can see. Each role is matched to its own by what it says (#217),
  // so the order costs the chronology, and no role reads as its neighbour.
  test('serialised columns keep every role and break the chronology', () => {
    const diff = diffOf('two-column-serialised');

    expect(diff.roleOrderMonotonic).toBe(false);
    expect(diff.experience.map(({ employer, period }) => [employer, period])).toEqual([
      ['exact', 'exact'],
      ['exact', 'exact'],
      ['exact', 'exact']
    ]);
  });

  test('a flattened table loses the title and the employer together', () => {
    const diff = diffOf('table-flattened');

    expect(diff.experience[0].title).toBe('lost');
    expect(diff.experience[0].employer).toBe('lost');
    expect(diff.experience[0].tripleAdjacent).toBe(false);
  });

  test('a dropped header loses the email', () => {
    expect(diffOf('header-footer-dropped').identity.email).toBe('lost');
  });

  test('a document that did not segment loses everything downstream', () => {
    const diff = diffOf('no-headings');

    expect(diff.segmentation).toBe('failed');
    expect(diff.sections.missing.length).toBeGreaterThan(0);
    expect(diff.experience.every((role) => role.title === 'lost')).toBe(true);
  });

  test('a link that exists only as an annotation is reported lost, not assumed', () => {
    const diff = RecoveryDiff.diff(
      document,
      AtsTextParser.parse(
        [
          'Giovanni Trovato',
          'Senior iOS Engineer / Mobile Platform Owner',
          'GitHub · LinkedIn · Web CV',
          '',
          'Professional Experience',
          '',
          'Mobile Software Engineer',
          'Cortado · Berlin',
          'August 2018 – Present',
          '',
          'Education',
          '',
          'M.Sc.',
          'Pisa · 2015'
        ].join('\n')
      )
    );

    expect(diff.links.every((link) => link.recovered)).toBe(false);
  });
});

// The page and the PDF write each role's length after its period, while the profile's period holds only the
// dates (#55). The dates recovered are what is compared.
test('a recovered period reads exact though the document wrote its length after it', () => {
  expect(diffOf('clean-english').experience.map((role) => role.period)).toEqual(
    document.experience.map(() => 'exact')
  );
});

// The page's print (#147): every role, degree and skill in its own slot, in the order poppler reads it.
describe.each(['page-print-spotlight', 'page-print-nerd'])(
  'the page as %s prints it',
  (fixture) => {
    const diff = diffOf(fixture, { words });

    test('every role keeps its title, employer and period', () => {
      expect(
        diff.experience.map(({ title, employer, period, tripleAdjacent }) => ({
          title,
          employer,
          period,
          tripleAdjacent
        }))
      ).toEqual(
        document.experience.map(() => ({
          title: 'exact',
          employer: 'exact',
          period: 'exact',
          tripleAdjacent: true
        }))
      );
    });

    // A degree that states its credits prints them after its name, "… Development (60 ECTS)" (#48). It is compared as
    // the document prints it, so a parser that returns that line lost nothing the document said (#186). Its period
    // prints in brackets after the school, and is graded as a role's is (#200).
    test('every degree keeps its school and its period, and one that states its credits reads exact', () => {
      expect(diff.education).toEqual(
        document.education.map(() => ({
          degree: 'exact',
          school: 'exact',
          period: 'exact',
          adjacent: true
        }))
      );
    });

    test('every skill stays with its own category', () => {
      expect(diff.skills.every((group) => group.category === 'exact' && group.attached)).toBe(true);
      expect(diff.unexpected).toEqual({ skillCategories: [], roles: 0 });
    });

    // A certification prints its issuer and year after its name (#169), and is compared as it prints.
    test('every certification comes back as its line prints', () => {
      expect(diff.certifications).toEqual(document.certifications.map(() => ({ name: 'exact' })));
    });
  }
);

// A degree is compared as the document prints it: its name, and the scope it states after the name, in the words the
// page writes it with (#186). The scope that printed is part of what the document said, so losing it is a loss.
describe('a degree is compared against the line the document prints', () => {
  const print = readFileSync(`${root}tests/fixtures/ats/page-print-nerd.txt`, 'utf8');
  const [pisa] = document.education;
  const diffOfText = (text, options = { words }) =>
    RecoveryDiff.diff(document, AtsTextParser.parse(text), options);

  test('recovered with the scope it printed, it lost nothing', () => {
    expect(diffOfText(print).education[0].degree).toBe('exact');
  });

  test('its evidence quotes the printed line, scope included', () => {
    expect(diffOfText(print).evidence['education.0.degree'].written).toBe(
      `${pisa.degree} (60 ECTS)`
    );
  });

  test('recovered without the scope it printed, it is partial', () => {
    const text = print.replace('Development (60 ECTS)', 'Development');

    expect(diffOfText(text).education[0].degree).toBe('partial');
  });

  test('recovered cut short, it is partial', () => {
    const text = print.replace(
      "First Level Professional Master's Programme in Mobile Applications\nDevelopment (60 ECTS)",
      "First Level Professional Master's Programme"
    );

    expect(text).not.toBe(print);
    expect(diffOfText(text).education[0].degree).toBe('partial');
  });

  test('a degree that states no scope is compared by its name alone', () => {
    expect(diffOfText(print).education[1].degree).toBe('exact');
  });

  // Without the words the page wrote the scope in, the comparison cannot build the printed line, and a printed scope
  // costs: the default errs toward a loss, never toward full marks.
  test('without the words the scope was written in, a printed scope reads as a loss', () => {
    expect(diffOfText(print, {}).education[0].degree).toBe('partial');
    expect(RecoveryDiff.diff(document, AtsTextParser.parse(print)).education[0].degree).toBe(
      'partial'
    );
  });
});

// A degree's period was never graded, so a print that lost it scored the same and the report named nothing (#200). It
// is compared as the school line prints it, "School (2014 – 2016)", without the brackets `schoolLine` sets it in: the
// parser reads them as the line's punctuation, as it reads " · ", and returns the period alone.
describe("a degree's period is compared as the school line prints it", () => {
  const nerd = readFileSync(`${root}tests/fixtures/ats/page-print-nerd.txt`, 'utf8');
  const clean = readFileSync(`${root}tests/fixtures/ats/clean-english.txt`, 'utf8');
  const [pisa] = document.education;
  const diffOfText = (text, from = document) =>
    RecoveryDiff.diff(from, AtsTextParser.parse(text), { words });

  test('printed in brackets and recovered without them, it lost nothing', () => {
    const diff = diffOfText(nerd);

    expect(nerd).toContain(`${pisa.school} (${pisa.period})`);
    expect(diff.education.map((degree) => degree.period)).toEqual(['exact', 'exact']);
    expect(diff.evidence['education.0.period']).toEqual({
      written: pisa.period,
      recovered: pisa.period
    });
  });

  test('printed after a separator, it lost nothing either', () => {
    expect(diffOfText(clean).education[0].period).toBe('exact');
  });

  test('a school line that came back without its period lost it', () => {
    const text = clean.replace(`${pisa.school} · ${pisa.period}`, pisa.school);
    const diff = diffOfText(text);

    expect(text).not.toBe(clean);
    expect(diff.education[0]).toEqual(expect.objectContaining({ school: 'exact', period: 'lost' }));
    expect(diff.evidence['education.0.period']).toEqual({ written: pisa.period, recovered: null });
  });

  test('a period recovered as other dates is wrong', () => {
    const diff = diffOfText(nerd.replace(`(${pisa.period})`, '(2015 – 2017)'));

    expect(diff.education[0].period).toBe('wrong');
    expect(diff.evidence['education.0.period'].recovered).toBe('2015 – 2017');
  });

  // A degree that prints no period has none to lose, whether the profile leaves it out or holds only whitespace, which
  // the school line prints as nothing.
  test.each([[undefined], [''], ['   ']])(
    'a degree whose period is %p is not graded on one',
    (period) => {
      const undated = new CvDocument({
        education: [{ degree: 'B.Sc.', school: 'Somewhere', period }]
      });
      const diff = RecoveryDiff.diff(undated, AtsTextParser.parse('Education\nB.Sc.\nSomewhere'));

      expect(diff.education[0]).not.toHaveProperty('period');
      expect(diff.evidence).not.toHaveProperty(['education.0.period']);
    }
  );
});

// An entry was matched to the document's by its position alone: a parser that dropped the first of three degrees
// compared the second with the first and the third with the second, so one loss read as three and none named the degree
// it was (#217). A recovered entry is matched to a written one by what it says.
describe('an entry is matched to the one written by what it says, not by where it stands', () => {
  const profile = JSON.parse(readFileSync(`${root}profiles/general/en.json`, 'utf8'));
  const nerd = readFileSync(`${root}tests/fixtures/ats/page-print-nerd.txt`, 'utf8');
  const diffOfText = (text, from) =>
    RecoveryDiff.diff(new CvDocument(from), AtsTextParser.parse(text), { words });

  describe('a degree, by its name and its school', () => {
    const phd = {
      degree: 'PhD in Computer Science',
      school: 'Università di Bologna',
      period: '2017 – 2020'
    };
    const three = { ...profile, education: [phd, ...profile.education] };
    const whole = { degree: 'exact', school: 'exact', period: 'exact', adjacent: true };
    const printed = nerd.replace(
      'Education\n',
      `Education\n${phd.degree}\n${phd.school} (${phd.period})\n\n`
    );

    test('three degrees printed come back whole', () => {
      expect(printed).not.toBe(nerd);
      expect(diffOfText(printed, three).education).toEqual([whole, whole, whole]);
    });

    test('a parse that drops the first of three loses that one, and the other two come back whole', () => {
      const diff = diffOfText(nerd, three);

      expect(diff.education).toEqual([
        { degree: 'lost', school: 'lost', period: 'lost', adjacent: false },
        whole,
        whole
      ]);
      expect(RecoveryDiff.losses(diff)).toEqual([
        { path: ['education', 0, 'degree'], verdict: 'lost', written: phd.degree, recovered: null },
        { path: ['education', 0, 'school'], verdict: 'lost', written: phd.school, recovered: null },
        { path: ['education', 0, 'period'], verdict: 'lost', written: phd.period, recovered: null }
      ]);
    });

    // Dates only break a tie between degrees their name or school already match: a degree whose name and school match
    // none written is one nobody wrote, whatever year it prints, and the degree that year belongs to is lost (the code
    // review of #222).
    test('a degree that shares only its period with a written one matches none, and that one is lost', () => {
      const culinary = nerd.replace(
        'B.Sc. Computer Engineering\nUniversità degli Studi di Catania (2009)',
        'Diploma in Culinary Arts\nScuola Alberghiera di Roma (2009)'
      );
      const diff = diffOfText(culinary, profile);

      expect(culinary).not.toBe(nerd);
      expect(diff.education).toEqual([
        whole,
        { degree: 'lost', school: 'lost', period: 'lost', adjacent: false }
      ]);
      expect(diff.unmatched.education).toEqual([
        ['Diploma in Culinary Arts', 'Scuola Alberghiera di Roma', '2009']
      ]);
    });

    test('degrees printed in another order come back whole', () => {
      const pisa =
        "First Level Professional Master's Programme in Mobile Applications\nDevelopment (60 ECTS)\nUniversità degli Studi di Pisa (2014 – 2016)";
      const catania = 'B.Sc. Computer Engineering\nUniversità degli Studi di Catania (2009)';
      const reordered = nerd.replace(`${pisa}\n\n${catania}`, `${catania}\n\n${pisa}`);

      expect(reordered).not.toBe(nerd);
      expect(diffOfText(reordered, profile).education).toEqual([whole, whole]);
    });
  });

  describe('a role, by its title and its employer', () => {
    const whole = {
      title: 'exact',
      employer: 'exact',
      period: 'exact',
      tripleAdjacent: true,
      highlights: 'exact'
    };
    // The first role's block as the print writes it: its period, its header and its achievements.
    const cortado = nerd.slice(
      nerd.indexOf('August 2018 – Present'),
      nerd.indexOf('September 2015 – July 2018')
    );

    test('a parse that drops the first of three loses that one, and the other two come back whole', () => {
      const diff = diffOfText(nerd.replace(cortado, ''), profile);
      const [first] = profile.relevant_experience;

      expect(diff.experience).toEqual([
        {
          title: 'lost',
          employer: 'lost',
          period: 'lost',
          tripleAdjacent: false,
          highlights: 'lost'
        },
        whole,
        whole
      ]);
      expect(
        RecoveryDiff.losses(diff)
          .filter(({ path }) => path[0] === 'experience')
          .map(({ path }) => path.join('.'))
      ).toEqual([
        'experience.0.title',
        'experience.0.employer',
        'experience.0.period',
        'experience.0.highlights'
      ]);
      expect(diff.evidence['experience.0.title']).toEqual({
        written: first.title,
        recovered: null
      });
      expect(diff.unexpected.roles).toBe(0);
    });

    // The order is judged where it was lost, in the order the roles came back, and costs the chronology alone.
    test('roles printed in another order come back whole, and break the chronology', () => {
      const reordered = nerd.replace(cortado, '').replace('Wikitude.\n', `Wikitude.\n\n${cortado}`);
      const diff = diffOfText(reordered, profile);

      expect(reordered).not.toBe(nerd);
      expect(diff.experience).toEqual([whole, whole, whole]);
      expect(diff.roleOrderMonotonic).toBe(false);
    });

    // A role whose title, employer and dates match nothing written is not the first role graded wrong: it is a role
    // nobody wrote, and the one it displaced is lost, though the document holds no more roles than came back.
    test('a role that says nothing of any written one is a role nobody wrote, and the one it displaced is lost', () => {
      const invented = nerd
        .replace('August 2018 – Present', 'January 2019 – March 2020')
        .replace(
          'iOS Developer at Cortado Mobile Solutions, Berlin (remote)',
          'Head Chef at Trattoria Da Mario, Rome, Italy'
        );
      const diff = diffOfText(invented, profile);

      expect(invented).not.toBe(nerd);
      expect(diff.experience[0]).toEqual(
        expect.objectContaining({ title: 'lost', employer: 'lost', period: 'lost' })
      );
      expect(diff.experience.slice(1)).toEqual([whole, whole]);
      expect(diff.unexpected.roles).toBe(1);
    });

    // Dates only break a tie between roles their title or employer already match (the code review of #222). A role
    // that came back with another title and employer and a written role's dates is not that role with two wrong
    // fields: matched on its dates, it read the written role's period and achievements as recovered, and was not
    // counted as a role nobody wrote.
    test('a role that shares only its period with a written one matches none, and that one is lost', () => {
      const chef = nerd.replace(
        'iOS Developer at Cortado Mobile Solutions, Berlin (remote)',
        'Head Chef at Trattoria Da Mario, Rome, Italy'
      );
      const diff = diffOfText(chef, profile);

      expect(chef).not.toBe(nerd);
      expect(diff.experience).toEqual([
        {
          title: 'lost',
          employer: 'lost',
          period: 'lost',
          tripleAdjacent: false,
          highlights: 'lost'
        },
        whole,
        whole
      ]);
      expect(diff.unmatched.experience).toEqual([
        ['Head Chef', 'Trattoria Da Mario', 'August 2018 – Present']
      ]);
      expect(diff.unexpected.roles).toBe(1);
    });

    // A flattened table keeps a role's dates and loses its title and employer. Nothing that identifies a role came
    // back, so it matches none written: the role is lost, and what came back is a role nobody wrote.
    test('a role whose title and employer came back as nothing matches none', () => {
      const diff = diffOf('table-flattened');

      expect(diff.experience[0]).toEqual(
        expect.objectContaining({ title: 'lost', employer: 'lost', period: 'lost' })
      );
      expect(diff.unmatched.experience).toEqual([['August 2018 – Present']]);
      expect(diff.unexpected.roles).toBe(1);
    });
  });

  describe('a certification, by the line it prints', () => {
    const scrum = { name: 'Professional Scrum Master I', issuer: 'Scrum.org', year: 2020 };
    const android = 'Android Enterprise Expert (incl. Associate, Professional) – Google (2026)';
    const ios = 'iOS Lead Essentials (TDD, Clean Architecture) – Essential Developer (2024)';

    test('a parse that drops the first of three loses that one, and the other two come back whole', () => {
      const three = { ...profile, certifications: [scrum, ...profile.certifications] };
      const diff = diffOfText(nerd, three);

      expect(diff.certifications).toEqual([{ name: 'lost' }, { name: 'exact' }, { name: 'exact' }]);
      expect(RecoveryDiff.losses(diff)).toEqual([
        {
          path: ['certifications', 0, 'name'],
          verdict: 'lost',
          written: 'Professional Scrum Master I – Scrum.org (2020)',
          recovered: null
        }
      ]);
    });

    test('certifications printed in another order come back whole', () => {
      const reordered = nerd.replace(`${android}\n${ios}`, `${ios}\n${android}`);

      expect(reordered).not.toBe(nerd);
      expect(diffOfText(reordered, profile).certifications).toEqual([
        { name: 'exact' },
        { name: 'exact' }
      ]);
    });
  });

  describe('a spoken language, by its name', () => {
    const whole = { name: 'exact', level: 'exact' };

    test('a parse that drops the first of three loses that one, and the other two come back whole', () => {
      const diff = diffOfText(nerd.replace('Italian: Native\n', ''), profile);

      expect(diff.spokenLanguages).toEqual([{ name: 'lost', level: 'lost' }, whole, whole]);
      expect(diff.evidence['spokenLanguages.0.name']).toEqual({
        written: 'Italian',
        recovered: null
      });
    });

    test('languages printed in another order come back whole', () => {
      const italian = 'Italian: Native\n';
      const english = 'English: C1 — professional working proficiency\n';
      const reordered = nerd.replace(`${italian}${english}`, `${english}${italian}`);

      expect(reordered).not.toBe(nerd);
      expect(diffOfText(reordered, profile).spokenLanguages).toEqual([whole, whole, whole]);
    });
  });

  // Categories were already found by their label. Each recovered category now answers for one written category only,
  // and is not also a piece of another that came back torn.
  describe('a skill category, by its label', () => {
    test('a category written twice and printed once is recovered once, and the other is lost', () => {
      const twice = {
        ...profile,
        skills: [...profile.skills, { category: 'iOS', items: [{ name: 'Objective-C' }] }]
      };
      const diff = diffOfText(nerd, twice);

      expect(diff.skills.map((group) => group.category)).toEqual([
        'exact',
        'exact',
        'exact',
        'exact',
        'lost'
      ]);
      expect(diff.skills[0].attached).toBe(true);
      expect(diff.skills[4]).toEqual({ category: 'lost', attached: false, lost: ['Objective-C'] });
    });
  });
});
