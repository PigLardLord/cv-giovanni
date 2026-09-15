/**
 * @jest-environment node
 */
import { PassThrough } from 'node:stream';
import { handleApi } from '../adapters/LocalApi.js';

// The code review of #113: a client that went away while it sent a body made the body's stream fail, and the
// rejection escaped handleApi, which answers only inside its try. Unhandled, it took the server down, with every
// page and build it was serving. A client that has gone has no one to answer, and the server carries on.
describe('a request abandoned while it sends its body', () => {
  const abandoned = (method, url) =>
    Object.assign(new PassThrough(), {
      method,
      url,
      headers: { 'content-type': 'application/json' }
    });
  const unanswered = () => {
    const written = [];
    return {
      written,
      writeHead: (...head) => written.push(head),
      end: (body) => written.push(body)
    };
  };

  test.each([
    ['PUT', '/api/profile'],
    ['POST', '/api/applications']
  ])('%s %s settles quietly, and answers no one', async (method, url) => {
    const request = abandoned(method, url);
    const response = unanswered();
    const handled = handleApi(request, response, {});
    request.write('{"na');
    request.destroy(new Error('aborted'));

    await expect(handled).resolves.toBeUndefined();
    expect(response.written).toEqual([]);
  });
});
