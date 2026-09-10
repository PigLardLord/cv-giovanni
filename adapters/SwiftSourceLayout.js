/**
 * How the CV reads as a Swift file, for Nerd Mode on screen — and what that file's #Preview shows.
 *
 * The sibling of `adapters/PdfLayout.js` for a different surface: it turns the profile into
 * lines of tokens, and `renderers/SourceRenderer.js` only writes them into the page. Every token
 * is one of two things, and the difference is the whole design:
 *
 * - `{ code }` is syntax — a keyword, a quote, a bracket, an argument label. The renderer never
 *   puts it into the document; the stylesheet draws it. A screen reader, a selection and a search
 *   never meet it.
 * - `{ text }` is the CV, exactly as the data wrote it. It is the only real text the file has.
 *
 * So the page can look like source code without a single word of Swift reaching anything that
 * reads the document, which is the rule `AGENTS.md` sets for every visual device here: removing
 * the stylesheet removes the decoration and never the meaning.
 *
 * The file is written the way Swift is written — a multi-line string for the summary, an
 * initialiser per role with its achievements in a trailing closure, a result builder for the
 * skills — because a reader who writes Swift notices a file that reads wrong. It does not have to
 * compile: `Engineer`, `Role` and `SkillSet` are names, not a library.
 *
 * `card` is the contact card the phone beside the editor shows: the name, the role and the ways to
 * reach the candidate. Every word on it is already in the file, so the renderer draws it too.
 *
 * It takes the raw profile, as every page renderer does, and knows nothing about the DOM.
 */
import { readableAddress } from '../domain/ReadableUrl.js';

const SECTIONS = ['skills', 'experience', 'certifications', 'education', 'languages', 'interests'];

/** A phone screen has room for four buttons across; a fifth would wrap into a second row. */
const CARD_ACTIONS = 4;

const code = (value, kind = 'plain') => ({ code: value, kind });
const content = (value, kind, extra = {}) => ({ text: value, kind, ...extra });
const clean = (value) => (value === undefined || value === null ? '' : String(value).trim());
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/** A string literal. The quotes are syntax; what is between them is the data. */
const quoted = (value, extra = {}) =>
  value === ''
    ? [code('""', 'string')]
    : [code('"', 'string'), content(value, 'string', extra), code('"', 'string')];

const comma = (last) => (last ? [] : [code(',')]);

const arrayOf = (type) => [code('['), code(type, 'type'), code(']')];

const arrayLiteral = (values) => [
  code('['),
  ...values.flatMap((value, index) => [...(index > 0 ? [code(', ')] : []), ...quoted(value)]),
  code(']')
];

/** `let name = `, or `let name: Type = ` when a type is given. */
const declaration = (keyword, name, type = []) => [
  code(`${keyword} `, 'keyword'),
  code(name, 'property'),
  ...(type.length > 0 ? [code(': '), ...type] : []),
  code(' = ')
];

/** An argument as the data gave it: a number stays a number, a list keeps what is not empty. */
const normalise = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (Array.isArray(item) ? item : clean(item)))
      .filter((item) => item.length > 0);
  }
  return Number.isFinite(value) ? value : clean(value);
};

/** Lines are `[depth, tokens, extra]` until `compose` places them; this moves a block inward. */
const indent = (lines, by = 1) =>
  lines.map(([depth, tokens, extra]) => [depth + by, tokens, extra]);

/**
 * The candidate's name as a Swift type: each word capitalised and run together, apostrophes
 * dropped, anything that cannot be part of an identifier removed. Letters outside ASCII stay —
 * Swift identifiers are Unicode, and "Núñez" is not "Nunez".
 * @param {string} name - The name as the profile writes it
 * @returns {string} A type name
 */
export function swiftTypeName(name) {
  const words = clean(name)
    .normalize('NFC')
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const joined = words.map((word) => word[0].toLocaleUpperCase() + word.slice(1)).join('');
  if (!joined) return 'Curriculum';
  return /^\p{N}/u.test(joined) ? `CV${joined}` : joined;
}

export class SwiftSourceLayout {
  /**
   * @param {object} data - the profile, as the page renderers receive it
   * @param {object} context - `t`, the translator, already bound by the caller
   * @returns {{ typeName: string, fileName: string, lines: object[], outline: object[],
   *   card: object }} `lines` are `{ depth, tokens }`, plus `heading` and `id` on a section mark
   *   and `current` on the line the editor opens on; `outline` is the sections written, in order;
   *   `card` is what the preview shows
   */
  compose(data = {}, { t = (key) => key } = {}) {
    const typeName = swiftTypeName(data.name);
    const lines = [];
    const outline = [];
    const push = (depth, tokens = [], extra = {}) =>
      lines.push({ depth: tokens.length === 0 ? 0 : depth, tokens, ...extra });
    const section = (key, label, body) => {
      if (body.length === 0) return;
      if (outline.length > 0) push(0);

      const id = `source-${key}`;
      push(1, [code('// MARK: - ', 'mark'), content(label, 'mark')], { heading: 2, id });
      push(0);
      body.forEach(([depth, tokens, extra]) => push(1 + depth, tokens, extra));
      outline.push({ id, label });
    };

    push(0, [code('//', 'comment')]);
    push(0, [code(`//  ${typeName}.swift`, 'comment')]);
    push(0, [code('//  CV', 'comment')]);
    push(0, [code('//', 'comment')]);
    push(0);
    push(0, [code('import ', 'keyword'), code('SwiftUI', 'type')]);
    push(0);
    push(0, [
      code('struct ', 'keyword'),
      code(typeName, 'type'),
      code(': '),
      code('Engineer', 'type'),
      code(' {')
    ]);

    section('profile', t('source.marks.profile'), this.profile(data));
    section('contact', t('source.marks.contact'), this.contact(data));
    SECTIONS.forEach((key) => section(key, t(`cv:sections.${key}`), this[key](data)));

    push(0, [code('}')]);
    push(0);
    push(0, [code('#Preview', 'macro'), code(' {')]);
    push(1, [
      code('ContactCard', 'call'),
      code('('),
      code('for: ', 'label'),
      code(typeName, 'type'),
      code('())')
    ]);
    push(2, [
      code('.'),
      code('preferredColorScheme', 'call'),
      code('('),
      code('.'),
      code('dark', 'property'),
      code(')')
    ]);
    push(0, [code('}')]);

    return {
      typeName,
      fileName: `${typeName}.swift`,
      lines,
      outline,
      card: this.card(data, t)
    };
  }

  profile(data) {
    const string = (name, value, extra = {}) => [
      ...declaration('let', name),
      ...quoted(value, extra)
    ];
    const [name, title, focus, summary, availability] = [
      data.name,
      data.title,
      data.subtitle,
      data.profile,
      data.availability
    ].map(clean);

    const lines = [];
    if (name) lines.push([0, string('name', name, { element: 'h1' }), { current: true }]);
    if (title) lines.push([0, string('title', title)]);
    if (focus) lines.push([0, string('focus', focus)]);
    if (summary) {
      // A paragraph is a multi-line string in Swift: the delimiters take lines of their own.
      lines.push([0, [...declaration('let', 'summary'), code('"""', 'string')]]);
      lines.push([1, [content(summary, 'string')]]);
      lines.push([1, [code('"""', 'string')]]);
    }
    if (availability) lines.push([0, string('availability', availability)]);
    return lines;
  }

  contact(data) {
    const links = list(data.social)
      .filter((link) => clean(link.url) !== '')
      .map((link) => {
        const address = readableAddress(link.url);
        return [
          code('Link', 'call'),
          code('('),
          ...quoted(clean(link.platform) || address),
          code(', '),
          code('url: ', 'label'),
          ...quoted(address, { element: 'a', href: clean(link.url) }),
          code(')')
        ];
      });

    return this.call(
      'Contact',
      [
        ['location', data.location],
        ['email', data.email],
        ['phone', data.phone],
        ['links', links]
      ],
      { prefix: declaration('let', 'contact'), close: '' }
    );
  }

  skills(data) {
    const skills = list(data.skills);
    const names = (items) => items.map((item) => clean(item && item.name)).filter(Boolean);

    if (!skills.some((entry) => Array.isArray(entry.items))) {
      const flat = names(skills);
      if (flat.length === 0) return [];
      return [[0, [...declaration('let', 'skills', arrayOf('String')), ...arrayLiteral(flat)]]];
    }

    const groups = skills
      .filter((entry) => Array.isArray(entry.items))
      .map((entry) => ({ category: clean(entry.category), names: names(entry.items) }))
      .filter((group) => group.names.length > 0);
    if (groups.length === 0) return [];

    // A result builder, the way SwiftUI groups children: one block per category.
    return [
      [
        0,
        [
          code('var ', 'keyword'),
          code('skills', 'property'),
          code(': '),
          code('some ', 'keyword'),
          code('SkillSet', 'type'),
          code(' {')
        ]
      ],
      ...groups.flatMap((group) => [
        [1, [code('Category', 'call'), code('('), ...quoted(group.category), code(') {')]],
        [2, arrayLiteral(group.names)],
        [1, [code('}')]]
      ]),
      [0, [code('}')]]
    ];
  }

  experience(data) {
    return this.collection(
      'experience',
      'Role',
      list(data.relevant_experience).map((role) =>
        this.call(
          'Role',
          [
            ['title', role.title, { element: 'h3' }],
            ['company', role.company],
            ['location', role.location],
            ['period', role.period],
            ['summary', role.summary],
            ['description', role.description]
          ],
          { trailing: list(role.highlights) }
        )
      )
    );
  }

  certifications(data) {
    return this.collection(
      'certifications',
      'Certification',
      list(data.certifications).map((certification) => {
        const url = clean(certification.url);
        return this.call('Certification', [
          ['name', certification.name, url ? { element: 'a', href: url } : {}],
          ['issuer', certification.issuer],
          ['year', certification.year],
          ['description', certification.description]
        ]);
      })
    );
  }

  education(data) {
    return this.collection(
      'education',
      'Degree',
      list(data.education).map((degree) =>
        this.call('Degree', [
          ['title', degree.degree],
          ['school', degree.school],
          ['period', degree.period],
          ['description', degree.description]
        ])
      )
    );
  }

  languages(data) {
    const languages = list(data.languages).filter((language) => clean(language.name) !== '');
    if (languages.length === 0) return [];

    const pairs = [
      code('KeyValuePairs', 'type'),
      code('<'),
      code('String', 'type'),
      code(', '),
      code('String', 'type'),
      code('>')
    ];
    return [
      [0, [...declaration('let', 'languages', pairs), code('[')]],
      ...languages.map((language) => [
        1,
        [...quoted(clean(language.name)), code(': '), ...quoted(clean(language.level)), code(',')]
      ]),
      [0, [code(']')]]
    ];
  }

  interests(data) {
    const interests = list(data.interests).map(clean).filter(Boolean);
    if (interests.length === 0) return [];
    return [
      [0, [...declaration('let', 'interests', arrayOf('String')), ...arrayLiteral(interests)]]
    ];
  }

  /** `let name: [Type] = [` an entry per block `]`, or nothing when there are no entries. */
  collection(name, type, entries) {
    const present = entries.filter((entry) => entry.length > 0);
    if (present.length === 0) return [];
    return [
      [0, [...declaration('let', name, arrayOf(type)), code('[')]],
      ...present.flatMap((entry) => indent(entry)),
      [0, [code(']')]]
    ];
  }

  /**
   * An initialiser across several lines, one argument a line. An empty argument is left out
   * rather than written as `""`: a role with no description has no description, not a blank one.
   * A list argument opens its own block. A number in the data is a number literal; a string that
   * looks like one — a period of "2009" — stays a string, because that is what was written.
   * `trailing` strings become a trailing closure, one a line, the shape SwiftUI gives children.
   */
  call(type, args, { prefix = [], close = ',', trailing = [] } = {}) {
    const present = args
      .map(([label, value, extra = {}]) => [label, normalise(value), extra])
      .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value !== ''));
    const children = trailing.map(clean).filter(Boolean);
    if (present.length === 0 && children.length === 0) return [];

    const head = [...prefix, code(type, 'call')];
    const closure = [...children.map((child) => [1, quoted(child)]), [0, [code(`}${close}`)]]];
    if (present.length === 0) return [[0, [...head, code(' {')]], ...closure];

    const body = present.flatMap(([label, value, extra], index) => {
      const last = index === present.length - 1;
      const name = code(`${label}: `, 'label');

      if (Array.isArray(value)) {
        return [
          [1, [name, code('[')]],
          ...value.map((item) => [2, [...(Array.isArray(item) ? item : quoted(item)), code(',')]]),
          [1, [code(']'), ...comma(last)]]
        ];
      }

      const literal =
        typeof value === 'number'
          ? [content(String(value), 'number', extra)]
          : quoted(value, extra);
      return [[1, [name, ...literal, ...comma(last)]]];
    });

    const end =
      children.length === 0 ? [[0, [code(`)${close}`)]]] : [[0, [code(') {')]], ...closure];
    return [[0, [...head, code('(')]], ...body, ...end];
  }

  /**
   * The contact card the preview renders: the name, the role, a row of actions and the details.
   * The actions are the ways a card offers to reach someone — call, mail, then the profile's links
   * — up to one row of four.
   */
  card(data, t) {
    const phone = clean(data.phone);
    const email = clean(data.email);
    const location = clean(data.location);

    const actions = [
      ...(phone ? [{ icon: 'phone', label: t('source.card.call') }] : []),
      ...(email ? [{ icon: 'mail', label: t('source.card.mail') }] : []),
      ...list(data.social)
        .filter((link) => clean(link.url) !== '' && clean(link.platform) !== '')
        .map((link) => ({ icon: 'link', label: clean(link.platform) }))
    ].slice(0, CARD_ACTIONS);

    const rows = [
      ...(phone ? [{ kind: 'phone', label: t('cv:contacts.phone'), value: phone }] : []),
      ...(email ? [{ kind: 'email', label: t('cv:contacts.email'), value: email }] : []),
      ...(location ? [{ kind: 'location', label: t('source.card.location'), value: location }] : [])
    ];

    return { name: clean(data.name), title: clean(data.title), actions, rows };
  }
}
