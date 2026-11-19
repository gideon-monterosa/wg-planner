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
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${Math.max(0, drag.dy)}px)` } : undefined}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] shadow-xl outline-none md:mx-6 md:max-w-2xl md:rounded-2xl md:border-b ${drag ? "" : "transition-transform"}`}
      >
        {/* Non-scrolling header: the drag handle (phones) and the close button never cover content. */}
        <div className="relative flex h-12 shrink-0 items-center justify-end px-1">
          <div
            className="absolute inset-y-0 left-14 right-14 flex touch-none justify-center pt-2 md:hidden"
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
            <div className="h-1.5 w-10 rounded-full bg-[var(--field-border)]" />
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-lg text-[var(--muted)] hover:bg-[var(--line)]/60"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-4 md:px-6 md:pb-6">
          <ItemPage onDeleted={onClose} />
        </div>
      </div>
    </div>
  );
}
