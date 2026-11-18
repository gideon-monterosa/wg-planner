import { HTTPException } from "hono/http-exception";

export type FailStatus = 400 | 403 | 404 | 409 | 500;

/** Aborts the request; `app.onError` renders it as `{ error: code, message }`. */
export function fail(status: FailStatus, code: string, message?: string): never {
  throw new HTTPException(status, { message: message ?? code, cause: { code } });
}

export function errorCode(err: HTTPException): string {
  const cause = err.cause as { code?: unknown } | undefined;
  return typeof cause?.code === "string" ? cause.code : "http_error";
}
