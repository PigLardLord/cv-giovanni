/**
 * How long the printed CV's lines run, read from the text layer (#155).
 *
 * WCAG 1.4.8 puts a line of text at 80 characters at most. Nothing measured it, and once the print is the only
 * downloadable PDF a stylesheet change that widened the column would go unnoticed. The measure is taken on prose, the
 * sentences a reader follows along a line: the summary, the highlights, and what a role, a certificate or a degree
 * says. Lists are scanned item by item, not read along a measure, so a line of skills, interests or contacts is not
 * held to it.
 *
 * Nerd Mode prints each role's dates in a column of their own, and a date too long for it runs into the gap beside the
 * role without wrapping anything a text check would see. So each line of a period is held to its column's edge too.
 */

/** WCAG 1.4.8: no more than 80 characters a line. */
export const MEASURE_LIMIT = 80;

/**
 * Nerd Mode's date column on paper, in points from the page's left edge: the page's side margin, and the column's
 * width, as print.css declares them. The audit reads no CSS, so `tests/LineLength.test.js` holds them to it.
 */
export const NERD_DATE_COLUMN = { left: 39, width: 128 };

/** Less than half a point past an edge is rounding, not overflow. */
const TOLERANCE = 0.5;

const squash = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The prose a profile prints, as its strings: the summary, the career highlights, and each role's summary,
 * description and highlights, each certificate's and each degree's description.
 * @param {object} profile - The profile
 * @returns {string[]} Every non-empty prose string, in the order the profile writes them
 */
export function proseOf(profile) {
  return [
    profile.profile,
    ...(profile.career_highlights ?? []),
    ...(profile.relevant_experience ?? []).flatMap((role) => [
      role.summary,
      role.description,
      ...(role.highlights ?? [])
    ]),
    ...(profile.certifications ?? []).map((certification) => certification.description),
    ...(profile.education ?? []).map((degree) => degree.description)
  ]
    .map(squash)
    .filter(Boolean);
}

/**
 * The prose lines longer than the measure, each with its page.
 * @param {string} text - The text layer, from `pdftotext`, pages separated by form feeds
 * @param {string[]} prose - The prose the profile prints, from `proseOf`
 * @param {number} [limit] - The most characters a line may hold
 * @returns {{ page: number, length: number, line: string }[]} Every prose line past the limit
 */
export function longProseLines(text, prose, limit = MEASURE_LIMIT) {
  return String(text)
    .split('\f')
    .flatMap((page, index) =>
      page
        .split('\n')
        .map(squash)
        .filter((line) => line.length > limit && prose.some((string) => string.includes(line)))
        .map((line) => ({ page: index + 1, length: line.length, line }))
    );
}

const attribute = (tag, name) => Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1]);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ENTITIES[name]);

/**
 * Every line of a `pdftotext -bbox-layout` extract, with its page, its left and right edge, its text, and each word's
 * right edge.
 * @param {string} extract - What `pdftotext -bbox-layout` wrote
 * @returns {{ page: number, left: number, right: number, text: string, words: { text: string, right: number }[] }[]}
 *   The lines, page by page
 */
export function bboxLines(extract) {
  return String(extract)
    .split(/<page\b/)
    .slice(1)
    .flatMap((page, index) =>
      [...page.matchAll(/<line\b([^>]*)>([\s\S]*?)<\/line>/g)].map(([, tag, body]) => {
        const words = [...body.matchAll(/<word\b([^>]*)>([^<]*)<\/word>/g)].map(
          ([, word, text]) => ({
            text: unescape(text),
            right: attribute(word, 'xMax')
          })
        );
        return {
          page: index + 1,
          left: attribute(tag, 'xMin'),
          right: attribute(tag, 'xMax'),
          text: words.map((word) => word.text).join(' '),
          words
        };
      })
    );
}

/**
 * The runs of a period that start in the date column and end past its edge.
 *
 * A line is read word by word from its start, for as long as the words so far are part of a period: poppler can set a
 * period and the role's title on one line, as it does when the two share a baseline, and only the period's own words
 * are held to the column.
 * @param {string} extract - What `pdftotext -bbox-layout` wrote
 * @param {string[]} periods - Each role's period as it prints, with its length when it has one
 * @param {{ left: number, width: number }} [column] - The date column
 * @returns {{ page: number, right: number, text: string }[]} Every overflowing run, with its right edge
 */
export function overflowingPeriods(extract, periods, column = NERD_DATE_COLUMN) {
  const edge = column.left + column.width;
  const written = periods.map(squash);
  return bboxLines(extract)
    .filter(({ left }) => left < edge)
    .map(({ page, words }) => {
      let run = [];
      for (const word of words) {
        const next = [...run, word];
        const text = next.map((part) => part.text).join(' ');
        if (!written.some((period) => period.includes(text))) break;
        run = next;
      }
      return { page, run };
    })
    .filter(({ run }) => run.length > 0 && run[run.length - 1].right > edge + TOLERANCE)
    .map(({ page, run }) => ({
      page,
      right: run[run.length - 1].right,
      text: run.map((word) => word.text).join(' ')
    }));
}
