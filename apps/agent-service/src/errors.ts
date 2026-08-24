/**
 * Errors this service raises deliberately.
 *
 * The distinction that matters is not the status code but whether the message
 * was written for a person to read. A 503 because a rail is switched off is
 * something the user must be told plainly (principle 4); a 503 because Postgres
 * fell over is not, and its detail stays in the logs.
 */
export class ServiceError extends Error {
  /** Marks the message as safe and intended to be shown to the caller. */
  readonly expose = true;

  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export function isExposable(error: unknown): error is ServiceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'expose' in error &&
    (error as { expose: unknown }).expose === true
  );
}
