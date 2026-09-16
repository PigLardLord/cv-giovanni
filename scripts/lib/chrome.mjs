import { spawn } from 'node:child_process';
import { devtoolsSession, within } from './devtools-session.mjs';

/**
 * Chrome with its DevTools socket open, and the three things this audit asks of it.
 *
 * Every wait has a deadline, and whatever ends the connection — the socket closing, the browser
 * exiting — fails every command still waiting on it: a promise nothing will settle would hold the
 * audit open, and its cleanup with it. Until the socket is open the browser belongs to this function,
 * which kills it on any failure; after that it belongs to the caller, through `close`.
 */
export async function openBrowser(binary, dataDir) {
  const child = spawn(
    binary,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      `--user-data-dir=${dataDir}`,
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  // Settles once the browser is gone, whether it stopped or never started.
  const gone = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
  let socket;
  // Resolves once the browser has exited. Killed outright, its renderers outlived it and went on writing
  // into the profile directory the audit removes next: on the CI runner that removal failed with
  // ENOTEMPTY on every run, after every check had passed, and the audit exited 1 with no report (#89).
  // Asked to stop, Chrome closes its profile first; only a browser that does not stop is killed.
  const close = async () => {
    socket?.close();
    child.kill('SIGTERM');
    const stopped = await within(gone, 5000, 'the browser did not stop').then(
      () => true,
      () => false
    );
    if (!stopped) {
      child.kill('SIGKILL');
      await within(gone, 5000, 'the browser did not exit').catch(() => {});
    }
  };

  try {
    const address = await within(
      new Promise((resolve, reject) => {
        let output = '';
        child.on('error', (error) =>
          reject(new Error(`the browser did not start: ${error.message}`))
        );
        child.on('exit', (code) =>
          reject(new Error(`the browser exited with ${code} before listening`))
        );
        child.stderr.on('data', (chunk) => {
          output += chunk;
          const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
          if (match) resolve(match[1]);
        });
      }),
      30000,
      'the browser printed no DevTools address'
    );
    const pages = await within(
      fetch(`http://127.0.0.1:${new URL(address).port}/json/list`).then((response) =>
        response.json()
      ),
      10000,
      'the browser listed no page'
    );
    socket = new WebSocket(pages.find((entry) => entry.type === 'page').webSocketDebuggerUrl);
    await within(
      new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', () => reject(new Error('the DevTools socket failed')), {
          once: true
        });
      }),
      10000,
      'the DevTools socket did not open'
    );
  } catch (error) {
    await close();
    throw error;
  }

  const { send, next, receive, end } = devtoolsSession((frame) => socket.send(frame));
  child.on('exit', (code) => end(`the browser exited with ${code}`));
  socket.addEventListener('close', () => end('the DevTools socket closed'));
  socket.addEventListener('error', () => end('the DevTools socket failed'));
  socket.addEventListener('message', (event) => receive(JSON.parse(event.data)));
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }
    return result.value;
  };
  return { send, next, evaluate, close };
}
