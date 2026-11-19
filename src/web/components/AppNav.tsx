import type { ReactNode } from "react";
import { Link, useRoute } from "wouter";

export type TabHref = "/" | "/ideas" | "/overview";

const ICON = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
} as const;

const TABS: { href: TabHref; label: string; icon: ReactNode }[] = [
  {
    href: "/",
    label: "List",
    icon: (
      <svg {...ICON}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" />
      </svg>
    ),
  },
  {
    href: "/ideas",
    label: "Ideas",
    icon: (
      <svg {...ICON}>
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
      </svg>
    ),
  },
  {
    href: "/overview",
    label: "Overview",
    icon: (
      <svg {...ICON}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
];

/**
 * The tab that matches the current route; no tab elsewhere. An open item belongs to the page it overlays
 * (`itemTab`: List by default, Ideas when opened from there).
 */
function useActiveTab(itemTab: TabHref = "/"): TabHref | null {
  const [isList] = useRoute("/");
  const [isItem] = useRoute("/items/:id");
  const [isIdeas] = useRoute("/ideas");
  const [isOverview] = useRoute("/overview");
  if (isItem) return itemTab;
  if (isList) return "/";
  if (isIdeas) return "/ideas";
  if (isOverview) return "/overview";
  return null;
}

function GearLink() {
  const [isSettings] = useRoute("/settings");
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      aria-current={isSettings ? "page" : undefined}
      className={`-mr-2 ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg md:hover:bg-[var(--line)]/60 ${
        isSettings ? "text-[var(--accent)]" : "text-[var(--muted)]"
      }`}
    >
      <svg {...ICON}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </Link>
  );
}

/** App bar: title and gear on phones; from 768px a sticky bar that also holds the tabs. */
export function TopBar({ inert, itemTab }: { inert?: boolean; itemTab?: TabHref }) {
  const active = useActiveTab(itemTab);
  return (
    <header
      inert={inert}
      className="md:sticky md:top-0 md:z-30 md:border-b md:border-[var(--line)] md:bg-[var(--bg)]"
    >
      <div className="mx-auto flex h-14 max-w-xl items-center gap-6 px-4 md:max-w-5xl md:px-6">
        <Link href="/" className="font-semibold">WG Planner</Link>
        <nav aria-label="Main" data-testid="top-nav" className="hidden h-full items-stretch gap-1 md:flex">
          {TABS.map((t) => {
            const current = active === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={current ? "page" : undefined}
                className={`flex items-center border-b-2 px-3 text-sm hover:bg-[var(--line)]/40 ${
                  current ? "border-[var(--accent)] font-semibold text-[var(--accent)]" : "border-transparent text-[var(--muted)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <GearLink />
      </div>
    </header>
  );
}

/** Tab bar fixed to the bottom on phones; hidden from 768px, where the top bar holds the tabs. */
export function BottomNav({ inert, itemTab }: { inert?: boolean; itemTab?: TabHref }) {
  const active = useActiveTab(itemTab);
  return (
    <nav
      inert={inert}
      aria-label="Main"
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--line)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map((t) => {
        const current = active === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs ${
              current ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
