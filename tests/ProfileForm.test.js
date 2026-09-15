/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { ProfileForm, segments } from '../core/ProfileForm.js';
import { PROFILE, ProfileShape } from '../core/ProfileShape.js';

// The editor's form is built from the profile's shape, and every change to the profile is made here, as a
// new profile, so the page that shows the form decides nothing (#23; CLAUDE.md: no business logic in views).
const published = JSON.parse(
  readFileSync(new URL('../profiles/general/en.json', import.meta.url), 'utf8')
);
const untouched = structuredClone(published);
const find = (nodes, path) => {
  for (const node of nodes) {
    if (node.path === path) return node;
    const inner = find([...(node.fields || []), ...(node.items || [])], path);
    if (inner) return inner;
  }
  return null;
};

describe('the form over a profile', () => {
  test('lists every field the shape has, in its order, with the profile’s values', () => {
    const fields = ProfileForm.fields(published);

    expect(fields.map(({ key }) => key)).toEqual(
      Object.keys(PROFILE.fields).filter((key) => key !== 'letter')
    );
    expect(find(fields, 'name')).toMatchObject({
      kind: 'text',
      label: 'Name',
      required: true,
      value: published.name
    });
    const experience = find(fields, 'relevant_experience');
    expect(experience).toMatchObject({ kind: 'list', itemLabel: 'Role' });
    expect(experience.items).toHaveLength(published.relevant_experience.length);
    expect(experience.items[0].fields.map(({ key }) => key)).toEqual([
      'title',
      'company',
      'location',
      'period',
      'summary',
      'description',
      'highlights'
    ]);
    expect(find(fields, 'relevant_experience[0].highlights[0]')).toMatchObject({
      kind: 'text',
      multiline: true,
      value: published.relevant_experience[0].highlights[0]
    });
  });

  test('a field the profile does not write is in the form, empty', () => {
    expect(find(ProfileForm.fields(published), 'portfolio')).toMatchObject({ value: '' });
  });

  test('a problem is placed on the field it is about, and one with no field is listed apart', () => {
    const problems = [
      { path: 'relevant_experience[1].period', reason: 'carries more than its dates' },
      { path: 'carrer_highlights', reason: 'is not a field the CV reads' }
    ];

    const fields = ProfileForm.fields(published, problems);

    expect(find(fields, 'relevant_experience[1].period').problems).toEqual([
      'carries more than its dates'
    ]);
    expect(find(fields, 'name').problems).toEqual([]);
    expect(ProfileForm.unplaced(problems)).toEqual([problems[1]]);
  });
});

describe('a change to the profile', () => {
  test('is a new profile with the value set, and the profile it was given stays as it was', () => {
    const changed = ProfileForm.set(
      published,
      'relevant_experience[1].highlights[0]',
      'Led the rewrite'
    );

    expect(changed.relevant_experience[1].highlights[0]).toBe('Led the rewrite');
    expect(changed.relevant_experience[1].highlights.slice(1)).toEqual(
      published.relevant_experience[1].highlights.slice(1)
    );
    expect(published).toEqual(untouched);
    expect(ProfileShape.problems(changed)).toEqual([]);
  });

  test('a year typed as digits is a number, a cleared one is gone, and anything else is kept for the check to refuse', () => {
    expect(
      ProfileForm.set(published, 'certifications[0].year', '2027').certifications[0].year
    ).toBe(2027);
    expect(
      ProfileForm.set(published, 'certifications[0].year', '').certifications[0]
    ).not.toHaveProperty('year');
    const typo = ProfileForm.set(published, 'certifications[0].year', '20x7');
    expect(typo.certifications[0].year).toBe('20x7');
    expect(ProfileShape.problems(typo).map(({ path }) => path)).toEqual(['certifications[0].year']);
  });

  test('adding an entry appends one with its required fields empty', () => {
    const roles = ProfileForm.add(published, 'relevant_experience').relevant_experience;
    expect(roles).toHaveLength(published.relevant_experience.length + 1);
    expect(roles.at(-1)).toEqual({ title: '', company: '', period: '' });
    expect(ProfileForm.add(published, 'skills').skills.at(-1)).toEqual({
      category: '',
      items: [{ name: '' }]
    });
    expect(ProfileForm.add(published, 'interests').interests.at(-1)).toBe('');
    expect(
      ProfileForm.add(
        published,
        'relevant_experience[0].highlights'
      ).relevant_experience[0].highlights.at(-1)
    ).toBe('');

    const { portfolio, ...without } = { ...published, portfolio: undefined };
    delete without.career_highlights;
    expect(ProfileForm.add(without, 'career_highlights').career_highlights).toEqual(['']);
  });

  test('an entry can be removed, and moved', () => {
    expect(ProfileForm.remove(published, 'interests', 0).interests).toEqual(
      published.interests.slice(1)
    );
    const moved = ProfileForm.move(published, 'relevant_experience', 2, 0).relevant_experience;
    expect(moved.map(({ company }) => company)).toEqual([
      published.relevant_experience[2].company,
      published.relevant_experience[0].company,
      published.relevant_experience[1].company
    ]);
    expect(published).toEqual(untouched);
  });

  test('a path the shape does not have, or an entry that is not there, is a mistake in the page, and throws', () => {
    expect(() => ProfileForm.set(published, 'nonsense', 'x')).toThrow(/not a field/);
    expect(() => ProfileForm.add(published, 'name')).toThrow(/not a list/);
    expect(() => ProfileForm.remove(published, 'interests', 99)).toThrow(/no entry/);
    expect(() => ProfileForm.move(published, 'interests', 0, -1)).toThrow(/no entry/);
    expect(() => segments('relevant_experience..title')).toThrow(/not a path/);
    expect(segments('relevant_experience[1].highlights[0]')).toEqual([
      'relevant_experience',
      1,
      'highlights',
      0
    ]);
  });
});
