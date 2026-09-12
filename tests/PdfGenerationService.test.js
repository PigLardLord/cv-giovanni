import { jest } from '@jest/globals';
import { PdfGenerationService } from '../core/PdfGenerationService.js';

test('injects composer, renderer and writer boundaries', async () => {
  const composer = {
    buildDocument: jest.fn(() => ({ content: [] })),
    filename: jest.fn(() => 'cv.pdf')
  };
  const renderer = { render: jest.fn(async () => new Uint8Array([1, 2, 3])) };
  const writer = { write: jest.fn(async () => {}) };
  const service = new PdfGenerationService({ composer, renderer, writer });

  const result = await service.generate({ name: 'Candidate' }, { layout: 'new-layout' });

  expect(renderer.render).toHaveBeenCalledWith({ content: [] });
  expect(composer.filename).toHaveBeenCalledWith({ name: 'Candidate' }, { layout: 'new-layout' });
  expect(writer.write).toHaveBeenCalledWith('cv.pdf', expect.any(Uint8Array));
  expect(result).toEqual({ filename: 'cv.pdf', bytes: 3 });
});
