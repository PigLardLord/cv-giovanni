import { readFileSync, unlinkSync } from 'node:fs';
import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
 * process id. A lock whose process is gone is stale: it is moved aside, again an act only one process can win, and
 * taken.
 *
 * A process id the system gave to another program since reads as alive; the refusal names the lock's file, so it can
 * be deleted by hand.
 */
export class QueueLock {
  /**
   * @param {string} root - The project root
   * @param {{ pid?: number, alive?: (pid: number) => boolean, clock?: () => number }} [options] - This process's id,
   *   how another's liveness is read, and the time
   */
  constructor(root, { pid = process.pid, alive = isAlive, clock = Date.now } = {}) {
    this.file = join(root, QUEUE_LOCK);
    this.pid = pid;
    this.alive = alive;
    this.clock = clock;
  }

  /**
   * Takes the lock, unless a live process holds it.
   * @returns {Promise<{ taken: true } | { taken: false, holder: { pid: number, since: string|null }, file: string }>}
   */
  async take() {
    await mkdir(dirname(this.file), { recursive: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await this.create()) return { taken: true };
      const holder = await this.holder();
      if (holder === null) continue;
      if (holder.pid === this.pid) return { taken: true };
      if (holder.pid > 0 && this.alive(holder.pid))
        return { taken: false, holder, file: QUEUE_LOCK };
      // Stale: moved aside under a name of its own, so that of two servers finding it only one takes it over.
      const aside = `${this.file}.stale-${this.pid}`;
      try {
        await rename(this.file, aside);
        await unlink(aside);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const holder = await this.holder();
    return { taken: false, holder: holder ?? { pid: null, since: null }, file: QUEUE_LOCK };
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
   * other server ever reads a lock half written and takes it for a torn one.
   */
  async create() {
    const since = new Date(this.clock()).toISOString();
    const draft = `${this.file}.${this.pid}.draft`;
    await writeFile(draft, `${JSON.stringify({ pid: this.pid, since }, null, 2)}\n`);
    try {
      await link(draft, this.file);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    } finally {
      await unlink(draft).catch(() => {});
    }
  }

  /** Who holds the lock, or null when it vanished while being read. A lock nobody can read is nobody's: stale. */
  async holder() {
    let text;
    try {
      text = await readFile(this.file, 'utf8');
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
