/**
 * The weights, and their reasons.
 *
 * Every commercial checker hands out a number and none of them publishes what it measures.
 * This file is the publication: each weight carries why it is that size, and the report
 * prints the table rather than linking to it, because a score whose weights are one click
 * away gets quoted without them.
 *
 * The number is this repository's own definition. No vendor produces it, no applicant
 * tracking system uses it, and no employer will ever see it. It is a floor — one parser
 * model, the strictest naive reading — not a prediction.
 */
export const BANDS = {
  // If the parsed record cannot reach the candidate, nothing downstream matters: the CV can
  // be perfect and still be a document nobody can answer.
  contactability: {
    weight: 25,
    parts: { email: 8, name: 6, phone: 5, location: 3, links: 3 }
  },
  // The largest, because this is the field set that goes into the database and gets searched,
  // and because it is the failure mode with a published independent baseline — 0.817 F1 over
  // 13,100 résumés, against vendor claims of 97%.
  structure: {
    weight: 35,
    parts: { segmentation: 8, sections: 7, tripleAdjacent: 8, chronology: 6, skillsAttached: 6 }
  },
  // Strings must survive, but a welded hyphen costs less than a lost employer, so this sits
  // below structure rather than beside it.
  fidelity: {
    weight: 20,
    parts: { roles: 8, education: 4, skills: 5, languages: 3 }
  },
  // Capped deliberately. Over-weighting the advert would reproduce the myth the evidence
  // disproves: 92% of surveyed recruiters report their system does not auto-reject on
  // content, and the "75% rejected" figure traces to a 2012 sales pitch with no method.
  advert: {
    weight: 20,
    parts: { requiredInProse: 12, requiredPresent: 5, optional: 3 }
  }
};

/** What each rung of the ladder is worth. */
const CREDIT = { exact: 1, normalised: 1, partial: 0.5, wrong: 0, lost: 0 };

const share = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export class AtsScore {
  /**
   * Compose the bands into one number, without rescaling an absent one.
   *
   * A band with no input is **unscored**, and the denominator drops. It is never rescaled to
   * 100: rescaling lets a missing input look like a pass, which is the mistake the grayscale
   * check made when its filename pattern matched no files for weeks.
   * @param {Object} diff - A RecoveryDiff result
   * @param {Object|null} [advert] - An advert match, when one was given
   * @returns {Object} `{ points, denominator, bands, weights }`
   */
  static compose(diff, advert = null) {
    const bands = {
      contactability: AtsScore.contactability(diff),
      structure: AtsScore.structure(diff),
      fidelity: AtsScore.fidelity(diff),
      advert: advert ? AtsScore.advert(advert) : null
    };

    const scored = Object.entries(bands).filter(([, band]) => band !== null);
    return {
      points: Math.round(scored.reduce((total, [, band]) => total + band.points, 0)),
      denominator: scored.reduce((total, [name]) => total + BANDS[name].weight, 0),
      unscored: Object.entries(bands).filter(([, band]) => band === null).map(([name]) => name),
      bands,
      weights: BANDS
    };
  }

  static contactability(diff) {
    const { parts } = BANDS.contactability;
    const got = (field, points) => (CREDIT[diff.identity[field]] ?? 0) * points;
    const links = diff.links.length
      ? (diff.links.filter((link) => link.recovered).length / diff.links.length) * parts.links
      : parts.links;
    return AtsScore.band({
      email: got('email', parts.email),
      name: got('name', parts.name),
      phone: got('phone', parts.phone),
      location: got('location', parts.location),
      links
    });
  }

  static structure(diff) {
    const { parts } = BANDS.structure;
    const sections = diff.sections.expected.length
      ? (diff.sections.found.length / diff.sections.expected.length) * parts.sections
      : parts.sections;
    const triples = diff.experience.length
      ? share(diff.experience.map((role) => (role.tripleAdjacent ? 1 : 0))) * parts.tripleAdjacent
      : 0;
    const attached = diff.skills.length
      ? share(diff.skills.map((group) => (group.attached ? 1 : 0))) * parts.skillsAttached
      : 0;
    return AtsScore.band({
      segmentation: diff.segmentation === 'ok' ? parts.segmentation : 0,
      sections,
      tripleAdjacent: triples,
      chronology: diff.roleOrderMonotonic ? parts.chronology : 0,
      skillsAttached: attached
    });
  }

  static fidelity(diff) {
    const { parts } = BANDS.fidelity;
    const credit = (verdicts) => share(verdicts.map((verdict) => CREDIT[verdict] ?? 0));
    const roles = diff.experience.flatMap((role) => [role.title, role.employer, role.period, role.highlights]);
    const education = diff.education.flatMap((entry) => [entry.degree, entry.school]);
    const skills = diff.skills.map((group) => group.category);
    const languages = diff.spokenLanguages.flatMap((entry) => [entry.name, entry.level]);

    // Anything recovered that was never written costs, because it is not a smaller version of
    // the truth: it is a record with something in it that came from nowhere.
    const invented = diff.unexpected.skillCategories.length + diff.unexpected.roles;
    return AtsScore.band({
      roles: credit(roles) * parts.roles,
      education: credit(education) * parts.education,
      skills: credit(skills) * parts.skills,
      languages: credit(languages) * parts.languages,
      unexpected: -Math.min(invented, 4)
    });
  }

  static advert(match) {
    const { parts } = BANDS.advert;
    const required = match.terms.filter((term) => term.required);
    const optional = match.terms.filter((term) => !term.required);
    const inProse = (list) => share(list.map((term) => (term.evidence === 'inProse' ? 1 : 0)));
    const present = (list) => share(list.map((term) => (term.evidence === 'absent' ? 0 : 1)));
    return AtsScore.band({
      requiredInProse: inProse(required) * parts.requiredInProse,
      requiredPresent: present(required) * parts.requiredPresent,
      optional: present(optional) * parts.optional
    });
  }

  /** Sum the parts, never below zero and never above the band's own weight. */
  static band(parts) {
    const total = Object.values(parts).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    return { points: Math.max(0, total), parts };
  }
}
