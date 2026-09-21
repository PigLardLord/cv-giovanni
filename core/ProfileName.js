/**
 * A name a profile can have: lowercase letters and digits, with hyphens inside, at most 40.
 *
 * It becomes a directory under `profiles/` or `applications/`, a word in every generated filename, and the `profile`
 * of the page's address. One rule for all three: the page once took only a name that began with a letter while an
 * application's name, and a tailoring job's id, may begin with a digit — so a job's CV, which the page prints, fell
 * back to the published one and never printed at all (#303).
 */
export const PROFILE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
