/**
 * @jest-environment node
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
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

  // The review of #316: a rename moves whatever is there now. A server that read the dead lock, then moved aside the
  // lock another server had just taken over, led beside it.
  test('left by a dead server, is not taken from the one that took it over first', async () => {
    await serverWith(101).take();
    const alive = (pid) => pid !== 101;
    const first = serverWith(303, alive);
    const late = serverWith(202, alive);
    const read = late.read.bind(late);
    let firstTook = null;
    late.read = async (path) => {
      const found = await read(path);
      firstTook ??= await first.take();
      return found;
    };

    const lateTook = await late.take();

    expect(firstTook).toEqual({ taken: true });
    expect(lateTook).toMatchObject({ taken: false, holder: { pid: 303 } });
    expect(lockOf().pid).toBe(303);
  });

  test('is written in place on a file system that makes no hard links', async () => {
    const linkless = {
      link: async () => {
        throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
      }
    };
    const server = (pid) =>
      new QueueLock(root, { pid, alive: () => true, clock: () => 0, fs: linkless });

    expect(await server(101).take()).toEqual({ taken: true });
    expect(await server(202).take()).toMatchObject({ taken: false, holder: { pid: 101 } });
    expect(lockOf().pid).toBe(101);
  });

  // The second review of #316: on a file system without hard links a live lock moved aside could not be put back, and
  // three servers at once could still lose one. A stale lock is now removed under a claim, and only while still stale.
  test.each([
    ['with hard links', undefined],
    [
      'without them',
      {
        link: async () => {
          throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
        }
      }
    ]
  ])('left by a dead server and found by three at once, is taken by one, %s', async (_, fs) => {
    await serverWith(101).take();
    const servers = [202, 303, 404].map((pid) => {
      const server = new QueueLock(root, { pid, alive: (other) => other !== 101, fs });
      // Each looks at the lock, then lets the others run before it acts on what it saw.
      const read = server.read.bind(server);
      server.read = async (path) => {
        const found = await read(path);
        await new Promise((resolve) => setImmediate(resolve));
        return found;
      };
      return server;
    });

    const results = await Promise.all(servers.map((server) => server.take()));

    const leaders = [202, 303, 404].filter((_pid, index) => results[index].taken);
    expect(leaders).toHaveLength(1);
    expect(lockOf().pid).toBe(leaders[0]);
    expect(existsSync(join(root, `${QUEUE_LOCK}.takeover`))).toBe(false);
  });

  test('being written — empty, and young — is waited for, and one empty for long is stale', async () => {
    mkdirSync(join(root, 'applications'), { recursive: true });
    writeFileSync(join(root, QUEUE_LOCK), '');
    // The file's time is the machine's, so this server's clock is too.
    const server = new QueueLock(root, { pid: 202, alive: () => true });

    expect(await server.take()).toEqual({
      taken: false,
      holder: { pid: null, since: null },
      file: QUEUE_LOCK
    });
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(root, QUEUE_LOCK), old, old);
    expect(await server.take()).toEqual({ taken: true });
  });

  // A lock read in the millisecond it was written read as from the future: the clock is whole milliseconds, the file's
  // time has their fractions, and the suite failed now and then on a busy machine.
  test('empty and read in the millisecond it was written, is being written, not from the future', async () => {
    mkdirSync(join(root, 'applications'), { recursive: true });
    writeFileSync(join(root, QUEUE_LOCK), '');
    const { mtimeMs } = statSync(join(root, QUEUE_LOCK));
    const server = new QueueLock(root, { pid: 202, alive: () => true, clock: () => mtimeMs - 0.5 });

    expect(await server.take()).toMatchObject({ taken: false, holder: { pid: null } });
    // And a file a tenth of a second ahead is from the future, and stale at once.
    const ahead = new QueueLock(root, { pid: 202, alive: () => true, clock: () => mtimeMs - 100 });
    expect(await ahead.take()).toEqual({ taken: true });
  });

  // The third review of #316: a file from the future read as being written for ever, and a live claim blocked every
  // start with a refusal that named no file.
  test('empty and dated in the future, is stale, not being written for ever', async () => {
    mkdirSync(join(root, 'applications'), { recursive: true });
    writeFileSync(join(root, QUEUE_LOCK), '');
    const later = new Date(Date.now() + 3_600_000);
    utimesSync(join(root, QUEUE_LOCK), later, later);

    expect(await new QueueLock(root, { pid: 202, alive: () => true }).take()).toEqual({
      taken: true
    });
  });

  test('blocked by a live claim, names the claim as the file to delete', async () => {
    await serverWith(101).take();
    writeFileSync(join(root, `${QUEUE_LOCK}.takeover`), JSON.stringify({ pid: 303, since: null }));

    expect(await serverWith(202, (pid) => pid !== 101).take()).toEqual({
      taken: false,
      holder: { pid: null, since: null },
      file: `${QUEUE_LOCK}.takeover`
    });
  });

  test('its claim is let go with it, so a signal inside a takeover leaves none behind', async () => {
    mkdirSync(join(root, 'applications'), { recursive: true });
    writeFileSync(join(root, `${QUEUE_LOCK}.takeover`), JSON.stringify({ pid: 202, since: null }));

    serverWith(202).release();

    expect(existsSync(join(root, `${QUEUE_LOCK}.takeover`))).toBe(false);
  });

  test('a claim left by a server that died mid-takeover blocks no one', async () => {
    await serverWith(101).take();
    writeFileSync(join(root, `${QUEUE_LOCK}.takeover`), JSON.stringify({ pid: 101, since: null }));

    expect(await serverWith(202, (pid) => pid !== 101).take()).toEqual({ taken: true });
    expect(lockOf().pid).toBe(202);
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
