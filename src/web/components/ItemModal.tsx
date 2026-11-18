import { useEffect, useRef, useState } from "react";
import { useItem } from "../api.ts";
import ItemPage from "../pages/ItemPage.tsx";

const SWIPE_CLOSE_PX = 80;

/** Item detail shown over the list: bottom sheet on phones, centered dialog from 768px. */
export default function ItemModal({ id, onClose }: { id: number; onClose: () => void }) {
  const item = useItem(id);
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [drag, setDrag] = useState<{ startY: number; dy: number } | null>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const label = item.data?.name ?? "Item";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={() => onClose()}>
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${Math.max(0, drag.dy)}px)` } : undefined}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--bg)] text-[var(--fg)] shadow-xl outline-none md:max-w-xl md:rounded-2xl"
      >
        <div
          className="flex shrink-0 touch-none justify-center pt-2 pb-1 md:hidden"
          data-testid="drag-handle"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setDrag({ startY: e.clientY, dy: 0 });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, dy: e.clientY - drag.startY })}
          onPointerUp={(e) => {
            const dy = drag ? e.clientY - drag.startY : 0;
            setDrag(null);
            if (dy > SWIPE_CLOSE_PX) onClose();
          }}
          onPointerCancel={() => setDrag(null)}
        >
          <div className="h-1.5 w-10 rounded-full bg-[var(--line)]" />
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 rounded-full px-3 py-1 text-lg text-[var(--muted)]"
        >
          ✕
        </button>
        <div className="overflow-y-auto overscroll-contain p-4 pt-8 md:pt-4">
          <ItemPage />
        </div>
      </div>
    </div>
  );
}
