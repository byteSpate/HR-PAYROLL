/**
 * What a failed API call throws on the client. It lives here, not in the web app, so shared UI
 * (the record kit's error messages) can tell an API refusal from a network failure.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The parsed JSON error body, for structured details such as an import's per-row issues. */
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }

  /** What the server attached to the error, such as an import's per-row `issues`. */
  get details(): Record<string, unknown> | undefined {
    const details = this.body['details'];
    return typeof details === 'object' && details !== null
      ? (details as Record<string, unknown>)
      : undefined;
  }
}
