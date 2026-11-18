import { Hono } from "hono";
import { z } from "zod";
import type { Person } from "../../shared/types";
import type { AppEnv } from "../env";
import { PERSON_COLUMNS, insertPerson } from "../auth";
import { fail } from "../http";
import { parseBody, pathId } from "../route-utils";

const name = z.string().trim().min(1).max(60);
const email = z.email().transform((e) => e.toLowerCase());

const people = new Hono<AppEnv>();

people.get("/me", (c) => c.json(c.var.me));

people.get("/people", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT ${PERSON_COLUMNS} FROM people ORDER BY sort, id`,
  ).all<Person>();
  return c.json(results);
});

const createBody = z.object({ name, email });
const patchBody = z.object({ name: name.optional(), email: email.optional() });

people.post("/people", async (c) => {
  const body = await parseBody(c, createBody);
  if (!(await insertPerson(c.env.DB, body.name, body.email))) {
    fail(409, "email_taken", "That email is already in use");
  }
  const person = await c.env.DB.prepare(`SELECT ${PERSON_COLUMNS} FROM people WHERE email = ?`)
    .bind(body.email)
    .first<Person>();
  return c.json(person, 201);
});

people.patch(
  "/people/:id",
  async (c) => {
    const id = pathId(c, "Person");
    const body = await parseBody(c, patchBody);
    try {
      await c.env.DB.prepare(
        "UPDATE people SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?",
      )
        .bind(body.name ?? null, body.email ?? null, id)
        .run();
    } catch (e) {
      if (String(e).includes("UNIQUE")) fail(409, "email_taken", "That email is already in use");
      throw e;
    }
    const person = await c.env.DB.prepare(`SELECT ${PERSON_COLUMNS} FROM people WHERE id = ?`)
      .bind(id)
      .first<Person>();
    if (!person) fail(404, "not_found", "Person not found");
    return c.json(person);
  },
);

export default people;
