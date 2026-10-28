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
}
