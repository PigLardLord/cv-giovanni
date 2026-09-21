import { readFileSync, unlinkSync } from 'node:fs';
import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The errors of a file system that makes no hard links. */
const LINKLESS = ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'];

/** Where the lock lives, relative to the project: beside the jobs, hidden, so nothing lists or serves it. */
export const QUEUE_LOCK = 'applications/.queue-lock.json';

/** Whether a process is alive: a signal of 0 checks without sending anything, and EPERM is someone else's. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Which server on this checkout runs the tailoring queue (#282).
 *
 * Two development servers on one tree both found the jobs in `applications/`: the second marked the first's running
 * job interrupted and queued its waiting jobs again, so each ran twice. The server that runs the queue now says so in
 * a file, created only if absent — the one thing a file system decides for two processes at once — and holding its
 * process id. A lock whose process is gone is stale: it is moved aside and taken, and a live lock moved aside by
 * mistake is put back.
 *
 * A process id the system gave to another program since reads as alive; the refusal names the lock's file, so it can
 * be deleted by hand.
 */
export class QueueLock {
  /**
   * @param {string} root - The project root
   * @param {{ pid?: number, alive?: (pid: number) => boolean, clock?: () => number, fs?: { link: Function } }} [options]
   *   - This process's id, how another's liveness is read, the time, and how a file is linked
   */
  constructor(root, { pid = process.pid, alive = isAlive, clock = Date.now, fs = { link } } = {}) {
    this.file = join(root, QUEUE_LOCK);
    this.pid = pid;
    this.alive = alive;
    this.clock = clock;
    this.fs = fs;
  }

  /**
   * Takes the lock, unless a live process holds it.
   * @returns {Promise<{ taken: true } | { taken: false, holder: { pid: number|null, since: string|null }, file: string }>}
   */
  async take() {
    await mkdir(dirname(this.file), { recursive: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Read first: a server that is not the holder asks on every call, and learns who is without writing a draft.
      const holder = await this.read(this.file);
      if (holder?.pid === this.pid) return { taken: true };
      if (holder && this.lives(holder)) return this.held(holder);
      if (holder && !(await this.moveAside(holder))) continue;
      if (await this.create()) return { taken: true };
    }
    return this.held(await this.read(this.file));
  }

  /** Whether the process a lock names is alive: a lock no server wrote names none. */
  lives(holder) {
    return holder.pid > 0 && this.alive(holder.pid);
  }

  /** The answer for a lock another process holds, or one that kept changing hands while this one looked. */
  held(holder) {
    return { taken: false, holder: holder ?? { pid: null, since: null }, file: QUEUE_LOCK };
  }

  /**
   * Moves a stale lock aside, and says whether the way is clear. A rename moves whatever is there now, which another
   * server may have made its own since the stale one was read: that one is put back, and this server does not lead
   * (the review of #316). Three servers at once on one stale lock can still lose the second's when a third creates its
   * own in between; two, the case a checkout meets, cannot.
   * @param {{ pid: number }} stale - The lock as it was read
   * @returns {Promise<boolean>} True when nothing live was moved
   */
  async moveAside(stale) {
    const aside = `${this.file}.stale-${this.pid}`;
    try {
      await rename(this.file, aside);
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
    const moved = await this.read(aside);
    if (moved && moved.pid !== stale.pid && this.lives(moved)) {
      await this.fs.link(aside, this.file).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
      await unlink(aside);
      return false;
    }
    await unlink(aside).catch(() => {});
    return true;
  }

  /** Releases the lock, if this process holds it. Synchronous, so a process on its way out can call it. */
  release() {
    try {
      const { pid } = JSON.parse(readFileSync(this.file, 'utf8'));
      if (pid === this.pid) unlinkSync(this.file);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
  }

  /**
   * Creates the lock whole, or says it exists: written under a name of its own first and then linked into place, so no
   * other server ever reads a lock half written and takes it for a torn one. A file system without hard links gets the
   * lock written in place, created only if absent (the review of #316).
   */
  async create() {
    const since = new Date(this.clock()).toISOString();
    const text = `${JSON.stringify({ pid: this.pid, since }, null, 2)}\n`;
    const draft = `${this.file}.${this.pid}.draft`;
    await writeFile(draft, text);
    try {
      await this.fs.link(draft, this.file);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      if (!LINKLESS.includes(error.code)) throw error;
      try {
        await writeFile(this.file, text, { flag: 'wx' });
        return true;
      } catch (inPlace) {
        if (inPlace.code === 'EEXIST') return false;
        throw inPlace;
      }
    } finally {
      await unlink(draft).catch(() => {});
    }
  }

  /** Who a lock names, or null when it vanished while being read. A lock nobody can read is nobody's: stale. */
  async read(path) {
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    try {
      const { pid, since = null } = JSON.parse(text);
      if (Number.isInteger(pid) && pid > 0) return { pid, since };
    } catch {
      // Not a lock this class wrote: as stale as a dead process's.
    }
    return { pid: -1, since: null };
  }
}
