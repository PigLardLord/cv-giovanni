import { ErrorRenderer } from '../renderers/ErrorRenderer.js';
import { JSDOM } from 'jsdom';

describe('ErrorRenderer', () => {
  let document;

  beforeEach(() => {
    document = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>').window
      .document;
  });

  test('renders the failure where the CV would have been', () => {
    new ErrorRenderer().render(document, {
      title: 'Error loading CV',
      message: 'profile not found',
      hint: 'Check the console.'
    });
    const text = document.body.textContent;
    expect(text).toContain('Error loading CV');
    expect(text).toContain('profile not found');
    expect(text).toContain('Check the console.');
  });

  test('replaces whatever was there, so a half-rendered CV is not left behind', () => {
    document.body.innerHTML = '<p id="stale">half a CV</p>';
    new ErrorRenderer().render(document, { title: 'T', message: 'M', hint: 'H' });
    expect(document.getElementById('stale')).toBeNull();
  });

  test('carries no inline styling: the look belongs to the stylesheet', () => {
    new ErrorRenderer().render(document, { title: 'T', message: 'M', hint: 'H' });
    expect(document.body.innerHTML).not.toContain('style=');
    expect(document.querySelector('.cv-error')).not.toBeNull();
  });
});
