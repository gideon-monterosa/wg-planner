import { env } from "cloudflare:test";
import app from "../../src/worker/app";

export function api(
  path: string,
  opts: { as?: string; method?: string; body?: unknown } = {},
): Promise<Response> {
  const init: RequestInit = { method: opts.method ?? "GET" };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { "content-type": "application/json" };
  }
  return Promise.resolve(
    app.request(path, init, {
      ...env,
      DEV_USER_EMAIL: opts.as ?? "gideon@example.com",
    }),
  );
}

export async function post<T = any>(path: string, body: unknown, as?: string): Promise<T> {
  const res = await api(path, { method: "POST", body, as });
  return (await res.json()) as T;
}

/** Deletes every row from every app table (migration bookkeeping is kept). */
export async function resetDb(): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
  ).all<{ name: string }>();
  if (results.length === 0) return;
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = ON"),
    ...results.map(({ name }) => env.DB.prepare(`DELETE FROM "${name}"`)),
  ]);
}
