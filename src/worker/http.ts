import { HTTPException } from "hono/http-exception";

export type FailStatus = 400 | 401 | 403 | 404 | 409 | 500;

/**
 * Aborts the request; `app.onError` renders it as `{ error: code, message, ...extra }`.
 */
export function fail(
  status: FailStatus,
  code: string,
  message?: string,
  extra?: Record<string, unknown>,
): never {
  throw new HTTPException(status, { message: message ?? code, cause: { code, extra } });
}

export function errorCode(err: HTTPException): string {
  const cause = err.cause as { code?: unknown } | undefined;
  return typeof cause?.code === "string" ? cause.code : "http_error";
}

export function errorExtra(err: HTTPException): Record<string, unknown> {
  const cause = err.cause as { extra?: Record<string, unknown> } | undefined;
  return cause?.extra ?? {};
}
