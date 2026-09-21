import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { configFile } from './ConfigDirectory.js';

/**
 * Where the local API's token is kept: beside the API key, outside the project (#270).
 * @param {{ env?: object, home?: string, projectRoot?: string }} [where] - The environment, the home directory,
 *   and the project the token must stay out of
 * @returns {string} The token's file
 * @throws {Error} When that file would be inside the project
 */
export function apiTokenFile(where = {}) {
  return configFile('api-token', { ...where, what: "API token's file" });
}

/**
 * The token a program on this machine sends as `Authorization: Bearer`, in place of the cookie a browser holds
 * (#270). Made on the server's first start — 256 random bits, readable only by its owner — and the same on every
 * start after, so a client reads it once.
 *
 * A file other users can read is not used: a token they can read is one they can send. It is not replaced either:
 * the file is its owner's, and a server that silently rotated it would break every client that already read it.
 * @param {string} file - The token's file, from `apiTokenFile`
 * @returns {Promise<{ token: string } | { token: null, reason: string }>} The token, or why there is none; the
 *   reason never carries the file's content
 */
export async function ensureApiToken(file) {
  let info;
  try {
    info = await stat(file);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      return { token: null, reason: `the API token's file ${file} cannot be read` };
    }
    const made = await make(file);
    if (made !== 'taken') return made;
    // Another server started at the same moment and made the file first: read what it made, so both hold one token.
    return ensureApiToken(file);
  }
  if (!info.isFile()) {
    return { token: null, reason: `the API token's file ${file} cannot be read: it is not a file` };
  }
  if (info.mode & 0o077) {
    return {
      token: null,
      reason: `the API token's file ${file} can be read by other users: set its mode to 600`
    };
  }
  let token;
  try {
    token = (await readFile(file, 'utf8')).trim();
  } catch {
    return { token: null, reason: `the API token's file ${file} cannot be read` };
  }
  if (!token) return { token: null, reason: `the API token's file ${file} is empty` };
  return { token };
}

/**
 * Makes the token's file, or says why it could not; 'taken' when another process made it first. The file never
 * exists wider than 600: it is created with that mode and exclusively, so nothing can be written through a link.
 */
async function make(file) {
  const token = randomBytes(32).toString('base64url');
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, `${token}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(file, 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') return 'taken';
    return { token: null, reason: `the API token's file ${file} cannot be made (${error.code})` };
  }
  return { token };
}
