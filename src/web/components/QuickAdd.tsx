import { useState, type FormEvent } from "react";
import type { Room } from "../../shared/types.ts";
import { useCreateItem } from "../api.ts";
import { parseChfInput } from "../format.ts";

export default function QuickAdd({ rooms }: { rooms: Room[] }) {
  const create = useCreateItem();
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [price, setPrice] = useState("");
  const [priceError, setPriceError] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const cents = parseChfInput(price);
    if (cents === "invalid") {
      setPriceError(true);
      return;
    }
    setPriceError(false);
    create.mutate(
      { name: trimmed, roomId: roomId === "" ? null : Number(roomId), ownPriceCents: cents },
      {
        onSuccess: () => {
          setName("");
          setPrice("");
        },
      },
    );
  }

  const field = "min-w-0 rounded-lg border border-[var(--line)] bg-transparent px-2 py-2 text-sm";
  return (
    <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2" aria-label="Quick add">
      <input
        aria-label="Item name"
        placeholder="+ Add item"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`${field} flex-1 basis-full`}
      />
      <select aria-label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`${field} flex-1`}>
        <option value="">No room</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Price"
        aria-invalid={priceError}
        inputMode="decimal"
        placeholder="Price (CHF)"
        value={price}
        onChange={(e) => {
          setPrice(e.target.value);
          setPriceError(false);
        }}
        className={`${field} w-24`}
      />
      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Add
      </button>
      {priceError && (
        <p role="alert" className="basis-full text-sm text-red-600">
          Enter a price like 19,99
        </p>
      )}
      {create.isError && (
        <p role="alert" className="basis-full text-sm text-red-600">
          Couldn't add the item. Try again.
        </p>
      )}
    </form>
  );
}
