import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ApiError, useAddIdea, useDeleteIdea, useDeleteItem, useIdeas, useItem, useMe, usePatchIdea, usePatchItem,
  usePeople, useRooms, useSetFavorite,
} from "../api.ts";
import type { ItemInput } from "../api.ts";
import { formatChf, parseChfInput } from "../format.ts";
import PriceLabel from "../components/PriceLabel.tsx";
import StatusPill from "../components/StatusPill.tsx";
import type { Idea, ItemDetail, Payer, Person, PriceInfo, Room, Status } from "../../shared/types.ts";

const INPUT = "min-h-11 w-full rounded-lg border border-[var(--field-border)] bg-transparent px-2.5 py-2 disabled:opacity-60";
const BTN = "inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--field-border)] px-3 py-2 text-sm hover:bg-[var(--line)]/40 disabled:opacity-60";
/** Small text action (Edit / Delete on an idea): a 40px touch target without looking like a button. */
const LINK_BTN = "inline-flex min-h-10 items-center rounded px-2 py-2 underline hover:bg-[var(--line)]/40 disabled:opacity-60";
const SPAN2 = "md:col-span-2";
const STATUSES: Status[] = ["needed", "decided", "bought", "owned"];

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

const centsToText = (c: number | null) => (c === null ? "" : String(c / 100).replace(".", ","));
const payerValue = (p: Payer) => (p.kind === "person" ? String(p.personId) : p.kind);
const payerFrom = (v: string): Payer =>
  v === "none" || v === "together" ? { kind: v } : { kind: "person", personId: Number(v) };

/** Text input that saves on blur / Enter; resyncs when the server value changes. */
function TextField({
  label, value, onSave, disabled, multiline, grow, className,
}: {
  label: string; value: string; onSave: (v: string) => void; disabled?: boolean; multiline?: boolean;
  /** One line that grows with its content (long item names) instead of scrolling sideways. */
  grow?: boolean; className?: string;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  const commit = () => text !== value && onSave(text);
  return (
    <Field label={label} className={className}>
      {multiline ? (
        <textarea className={INPUT} rows={3} value={text} disabled={disabled}
          onChange={(e) => setText(e.target.value)} onBlur={commit} />
      ) : grow ? (
        <textarea className={`${INPUT} resize-none [field-sizing:content]`} rows={1} value={text} disabled={disabled}
          onChange={(e) => setText(e.target.value.replace(/\n/g, " "))} onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }} />
      ) : (
        <input className={INPUT} value={text} disabled={disabled}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      )}
    </Field>
  );
}

/** Euro input; invalid input is flagged and not saved. */
function EuroField({
  label, cents, onSave, disabled, note, className,
}: { label: string; cents: number | null; onSave: (c: number | null) => void; disabled?: boolean; note?: string; className?: string }) {
  const [text, setText] = useState(centsToText(cents));
  const [prev, setPrev] = useState(cents);
  const [bad, setBad] = useState(false);
  if (cents !== prev) {
    setPrev(cents);
    setText(centsToText(cents));
    setBad(false);
  }
  const commit = () => {
    const parsed = parseChfInput(text);
    if (parsed === "invalid") return setBad(true);
    setBad(false);
    if (parsed !== cents) onSave(parsed);
  };
  return (
    <Field label={label} className={className}>
      <input className={INPUT} inputMode="decimal" value={text} disabled={disabled} placeholder="CHF"
        aria-invalid={bad} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      {bad && <span className="text-sm text-[var(--danger)]">Enter an amount like 19,90</span>}
      {note && <span className="text-sm text-[var(--muted)]">{note}</span>}
    </Field>
  );
}

function IdeaRow({ item, idea, editable }: { item: ItemDetail; idea: Idea; editable: boolean }) {
  const patch = usePatchIdea();
  const del = useDeleteIdea();
  const fav = useSetFavorite();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    title: idea.title, url: idea.url, shop: idea.shop, price: centsToText(idea.priceCents), imageUrl: idea.imageUrl, notes: idea.notes,
  });
  const [bad, setBad] = useState(false);
  const save = () => {
    const price = parseChfInput(f.price);
    if (price === "invalid" || !f.title.trim()) return setBad(true);
    setBad(false);
    patch.mutate(
      { id: idea.id, fromItemId: item.id, title: f.title.trim(), url: f.url.trim(), shop: f.shop.trim(), priceCents: price, imageUrl: f.imageUrl.trim(), notes: f.notes },
      { onSuccess: () => setEditing(false) },
    );
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const perPiece = item.quantity > 1;

  if (editing) {
    return (
      <li className="space-y-2 rounded-lg border border-[var(--line)] p-2">
        <input aria-label="Idea title" className={INPUT} value={f.title} onChange={set("title")} placeholder="Title" />
        <input aria-label="Idea link" className={INPUT} value={f.url} onChange={set("url")} placeholder="Link" />
        <input aria-label="Idea image link" className={INPUT} value={f.imageUrl} onChange={set("imageUrl")} placeholder="Image link (optional)" />
        <div className="flex gap-2">
          <input aria-label="Idea shop" className={INPUT} value={f.shop} onChange={set("shop")} placeholder="Shop" />
          <input aria-label={perPiece ? "Idea price per piece" : "Idea price"} className={INPUT} inputMode="decimal"
            value={f.price} onChange={set("price")} placeholder={perPiece ? "Price per piece" : "CHF"} />
        </div>
        <input aria-label="Idea notes" className={INPUT} value={f.notes} onChange={set("notes")} placeholder="Notes" />
        {bad && <p className="text-sm text-[var(--danger)]">Needs a title and a valid price.</p>}
        <div className="flex gap-2">
          <button type="button" className={BTN} onClick={save} disabled={patch.isPending}>Save</button>
          <button type="button" className={BTN} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 rounded-lg border border-[var(--line)] p-2">
      <button
        type="button"
        aria-pressed={idea.isFavorite}
        aria-label={idea.isFavorite ? `Unstar ${idea.title}` : `Star ${idea.title}`}
        disabled={!editable || fav.isPending}
        className="-m-1.5 inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded text-xl leading-none disabled:opacity-60"
        onClick={() => fav.mutate({ itemId: item.id, ideaId: idea.isFavorite ? null : idea.id })}
      >
        {idea.isFavorite ? "★" : "☆"}
      </button>
      {idea.imageUrl && <img src={idea.imageUrl} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />}
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <span className="line-clamp-2 min-w-0 break-words font-medium">
            {idea.url ? <a href={idea.url} target="_blank" rel="noreferrer noopener" className="underline">{idea.title}</a> : idea.title}
          </span>
          {idea.priceCents !== null && <span className="shrink-0 whitespace-nowrap tabular-nums">{formatChf(idea.priceCents)}</span>}
        </div>
        {idea.shop && <div className="text-sm text-[var(--muted)]">{idea.shop}</div>}
        {idea.notes && <div className="text-sm text-[var(--muted)]">{idea.notes}</div>}
        {editable && (
          <div className="-ml-2 flex gap-1 text-sm">
            <button type="button" className={LINK_BTN} onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className={`${LINK_BTN} text-[var(--danger)]`} disabled={del.isPending}
              onClick={() => window.confirm(`Delete idea "${idea.title}"?`) && del.mutate(idea.id)}>Delete</button>
          </div>
        )}
      </div>
    </li>
  );
}

function AddIdea({ itemId, quantity }: { itemId: number; quantity: number }) {
  const perPiece = quantity > 1;
  const add = useAddIdea();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [err, setErr] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseChfInput(price);
    if (!title.trim()) return setErr("Give the idea a title.");
    if (cents === "invalid") return setErr("Enter a price like 19,90.");
    setErr("");
    add.mutate({ itemId, title: title.trim(), url: url.trim(), priceCents: cents }, {
      onSuccess: () => { setUrl(""); setTitle(""); setPrice(""); },
    });
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border border-dashed border-[var(--field-border)] p-2">
      <input aria-label="New idea link" className={INPUT} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" />
      <div className="flex gap-2">
        <input aria-label="New idea title" className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <input aria-label={perPiece ? "New idea price per piece" : "New idea price"} className={`${INPUT} ${perPiece ? "max-w-36" : "max-w-28"}`}
          inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={perPiece ? "Price per piece" : "CHF"} />
      </div>
      {(err || add.isError) && <p className="text-sm text-[var(--danger)]">{err || "Could not add the idea."}</p>}
      <button type="submit" className={BTN} disabled={add.isPending}>Add idea</button>
    </form>
  );
}

/** Links one of the viewer's unlinked ideas to this item; hidden when there are none. */
function AddSavedIdea({ itemId }: { itemId: number }) {
  const ideas = useIdeas();
  const patch = usePatchIdea();
  const saved = (ideas.data ?? []).filter((i) => i.itemId === null && i.isMine);
  if (saved.length === 0) return null;
  return (
    <div className="mt-3">
      <Field label="Add from your saved ideas">
        <select className={INPUT} value="" disabled={patch.isPending}
          onChange={(e) => e.target.value && patch.mutate({ id: Number(e.target.value), itemId, fromItemId: null })}>
          <option value="">Choose an idea…</option>
          {saved.map((i) => (
            <option key={i.id} value={i.id}>{i.priceCents !== null ? `${i.title} · ${formatChf(i.priceCents)}` : i.title}</option>
          ))}
        </select>
      </Field>
      {patch.isError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {patch.error instanceof ApiError && patch.error.code === "not_creator"
            ? "Only the person who added this idea can move it."
            : "Could not add the idea. Try again."}
        </p>
      )}
    </div>
  );
}

function ItemForm({ item, people, rooms, me, onDeleted }: { item: ItemDetail; people: Person[]; rooms: Room[]; me: number | undefined; onDeleted?: () => void }) {
  const [, navigate] = useLocation();
  const patch = usePatchItem();
  const del = useDeleteItem();
  const save = (p: ItemInput) => patch.mutate({ id: item.id, ...p });
  const ro = !item.canEdit;
  const owned = item.status === "owned";
  const personal = item.forPersonId !== null;
  const hasFavorite = item.ideas.some((i) => i.isFavorite);
  const owner = people.find((p) => p.id === item.forPersonId);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <header className={`flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 ${SPAN2}`}>
        <div className="min-w-0 flex-1">
          <TextField label="Name" grow value={item.name} disabled={ro} onSave={(v) => v.trim() && save({ name: v.trim() })} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg sm:flex-col sm:items-end sm:pt-6 sm:text-right">
          {!owned && <PriceLabel price={item.price} />}
          <StatusPill status={item.status} />
          {!owned && <PerPiece price={item.price} quantity={item.quantity} />}
        </div>
      </header>

      {ro && <p className={`rounded-lg bg-[var(--line)] p-2 text-sm ${SPAN2}`}>This is {owner?.name ?? "someone else"}'s item.</p>}
      {patch.isError && (
        <p role="alert" className={`text-sm text-[var(--danger)] ${SPAN2}`}>
          {patch.error instanceof ApiError && patch.error.code === "read_only" ? "Read-only." : "Could not save. Try again."}
        </p>
      )}

      <Field label="Room">
        <select className={INPUT} disabled={ro} value={item.roomId ?? ""}
          onChange={(e) => save({ roomId: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">No room</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>

      <Field label="For">
        <select className={INPUT} disabled={ro} value={personal ? "me" : "everyone"}
          onChange={(e) => save({ forMe: e.target.value === "me" })}>
          <option value="everyone">Everyone</option>
          <option value="me">{personal && me !== item.forPersonId ? (owner?.name ?? "Someone") : "Just me"}</option>
        </select>
      </Field>

      {personal && (
        <label className={`flex min-h-11 items-center gap-3 ${SPAN2}`}>
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" disabled={ro} checked={item.visibleToAll}
            onChange={(e) => save({ visibleToAll: e.target.checked })} />
          <span>Show to everyone</span>
        </label>
      )}

      <Field label="Quantity">
        <input type="number" min={1} className={INPUT} disabled={ro} key={item.quantity} defaultValue={item.quantity}
          onBlur={(e) => {
            const q = Math.floor(Number(e.target.value));
            if (q >= 1 && q !== item.quantity) save({ quantity: q });
            else e.target.value = String(item.quantity);
          }} />
      </Field>

      <Field label="Status">
        <select className={INPUT} disabled={ro} value={item.status} onChange={(e) => save({ status: e.target.value as Status })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
      </Field>

      {!personal && (
        <Field label={owned ? "Belongs to" : "Paid by"}>
          <select className={INPUT} disabled={ro} value={payerValue(item.payer)}
            onChange={(e) => save({ payer: payerFrom(e.target.value) })}>
            <option value="none">Not set</option>
            <option value="together">Together</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}

      {!owned && (
        <>
          <EuroField label={item.quantity > 1 ? "Own price (per piece)" : "Own price"} cents={item.ownPriceCents} disabled={ro || hasFavorite}
            note={hasFavorite ? "Using the starred idea's price" : undefined}
            onSave={(c) => save({ ownPriceCents: c })} />
          {item.status === "bought" && (
            <EuroField label="Price paid" cents={item.pricePaidCents} disabled={ro} onSave={(c) => save({ pricePaidCents: c })} />
          )}
        </>
      )}

      <TextField label="Notes" multiline className={SPAN2} value={item.notes} disabled={ro} onSave={(v) => save({ notes: v })} />

      {!owned && (
        <section aria-label="Ideas" className={SPAN2}>
          <h2 className="mb-2 font-semibold">Ideas</h2>
          {item.ideas.length === 0 && (
            <p className="mb-2 text-sm text-[var(--muted)]">
              {item.canEdit ? "No ideas yet. Paste a link below." : "No ideas yet."}
            </p>
          )}
          <ul className="space-y-2">
            {item.ideas.map((i) => <IdeaRow key={i.id} item={item} idea={i} editable={item.canEdit} />)}
          </ul>
          {item.canEdit && <AddSavedIdea itemId={item.id} />}
          {item.canEdit && <AddIdea itemId={item.id} quantity={item.quantity} />}
        </section>
      )}

      {item.canEdit && (
        <div className={SPAN2}>
          <button type="button" className={`${BTN} text-[var(--danger)]`} disabled={del.isPending}
            onClick={() => window.confirm(`Delete "${item.name}"?`) && del.mutate(item.id, { onSuccess: () => (onDeleted ? onDeleted() : navigate("/", { replace: true })) })}>
            Delete item
          </button>
        </div>
      )}
    </div>
  );
}

/** "4 × CHF 89.–" under the total when an item has more than one piece. */
function PerPiece({ price, quantity }: { price: PriceInfo; quantity: number }) {
  if (quantity <= 1 || (price.kind !== "own" && price.kind !== "favorite")) return null;
  return (
    <span className="text-sm whitespace-nowrap text-[var(--muted)] tabular-nums">
      {quantity} × {formatChf(Math.round(price.cents / quantity))}
    </span>
  );
}

/** Leaves the item through the modal's close path (history.back or replace), never by pushing "/". */
function BackToList({ onClose }: { onClose?: () => void }) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={onClose ?? (() => navigate("/", { replace: true }))}
      className="inline-flex min-h-11 items-center text-[var(--accent)] underline"
    >
      Back to the list
    </button>
  );
}

/** `onClose` closes the surrounding modal; it is used after a delete and by "Back to the list". */
export default function ItemPage({ onClose }: { onClose?: () => void } = {}) {
  const [, params] = useRoute("/items/:id");
  const id = Number(params?.id);
  const item = useItem(id);
  const people = usePeople();
  const rooms = useRooms();
  const me = useMe();

  // Only errors without data count: a failed background refetch must not wipe an open form.
  const itemFailed = !item.data && item.isError;
  const notFound = !Number.isFinite(id) || (itemFailed && item.error instanceof ApiError && item.error.status === 404);
  if (notFound || itemFailed || (!people.data && people.isError) || (!rooms.data && rooms.isError)) {
    return (
      <div role="alert" className="space-y-1">
        <p>{notFound ? "This item doesn't exist or isn't shared with you." : "Could not load this item."}</p>
        <BackToList onClose={onClose} />
      </div>
    );
  }
  if (!item.data || !people.data || !rooms.data) return <p className="text-[var(--muted)]">Loading…</p>;
  return <ItemForm item={item.data} people={people.data} rooms={rooms.data} me={me.data?.id} onDeleted={onClose} />;
}
