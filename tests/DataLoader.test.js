import { DataLoader } from '../core/DataLoader.js';

// Create a simple fetch mock
const createMockFetch = (response) => {
  return () => Promise.resolve(response);
};

describe('DataLoader', () => {
  let dataLoader;
  let originalFetch;

  beforeEach(() => {
    dataLoader = new DataLoader('test-data.json');
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('validates CV data structure', () => {
    expect(dataLoader.validateCVData({ name: 'John' })).toBe(true);
    expect(dataLoader.validateCVData({ title: 'Developer' })).toBe(true);
    expect(dataLoader.validateCVData({})).toBe(false);
    expect(dataLoader.validateCVData(null)).toBe(false);
  });

  test('handles invalid data structure', async () => {
    global.fetch = createMockFetch({
      ok: true,
      json: async () => ({})
    });

    await expect(dataLoader.loadCVData()).rejects.toThrow('Invalid CV data structure');
  });

  test('handles HTTP errors', async () => {
    global.fetch = createMockFetch({
      ok: false,
      status: 404
    });

    await expect(dataLoader.loadCVData()).rejects.toThrow('HTTP error! status: 404');
  });
});