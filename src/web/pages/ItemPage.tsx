import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ApiError, useAddIdea, useDeleteIdea, useDeleteItem, useItem, useMe, usePatchIdea, usePatchItem,
  usePeople, useRooms, useSetFavorite,
} from "../api.ts";
import type { ItemInput } from "../api.ts";
import { formatChf, parseChfInput } from "../format.ts";
import PriceLabel from "../components/PriceLabel.tsx";
import StatusPill from "../components/StatusPill.tsx";
import type { Idea, ItemDetail, Payer, Person, Room, Status } from "../../shared/types.ts";

const INPUT = "w-full rounded border border-[var(--line)] bg-transparent px-2 py-1.5 disabled:opacity-60";
const BTN = "rounded border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60";
const STATUSES: Status[] = ["needed", "decided", "bought", "owned"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
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
  label, value, onSave, disabled, multiline,
}: { label: string; value: string; onSave: (v: string) => void; disabled?: boolean; multiline?: boolean }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value);
  }
  const commit = () => text !== value && onSave(text);
  return (
    <Field label={label}>
      {multiline ? (
        <textarea className={INPUT} rows={3} value={text} disabled={disabled}
          onChange={(e) => setText(e.target.value)} onBlur={commit} />
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
  label, cents, onSave, disabled, note,
}: { label: string; cents: number | null; onSave: (c: number | null) => void; disabled?: boolean; note?: string }) {
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
    <Field label={label}>
      <input className={INPUT} inputMode="decimal" value={text} disabled={disabled} placeholder="CHF"
        aria-invalid={bad} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      {bad && <span className="text-sm text-red-600">Enter an amount like 19,90</span>}
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
      { id: idea.id, title: f.title.trim(), url: f.url.trim(), shop: f.shop.trim(), priceCents: price, imageUrl: f.imageUrl.trim(), notes: f.notes },
      { onSuccess: () => setEditing(false) },
    );
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const perPiece = item.quantity > 1;

  if (editing) {
    return (
      <li className="space-y-2 rounded border border-[var(--line)] p-2">
        <input aria-label="Idea title" className={INPUT} value={f.title} onChange={set("title")} placeholder="Title" />
        <input aria-label="Idea link" className={INPUT} value={f.url} onChange={set("url")} placeholder="Link" />
        <input aria-label="Idea image link" className={INPUT} value={f.imageUrl} onChange={set("imageUrl")} placeholder="Image link (optional)" />
        <div className="flex gap-2">
          <input aria-label="Idea shop" className={INPUT} value={f.shop} onChange={set("shop")} placeholder="Shop" />
          <input aria-label={perPiece ? "Idea price per piece" : "Idea price"} className={INPUT} inputMode="decimal"
            value={f.price} onChange={set("price")} placeholder={perPiece ? "Price per piece" : "CHF"} />
        </div>
        <input aria-label="Idea notes" className={INPUT} value={f.notes} onChange={set("notes")} placeholder="Notes" />
        {bad && <p className="text-sm text-red-600">Needs a title and a valid price.</p>}
        <div className="flex gap-2">
          <button type="button" className={BTN} onClick={save} disabled={patch.isPending}>Save</button>
          <button type="button" className={BTN} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 rounded border border-[var(--line)] p-2">
      <button
        type="button"
        aria-pressed={idea.isFavorite}
        aria-label={idea.isFavorite ? `Unstar ${idea.title}` : `Star ${idea.title}`}
        disabled={!editable || fav.isPending}
        className="text-xl leading-none disabled:opacity-60"
        onClick={() => fav.mutate({ itemId: item.id, ideaId: idea.isFavorite ? null : idea.id })}
      >
        {idea.isFavorite ? "★" : "☆"}
      </button>
      {idea.imageUrl && <img src={idea.imageUrl} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />}
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <span className="truncate font-medium">
            {idea.url ? <a href={idea.url} target="_blank" rel="noreferrer noopener" className="underline">{idea.title}</a> : idea.title}
          </span>
          {idea.priceCents !== null && <span className="tabular-nums">{formatChf(idea.priceCents)}</span>}
        </div>
        {idea.shop && <div className="text-sm text-[var(--muted)]">{idea.shop}</div>}
        {idea.notes && <div className="text-sm text-[var(--muted)]">{idea.notes}</div>}
        {editable && (
          <div className="mt-1 flex gap-3 text-sm">
            <button type="button" className="underline" onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className="underline" disabled={del.isPending}
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
    <form onSubmit={submit} className="mt-3 space-y-2 rounded border border-dashed border-[var(--line)] p-2">
      <input aria-label="New idea link" className={INPUT} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" />
      <div className="flex gap-2">
        <input aria-label="New idea title" className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <input aria-label={perPiece ? "New idea price per piece" : "New idea price"} className={`${INPUT} ${perPiece ? "max-w-36" : "max-w-28"}`}
          inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={perPiece ? "Price per piece" : "CHF"} />
      </div>
      {(err || add.isError) && <p className="text-sm text-red-600">{err || "Could not add the idea."}</p>}
      <button type="submit" className={BTN} disabled={add.isPending}>Add idea</button>
    </form>
  );
}

function ItemForm({ item, people, rooms, me }: { item: ItemDetail; people: Person[]; rooms: Room[]; me: number | undefined }) {
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
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <TextField label="Name" value={item.name} disabled={ro} onSave={(v) => v.trim() && save({ name: v.trim() })} />
        </div>
        <div className="pt-6 text-right text-lg">
          {!owned && <PriceLabel price={item.price} />}
          <div className="mt-1"><StatusPill status={item.status} /></div>
        </div>
      </header>

      {ro && <p className="rounded bg-[var(--line)] p-2 text-sm">This is {owner?.name ?? "someone else"}'s item.</p>}
      {patch.isError && (
        <p role="alert" className="text-sm text-red-600">
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
        <label className="flex items-center gap-2">
          <input type="checkbox" disabled={ro} checked={item.visibleToAll} onChange={(e) => save({ visibleToAll: e.target.checked })} />
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

      <TextField label="Notes" multiline value={item.notes} disabled={ro} onSave={(v) => save({ notes: v })} />

      {!owned && (
        <section aria-label="Ideas">
          <h2 className="mb-2 font-semibold">Ideas</h2>
          <ul className="space-y-2">
            {item.ideas.map((i) => <IdeaRow key={i.id} item={item} idea={i} editable={item.canEdit} />)}
          </ul>
          {item.canEdit && <AddIdea itemId={item.id} quantity={item.quantity} />}
        </section>
      )}

      {item.canEdit && (
        <button type="button" className={`${BTN} text-red-600`} disabled={del.isPending}
          onClick={() => window.confirm(`Delete "${item.name}"?`) && del.mutate(item.id, { onSuccess: () => navigate("/", { replace: true }) })}>
          Delete item
        </button>
      )}
    </div>
  );
}

export default function ItemPage() {
  const [, params] = useRoute("/items/:id");
  const id = Number(params?.id);
  const item = useItem(id);
  const people = usePeople();
  const rooms = useRooms();
  const me = useMe();

  if (item.isError) {
    const notFound = item.error instanceof ApiError && item.error.status === 404;
    return <p>{notFound ? "This item doesn't exist or isn't shared with you." : "Could not load this item."}</p>;
  }
  if (!item.data || !people.data || !rooms.data) return <p className="text-[var(--muted)]">Loading…</p>;
  return <ItemForm item={item.data} people={people.data} rooms={rooms.data} me={me.data?.id} />;
}
