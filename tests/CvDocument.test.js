import { CvDocument } from '../domain/CvDocument.js';

test('maps source data into a framework-free document model', () => {
  const model = new CvDocument({
    name: 'Candidate',
    title: 'Engineer',
    profile: 'Summary',
    skills: [{ category: 'iOS', items: [] }],
    social: [{ platform: 'GitHub', url: 'https://example.test' }]
  });

  expect(model.identity.name).toBe('Candidate');
  expect(model.identity.social).toHaveLength(1);
  expect(model.skills[0].category).toBe('iOS');
  expect(model.experience).toEqual([]);
});

// Interests are part of the CV like every other section. The model carries them, so every output
// boundary built on it can reach them, whether or not it shows them (#35).
test('carries the interests the profile writes, and none when it writes none', () => {
  expect(new CvDocument({ interests: ['Mountain Hiking', 'Tech Mentoring'] }).interests).toEqual([
    'Mountain Hiking',
    'Tech Mentoring'
  ]);
  expect(new CvDocument({}).interests).toEqual([]);
});
