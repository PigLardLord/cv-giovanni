/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';

// tests/fixtures/ats/clean-english.txt is the recoverability tests' reference: they diff what the parser
// recovers from it against profiles/general/en.json. It was written by hand, and it drifted from the
// profile — a withdrawn degree, a German level the profile had already corrected — while every test built
// on it kept passing (#50). Its education and its languages are the profile's, line for line.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const profile = JSON.parse(read('profiles/general/en.json'));
const labels = JSON.parse(read('locales/en/cv.json')).sections;
const fixture = read('tests/fixtures/ats/clean-english.txt');

/** The non-empty lines between one heading of the fixture and the next. */
const between = (text, heading, next) => {
  const lines = text.split('\n').map((line) => line.trim());
  const start = lines.indexOf(heading);
  const end = lines.indexOf(next, start + 1);
  return start < 0 || end < 0 ? null : lines.slice(start + 1, end).filter(Boolean);
};

/** What the fixture's two sections hold. */
const written = (text) => ({
  education: between(text, labels.education, labels.languages),
  languages: between(text, labels.languages, labels.certifications)
});

/** What the profile says they hold, in the form the extracted PDF writes it. */
const authored = (cv) => ({
  education: cv.education.flatMap(({ degree, school, period }) => [
    degree,
    `${school} · ${period}`
  ]),
  languages: cv.languages.map(({ name, level }) => `${name}: ${level}`)
});

describe('the reference fixture follows the profile', () => {
  test('the check finds a line changed away from the profile', () => {
    const [line] = authored(profile).languages;
    const drifted = fixture.replace(line, `${line} (drifted)`);

    expect(drifted).not.toBe(fixture);
    expect(written(drifted)).not.toEqual(authored(profile));
  });

  test('its education lines are the profile’s', () => {
    expect(written(fixture).education).toEqual(authored(profile).education);
  });

  test('its language lines are the profile’s', () => {
    expect(written(fixture).languages).toEqual(authored(profile).languages);
  });
});
