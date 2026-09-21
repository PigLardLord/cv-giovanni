import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

/**
 * A file in the local app's configuration directory: `$XDG_CONFIG_HOME/mycv/`, or `~/.config/mycv/` when that is
 * unset or not absolute. The API key lives there (#22), and so do the API token (#270) and the full CV #260 tailors
 * from — each a secret or a record the repository must never hold. So a file that would land inside the project,
 * which git tracks and the development server serves, is refused rather than written.
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
  if (projectRoot) {
    const inside = relative(resolve(projectRoot), resolve(file));
    if (!inside.startsWith('..') && !isAbsolute(inside)) {
      throw new Error(
        `The ${what} would be inside the project, at ${file}: keep it outside the repository.`
      );
    }
  }
  return file;
}
