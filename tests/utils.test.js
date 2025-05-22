const { capitalizeFirstLetter } = require('../utils');

test('capitalizes the first letter of a string', () => {
  expect(capitalizeFirstLetter('hello')).toBe('Hello');
});

test('returns empty string if input is empty', () => {
  expect(capitalizeFirstLetter('')).toBe('');
});