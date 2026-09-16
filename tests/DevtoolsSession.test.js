/**
 * @jest-environment node
 */
import { devtoolsSession } from '../scripts/lib/devtools-session.mjs';

// The screen audit talks to Chrome over one DevTools socket: commands answered by id, and waits for an event by its
// name. These drive the session with frames, without a browser.
const session = () => {
  const written = [];
  return { written, ...devtoolsSession((frame) => written.push(JSON.parse(frame))) };
};

describe('a DevTools session', () => {
  test('answers a command by its id, and fails one the browser refuses', async () => {
    const { written, send, receive } = session();
    const navigated = send('Page.navigate', { url: 'about:blank' });
    const refused = send('Page.nowhere');
    expect(written).toEqual([
      { id: 1, method: 'Page.navigate', params: { url: 'about:blank' } },
      { id: 2, method: 'Page.nowhere', params: {} }
    ]);

    receive({ id: 2, error: { message: "'Page.nowhere' wasn't found" } });
    receive({ id: 1, result: { frameId: 'F' } });

    await expect(navigated).resolves.toEqual({ frameId: 'F' });
    await expect(refused).rejects.toThrow(/wasn't found/);
  });

  test('hands a wait for an event its params, and no other event', async () => {
    const { next, receive } = session();
    const loaded = next('Page.loadEventFired');
    receive({ method: 'Page.frameNavigated', params: { frame: {} } });
    receive({ method: 'Page.loadEventFired', params: { timestamp: 1 } });

    await expect(loaded).resolves.toEqual({ timestamp: 1 });
  });

  test('fails every command still waiting when the connection ends, and every one sent after', async () => {
    const { send, end } = session();
    const waiting = send('Runtime.evaluate');
    end('the browser exited with 1');

    await expect(waiting).rejects.toThrow('the browser exited with 1');
    await expect(send('Page.enable')).rejects.toThrow('the browser exited with 1');
  });
});
