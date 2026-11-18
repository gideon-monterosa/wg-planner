import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./env";
import { identity } from "./auth";
import { errorCode, errorExtra } from "./http";
import people from "./routes/people";
import rooms from "./routes/rooms";
import items from "./routes/items";
import ideas from "./routes/ideas";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", identity);

app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS db").first<{ db: number }>();
  return c.json({ ok: true, db: row?.db });
});

app.route("/", people);
app.route("/", rooms);
app.route("/", items);
app.route("/", ideas);

app.notFound((c) => c.json({ error: "not_found", message: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ ...errorExtra(err), error: errorCode(err), message: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal", message: "Something went wrong" }, 500);
});

export default app;
