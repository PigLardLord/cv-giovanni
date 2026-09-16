import { DateRange } from '../domain/DateRange.js';
import { PlaceLexicon } from '../domain/PlaceLexicon.js';
import { RecoveredCv } from '../domain/RecoveredCv.js';
import { SectionLexicon } from '../domain/SectionLexicon.js';

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s·|]*)?/gi;
const SEPARATORS = /\s*[·|•]\s*/;

/**
 * The worst-case parser: what a stranger recovers from the text and nothing else.
 *
 * It takes a **string** — the output of `pdftotext` with no `-layout`, because that flag
 * makes poppler a better extractor than the naive reading this models, or of `pdftotext -raw`,
 * the content-stream order PDFBox and Tika read, which writes no blank line anywhere. It never sees the
 * authored JSON, which `tests/AtsParserIsBlind.test.js` enforces: a parser that can read the
 * answer key measures nothing.
 *
 * What it refuses to guess is as much the point as what it recovers. Every refusal is a
 * finding about the document, not a gap in the tool.
 */
export class AtsTextParser {
  /**
   * @param {string} text - Extracted text, lines separated by newlines
   * @returns {RecoveredCv} What could be recovered
   */
  static parse(text) {
    const lines = String(text ?? '')
      .replace(/ | | /g, ' ')
      // A page break is a line break. Poppler's own order opens the next page on a line of its own;
      // content-stream order writes the form feed between two lines it never parted,
      // "colleagues.\fLed annual", and the two would read as one sentence.
      .replace(/([^\n])\f/g, '$1\n')
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/\f/g, '')
          .replace(/[ \t]+/g, ' ')
          .trim()
      );

    const headings = AtsTextParser.headings(lines);
    if (headings.length < 2) {
      // Fewer than two headings is not a document with little structure; it is a document
      // whose structure did not survive. Everything below would be invention.
      return new RecoveredCv({
        segmentation: 'failed',
        identity: AtsTextParser.identity(lines, lines.length),
        sections: headings.map(({ beside, ...heading }) => heading)
      });
    }

    const blocks = AtsTextParser.blocks(lines, headings);
    const experience = AtsTextParser.experience(blocks.experience || []);

    return new RecoveredCv({
      segmentation: 'ok',
      languages: SectionLexicon.languagesUsed(headings),
      identity: AtsTextParser.identity(lines, headings[0].line),
      sections: headings.map(({ beside, ...heading }) => heading),
      profile: AtsTextParser.profile(lines, headings[0].line, blocks.profile),
      experience,
      education: AtsTextParser.education(blocks.education || []),
      skills: AtsTextParser.skills(blocks.skills || []),
      spokenLanguages: AtsTextParser.spokenLanguages(blocks.languages || []),
      certifications: (blocks.certifications || [])
        .filter((entry) => entry.text)
        .map((entry) => ({ text: entry.text, line: entry.line })),
      unassigned: (blocks.unassigned || []).map((entry) => entry.line)
    });
  }

  /**
   * Every line that names a section, with the language it named it in.
   *
   * A section name alone on its line is a heading wherever it stands, because content-stream order
   * writes no blank line above one (#147). A name the lexicon only half recognises still needs the
   * blank line: without it, a truncated heading and the start of a sentence look alike. A label set
   * beside its block comes out welded to the block's first line, and that line is kept as the block's.
   */
  static headings(lines) {
    return lines.flatMap((text, line) => {
      const previous = line === 0 ? '' : lines[line - 1];
      const recognised = SectionLexicon.recognise(text);
      if (recognised && (recognised.match === 'exact' || previous === '')) {
        return [{ ...recognised, text, line }];
      }
      const label = SectionLexicon.label(text);
      if (!label) return [];
      const { rest, label: name, ...where } = label;
      return [{ ...where, text: name, line, beside: rest }];
    });
  }

  /** The lines under each heading, keyed by canonical section. */
  static blocks(lines, headings) {
    const result = { unassigned: [] };
    headings.forEach((heading, index) => {
      const end = index + 1 < headings.length ? headings[index + 1].line : lines.length;
      const body = heading.beside ? [{ text: heading.beside, line: heading.line }] : [];
      for (let line = heading.line + 1; line < end; line += 1) {
        body.push({ text: lines[line], line });
      }
      result[heading.section] = (result[heading.section] || []).concat(body);
    });
    return result;
  }

  /**
   * Contacts, name and the headline block, read from the lines above the first heading.
   *
   * The one refusal worth naming here: a URL is never derived from anchor text. If the
   * document draws `GitHub` over a hyperlink, no address was recovered — and saying so is
   * the finding, because that is exactly what a parser downstream will report.
   */
  static identity(lines, until) {
    const head = lines.slice(0, until);
    const joined = head.join('\n');
    const emails = [...new Set(joined.match(EMAIL) || [])];
    // Emails come out before addresses are looked for: `trovato.giovanni@gmail.com` contains
    // two things that look exactly like hostnames, and both would be reported as links the
    // CV does not have.
    const withoutEmails = emails.reduce((text, email) => text.split(email).join(' '), joined);
    const addresses = [
      ...new Set(
        (withoutEmails.match(URL) || []).map((candidate) => candidate.replace(/[.,;]$/, ''))
      )
    ];

    const lineOf = (value) => head.findIndex((text) => value && text.includes(value));
    const name = AtsTextParser.name(head);

    return {
      name: RecoveredCv.field(name, name ? head.findIndex((text) => text === name) : -1),
      title: RecoveredCv.field(AtsTextParser.title(head, name), name ? 1 : -1),
      email: RecoveredCv.field(emails[0] || null, lineOf(emails[0])),
      phone: RecoveredCv.field(AtsTextParser.phone(head), lineOf(AtsTextParser.phone(head))),
      location: AtsTextParser.location(head),
      addresses: addresses.map((value) => ({ value, line: lineOf(value) })),
      otherHeaderLines: head.map((text, line) => ({ text, line })).filter((entry) => entry.text)
    };
  }

  /**
   * The location, when a part of the header ends in a place the lexicon knows.
   *
   * Refused otherwise. An employer beside a city and a town beside a country are the same
   * shape to a regex, and a guess puts a company name in the location field of a parsed
   * record — wrong, and invisible.
   * @param {string[]} head - Lines above the first heading
   * @returns {{value: string, line: number}|null} The location
   */
  static location(head) {
    for (const [line, text] of head.entries()) {
      for (const candidate of text.split(SEPARATORS)) {
        const location = PlaceLexicon.locationIn(candidate);
        if (location) return { value: location, line };
      }
    }
    return null;
  }

  /**
   * The first line, when it looks like a name.
   *
   * Never derived from the email address: a local part of `surname.forename` would give the
   * name reversed — plausible, and wrong. A guess that looks right is worse than a gap.
   */
  static name(head) {
    const candidate = head.find(Boolean);
    if (!candidate || candidate.length > 60) return null;
    if (/[@\d]/.test(candidate) || SectionLexicon.recognise(candidate)) return null;
    const words = candidate.split(' ');
    return words.length >= 2 &&
      words.length <= 4 &&
      words.every((word) => word[0] === word[0].toUpperCase())
      ? candidate
      : null;
  }

  /** The line under the name, when it is not a contact line and not a date. */
  static title(head, name) {
    if (!name) return null;
    const at = head.findIndex((text) => text === name);
    const candidate = head.slice(at + 1).find(Boolean);
    if (!candidate || candidate.length > 90) return null;
    return /@/.test(candidate) || DateRange.parse(candidate) ? null : candidate;
  }

  /**
   * A telephone number, or nothing.
   *
   * A CV is full of numbers — test counts, percentages, runtimes, team sizes — and every one
   * of them can be read as a phone number by a regex that only counts digits. The guards are the substance: eight to fifteen digits, no percent, no
   * tilde, no thousands comma, and never inside something that parses as a date.
   */
  static phone(head) {
    for (const text of head) {
      if (!text || /[%~]/.test(text) || DateRange.parse(text)) continue;
      for (const candidate of text.match(/\+?[\d][\d\s().-]{6,}\d/g) || []) {
        if (/,/.test(candidate)) continue;
        const digits = candidate.replace(/\D/g, '');
        if (digits.length >= 8 && digits.length <= 15) {
          return `${candidate.trim().startsWith('+') ? '+' : ''}${digits}`;
        }
      }
    }
    return null;
  }

  /** The summary paragraph: the prose above the first heading, or under a profile heading. */
  static profile(lines, until, block) {
    const fromBlock = (block || [])
      .map((entry) => entry.text)
      .filter(Boolean)
      .join(' ');
    if (fromBlock.length > 120) return fromBlock;
    const paragraphs = lines
      .slice(0, until)
      .join('\n')
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, ' ').trim());
    const prose = paragraphs.filter((p) => p.length > 120 && (p.match(/\./g) || []).length >= 2);
    return prose[prose.length - 1] || null;
  }

  /**
   * Roles, anchored on their periods.
   *
   * The rule is the date: a line that is wholly a period, or a period opening a role's header on
   * the same line, starts a role, and every line up to the next role's first line is its body.
   * Nothing before the first role is a role.
   *
   * A role's header stands on one side of its period, and which side is read off the section's
   * first line, as a reader reads it: a section that opens on a period writes every period first.
   * Deciding role by role would bind a period that sits between two headers to whichever looked
   * better, and a career of roles without achievements is exactly that shape.
   *
   * `tripleAdjacent` records whether the title, the employer and the period arrived within three
   * consecutive lines of text — the thing a sidebar destroys while leaving all three strings
   * present. A blank line is not text: a column of dates beside the roles leaves one between a
   * period and its title, and nothing else.
   */
  static experience(block) {
    const entries = block.filter((entry) => entry.text);
    const anchors = entries.flatMap((entry, index) => {
      const whole = DateRange.parse(entry.text);
      if (whole) return [{ index, period: whole, opens: null }];
      const opening = AtsTextParser.openingPeriod(entry.text);
      return opening ? [{ index, period: opening.period, opens: opening.rest }] : [];
    });
    const periodFirst = anchors.length > 0 && anchors[0].index === 0;

    const roles = [];
    anchors.forEach((anchor, n) => {
      // A header never reaches past the role before it or into the role after it.
      const floor = n === 0 ? 0 : roles[n - 1].header.to + 1;
      const ceiling = n + 1 < anchors.length ? anchors[n + 1].index : entries.length;
      const header =
        anchor.opens !== null || periodFirst
          ? AtsTextParser.headerAfter(entries, anchor, ceiling)
          : AtsTextParser.headerBefore(entries, anchor, floor);
      roles.push({ anchor, header });
    });

    // Lines, not achievements. Extraction drops the bullet glyphs, so where one achievement
    // ends and the next begins is not decidable from the stream — and inventing the boundary
    // is exactly the kind of guess this parser exists to refuse. The joined text is offered
    // beside them so a diff can search prose without pretending to know its structure.
    return roles.map(({ anchor, header }, n) => {
      const next = roles[n + 1];
      const body = entries.slice(header.to + 1, next ? next.header.from : entries.length);
      const { title, employer, location } = header;
      return {
        title: RecoveredCv.field(title?.value || null, title?.line ?? -1),
        employer: RecoveredCv.field(employer?.value || null, employer?.line ?? -1),
        location: RecoveredCv.field(location?.value || null, location?.line ?? -1),
        period: anchor.period,
        periodLine: entries[anchor.index].line,
        tripleAdjacent: Boolean(title && employer) && header.to - header.from <= 2,
        body,
        bodyLines: body.map((entry) => entry.text),
        bodyText: body.map((entry) => entry.text).join(' ')
      };
    });
  }

  /**
   * A role's header, read from the lines above its period, and no higher than the role before.
   *
   * Three shapes, tried in this order: "Title at Employer, City" on the line above; the same
   * wrapped after its connector, "Title at" over "Employer, City"; and a title over
   * "Employer · City", which has no connector to confirm it and so is only read when both lines
   * sit in the period's own paragraph.
   * @returns {{title, employer, location, from: number, to: number}} Fields, and the lines they span
   */
  static headerBefore(entries, anchor, floor) {
    const at = anchor.index;
    const above = at - 1 >= floor ? entries[at - 1] : null;
    const twoAbove = at - 2 >= floor ? entries[at - 2] : null;
    const period = entries[at];

    const oneLine = above && AtsTextParser.roleHeader(above.text);
    if (oneLine) return AtsTextParser.header(oneLine, above, above, at - 1, at);

    const wrapped = twoAbove && AtsTextParser.wrappedTitle(twoAbove.text);
    if (wrapped) {
      return AtsTextParser.header(
        { title: wrapped, ...AtsTextParser.employerAndPlace(above.text) },
        twoAbove,
        above,
        at - 2,
        at
      );
    }

    const adjacent = (entry, distance) => entry && entry.line === period.line - distance;
    if (adjacent(above, 1) && adjacent(twoAbove, 2)) {
      const [employer, location] = above.text.split(SEPARATORS);
      return AtsTextParser.header(
        { title: twoAbove.text, employer, location },
        twoAbove,
        above,
        at - 2,
        at
      );
    }
    // Refused rather than guessed: with one line above the date there is no way to tell a title
    // from an employer, and binding the wrong one is worse than binding neither.
    return {
      title: null,
      employer: null,
      location: null,
      from: adjacent(above, 1) ? at - 1 : at,
      to: at
    };
  }

  /**
   * A role's header, read from its period's own line or from the lines below it, and no lower
   * than the next role. Only the shapes a connector confirms: a title and an employer below a
   * period with nothing joining them could as well be a summary's first two lines.
   */
  static headerAfter(entries, anchor, ceiling) {
    const at = anchor.index;
    const [line, next] = anchor.opens !== null ? [at, at + 1] : [at + 1, at + 2];
    const first =
      line < ceiling ? { ...entries[line], text: anchor.opens ?? entries[line].text } : null;
    const second = next < ceiling ? entries[next] : null;

    const oneLine = first && AtsTextParser.roleHeader(first.text);
    if (oneLine) return AtsTextParser.header(oneLine, first, first, at, line);

    const wrapped = first && second && AtsTextParser.wrappedTitle(first.text);
    if (wrapped) {
      return AtsTextParser.header(
        { title: wrapped, ...AtsTextParser.employerAndPlace(second.text) },
        first,
        second,
        at,
        next
      );
    }
    return { title: null, employer: null, location: null, from: at, to: at };
  }

  /** The header's fields, each with the line it was read from. */
  static header({ title, employer, location }, titleLine, employerLine, from, to) {
    const on = (value, entry) => (value ? { value: value.trim(), line: entry.line } : null);
    return {
      title: on(title, titleLine),
      employer: on(employer, employerLine),
      location: on(location, employerLine),
      from,
      to
    };
  }

  /**
   * "Title at Employer, City" — a role as the page writes it and as running text says it.
   *
   * A header names; it does not end a sentence. A line that closes on a full stop is prose that
   * happens to mention a place of work, and it is refused.
   * @param {string} text - One line
   * @returns {{title: string, employer: string, location: string|null}|null} The header
   */
  static roleHeader(text) {
    const value = String(text ?? '').trim();
    if (!value || /[.;:!?]$/.test(value)) return null;
    const match = new RegExp(`^(.+?)\\s(?:${AtsTextParser.connectors()})\\s(.+)$`).exec(value);
    return match ? { title: match[1].trim(), ...AtsTextParser.employerAndPlace(match[2]) } : null;
  }

  /** A title whose line ends on its connector, "… iOS & Android at": the employer is on the next line. */
  static wrappedTitle(text) {
    const match = new RegExp(`^(.+?)\\s(?:${AtsTextParser.connectors()})$`).exec(
      String(text ?? '').trim()
    );
    return match ? match[1].trim() : null;
  }

  /** "Employer, City" or "Employer · City", parted at the first separator. */
  static employerAndPlace(text) {
    const value = String(text ?? '').trim();
    const split = /\s*[·|•]\s*|,\s+/.exec(value);
    return split
      ? {
          employer: value.slice(0, split.index),
          location: value.slice(split.index + split[0].length)
        }
      : { employer: value, location: null };
  }

  /** The connectors, as one alternation for a pattern. */
  static connectors() {
    return SectionLexicon.connectors()
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
  }

  /**
   * A period that opens a line and a role header that follows it on the same line: "September 2015 –
   * July 2018 Mobile Developer at Acme, Pisa, Italy", which is how a column of dates drawn first
   * reads in content-stream order. The longest period wins, so "May 2015" is never cut from
   * "May 2015 – August 2015".
   * @param {string} text - One line
   * @returns {{period: DateRange, rest: string}|null} The period and the header after it
   */
  static openingPeriod(text) {
    const words = text.split(' ');
    for (let count = Math.min(words.length - 1, 8); count >= 1; count -= 1) {
      const rest = words.slice(count).join(' ');
      if (!AtsTextParser.roleHeader(rest) && !AtsTextParser.wrappedTitle(rest)) continue;
      const period = DateRange.parse(words.slice(0, count).join(' '));
      if (period) return { period, rest };
    }
    return null;
  }

  /** Blank-line-separated groups of non-empty lines. */
  static groups(block) {
    const groups = [];
    let current = [];
    for (const entry of block) {
      if (entry.text === '') {
        if (current.length) groups.push(current);
        current = [];
        continue;
      }
      current.push(entry);
    }
    if (current.length) groups.push(current);
    return groups;
  }

  /**
   * Degrees, each with the school and period that close it.
   *
   * A line that ends in a period — "School · 2014 – 2016" or "School (2014 – 2016)" — closes an
   * entry, and every line above it since the last one is the degree, so a degree the measure
   * wrapped stays one degree. A paragraph with no such line keeps the older reading: the degree,
   * then the school.
   */
  static education(block) {
    const entries = [];
    for (const group of AtsTextParser.groups(block)) {
      const closers = group
        .map((entry, index) => ({ index, ...AtsTextParser.schoolAndPeriod(entry.text) }))
        .filter((candidate) => candidate.period);
      if (!closers.length) {
        const [school, period] = (group[1]?.text || '').split(SEPARATORS);
        entries.push({
          degree: RecoveredCv.field(group[0]?.text || null, group[0]?.line ?? -1),
          school: RecoveredCv.field(school || null, group[1]?.line ?? -1),
          period: period || null,
          line: group[0]?.line ?? -1
        });
        continue;
      }
      let start = 0;
      for (const closer of closers) {
        const degree = group.slice(start, closer.index);
        entries.push({
          degree: RecoveredCv.field(
            degree.map((entry) => entry.text).join(' ') || null,
            degree[0]?.line ?? -1
          ),
          school: RecoveredCv.field(closer.school, group[closer.index].line),
          period: closer.period,
          line: degree[0]?.line ?? -1
        });
        start = closer.index + 1;
      }
    }
    return entries.filter((entry) => entry.degree);
  }

  /**
   * "School · period" or "School (period)", when what closes the line reads as a period. A
   * parenthesis that does not — "(TUM)", "(remote)" — is part of the name.
   */
  static schoolAndPeriod(text) {
    const parenthesised = /^(.*\S)\s*\(([^()]+)\)$/.exec(text);
    if (parenthesised && DateRange.parse(parenthesised[2])) {
      return { school: parenthesised[1], period: parenthesised[2] };
    }
    const parts = text.split(SEPARATORS);
    if (parts.length >= 2 && DateRange.parse(parts[parts.length - 1])) {
      return { school: parts[0], period: parts[parts.length - 1] };
    }
    return { school: null, period: null };
  }

  /**
   * Skill groups: a short line with no comma, then the comma-bearing lines under it — or
   * "Category — items" on one line, whose list runs on over the lines until the next category.
   *
   * Items split on `,` and `·` only. Never on `/`, or `XCTest / XCUITest` and
   * `SBOM / Dependency-Track` shatter into halves that are not skills.
   */
  static skills(block) {
    const groups = [];
    for (const group of AtsTextParser.groups(block)) {
      if (AtsTextParser.inlineCategory(group[0].text)) {
        const lists = [];
        for (const entry of group) {
          const inline = AtsTextParser.inlineCategory(entry.text);
          if (inline) {
            lists.push({ category: inline.category, line: entry.line, text: [inline.items] });
          } else {
            lists[lists.length - 1].text.push(entry.text);
          }
        }
        groups.push(
          ...lists.map(({ text, ...list }) => ({ ...list, items: AtsTextParser.items(text) }))
        );
        continue;
      }
      const isCategory = group[0].text.length <= 40 && !group[0].text.includes(',');
      if (isCategory && group.length === 1) {
        groups.push({ category: group[0].text, line: group[0].line, items: [] });
        continue;
      }
      const target = groups[groups.length - 1];
      const items = AtsTextParser.items(group.map((entry) => entry.text));
      if (target && !target.items.length) target.items = items;
      else groups.push({ category: null, line: group[0].line, items });
    }
    return groups;
  }

  /**
   * "Category — items" or "Category: items". The category is short and carries no comma, so a
   * wrapped line of the list that happens to hold a dash is never taken for one.
   */
  static inlineCategory(text) {
    const match = /^([^,:—–]{1,40}?)(?:\s+[—–]|:)\s+(.+)$/.exec(text);
    return match ? { category: match[1].trim(), items: match[2] } : null;
  }

  /** A list's lines, joined and split into items. */
  static items(lines) {
    return lines
      .join(' ')
      .split(/\s*[,·]\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /** `Language: level`, `Language — level` or `Language (level)`. CEFR only when written. */
  static spokenLanguages(block) {
    return block
      .filter((entry) => entry.text)
      .map((entry) => {
        const match = /^([^:—(]{2,30})\s*[:—(]\s*(.+?)\)?$/.exec(entry.text);
        if (!match) return null;
        const level = match[2].trim();
        return {
          name: match[1].trim(),
          level,
          // A prose word is not a CEFR level, and mapping one to another would be claiming a
          // precision the document did not state.
          cefr: /\b([ABC][12])\b/.exec(level)?.[1] || null,
          line: entry.line
        };
      })
      .filter(Boolean);
  }
}
