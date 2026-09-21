/**
 * @jest-environment node
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QUEUE_LOCK, QueueLock } from '../adapters/QueueLock.js';

// Two servers on one checkout ran every tailoring job twice (#282). The one that runs the queue says so in a file;
// the others leave the jobs alone, and a lock whose process is gone is taken over.
let root;
const lockOf = () => JSON.parse(readFileSync(join(root, QUEUE_LOCK), 'utf8'));
const serverWith = (pid, alive = () => true) =>
  new QueueLock(root, { pid, alive, clock: () => Date.UTC(2026, 8, 21, 18, 0, 0) });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'queue-lock-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the queue’s lock', () => {
  test('is taken by the first server, and says which process holds it and since when', async () => {
    expect(await serverWith(101).take()).toEqual({ taken: true });
    expect(lockOf()).toEqual({ pid: 101, since: '2026-09-21T18:00:00.000Z' });
  });

  test('is not taken by a second server while the first is alive, which is named', async () => {
    await serverWith(101).take();

    expect(await serverWith(202).take()).toEqual({
      taken: false,
      holder: { pid: 101, since: '2026-09-21T18:00:00.000Z' },
      file: QUEUE_LOCK
    });
    expect(lockOf().pid).toBe(101);
  });

  test('left by a server that died, is taken over', async () => {
    await serverWith(101).take();

    expect(await serverWith(202, (pid) => pid !== 101).take()).toEqual({ taken: true });
    expect(lockOf().pid).toBe(202);
  });

  test('that no server wrote, is taken over', async () => {
    mkdirSync(join(root, 'applications'), { recursive: true });
    writeFileSync(join(root, QUEUE_LOCK), '{ torn');

    expect(await serverWith(202).take()).toEqual({ taken: true });
    expect(lockOf().pid).toBe(202);
  });

  test('left by a dead server and found by two at once, is taken by one of them', async () => {
    await serverWith(101).take();
    const alive = (pid) => pid !== 101;

    const results = await Promise.all([
      serverWith(202, alive).take(),
      serverWith(303, alive).take()
    ]);

    expect(results.filter(({ taken }) => taken)).toHaveLength(1);
    expect([202, 303]).toContain(lockOf().pid);
  });

  test('is its own holder’s to take again', async () => {
    const server = serverWith(101);
    await server.take();

    expect(await server.take()).toEqual({ taken: true });
  });

  test('is released by its holder only, and releasing none is no error', async () => {
    await serverWith(101).take();

    serverWith(202).release();
    expect(lockOf().pid).toBe(101);
    serverWith(101).release();
    expect(existsSync(join(root, QUEUE_LOCK))).toBe(false);
    expect(() => serverWith(101).release()).not.toThrow();
  });

  test('leaves no draft of itself behind', async () => {
    await serverWith(101).take();
    await serverWith(202).take();

    expect(existsSync(join(root, `${QUEUE_LOCK}.101.draft`))).toBe(false);
    expect(existsSync(join(root, `${QUEUE_LOCK}.202.draft`))).toBe(false);
  });
});
