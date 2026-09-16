import { PROFILE } from './ProfileShape.js';

const isGroup = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const join = (path, key) => (path ? `${path}.${key}` : key);

/**
 * A field's path, as `ProfileShape` reports it, in parts: `relevant_experience[1].highlights[0]` is
 * `['relevant_experience', 1, 'highlights', 0]`.
 * @param {string} path - The path
 * @returns {(string|number)[]} Its parts
 */
export function segments(path) {
  const parts = [];
  for (const part of typeof path === 'string' && path ? path.split('.') : [null]) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/.exec(part ?? '');
    if (!match) throw new Error(`not a path: "${path}"`);
    parts.push(match[1], ...[...match[2].matchAll(/\[(\d+)\]/g)].map(([, index]) => Number(index)));
  }
  return parts;
}

/** The shape at a path, or null when the profile's shape has no such field. */
function shapeAt(path) {
  let shape = PROFILE;
  for (const part of segments(path)) {
    if (typeof part === 'number') shape = shape.kind === 'list' ? shape.item : null;
    else
      shape =
        shape.kind === 'group' && Object.hasOwn(shape.fields, part) ? shape.fields[part] : null;
    if (!shape) return null;
  }
  return shape;
}

const known = (path) => {
  try {
    return shapeAt(path);
  } catch {
    return null;
  }
};

function readAt(value, parts) {
  return parts.reduce((current, part) => (current == null ? undefined : current[part]), value);
}

/** A copy of `container` with `value` at `parts`, making what is missing on the way; `undefined` removes. */
function writeAt(container, [head, ...rest], value) {
  const copy = Array.isArray(container)
    ? [...container]
    : { ...(isGroup(container) ? container : {}) };
  if (rest.length === 0) {
    if (value !== undefined) copy[head] = value;
    else if (Array.isArray(copy)) copy.splice(head, 1);
    else delete copy[head];
    return copy;
  }
  const next = container == null ? undefined : container[head];
  copy[head] = writeAt(next ?? (typeof rest[0] === 'number' ? [] : {}), rest, value);
  return copy;
}

/** What a new entry of a shape starts as: its required fields, empty. */
function blank(shape) {
  if (shape.kind === 'group') {
    return Object.fromEntries(
      Object.entries(shape.fields)
        .filter(([, field]) => field.required)
        .map(([key, field]) => [key, field.kind === 'list' ? [blank(field.item)] : blank(field)])
    );
  }
  return shape.kind === 'list' ? [] : '';
}

function node(shape, value, path, key, problems) {
  const base = {
    path,
    key,
    kind: shape.kind,
    label: shape.label,
    required: Boolean(shape.required),
    multiline: Boolean(shape.multiline),
    problems: problems.filter((problem) => problem.path === path).map(({ reason }) => reason)
  };
  if (shape.kind === 'group') {
    return {
      ...base,
      fields: Object.entries(shape.fields)
        .filter(([, field]) => field.kind !== 'object')
        .map(([name, field]) =>
          node(field, isGroup(value) ? value[name] : undefined, join(path, name), name, problems)
        )
    };
  }
  if (shape.kind === 'list') {
    return {
      ...base,
      itemLabel: shape.item.label,
      items: (Array.isArray(value) ? value : []).map((item, index) =>
        node(shape.item, item, `${path}[${index}]`, index, problems)
      )
    };
  }
  return { ...base, value: value ?? '' };
}

/**
 * The editor's form over a profile, and every change the form makes to it (#23).
 *
 * The form is built from `PROFILE`, so a field the shape gains appears in the editor with nothing else to
 * change. A change returns a new profile and leaves the one it was given as it was: the editor keeps the
 * profile, not the form, so a field the form does not show — a cover letter, or a malformed list the shape
 * refuses — is saved back exactly as it was loaded. Nothing typed is coerced into something else, with one
 * exception: a year typed as digits is the number the profile writes, and a cleared year is no year.
 * Anything else typed stays as typed, for `ProfileShape` to refuse with the reason.
 */
export class ProfileForm {
  /**
   * @param {object} profile - The profile being edited
   * @param {{ path: string, reason: string }[]} [problems] - What `ProfileShape` found, placed on the fields
   * @returns {object[]} The form: one node per field, each with its path, kind, label, value or entries, and
   *   the reasons the field was refused
   */
  static fields(profile, problems = []) {
    return node(PROFILE, isGroup(profile) ? profile : {}, '', '', problems).fields;
  }

  /** The problems no field of the form is about: a field the CV does not read, or the profile as a whole. */
  static unplaced(problems = []) {
    return problems.filter(({ path }) => !path || !known(path) || known(path).kind === 'object');
  }

  /** The profile with what was typed into the field at `path`. */
  static set(profile, path, input) {
    const shape = shapeAt(path);
    if (!shape || shape.kind === 'list' || shape.kind === 'group') {
      throw new Error(`not a field the form sets: "${path}"`);
    }
    let value = input;
    if (shape.kind === 'year') {
      const typed = String(input ?? '').trim();
      value = typed === '' ? undefined : /^\d{4}$/.test(typed) ? Number(typed) : input;
    }
    return writeAt(profile, segments(path), value);
  }

  /** The profile with a new, empty entry at the end of the list at `path`. */
  static add(profile, path) {
    const shape = shapeAt(path);
    if (!shape || shape.kind !== 'list') throw new Error(`not a list: "${path}"`);
    const entries = readAt(profile, segments(path));
    return writeAt(profile, segments(path), [
      ...(Array.isArray(entries) ? entries : []),
      blank(shape.item)
    ]);
  }

  /** The profile without the entry at `index` of the list at `path`. */
  static remove(profile, path, index) {
    const entries = ProfileForm.entries(profile, path, index);
    return writeAt(
      profile,
      segments(path),
      entries.filter((entry, at) => at !== index)
    );
  }

  /** The profile with the entry at `from` of the list at `path` moved to `to`. */
  static move(profile, path, from, to) {
    const entries = [...ProfileForm.entries(profile, path, from, to)];
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    return writeAt(profile, segments(path), entries);
  }

  /** The list at `path`, once every index given is an entry of it. */
  static entries(profile, path, ...indexes) {
    const shape = shapeAt(path);
    if (!shape || shape.kind !== 'list') throw new Error(`not a list: "${path}"`);
    const entries = readAt(profile, segments(path));
    const list = Array.isArray(entries) ? entries : [];
    const missing = indexes.find(
      (index) => !Number.isInteger(index) || index < 0 || index >= list.length
    );
    if (missing !== undefined) throw new Error(`no entry ${missing} in "${path}"`);
    return list;
  }
}
