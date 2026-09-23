/** Screen-share proctoring: the terms and the promise they make. */

/**
 * The proctoring terms a member agrees to before sharing. Bump it whenever the
 * wording changes, so each session records which version it was started under.
 */
export const PROCTOR_TERMS_VERSION = 1;

/**
 * Recordings are deleted this long after they were made. The terms promise at
 * most four weeks after the competition, and a recording always predates the
 * end of the competition it was made in, so counting from the recording keeps
 * that promise.
 */
export const PROCTOR_RETENTION_DAYS = 28;
