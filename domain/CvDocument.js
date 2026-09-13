import { DateRange } from './DateRange.js';
/** Framework-free CV model consumed by every output boundary. */
export class CvDocument {
  constructor(data) {
    this.identity = {
      name: data.name,
      title: data.title,
      subtitle: data.subtitle || '',
      location: data.location,
      email: data.email,
      phone: data.phone,
      availability: data.availability || '',
      portfolio: data.portfolio || '',
      social: data.social || []
    };
    this.profile = data.profile;
    this.careerHighlights = data.career_highlights || [];
    this.skills = data.skills || [];
    this.experience = data.relevant_experience || [];
    this.education = data.education || [];
    this.languages = data.languages || [];
    this.certifications = data.certifications || [];
    this.interests = data.interests || [];
    // The month the CV's lengths are counted to: a role still running lasts until then (#55). A fixed month
    // keeps the same commit producing the same document on any day.
    this.asOf = CvDocument.month(data.asOf);
  }

  /**
   * How many months a role lasted, both ends counted. A role still running is counted to `asOf`.
   * @param {{ period?: string }} role - One entry of `experience`
   * @returns {number|null} Months, or null for a period written to the year, or for a running role in a
   *   profile that names no `asOf`
   */
  monthsIn(role) {
    return DateRange.parse(role?.period)?.monthsAt(this.asOf) ?? null;
  }

  /**
   * `2026-09` as `{ year: 2026, month: 9 }`.
   * @param {string} text - The month, as the profile writes it
   * @returns {{year: number, month: number}|null} The month, or null for anything else
   */
  static month(text) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(typeof text === 'string' ? text.trim() : '');
    return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
  }
}
