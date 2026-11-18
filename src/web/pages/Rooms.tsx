import { useState } from "react";
import { useRoomMutations, usePeople, useRooms } from "../api.ts";
import type { Person, Room } from "../../shared/types.ts";

function RoomRow({
  room, people, index, count, onMove, onDragStart, onDrop,
}: {
  room: Room;
  people: Person[];
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onDragStart: (index: number) => void;
  onDrop: (index: number) => void;
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
    <li
      className="flex flex-wrap items-center gap-2 rounded border border-[var(--line)] p-2"
      draggable={typeof window !== "undefined" && window.matchMedia?.("(min-width: 768px)").matches}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(index)}
    >
      <input
        aria-label={`Name of ${room.name}`}
        className="min-w-[10rem] flex-1 rounded border border-transparent bg-transparent px-2 py-1 hover:border-[var(--line)]"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <select
        aria-label={`Owner of ${room.name}`}
        className="rounded border border-[var(--line)] bg-transparent px-2 py-1"
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
        className="rounded border border-[var(--line)] px-2 py-1 disabled:opacity-40"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${room.name} down`}
        className="rounded border border-[var(--line)] px-2 py-1 disabled:opacity-40"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
      <button type="button" aria-label={`Delete ${room.name}`} className="rounded px-2 py-1 text-red-600" onClick={onDelete}>
        Delete
      </button>
      {patch.isError && <p role="alert" className="basis-full text-sm text-red-600">Could not save the room. Please try again.</p>}
      {remove.isError && <p role="alert" className="basis-full text-sm text-red-600">Could not delete the room. Please try again.</p>}
    </li>
  );
}

export default function Rooms() {
  const rooms = useRooms();
  const people = usePeople();
  const { create, reorder } = useRoomMutations();
  const [newName, setNewName] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);

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

  if (rooms.isLoading) return <p>Loading…</p>;
  if (rooms.isError) return <p role="alert">Could not load rooms.</p>;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Rooms</h2>
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
            onDrop={(to) => {
              if (dragFrom !== null) move(dragFrom, to);
              setDragFrom(null);
            }}
          />
        ))}
      </ul>
      {reorder.isError && <p role="alert" className="text-sm text-red-600">Could not reorder the rooms. Please try again.</p>}
      <form onSubmit={add} className="flex gap-2">
        <input
          aria-label="New room name"
          className="min-w-0 flex-1 rounded border border-[var(--line)] bg-transparent px-2 py-1"
          placeholder="Room name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="rounded bg-[var(--accent)] px-3 py-1 text-white" disabled={create.isPending}>
          Add room
        </button>
      </form>
      {create.isError && <p role="alert" className="text-sm text-red-600">Could not add the room. Please try again.</p>}
    </div>
  );
}
