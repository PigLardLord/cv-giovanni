import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';

/**
 * The project's files on disk, by path relative to the project root, for the local app's services (#21).
 *
 * A path here may be built from a request, so three things are refused before anything is read or written:
 * a path that is not relative, one that climbs out with `..`, and one with a hidden segment such as `.git`
 * — which the development server never serves either. Where the path really leads is checked too, so a link
 * inside the tree cannot carry a write out of it, and no directory is made until the part of the path that
 * already exists is known to be inside.
 */
export class NodeProjectFiles {
  /** @param {string} root - The project root */
  constructor(root) {
    this.root = realpathSync.native(root);
  }

  /** The absolute path for a project-relative one, or a refusal. */
  place(path) {
    if (typeof path !== 'string' || !path || isAbsolute(path)) {
      throw new Error(`not a path inside the project: "${path}"`);
    }
    const segments = path.split(/[\\/]/);
    if (segments.includes('..')) throw new Error(`a path outside the project: "${path}"`);
    if (segments.some((segment) => segment.startsWith('.'))) {
      throw new Error(`a hidden path: "${path}"`);
    }
    return join(this.root, path);
  }

  /** Refuses a location whose real place, links followed, is outside the project. */
  async inside(absolute, path) {
    const real = await realpath(absolute);
    if (real !== this.root && !real.startsWith(`${this.root}${sep}`)) {
      throw new Error(`a path outside the project, through a link: "${path}"`);
    }
    return real;
  }

  /** The nearest part of a path that exists, checked to be inside the project. */
  async existingAncestor(absolute, path) {
    for (let directory = absolute; ; directory = dirname(directory)) {
      try {
        return await this.inside(directory, path);
      } catch (error) {
        if (error.code !== 'ENOENT' || directory === this.root) throw error;
      }
    }
  }

  /** @returns {Promise<string>} The file's text */
  async readText(path) {
    return readFile(await this.inside(this.place(path), path), 'utf8');
  }

  /** Writes the file, making the directories it needs inside the project. */
  async writeText(path, text) {
    const file = this.place(path);
    await this.existingAncestor(dirname(file), path);
    await mkdir(dirname(file), { recursive: true });
    await this.inside(dirname(file), path);
    const existing = await lstat(file).catch(() => null);
    if (existing?.isSymbolicLink()) await this.inside(file, path);
    await writeFile(file, text);
  }

  /** @returns {Promise<string[]>} The names in a directory inside the project; none when it does not exist */
  async list(path) {
    let directory;
    try {
      directory = await this.inside(this.place(path), path);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return readdir(directory);
  }

  /**
   * @returns {Promise<boolean>} Whether the file exists, inside the project. Under a file rather than a directory,
   *   it does not.
   */
  async exists(path) {
    const file = this.place(path);
    try {
      await this.inside(file, path);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
      throw error;
    }
  }
}
