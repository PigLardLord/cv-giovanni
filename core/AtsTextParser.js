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
 * makes poppler a better extractor than the naive reading this models. It never sees the
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
      .split(/\r?\n/)
      .map((line) => line.replace(/\f/g, '').replace(/[ \t]+/g, ' ').trim());

    const headings = AtsTextParser.headings(lines);
    if (headings.length < 2) {
      // Fewer than two headings is not a document with little structure; it is a document
      // whose structure did not survive. Everything below would be invention.
      return new RecoveredCv({
        segmentation: 'failed',
        identity: AtsTextParser.identity(lines, lines.length),
        sections: headings.map(({ line, ...rest }) => ({ ...rest, line }))
      });
    }

    const blocks = AtsTextParser.blocks(lines, headings);
    const experience = AtsTextParser.experience(blocks.experience || []);

    return new RecoveredCv({
      segmentation: 'ok',
      languages: SectionLexicon.languagesUsed(headings),
      identity: AtsTextParser.identity(lines, headings[0].line),
      sections: headings,
      profile: AtsTextParser.profile(lines, headings[0].line, blocks.profile),
      experience,
      education: AtsTextParser.education(blocks.education || []),
      skills: AtsTextParser.skills(blocks.skills || []),
      spokenLanguages: AtsTextParser.spokenLanguages(blocks.languages || []),
      certifications: (blocks.certifications || []).filter((entry) => entry.text)
        .map((entry) => ({ text: entry.text, line: entry.line })),
      unassigned: (blocks.unassigned || []).map((entry) => entry.line)
    });
  }

  /** Every line that names a section, with the language it named it in. */
  static headings(lines) {
    return lines.flatMap((text, line) => {
      const previous = line === 0 ? '' : lines[line - 1];
      if (previous !== '') return [];
      const recognised = SectionLexicon.recognise(text);
      return recognised ? [{ ...recognised, text, line }] : [];
    });
  }

  /** The lines under each heading, keyed by canonical section. */
  static blocks(lines, headings) {
    const result = { unassigned: [] };
    headings.forEach((heading, index) => {
      const end = index + 1 < headings.length ? headings[index + 1].line : lines.length;
      const body = [];
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
    const addresses = [...new Set((withoutEmails.match(URL) || [])
      .map((candidate) => candidate.replace(/[.,;]$/, '')))];

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
    return words.length >= 2 && words.length <= 4
      && words.every((word) => word[0] === word[0].toUpperCase()) ? candidate : null;
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
    const fromBlock = (block || []).map((entry) => entry.text).filter(Boolean).join(' ');
    if (fromBlock.length > 120) return fromBlock;
    const paragraphs = lines.slice(0, until).join('\n').split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim());
    const prose = paragraphs.filter((p) => p.length > 120 && (p.match(/\./g) || []).length >= 2);
    return prose[prose.length - 1] || null;
  }

  /**
   * Roles, read as blank-line-separated blocks.
   *
   * The rule is the date: a block with no line that is wholly a period is not a role, and
   * its prose belongs to the role above. `tripleAdjacent` records whether the title, the
   * employer and the period arrived within three consecutive lines — the thing a sidebar
   * destroys while leaving all three strings present.
   */
  static experience(block) {
    const roles = [];
    for (const group of AtsTextParser.groups(block)) {
      const dateAt = group.findIndex((entry) => DateRange.parse(entry.text));
      if (dateAt < 0) {
        if (roles.length) roles[roles.length - 1].body.push(...group);
        continue;
      }
      const period = DateRange.parse(group[dateAt].text);
      const employerLine = dateAt >= 1 ? group[dateAt - 1] : null;
      const titleLine = dateAt >= 2 ? group[dateAt - 2] : null;
      const [employer, location] = employerLine ? employerLine.text.split(SEPARATORS) : [null, null];

      roles.push({
        title: RecoveredCv.field(titleLine?.text || null, titleLine?.line ?? -1),
        // Refused rather than guessed: with one line above the date there is no way to tell
        // a title from an employer, and binding the wrong one is worse than binding neither.
        employer: RecoveredCv.field(titleLine ? (employer || null) : null, employerLine?.line ?? -1),
        location: RecoveredCv.field(titleLine ? (location || null) : null, employerLine?.line ?? -1),
        period,
        periodLine: group[dateAt].line,
        tripleAdjacent: dateAt >= 2 && group[dateAt].line - group[dateAt - 2].line <= 2,
        body: group.slice(dateAt + 1)
      });
    }
    // Lines, not achievements. Extraction drops the bullet glyphs, so where one achievement
    // ends and the next begins is not decidable from the stream — and inventing the boundary
    // is exactly the kind of guess this parser exists to refuse. The joined text is offered
    // beside them so a diff can search prose without pretending to know its structure.
    return roles.map((role) => ({
      ...role,
      bodyLines: role.body.map((entry) => entry.text).filter(Boolean),
      bodyText: role.body.map((entry) => entry.text).filter(Boolean).join(' ')
    }));
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

  /** Degrees, each with whatever school and period followed it. */
  static education(block) {
    return AtsTextParser.groups(block).map((group) => {
      const [school, period] = (group[1]?.text || '').split(SEPARATORS);
      return {
        degree: RecoveredCv.field(group[0]?.text || null, group[0]?.line ?? -1),
        school: RecoveredCv.field(school || null, group[1]?.line ?? -1),
        period: period || null,
        line: group[0]?.line ?? -1
      };
    }).filter((entry) => entry.degree);
  }

  /**
   * Skill groups: a short line with no comma, then the comma-bearing lines under it.
   *
   * Items split on `,` and `·` only. Never on `/`, or `XCTest / XCUITest` and
   * `SBOM / Dependency-Track` shatter into halves that are not skills.
   */
  static skills(block) {
    const groups = [];
    for (const group of AtsTextParser.groups(block)) {
      const isCategory = group[0] && group[0].text.length <= 40 && !group[0].text.includes(',');
      if (isCategory && group.length === 1) {
        groups.push({ category: group[0].text, line: group[0].line, items: [] });
        continue;
      }
      const target = groups[groups.length - 1];
      const items = group.map((entry) => entry.text).join(' ')
        .split(/\s*[,·]\s*/).map((item) => item.trim()).filter(Boolean);
      if (target && !target.items.length) target.items = items;
      else groups.push({ category: null, line: group[0].line, items });
    }
    return groups;
  }

  /** `Language: level`, `Language — level` or `Language (level)`. CEFR only when written. */
  static spokenLanguages(block) {
    return block.filter((entry) => entry.text).map((entry) => {
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
    }).filter(Boolean);
  }
}
