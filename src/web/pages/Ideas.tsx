import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import type { IdeaWithItem, ItemSummary, Room } from "../../shared/types.ts";
import {
  useCreateIdea, useDeleteIdea, useIdeaToItem, useIdeas, useItems, useMe, usePatchIdea, useRooms, useSetFavorite,
} from "../api.ts";
import { formatChf, parseChfInput } from "../format.ts";
import { ideaErrorMessage } from "../ideaErrors.ts";
import { editableItemsByRoom, groupIdeas, isSharedItem, type IdeaFilter, type ItemOptionGroup } from "../ideaGrouping.ts";

const FILTERS: { value: IdeaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unlinked", label: "Not linked" },
  { value: "mine", label: "Mine" },
];

// text-base on phones: iOS zooms into inputs with smaller text on focus.
const FIELD = "min-h-11 min-w-0 rounded-lg border border-[var(--field-border)] bg-transparent px-2.5 py-2 text-base md:text-sm";
const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--field-border)] px-3 py-2 text-sm hover:bg-[var(--line)]/40 disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent-fill)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const SHARED_HINT = "Everyone who can see this item will see the idea.";

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="basis-full text-sm text-[var(--danger)]">{ideaErrorMessage(error)}</p>;
}

/** A select of items the viewer may edit, grouped by room. */
function ItemSelect({
  label, groups, value, onChange, placeholder, excludeId, className = "",
}: {
  label: string; groups: ItemOptionGroup[]; value: string; onChange: (v: string) => void; placeholder: string;
  excludeId?: number; className?: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${FIELD} ${className}`}>
      <option value="">{placeholder}</option>
      {groups.map((g) => {
        const items = g.items.filter((i) => i.id !== excludeId);
        if (items.length === 0) return null;
        return (
          <optgroup key={g.label} label={g.label}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

function IdeaCapture({ groups }: { groups: ItemOptionGroup[] }) {
  const create = useCreateIdea();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [itemId, setItemId] = useState("");
  const [error, setError] = useState<"" | "missing" | "price">("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const link = url.trim();
    const name = title.trim();
    if (!link && !name) return setError("missing");
    const cents = parseChfInput(price);
    if (cents === "invalid") return setError("price");
    setError("");
    create.mutate(
      {
        ...(link ? { url: link } : {}),
        ...(name ? { title: name } : {}),
        ...(cents !== null ? { priceCents: cents } : {}),
        ...(itemId ? { itemId: Number(itemId) } : {}),
      },
      {
        onSuccess: () => {
          setUrl("");
          setTitle("");
          setPrice("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} aria-label="Save an idea" className="mb-4 flex flex-wrap gap-2 lg:flex-nowrap">
      <input
        aria-label="Link"
        inputMode="url"
        autoComplete="off"
        placeholder="Paste a link"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError("");
        }}
        className={`${FIELD} flex-1 basis-full sm:basis-0 lg:flex-[3]`}
      />
      <input
        aria-label="Title"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setError("");
        }}
        className={`${FIELD} flex-1 basis-full sm:basis-0 lg:flex-[2]`}
      />
      <input
        aria-label="Price"
        aria-invalid={error === "price"}
        inputMode="decimal"
        placeholder="Price (CHF)"
        value={price}
        onChange={(e) => {
          setPrice(e.target.value);
          setError("");
        }}
        className={`${FIELD} w-28 lg:w-32`}
      />
      <ItemSelect label="For item" groups={groups} value={itemId} onChange={setItemId} placeholder="No item yet"
        className="flex-1 lg:w-48 lg:flex-none" />
      <button type="submit" disabled={create.isPending} className={PRIMARY}>Add</button>
      {error === "missing" && <p role="alert" className="basis-full text-sm text-[var(--danger)]">Paste a link or type a title.</p>}
      {error === "price" && <p role="alert" className="basis-full text-sm text-[var(--danger)]">Enter a price like 19,90</p>}
      {create.isError && <ErrorText error={create.error} />}
    </form>
  );
}

/** Title (two lines at most), shop, price and an external link. */
function IdeaBody({ idea }: { idea: IdeaWithItem }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 min-w-0 break-words font-medium">{idea.title}</span>
        {idea.priceCents !== null && (
          <span className="shrink-0 whitespace-nowrap tabular-nums">{formatChf(idea.priceCents)}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 text-sm text-[var(--muted)]">
        {idea.shop && <span className="min-w-0 truncate">{idea.shop}</span>}
        {idea.url && (
          <a
            href={idea.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open link for ${idea.title} (new tab)`}
            className="-my-2 inline-flex min-h-11 items-center text-[var(--accent)] underline"
          >
            Open link ↗
          </a>
        )}
      </div>
    </div>
  );
}

function UnlinkedIdeaCard({ idea, groups, rooms, items }: {
  idea: IdeaWithItem; groups: ItemOptionGroup[]; rooms: Room[]; items: ItemSummary[];
}) {
  const patch = usePatchIdea();
  const toItem = useIdeaToItem();
  const del = useDeleteIdea();
  const [panel, setPanel] = useState<"link" | "make" | null>(null);
  const [target, setTarget] = useState("");
  const [roomId, setRoomId] = useState("");
  const targetItem = items.find((i) => i.id === Number(target));
  const busy = patch.isPending || toItem.isPending || del.isPending;
  const error = patch.error ?? toItem.error ?? del.error;
  const hasTargets = groups.length > 0;

  return (
    <li className="min-w-0 rounded-lg border border-[var(--line)] p-3">
      <IdeaBody idea={idea} />
      {idea.isMine && (
        <div className="-ml-1 mt-1 flex flex-wrap gap-2">
          <button type="button" className={BTN} aria-expanded={panel === "link"} disabled={busy}
            onClick={() => setPanel(panel === "link" ? null : "link")}>
            Link to item…
          </button>
          <button type="button" className={BTN} aria-expanded={panel === "make"} disabled={busy}
            onClick={() => setPanel(panel === "make" ? null : "make")}>
            Make item
          </button>
          <button type="button" className={`${BTN} text-[var(--danger)]`} disabled={busy}
            onClick={() => window.confirm(`Delete idea "${idea.title}"?`) && del.mutate(idea.id)}>
            Delete
          </button>
        </div>
      )}
      {panel === "link" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {hasTargets ? (
            <>
              <ItemSelect label={`Item for ${idea.title}`} groups={groups} value={target} onChange={setTarget}
                placeholder="Choose an item…" className="w-full sm:w-auto sm:flex-1" />
              <button type="button" className={PRIMARY} disabled={!target || busy}
                onClick={() => patch.mutate({ id: idea.id, itemId: Number(target), fromItemId: null })}>
                Link
              </button>
              {targetItem && isSharedItem(targetItem) && (
                <p className="basis-full text-sm text-[var(--muted)]">{SHARED_HINT}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No items you can edit yet. Use "Make item" instead.</p>
          )}
        </div>
      )}
      {panel === "make" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label={`Room for ${idea.title}`} value={roomId} onChange={(e) => setRoomId(e.target.value)}
            className={`${FIELD} w-full sm:w-auto sm:flex-1`}>
            <option value="">No room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="button" className={PRIMARY} disabled={busy}
            onClick={() => toItem.mutate({ id: idea.id, roomId: roomId === "" ? null : Number(roomId) })}>
            Create item
          </button>
        </div>
      )}
      <ErrorText error={error} />
    </li>
  );
}

function LinkedIdeaRow({ idea, groups, items }: { idea: IdeaWithItem; groups: ItemOptionGroup[]; items: ItemSummary[] }) {
  const fav = useSetFavorite();
  const patch = usePatchIdea();
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState("");
  const itemId = idea.itemId!;
  const targetItem = items.find((i) => i.id === Number(target));
  const busy = fav.isPending || patch.isPending;
  const hasTargets = groups.some((g) => g.items.some((i) => i.id !== itemId));

  return (
    <li className="min-w-0 py-1">
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-pressed={idea.isFavorite}
          aria-label={idea.isFavorite ? `Unstar ${idea.title}` : `Star ${idea.title}`}
          disabled={!idea.canEditItem || busy}
          onClick={() => fav.mutate({ itemId, ideaId: idea.isFavorite ? null : idea.id })}
          className="-ml-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-xl leading-none hover:bg-[var(--line)]/40 disabled:opacity-60 disabled:hover:bg-transparent"
        >
          <span aria-hidden="true" className={idea.isFavorite ? "text-[var(--accent)]" : ""}>{idea.isFavorite ? "★" : "☆"}</span>
        </button>
        <div className="min-w-0 flex-1 pt-2.5">
          <IdeaBody idea={idea} />
        </div>
      </div>
      {idea.isMine && (
        <div className="ml-9 flex flex-wrap gap-2">
          {hasTargets && (
            <button type="button" className={BTN} aria-expanded={moving} disabled={busy} onClick={() => setMoving(!moving)}>
              Move…
            </button>
          )}
          <button type="button" className={BTN} disabled={busy}
            onClick={() => patch.mutate({ id: idea.id, itemId: null, fromItemId: itemId })}>
            Unlink
          </button>
        </div>
      )}
      {moving && (
        <div className="ml-9 mt-2 flex flex-wrap gap-2">
          <ItemSelect label={`Move ${idea.title} to`} groups={groups} value={target} onChange={setTarget}
            placeholder="Choose an item…" excludeId={itemId} className="w-full sm:w-auto sm:flex-1" />
          <button type="button" className={PRIMARY} disabled={!target || busy}
            onClick={() => patch.mutate({ id: idea.id, itemId: Number(target), fromItemId: itemId }, { onSuccess: () => setMoving(false) })}>
            Move
          </button>
          {targetItem && isSharedItem(targetItem) && <p className="basis-full text-sm text-[var(--muted)]">{SHARED_HINT}</p>}
        </div>
      )}
      <div className="ml-9"><ErrorText error={fav.error ?? patch.error} /></div>
    </li>
  );
}

const CARD = "min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 pt-2 pb-2";

export default function Ideas() {
  const me = useMe();
  const rooms = useRooms();
  const items = useItems();
  const ideas = useIdeas();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<IdeaFilter>("all");

  const heading = <h1 className="mb-3 text-xl font-semibold">Ideas</h1>;
  if (!me.data || rooms.isPending || items.isPending || ideas.isPending) {
    return <div>{heading}<p className="text-[var(--muted)]">Loading…</p></div>;
  }
  if (rooms.isError || items.isError || ideas.isError) {
    return (
      <div>
        {heading}
        <div role="alert" className="space-y-3 py-6 text-center">
          <p>Couldn't load the ideas.</p>
          <button
            type="button"
            onClick={() => {
              void rooms.refetch();
              void items.refetch();
              void ideas.refetch();
            }}
            className={PRIMARY}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const groups = editableItemsByRoom(rooms.data, items.data);
  const grouped = groupIdeas(rooms.data, ideas.data, filter, me.data.id);
  const nothing = grouped.unlinked.length === 0 && grouped.rooms.length === 0;

  return (
    <div>
      {heading}
      <IdeaCapture groups={groups} />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter ideas">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`min-h-11 rounded-full border px-3.5 py-2 text-sm ${
              filter === f.value
                ? "border-[var(--accent-fill)] bg-[var(--accent-fill)] text-white"
                : "border-[var(--field-border)] hover:bg-[var(--line)]/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {ideas.data.length === 0 ? (
        <div className="space-y-1 text-[var(--muted)]">
          <p>No ideas yet. Paste a link above to save something you might buy.</p>
          <p>
            You don't need an item for it: an idea that isn't linked stays private to you until you link it to an item or
            make an item from it.
          </p>
        </div>
      ) : nothing ? (
        <p className="text-[var(--muted)]">Nothing matches this filter.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {grouped.unlinked.length > 0 && (
            <section aria-labelledby="ideas-unlinked" className={`${CARD} lg:col-span-2`}>
              <h2 id="ideas-unlinked" className="border-b border-[var(--line)] pb-1 text-sm font-semibold">
                Not linked yet
                <span className="ml-2 font-normal text-[var(--muted)]">only you can see these</span>
              </h2>
              <ul className="grid grid-cols-1 gap-2 py-2 lg:grid-cols-2">
                {grouped.unlinked.map((idea) => (
                  <UnlinkedIdeaCard key={idea.id} idea={idea} groups={groups} rooms={rooms.data} items={items.data} />
                ))}
              </ul>
            </section>
          )}
          {grouped.rooms.map((g) => (
            <section key={g.room?.id ?? "none"} aria-label={g.room?.name ?? "No room"} className={CARD}>
              <h2 className="border-b border-[var(--line)] pb-1 text-sm font-semibold break-words">{g.room?.name ?? "No room"}</h2>
              {g.items.map((item) => (
                <div key={item.itemId} className="border-b border-[var(--line)] py-1 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/items/${item.itemId}`)}
                    className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2 rounded px-1 text-left font-medium hover:bg-[var(--line)]/40"
                  >
                    <span className="min-w-0 break-words">{item.itemName}</span>
                    {item.hidden && (
                      <span className="shrink-0 rounded border border-[var(--field-border)] px-1 text-xs font-normal text-[var(--muted)]">
                        <span className="sr-only">, </span>only you
                      </span>
                    )}
                    <span aria-hidden="true" className="ml-auto text-[var(--muted)]">›</span>
                  </button>
                  <ul>
                    {item.ideas.map((idea) => (
                      <LinkedIdeaRow key={idea.id} idea={idea} groups={groups} items={items.data} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
