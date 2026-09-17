import { certificationLine, roleHeader, schoolLine } from '../domain/EntryLines.js';

const isGroup = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The entries of a list the profile writes, each with its index, leaving out any that is not a group of fields. */
const entries = (list) =>
  Array.isArray(list)
    ? list.map((entry, index) => ({ entry, index })).filter(({ entry }) => isGroup(entry))
    : [];

/** Whether a line, as `domain/EntryLines.js` writes it, prints the field. */
const prints = (pieces, field) => pieces.some((piece) => piece.field === field);

/**
 * What a profile leaves out that a reader looks for (#178).
 *
 * `ProfileShape` leaves a role's location, a degree's period and a certification's issuer and year optional on purpose,
 * and since #169 the CV prints without them cleanly. Each still carries credibility. The review of #175 printed a copy
 * of the published profile without them: the undated degree was lost to a parser reading in drawing order, since its
 * period is what closes the entry; a renewable certificate without a year cannot be told current from lapsed; one
 * without an issuer names nobody who awarded it; and a role without a place breaks the pattern of neighbours that name
 * theirs. So a role is named only when another role does name its place: a CV that names none is consistent.
 *
 * A warning, never a refusal: the shape decides what a profile must hold, and the editor saves this one. A field is
 * missing exactly where the entry's line prints nothing for it, so the warning and the paper agree.
 */
export class ProfileCompleteness {
  /**
   * @param {unknown} profile - A profile, as its file holds it
   * @returns {{ path: string, reason: string }[]} Every omission, in the order of the profile's fields: roles, then
   *   degrees, then certifications, each with where it is (`education[1].period`) and what the print loses; none for
   *   a profile that leaves nothing out
   */
  static omissions(profile) {
    if (!isGroup(profile)) return [];
    const roles = entries(profile.relevant_experience).map(({ entry, index }) => ({
      entry,
      index,
      placed: prints(roleHeader(entry, ''), 'location')
    }));
    const placed = roles.filter((role) => role.placed).length;
    return [
      ...(placed > 0
        ? roles
            .filter((role) => !role.placed)
            .map(({ entry, index }) => ({
              path: `relevant_experience[${index}].location`,
              reason: `is missing: the role "${entry.title}" at ${entry.company} prints with no place, while ${placed} other ${placed === 1 ? 'role names one' : 'roles name one'}`
            }))
        : []),
      ...entries(profile.education)
        .filter(({ entry }) => !prints(schoolLine(entry), 'period'))
        .map(({ entry, index }) => ({
          path: `education[${index}].period`,
          reason: `is missing: the degree "${entry.degree}" prints with no date`
        })),
      ...entries(profile.certifications).flatMap(({ entry, index }) => [
        ...(certificationLine({ issuer: entry.issuer }).length
          ? []
          : [
              {
                path: `certifications[${index}].issuer`,
                reason: `is missing: "${entry.name}" prints with no issuer, so nobody can tell who awarded it`
              }
            ]),
        ...(certificationLine({ year: entry.year }).length
          ? []
          : [
              {
                path: `certifications[${index}].year`,
                reason: `is missing: "${entry.name}" prints with no year, so nobody can tell it current from lapsed`
              }
            ])
      ])
    ];
  }
}
