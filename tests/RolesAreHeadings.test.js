import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { ExperienceRenderer } from '../renderers/ExperienceRenderer.js';
import { EducationRenderer } from '../renderers/EducationRenderer.js';
import { fedTheModel } from './support/model.js';

// In the printed PDF's structure tree a screen-reader user could jump between sections and not between roles: each
// role was a `div` of strong runs (#265). A role and a degree are headings one level below their section's.
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const { document } = new JSDOM(page).window;

describe('a role and a degree', () => {
  test('are headings one level below the section they are in', () => {
    const data = {
      name: 'Ada Lovelace',
      relevant_experience: [
        { title: 'iOS Engineer', company: 'Analytical Engines', period: '2021 – 2023' },
        { title: 'Mobile Developer', company: 'Difference Works', period: '2015 – 2020' }
      ],
      education: [
        { degree: 'B.Sc. Mathematics', school: 'University of London', period: '2010–2013' }
      ]
    };
    fedTheModel(new ExperienceRenderer()).render(document, data);
    fedTheModel(new EducationRenderer()).render(document, data);

    for (const [section, heading, count] of [
      ['experience', 'h4.job-header', 2],
      ['education', 'h4.edu-degree', 1]
    ]) {
      const container = document.getElementById(section);
      const title = container.closest('section, .section, [class*="section"]')?.querySelector('h3');
      expect(title).not.toBeNull();
      expect(container.querySelectorAll(heading)).toHaveLength(count);
    }
    expect([...document.querySelectorAll('h4.job-header')].map((h) => h.textContent)).toEqual([
      'iOS Engineer at Analytical Engines',
      'Mobile Developer at Difference Works'
    ]);
  });

  test('look as they did: the page resets a heading’s own margin, size and weight, and nothing more', () => {
    const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

    expect(style).toMatch(
      /:where\(h4\.job-header, h4\.edu-degree\) \{\n {2}margin: 0;\n {2}font-size: inherit;\n {2}font-weight: inherit;\n {2}line-height: inherit;\n\}/
    );
  });
});
