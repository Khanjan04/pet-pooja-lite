// User-safe errors. No framework imports, so scripts and tests can use the server logic too.

/** An error whose message is safe to show the user. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const bad = (m: string, code?: string) => new HttpError(400, m, code);
export const forbidden = (m = "You don’t have permission to do that. Ask a manager.") => new HttpError(403, m, "forbidden");
export const unauthorized = (m: string, code: string) => new HttpError(401, m, code);
export const notFound = (m = "Not found.") => new HttpError(404, m, "not_found");
export const conflict = (m: string) => new HttpError(409, m, "conflict");
