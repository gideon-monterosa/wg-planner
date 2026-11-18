import { it, expect } from "vitest";
import { api } from "./helpers";

it("GET /api/health answers ok and reaches D1", async () => {
  const res = await api("/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, db: 1 });
});

it("unknown API path is a JSON 404", async () => {
  const res = await api("/api/nope");
  expect(res.status).toBe(404);
  expect(await res.json()).toMatchObject({ error: "not_found" });
});
