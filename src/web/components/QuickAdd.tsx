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

  // text-base on phones: iOS zooms into inputs with smaller text on focus.
  const field = "min-h-11 min-w-0 rounded-lg border border-[var(--field-border)] bg-transparent px-2.5 py-2 text-base md:text-sm";
  return (
    <form onSubmit={submit} className="mb-4" aria-label="Quick add">
      {/* Errors sit below this row at full width, so they never squeeze the fields on desktop. */}
      <div className="flex flex-wrap gap-2 md:flex-nowrap">
        <input
          aria-label="Item name"
          placeholder="+ Add item"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${field} flex-1 basis-full md:flex-[3] md:basis-auto`}
        />
        <select aria-label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`${field} flex-1 md:w-56 md:flex-none`}>
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
          className={`${field} w-28 md:w-32`}
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 rounded-lg bg-[var(--accent-fill)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {priceError && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          Enter a price like 19,99
        </p>
      )}
      {create.isError && (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          Couldn't add the item. Try again.
        </p>
      )}
    </form>
  );
}
