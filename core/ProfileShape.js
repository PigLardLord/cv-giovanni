import { CvDocument } from '../domain/CvDocument.js';
import { DateRange } from '../domain/DateRange.js';

const text = (label, options = {}) => ({ kind: 'text', label, ...options });
const month = (label, options = {}) => ({ kind: 'month', label, ...options });
const period = (label, options = {}) => ({ kind: 'period', label, ...options });
const year = (label, options = {}) => ({ kind: 'year', label, ...options });
const address = (label, options = {}) => ({ kind: 'address', label, ...options });
const list = (label, item, options = {}) => ({ kind: 'list', label, item, ...options });
const group = (label, fields, options = {}) => ({ kind: 'group', label, fields, ...options });

/**
 * The shape of a profile: every field the renderers, Nerd Mode's editor and the PDF read, in the order a
 * profile writes them, and what each must hold (#23). The editor builds its form from this, and a profile is
 * checked against it before it is saved. The labels name the fields for the editor, a tool used on this
 * machine in English; they are not the CV's own labels, which i18next owns.
 */
export const PROFILE = group('Profile', {
  name: text('Name', { required: true }),
  title: text('Title'),
  subtitle: text('Subtitle'),
  location: text('Location'),
  email: text('Email'),
  phone: text('Phone'),
  availability: text('Availability'),
  portfolio: address('Portfolio'),
  profile: text('Profile', { multiline: true }),
  career_highlights: list(
    'Career highlights',
    text('Highlight', { required: true, multiline: true })
  ),
  asOf: month('Lengths counted to'),
  relevant_experience: list(
    'Experience',
    group('Role', {
      title: text('Title', { required: true }),
      company: text('Company', { required: true }),
      location: text('Location'),
      period: period('Period', { required: true }),
      summary: text('Summary', { multiline: true }),
      description: text('Description', { multiline: true }),
      highlights: list('Highlights', text('Highlight', { required: true, multiline: true }))
    })
  ),
  education: list(
    'Education',
    group('Degree', {
      degree: text('Degree', { required: true }),
      school: text('School', { required: true }),
      period: period('Period'),
      description: text('Description', { multiline: true })
    })
  ),
  skills: list(
    'Skills',
    group('Category', {
      category: text('Category', { required: true }),
      items: list('Skills', group('Skill', { name: text('Name', { required: true }) }), {
        required: true
      })
    })
  ),
  languages: list(
    'Languages',
    group('Language', {
      name: text('Language', { required: true }),
      level: text('Level', { required: true })
    })
  ),
  certifications: list(
    'Certifications',
    group('Certification', {
      name: text('Name', { required: true }),
      issuer: text('Issuer'),
      year: year('Year'),
      url: address('Address'),
      description: text('Description', { multiline: true })
    })
  ),
  interests: list('Interests', text('Interest', { required: true })),
  social: list(
    'Links',
    group('Link', {
      platform: text('Platform', { required: true }),
      url: address('Address', { required: true })
    })
  ),
  letter: { kind: 'object', label: 'Cover letter' }
});

const isGroup = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const join = (path, key) => (path ? `${path}.${key}` : key);
const isAddress = (value) => {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Adds the problems of one value against one field's shape, in the order of the fields. */
function check(shape, value, path, found) {
  const problem = (reason) => found.push({ path, reason });
  if (value === undefined || value === null) {
    if (shape.required) problem('is required');
    return;
  }
  switch (shape.kind) {
    case 'text':
      if (typeof value !== 'string') problem('must be text');
      else if (shape.required && !value.trim()) problem('is required');
      return;
    case 'month':
      if (!CvDocument.month(value)) problem('must be a month written as 2026-09');
      return;
    case 'period': {
      const range = DateRange.parse(value);
      if (!range) {
        problem(
          'is not a period the CV can read: write it as "May 2015 – August 2015", "2014 – 2016" or "since March 2021"'
        );
      } else if (range.trailing) {
        problem(
          'carries more than its dates: write the dates only. The length is counted from them, and a note belongs in the summary'
        );
      }
      return;
    }
    case 'year':
      if (!Number.isInteger(value) || value < 1950 || value > 2100) {
        problem('must be a year, as a number such as 2024');
      }
      return;
    case 'address':
      if (typeof value !== 'string' || !isAddress(value)) {
        problem('must be a web address that starts with https:// or http://');
      }
      return;
    case 'list':
      if (!Array.isArray(value)) {
        problem('must be a list');
        return;
      }
      if (shape.required && value.length === 0) problem('needs at least one entry');
      value.forEach((item, index) => check(shape.item, item, `${path}[${index}]`, found));
      return;
    case 'group':
      if (!isGroup(value)) {
        problem('must be a group of fields');
        return;
      }
      for (const [key, field] of Object.entries(shape.fields)) {
        check(field, value[key], join(path, key), found);
      }
      for (const key of Object.keys(value).filter((key) => !Object.hasOwn(shape.fields, key))) {
        found.push({ path: join(path, key), reason: 'is not a field the CV reads' });
      }
      return;
    case 'object':
      if (!isGroup(value)) problem('must be a group of fields');
      return;
    default:
      throw new Error(`no check for a field of kind ${shape.kind}`);
  }
}

/**
 * Checks a profile against `PROFILE` (#23).
 *
 * The checks are the ones the code that reads a profile depends on. A text field is text; a period is one
 * `DateRange` can read, carrying dates and no duration (#55); a month is one `CvDocument` can count to; a year
 * is a number; an address is a web address, never a `javascript:` one; a list holds entries of its shape. A
 * field the CV does not read is a problem too: a misspelt field is a field the page silently leaves out. And
 * a profile with a role still running needs the month its length is counted to.
 */
export class ProfileShape {
  /**
   * @param {unknown} profile - A profile, as a request sent it
   * @returns {{ path: string, reason: string }[]} Every problem, in the order of the fields, each with where it
   *   is (`relevant_experience[1].period`) and what is wrong; none for a sound profile
   */
  static problems(profile) {
    if (!isGroup(profile)) return [{ path: '', reason: 'must be a JSON object' }];
    const found = [];
    for (const [key, field] of Object.entries(PROFILE.fields)) {
      check(field, profile[key], key, found);
      const running = Array.isArray(profile.relevant_experience)
        ? profile.relevant_experience.some(
            (role) => DateRange.parse(role?.period)?.end === 'present'
          )
        : false;
      if (key === 'asOf' && (profile.asOf === undefined || profile.asOf === null) && running) {
        found.push({
          path: 'asOf',
          reason:
            "is required while a role is still running: it is the month that role's length is counted to"
        });
      }
    }
    for (const key of Object.keys(profile).filter((key) => !Object.hasOwn(PROFILE.fields, key))) {
      found.push({ path: key, reason: 'is not a field the CV reads' });
    }
    return found;
  }
}
