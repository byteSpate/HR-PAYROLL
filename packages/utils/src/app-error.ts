// Carries an HTTP status so the API error filter can map it without string matching. `details` holds
// structured data the client acts on, such as an import's per-row issues.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
