/**
 * A request the local app refuses, and why, in words a person can act on (#21).
 *
 * `status` says what kind of refusal it is, in the numbers HTTP already gives those kinds, because the local
 * API is where a refusal surfaces: 404 nothing by that name, 409 already there, 422 not a valid input, 501
 * not built yet, 503 a valid request this machine cannot serve as it is set up — no backend, or a file of the
 * owner's that cannot be used. The core never sees a request; the adapter in front of it maps the status to its transport.
 */
export class Refusal extends Error {
  /**
   * @param {number} status - The kind of refusal, as an HTTP status
   * @param {string} message - Why, for the person who asked
   * @param {object[]} [details] - Each thing refused, when there is more than one to point at
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'Refusal';
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}
