import type { Idea, ItemDetail, ItemSummary, Payer, Status } from "../shared/types";
import { itemPrice, plannedCents, spentCents, type PricingInput } from "../shared/pricing";
import { fail } from "./http";

/** SQL condition (alias `i`) selecting only items the viewer may see. Binds one parameter: the viewer's id. */
export const VISIBLE = "(i.for_person_id IS NULL OR i.for_person_id = ? OR i.visible_to_all = 1)";

export interface ItemRow {
  id: number;
  name: string;
  room_id: number | null;
  for_person_id: number | null;
  visible_to_all: number;
  status: Status;
  payer_person_id: number | null;
  paid_together: number;
  quantity: number;
  own_price_cents: number | null;
  price_paid_cents: number | null;
  notes: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface IdeaRow {
  id: number;
  item_id: number;
  title: string;
  url: string;
  shop: string;
  price_cents: number | null;
  image_url: string;
  notes: string;
  is_favorite: number;
}

const IDEA_COLUMNS = "id, item_id, title, url, shop, price_cents, image_url, notes, is_favorite";

export function toPayer(row: Pick<ItemRow, "payer_person_id" | "paid_together">): Payer {
  if (row.payer_person_id !== null) return { kind: "person", personId: row.payer_person_id };
  return row.paid_together ? { kind: "together" } : { kind: "none" };
}

export function toIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    url: row.url,
    shop: row.shop,
    priceCents: row.price_cents,
    imageUrl: row.image_url,
    notes: row.notes,
    isFavorite: row.is_favorite === 1,
  };
}

export function pricingInput(row: ItemRow, ideas: IdeaRow[]): PricingInput {
  return {
    status: row.status,
    quantity: row.quantity,
    ownPriceCents: row.own_price_cents,
    pricePaidCents: row.price_paid_cents,
    ideas: ideas.map((i) => ({ priceCents: i.price_cents, isFavorite: i.is_favorite === 1 })),
  };
}

function toSummary(row: ItemRow, ideas: IdeaRow[], meId: number): ItemSummary {
  const input = pricingInput(row, ideas);
  return {
    id: row.id,
    name: row.name,
    roomId: row.room_id,
    forPersonId: row.for_person_id,
    visibleToAll: row.visible_to_all === 1,
    status: row.status,
    payer: toPayer(row),
    quantity: row.quantity,
    ideaCount: ideas.length,
    price: itemPrice(input),
    plannedCents: plannedCents(input),
    spentCents: spentCents(input),
    canEdit: row.for_person_id === null || row.for_person_id === meId,
  };
}

/** Every item the viewer may see, in two queries (items + their ideas). */
export async function listVisibleItems(db: D1Database, meId: number): Promise<ItemSummary[]> {
  const [items, ideas] = await db.batch<ItemRow | IdeaRow>([
    db.prepare(`SELECT i.* FROM items i WHERE ${VISIBLE} ORDER BY i.id`).bind(meId),
    db
      .prepare(
        `SELECT ${IDEA_COLUMNS} FROM ideas WHERE item_id IN (SELECT i.id FROM items i WHERE ${VISIBLE}) ORDER BY id`,
      )
      .bind(meId),
  ]);
  const byItem = new Map<number, IdeaRow[]>();
  for (const idea of ideas!.results as IdeaRow[]) {
    const list = byItem.get(idea.item_id);
    if (list) list.push(idea);
    else byItem.set(idea.item_id, [idea]);
  }
  return (items!.results as ItemRow[]).map((row) => toSummary(row, byItem.get(row.id) ?? [], meId));
}

/** The raw item row if the viewer may see it; otherwise a 404 (never a 403, so hidden items don't leak). */
export async function getVisibleItemRow(db: D1Database, id: number, meId: number): Promise<ItemRow> {
  const row = Number.isSafeInteger(id)
    ? await db.prepare(`SELECT i.* FROM items i WHERE i.id = ? AND ${VISIBLE}`).bind(id, meId).first<ItemRow>()
    : null;
  if (!row) fail(404, "not_found", "Item not found");
  return row;
}

/** Shared items are editable by everyone; personal items only by their owner. */
export function assertCanEdit(row: Pick<ItemRow, "for_person_id">, meId: number): void {
  if (row.for_person_id !== null && row.for_person_id !== meId) {
    fail(403, "read_only", "Only its owner can change this item");
  }
}

export async function getIdeaRows(db: D1Database, itemId: number): Promise<IdeaRow[]> {
  const { results } = await db
    .prepare(`SELECT ${IDEA_COLUMNS} FROM ideas WHERE item_id = ? ORDER BY id`)
    .bind(itemId)
    .all<IdeaRow>();
  return results;
}

export async function getItemDetail(db: D1Database, id: number, meId: number): Promise<ItemDetail> {
  const row = await getVisibleItemRow(db, id, meId);
  const ideas = await getIdeaRows(db, row.id);
  return {
    ...toSummary(row, ideas, meId),
    ownPriceCents: row.own_price_cents,
    pricePaidCents: row.price_paid_cents,
    notes: row.notes,
    ideas: ideas.map(toIdea),
  };
}
