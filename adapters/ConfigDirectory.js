import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * A file in the local app's configuration directory: `$XDG_CONFIG_HOME/mycv/`, or `~/.config/mycv/` when that is
 * unset or not absolute. The API key lives there (#22), and so do the API token (#270) and the full CV #260 tailors
 * from — each a secret or a record the repository must never hold. So a file that would land inside the project,
 * which git tracks and the development server serves, is refused rather than written: by the path as written, and by
 * where it really leads, so neither a directory named `..config` inside the project nor a link into it passes (#285).
 * @param {string} name - The file's path under `mycv/`
 * @param {{ env?: object, home?: string, projectRoot?: string, what?: string }} [where] - The environment, the home
 *   directory, the project the file must stay out of, and what the file is, for the refusal
 * @returns {string} The file's path
 * @throws {Error} When that file would be inside the project
 */
export function configFile(
  name,
  { env = process.env, home = homedir(), projectRoot, what = name } = {}
) {
  const base =
    env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME)
      ? env.XDG_CONFIG_HOME
      : join(home, '.config');
  const file = join(base, 'mycv', name);
  if (
    projectRoot &&
    (within(resolve(projectRoot), resolve(file)) || within(leadsTo(projectRoot), leadsTo(file)))
  ) {
    throw new Error(
      `The ${what} would be inside the project, at ${file}: keep it outside the repository.`
    );
  }
  return file;
}

/** Whether a path is the root or under it. Only `..` itself, or `..` then a separator, climbs out: `..config` is in. */
function within(root, path) {
  const inside = relative(root, path);
  return !isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`);
}

/**
 * Where a path really leads: its nearest part this process can resolve, with every link followed, and the rest as
 * written. A link whose target does not exist yet is followed by what it says, so a link into the project is refused
 * before an editor writes a secret through it (the review of #287).
 */
function leadsTo(path, hops = 0) {
  const rest = [];
  for (let existing = resolve(path); ; existing = dirname(existing)) {
    try {
      return join(realpathSync.native(existing), ...rest);
    } catch {
      const dangling = hops < 40 && isLink(existing);
      if (dangling)
        return leadsTo(join(resolve(dirname(existing), readlinkSync(existing)), ...rest), hops + 1);
      if (dirname(existing) === existing) return resolve(path);
      rest.unshift(basename(existing));
    }
  }
}

/** Whether a path is a symbolic link, whatever it leads to. */
function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
