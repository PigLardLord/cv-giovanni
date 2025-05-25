import { renderHeader } from '../renderers/renderHeader.js';
import { JSDOM } from 'jsdom';

describe('renderHeader', () => {
  let document;

  beforeEach(() => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="name"></div>
          <div id="title"></div>
          <div id="location"></div>
          <div id="contacts"></div>
        </body>
      </html>
    `);
    document = dom.window.document;
  });

  test('inserts name, title, and location into the DOM', () => {
    renderHeader(document, {
      name: 'Alice Dev',
      title: 'Senior iOS Engineer',
      location: 'Berlin',
      email: 'alice@example.com',
      phone: '1234567890'
    });

    expect(document.getElementById('name').textContent).toBe('Alice Dev');
    expect(document.getElementById('title').textContent).toBe('Senior iOS Engineer');
    expect(document.getElementById('location').textContent).toBe('Berlin');
  });

  test('inserts email and phone correctly formatted', () => {
    renderHeader(document, {
      name: '',
      title: '',
      location: '',
      email: 'foo@bar.com',
      phone: '555-1234'
    });

    const contacts = document.getElementById('contacts').innerHTML;
    expect(contacts).toContain('<strong>Email:</strong> foo@bar.com');
    expect(contacts).toContain('<strong>Phone:</strong> 555-1234');
  });

  test('handles missing fields gracefully', () => {
    renderHeader(document, {
      name: '',
      title: '',
      location: '',
      email: '',
      phone: ''
    });

    expect(document.getElementById('name').textContent).toBe('');
    expect(document.getElementById('contacts').innerHTML).toContain('<strong>Email:</strong> <br>');
  });
});