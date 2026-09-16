/** Rejects after `ms`, and clears its timer either way, so no deadline holds the process open. */
export const within = (promise, ms, what) => {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} within ${ms / 1000}s`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
};

/**
 * The DevTools protocol over one connection, as the screen audit speaks it: a command answered by its id, a wait for
 * an event by its name, and an end of the connection that fails whatever still waits (#62, #125).
 *
 * The connection stays with the caller, which writes each frame and hands every frame it reads to `receive`, so the
 * session runs without a browser.
 * @param {(frame: string) => void} write - Sends one frame
 * @returns {{ send: (method: string, params?: object) => Promise<object>, next: (method: string) => Promise<object>, receive: (message: object) => void, end: (reason: string) => void }}
 *   A command, a wait for an event, a frame read, and the end of the connection
 */
export function devtoolsSession(write) {
  const pending = new Map();
  const listeners = new Set();
  let ended = null;
  let sequence = 0;
  const end = (reason) => {
    ended ??= reason;
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  };
  const receive = (message) => {
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) {
      listeners.forEach((listener) => listener(message));
    }
  };
  const send = (method, params = {}) =>
    within(
      new Promise((resolve, reject) => {
        if (ended) {
          reject(new Error(ended));
          return;
        }
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        write(JSON.stringify({ id, method, params }));
      }),
      30000,
      `${method} got no answer`
    );
  const next = (method) =>
    new Promise((resolve) => {
      const listener = (message) => {
        if (message.method !== method) return;
        listeners.delete(listener);
        resolve(message.params);
      };
      listeners.add(listener);
    });
  return { send, next, receive, end };
}
