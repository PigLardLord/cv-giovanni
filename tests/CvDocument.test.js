import { CvDocument } from '../domain/CvDocument.js';

test('maps source data into a framework-free document model', () => {
  const model = new CvDocument({
    name: 'Candidate', title: 'Engineer', profile: 'Summary',
    skills: [{ category: 'iOS', items: [] }], social: [{ platform: 'GitHub', url: 'https://example.test' }]
  });

  expect(model.identity.name).toBe('Candidate');
  expect(model.identity.social).toHaveLength(1);
  expect(model.skills[0].category).toBe('iOS');
  expect(model.experience).toEqual([]);
});
