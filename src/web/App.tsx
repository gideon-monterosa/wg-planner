import { Link, Route, Switch, useRoute } from "wouter";
import { ApiError, useMe } from "./api.ts";
import ItemPage from "./pages/ItemPage.tsx";
import MovingList from "./pages/MovingList.tsx";
import Overview from "./pages/Overview.tsx";
import People from "./pages/People.tsx";
import Rooms from "./pages/Rooms.tsx";

const TABS = [
  { href: "/", label: "List" },
  { href: "/overview", label: "Overview" },
  { href: "/rooms", label: "Rooms" },
  { href: "/people", label: "People" },
];

function BottomNav() {
  const [isOverview] = useRoute("/overview");
  const [isRooms] = useRoute("/rooms");
  const [isPeople] = useRoute("/people");
  const active = isOverview ? "/overview" : isRooms ? "/rooms" : isPeople ? "/people" : "/";
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
  return (
    <div className="mx-auto max-w-xl pb-20">
      <main className="p-4">
        <Switch>
          <Route path="/" component={MovingList} />
          <Route path="/items/:id" component={ItemPage} />
          <Route path="/overview" component={Overview} />
          <Route path="/rooms" component={Rooms} />
          <Route path="/people" component={People} />
          <Route>
            <p>Not found.</p>
          </Route>
        </Switch>
      </main>
      <BottomNav />
    </div>
  );
}
