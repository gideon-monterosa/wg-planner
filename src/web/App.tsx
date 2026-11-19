import { useEffect, useRef } from "react";
import { Redirect, Route, Switch, useLocation, useRoute } from "wouter";
import { ApiError, useMe } from "./api.ts";
import { BottomNav, TopBar } from "./components/AppNav.tsx";
import ItemModal from "./components/ItemModal.tsx";
import Ideas from "./pages/Ideas.tsx";
import MovingList from "./pages/MovingList.tsx";
import NotFound from "./pages/NotFound.tsx";
import Overview from "./pages/Overview.tsx";
import Settings from "./pages/Settings.tsx";

function Shell() {
  const [location, navigate] = useLocation();
  const [isItem, itemParams] = useRoute("/items/:id");
  const [isList] = useRoute("/");
  const [isIdeas] = useRoute("/ideas");
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

  // history.back() is async: guard so a double close can't leave the app.
  const closing = useRef(false);
  const itemId = isItem ? itemParams?.id : null;
  useEffect(() => {
    closing.current = false;
  }, [itemId]);
  const closeItem = () => {
    if (closing.current) return;
    closing.current = true;
    if (prev.current === "/") window.history.back();
    else navigate("/", { replace: true });
  };

  const known = isItem || isList || isIdeas || isOverview || isSettings;
  return (
    <div className="min-h-dvh">
      <TopBar inert={isItem} />
      <main className="mx-auto max-w-xl px-4 pt-2 pb-24 md:max-w-5xl md:px-6 md:pt-6 md:pb-8" inert={isItem}>
        {(isList || isItem) && <MovingList />}
        <Switch>
          <Route path="/ideas" component={Ideas} />
          <Route path="/overview" component={Overview} />
          <Route path="/settings" component={Settings} />
          <Route path="/rooms"><Redirect to="/settings" replace /></Route>
          <Route path="/people"><Redirect to="/settings" replace /></Route>
          {!known && <Route component={NotFound} />}
        </Switch>
      </main>
      {isItem && <ItemModal id={Number(itemParams?.id)} onClose={closeItem} />}
      <BottomNav inert={isItem} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</main>;
}

export default function App() {
  const me = useMe();
  if (me.isPending) return <Centered><p className="text-[var(--muted)]">Loading…</p></Centered>;
  if (me.error instanceof ApiError && me.error.status === 403) {
    const email = me.error.email ?? "this account";
    return (
      <Centered>
        <p className="max-w-sm">
          You're signed in as {email}, but you haven't been added yet. Ask a flatmate to add you under People.
        </p>
      </Centered>
    );
  }
  if (me.error) {
    return (
      <Centered>
        <p role="alert" className="text-[var(--muted)]">Something went wrong while loading WG Planner.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-lg bg-[var(--accent-fill)] px-4 font-medium text-white"
        >
          Reload
        </button>
      </Centered>
    );
  }
  return <Shell />;
}
