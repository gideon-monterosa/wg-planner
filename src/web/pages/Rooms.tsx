import { useState } from "react";
import { useRoomMutations, usePeople, useRooms } from "../api.ts";
import type { Person, Room } from "../../shared/types.ts";

const FIELD = "min-h-10 rounded-lg border border-[var(--field-border)] bg-transparent px-2.5 py-1.5";
const SMALL_BTN = "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[var(--field-border)] px-2 hover:bg-[var(--line)]/40 disabled:opacity-40";

function RoomRow({
  room, people, index, count, onMove, onDragStart, onDrop, dropTarget, onDragOver, onDragEnd,
}: {
  room: Room;
  people: Person[];
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
  dropTarget: boolean;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
}) {
  const { patch, remove } = useRoomMutations();
  const [name, setName] = useState(room.name);
  const [prev, setPrev] = useState(room.name);
  if (room.name !== prev) {
    setPrev(room.name);
    setName(room.name);
  }
  const commit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setName(room.name);
    if (trimmed !== room.name) patch.mutate({ id: room.id, name: trimmed }, { onError: () => setName(room.name) });
  };
  const onDelete = () => {
    if (window.confirm(`Delete ${room.name}? Its items move to No room.`)) remove.mutate(room.id);
  };
  return (
    // Phones (and the narrow 2-column settings from 1024px): name on its own row, controls below.
    // 768-1023px: everything on one line.
    <li
      className={`flex flex-wrap items-center gap-2 rounded-lg border bg-[var(--surface)] p-2 ${
        dropTarget ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--line)]"
      }`}
      draggable={typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
    >
      <span aria-hidden="true" title="Drag to reorder" className="hidden cursor-grab px-0.5 text-[var(--muted)] select-none md:inline">
        ⋮⋮
      </span>
      <input
        aria-label={`Name of ${room.name}`}
        className={`${FIELD} min-w-0 basis-full md:flex-[2] md:basis-auto lg:flex-[1_0_80%]`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <select
        aria-label={`Owner of ${room.name}`}
        className={`${FIELD} min-w-32 flex-1 md:w-40 md:flex-none md:shrink-0 lg:flex-1`}
        value={room.personId ?? ""}
        onChange={(e) => patch.mutate({ id: room.id, personId: e.target.value === "" ? null : Number(e.target.value) })}
      >
        <option value="">Shared</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`Move ${room.name} up`}
        className={SMALL_BTN}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${room.name} down`}
        className={SMALL_BTN}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label={`Delete ${room.name}`}
        className="ml-auto inline-flex min-h-10 items-center rounded-lg px-2 text-[var(--danger)] hover:bg-[var(--line)]/40"
        onClick={onDelete}
      >
        Delete
      </button>
      {patch.isError && <p role="alert" className="basis-full text-sm text-[var(--danger)]">Could not save the room. Please try again.</p>}
      {remove.isError && <p role="alert" className="basis-full text-sm text-[var(--danger)]">Could not delete the room. Please try again.</p>}
    </li>
  );
}

export default function Rooms() {
  const rooms = useRooms();
  const people = usePeople();
  const { create, reorder } = useRoomMutations();
  const [newName, setNewName] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const list = [...(rooms.data ?? [])].sort((a, b) => a.sort - b.sort || a.id - b.id);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= list.length) return;
    const ids = list.map((r) => r.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    reorder.mutate(ids);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    create.mutate({ name, personId: null }, { onSuccess: () => setNewName("") });
  };

  const trimmed = newName.trim().toLowerCase();
  const duplicate = trimmed !== "" && list.some((r) => r.name.trim().toLowerCase() === trimmed);

  if (rooms.isLoading) return <p className="text-[var(--muted)]">Loading…</p>;
  if (rooms.isError) return <p role="alert">Could not load rooms.</p>;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Rooms</h2>
      <ul className="space-y-2">
        {list.map((room, i) => (
          <RoomRow
            key={room.id}
            room={room}
            people={people.data ?? []}
            index={i}
            count={list.length}
            onMove={move}
            onDragStart={setDragFrom}
            dropTarget={dragFrom !== null && dragOver === i && dragFrom !== i}
            onDragOver={setDragOver}
            onDragEnd={() => {
              // Fires after a drop and also when a drag is cancelled (Escape, dropped outside the list).
              setDragFrom(null);
              setDragOver(null);
            }}
            onDrop={(to) => {
              if (dragFrom !== null) move(dragFrom, to);
              setDragFrom(null);
              setDragOver(null);
            }}
          />
        ))}
      </ul>
      {reorder.isError && <p role="alert" className="text-sm text-[var(--danger)]">Could not reorder the rooms. Please try again.</p>}
      <form onSubmit={add} className="flex gap-2">
        <input
          aria-label="New room name"
          aria-describedby={duplicate ? "room-duplicate" : undefined}
          className={`${FIELD} min-w-0 flex-1`}
          placeholder="Room name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="min-h-10 shrink-0 rounded-lg bg-[var(--accent-fill)] px-3 py-1.5 font-medium text-white" disabled={create.isPending}>
          Add room
        </button>
      </form>
      {duplicate && (
        <p id="room-duplicate" className="text-sm text-[var(--muted)]">
          There's already a room with this name. You can still add it.
        </p>
      )}
      {create.isError && <p role="alert" className="text-sm text-[var(--danger)]">Could not add the room. Please try again.</p>}
    </div>
  );
}
