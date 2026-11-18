import { useEffect, useRef } from "react";
import { Link, Redirect, Route, Switch, useLocation, useRoute } from "wouter";
import { ApiError, useMe } from "./api.ts";
import ItemModal from "./components/ItemModal.tsx";
import MovingList from "./pages/MovingList.tsx";
import Overview from "./pages/Overview.tsx";
import Settings from "./pages/Settings.tsx";

const TABS = [
  { href: "/", label: "List" },
  { href: "/overview", label: "Overview" },
];

function BottomNav() {
  const [isOverview] = useRoute("/overview");
  const active = isOverview ? "/overview" : "/";
  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t border-[var(--line)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)]">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={`flex-1 py-3 text-center text-sm ${active === t.href ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between px-4 pt-3">
      <span className="font-semibold">WG Planner</span>
      <Link href="/settings" aria-label="Settings" className="-mr-2 rounded p-2 text-[var(--muted)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </header>
  );
}

function Shell() {
  const [location, navigate] = useLocation();
  const [isItem, itemParams] = useRoute("/items/:id");
  const [isList] = useRoute("/");
  const [isOverview] = useRoute("/overview");
  const [isSettings] = useRoute("/settings");
  // Track whether the entry before the current one is the list inside this app (not a deep link).
  const prev = useRef<string | null>(null);
  const cur = useRef(location);
  useEffect(() => {
    if (cur.current !== location) {
      prev.current = cur.current;
      cur.current = location;
    }
  }, [location]);

  const closeItem = () => {
    if (prev.current === "/") window.history.back();
    else navigate("/", { replace: true });
  };

  const known = isItem || isList || isOverview || isSettings;
  return (
    <div className="mx-auto max-w-xl pb-20">
      {!isSettings && <Header />}
      <main className="p-4">
        {(isList || isItem) && <MovingList />}
        <Switch>
          <Route path="/overview" component={Overview} />
          <Route path="/settings" component={Settings} />
          <Route path="/rooms"><Redirect to="/settings" replace /></Route>
          <Route path="/people"><Redirect to="/settings" replace /></Route>
          {!known && <Route><p>Not found.</p></Route>}
        </Switch>
      </main>
      {isItem && <ItemModal id={Number(itemParams?.id)} onClose={closeItem} />}
      <BottomNav />
    </div>
  );
}

export default function App() {
  const me = useMe();
  if (me.isPending) return <main className="p-4 text-[var(--muted)]">Loading…</main>;
  if (me.error instanceof ApiError && me.error.status === 403) {
    const email = me.error.email ?? "this account";
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <p className="max-w-sm">
          You're signed in as {email}, but you haven't been added yet. Ask a flatmate to add you under People.
        </p>
      </main>
    );
  }
  if (me.error) return <main className="p-4">Something went wrong. Please reload.</main>;
  return <Shell />;
}
