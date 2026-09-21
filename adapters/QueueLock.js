import { readFileSync, unlinkSync } from 'node:fs';
import { link, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The errors of a file system that makes no hard links. */
const LINKLESS = ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'];

/** How long a lock may stay empty while its server writes it: longer, and the server died between the two. */
const WRITING_MS = 5000;

/** How many times a server looks again at a lock that is changing hands before it says so. */
const LOOKS = 5;

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

/** A file that is not there is no failure here: another server removed it first. */
const gone = (error) => {
  if (error.code !== 'ENOENT') throw error;
};

const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * Which server on this checkout runs the tailoring queue (#282).
 *
 * Two development servers on one tree both found the jobs in `applications/`: the second marked the first's running
 * job interrupted and queued its waiting jobs again, so each ran twice. The server that runs the queue now says so in
 * a file, created only if absent — the one thing a file system decides for two processes at once — and holding its
 * process id.
 *
 * A lock whose process is gone is stale, and is removed under a claim: a second file, created the same way, which only
 * one server holds at a time. Under the claim the lock is read again and removed only if it is still stale — while the
 * claim's server lives nobody else removes it, and nobody creates a lock while the stale one is there — so a live lock
 * is never removed, however many servers start at once (the reviews of #316).
 *
 * A claim whose server died is removed like a stale lock, so a crash inside a takeover blocks no start after it. The
 * price, chosen over a claim deleted by hand: two servers that remove the same dead claim at the same instant could
 * each hold one, and both would lead. That needs a server killed inside the few milliseconds of a takeover — a signal
 * releases the claim with the lock, so only `kill -9` or a power cut leaves one — and two starts interleaving within
 * the next.
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
    this.claim = `${this.file}.takeover`;
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
    for (let look = 0; look < LOOKS; look += 1) {
      // Read first: a server that is not the holder asks on every call, and learns who is without writing anything.
      const holder = await this.read(this.file);
      if (holder?.pid === this.pid) return { taken: true };
      if (holder?.writing) {
        await pause();
        continue;
      }
      if (holder && this.lives(holder)) return this.held(holder);
      if (holder && !(await this.clear())) {
        await pause();
        continue;
      }
      if (await this.create(this.file)) return { taken: true };
    }
    const last = await this.read(this.file);
    if (last && this.lives(last)) return this.held(last);
    // Still changing hands, or blocked by a claim: the refusal names the file that blocks it.
    const claimed = await this.read(this.claim);
    return { ...this.held(null), file: claimed ? `${QUEUE_LOCK}.takeover` : QUEUE_LOCK };
  }

  /** Whether the process a lock names is alive: a lock no server wrote names none. */
  lives(holder) {
    return holder.pid > 0 && this.alive(holder.pid);
  }

  /** The answer for a lock another process holds, or for one that kept changing hands while this one looked. */
  held(holder) {
    return {
      taken: false,
      holder: holder?.pid > 0 ? holder : { pid: null, since: null },
      file: QUEUE_LOCK
    };
  }

  /**
   * Removes a stale lock under the claim, and says whether the way is clear. Without the claim — another server is
   * taking over — it removes nothing.
   * @returns {Promise<boolean>} True when this server held the claim and the lock is no live process's
   */
  async clear() {
    if (!(await this.create(this.claim))) {
      const claimant = await this.read(this.claim);
      // A claim whose server died mid-takeover would block every start after it: it goes, and the next look clears.
      if (claimant && !claimant.writing && !this.lives(claimant)) {
        await unlink(this.claim).catch(gone);
      }
      return false;
    }
    try {
      const now = await this.read(this.file);
      if (now && !now.writing && now.pid !== this.pid && !this.lives(now)) {
        await unlink(this.file).catch(gone);
      }
      return !now || (!now.writing && !this.lives(now));
    } finally {
      await unlink(this.claim).catch(gone);
    }
  }

  /**
   * Releases the lock, and a claim this process holds mid-takeover, if they are its own. Synchronous, so a process on
   * its way out can call it: a signal that stops a takeover leaves no dead claim behind (the third review of #316).
   */
  release() {
    for (const path of [this.claim, this.file]) {
      try {
        const { pid } = JSON.parse(readFileSync(path, 'utf8'));
        if (pid === this.pid) unlinkSync(path);
      } catch (error) {
        if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      }
    }
  }

  /**
   * Creates a file naming this process, whole, or says it exists: written under a name of its own first and then
   * linked into place, so no other server ever reads it half written. A file system without hard links gets it written
   * in place, created only if absent; read empty meanwhile, it is being written (the reviews of #316).
   * @param {string} path - The lock, or the claim
   * @returns {Promise<boolean>} True when this process created it
   */
  async create(path) {
    const since = new Date(this.clock()).toISOString();
    const text = `${JSON.stringify({ pid: this.pid, since }, null, 2)}\n`;
    const draft = `${path}.${this.pid}.draft`;
    await writeFile(draft, text);
    try {
      await this.fs.link(draft, path);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      if (!LINKLESS.includes(error.code)) throw error;
      try {
        await writeFile(path, text, { flag: 'wx' });
        return true;
      } catch (inPlace) {
        if (inPlace.code === 'EEXIST') return false;
        throw inPlace;
      }
    } finally {
      await unlink(draft).catch(() => {});
    }
  }

  /**
   * Who a lock or a claim names; `writing` while it is empty and young; null when there is none. One nobody can read,
   * or empty for longer than a server takes to write it, is nobody's: stale.
   * @param {string} path - The lock, or the claim
   * @returns {Promise<{ pid: number, since: string|null } | { writing: true } | null>} Who holds it
   */
  async read(path) {
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (text === '') {
      try {
        // A file from the future is no file being written: its clock was wrong, and it would block for ever.
        const age = this.clock() - (await stat(path)).mtimeMs;
        if (age >= 0 && age < WRITING_MS) return { writing: true };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      return { pid: -1, since: null };
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
