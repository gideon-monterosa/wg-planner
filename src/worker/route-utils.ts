import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "./env";
import { fail } from "./http";

/** Path ids must be positive integers; anything else is a 404, never a 500. */
export function pathId(c: Context<AppEnv>, what = "Item"): number {
  const raw = c.req.param("id") ?? "";
  if (!/^[1-9]\d{0,15}$/.test(raw)) fail(404, "not_found", `${what} not found`);
  return Number(raw);
}

/** Parses the JSON body. Done inside handlers (not as middleware) so visibility checks run first. */
export async function parseBody<T extends z.ZodType>(c: Context<AppEnv>, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    fail(400, "invalid_body", "Request body must be JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) fail(400, "invalid_body", z.prettifyError(result.error));
  return result.data;
}
