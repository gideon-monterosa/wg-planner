import { Hono } from "hono";
import type { Person } from "../../shared/types";
import type { AppEnv } from "../env";
import { PERSON_COLUMNS } from "../auth";
import { listVisibleItems } from "../items-query";
import { computeOverview } from "../overview";

const overview = new Hono<AppEnv>();

overview.get("/overview", async (c) => {
  const me = c.var.me;
  const [items, { results: people }] = await Promise.all([
    listVisibleItems(c.env.DB, me.id),
    c.env.DB.prepare(`SELECT ${PERSON_COLUMNS} FROM people ORDER BY sort, id`).all<Person>(),
  ]);
  return c.json(computeOverview(me.id, people, items));
});

export default overview;
