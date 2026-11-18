import { beforeEach, describe, it, expect } from "vitest";
import type { ItemDetail, Overview, OverviewRow, Person } from "../../src/shared/types";
import { api, post, resetDb } from "./helpers";

const GIDEON = "gideon@example.com";
const LENA = "lena@example.com";

let gideon: number;
let lena: number;

beforeEach(async () => {
  await resetDb();
  gideon = ((await (await api("/api/me", { as: GIDEON })).json()) as Person).id;
  lena = (await post<Person>("/api/people", { name: "Lena", email: LENA })).id;
});

async function add(body: Record<string, unknown>, patchBody: Record<string, unknown> = {}, as = GIDEON) {
  const created = (await (await api("/api/items", { method: "POST", body, as })).json()) as ItemDetail;
  const res = await api(`/api/items/${created.id}`, { method: "PATCH", body: patchBody, as });
  expect(res.status).toBe(200);
  return (await res.json()) as ItemDetail;
}

async function overview(as = GIDEON): Promise<Overview> {
  return (await (await api("/api/overview", { as })).json()) as Overview;
}

const row = (o: Overview["planned"], key: string) => o.rows.find((r: OverviewRow) => r.key === key)!;

describe("overview", () => {
  it("splits own and shared per person in planned mode", async () => {
    await add({ name: "Desk" }, { forMe: true, visibleToAll: true, ownPriceCents: 10000 });
    await add({ name: "Sofa" }, { forMe: false, payer: { kind: "person", personId: gideon }, ownPriceCents: 40000 });
    await add({ name: "Rug" }, { forMe: false, payer: { kind: "person", personId: lena }, ownPriceCents: 7000 });
    const o = await overview();
    expect(row(o.planned, `person:${gideon}`)).toMatchObject({ ownCents: 10000, sharedCents: 40000 });
    expect(row(o.planned, `person:${lena}`)).toMatchObject({ label: "Lena", ownCents: 0, sharedCents: 7000 });
    expect(o.planned.me).toEqual({ ownCents: 10000, sharedCents: 40000, totalCents: 50000 });
  });

  it("puts shared items without payer under nobody set yet and joint ones under paid together", async () => {
    await add({ name: "Toaster" }, { forMe: false, payer: { kind: "none" }, ownPriceCents: 2500 });
    await add({ name: "Fridge" }, { forMe: false, payer: { kind: "together" }, ownPriceCents: 30000 });
    const o = await overview();
    expect(row(o.planned, "unassigned")).toMatchObject({ label: "Nobody set yet", sharedCents: 2500 });
    expect(row(o.planned, "together")).toMatchObject({ label: "Paid together", sharedCents: 30000 });
  });

  it("spent mode counts only bought items", async () => {
    await add({ name: "Lamp" }, { forMe: false, payer: { kind: "person", personId: gideon }, ownPriceCents: 5000 });
    await add({ name: "Chair" }, { forMe: false, payer: { kind: "person", personId: gideon }, status: "bought", pricePaidCents: 4200 });
    const o = await overview();
    expect(row(o.planned, `person:${gideon}`).sharedCents).toBe(9200);
    expect(row(o.spent, `person:${gideon}`).sharedCents).toBe(4200);
    expect(o.spent.me.totalCents).toBe(4200);
  });

  it("never counts another person's hidden items", async () => {
    await add({ name: "Wardrobe" }, { forMe: true, visibleToAll: false, ownPriceCents: 32000 }, LENA);
    await add({ name: "Chair" }, { forMe: true, visibleToAll: true, ownPriceCents: 15000 }, LENA);
    const o = await overview(GIDEON);
    expect(row(o.planned, `person:${lena}`).ownCents).toBe(15000);
  });

  it("the viewer sees their own hidden items in their own numbers", async () => {
    await add({ name: "Wardrobe" }, { forMe: true, visibleToAll: false, ownPriceCents: 32000 }, LENA);
    const o = await overview(LENA);
    expect(row(o.planned, `person:${lena}`).ownCents).toBe(32000);
    expect(o.planned.me.ownCents).toBe(32000);
  });
});
