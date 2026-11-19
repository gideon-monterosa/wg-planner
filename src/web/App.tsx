import { useEffect, useRef, useState } from "react";
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
  // The page an item dialog overlays: the one it was opened from (List or Ideas); a deep link gets the list.
  const [background, setBackground] = useState<"/" | "/ideas">(isIdeas ? "/ideas" : "/");
  const nextBackground = isIdeas ? "/ideas" : isItem ? background : "/";
  if (nextBackground !== background) setBackground(nextBackground);
  // Track whether the entry before the current one is that page inside this app (not a deep link).
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
    if (prev.current === nextBackground) window.history.back();
    else navigate(nextBackground, { replace: true });
  };

  const known = isItem || isList || isIdeas || isOverview || isSettings;
  // List and Ideas stay mounted under an open item, so closing it keeps their filters and drafts.
  const showList = isList || (isItem && nextBackground === "/");
  const showIdeas = isIdeas || (isItem && nextBackground === "/ideas");
  return (
    <div className="min-h-dvh">
      <TopBar inert={isItem} itemTab={nextBackground} />
      <main className="mx-auto max-w-xl px-4 pt-2 pb-24 md:max-w-5xl md:px-6 md:pt-6 md:pb-8" inert={isItem}>
        {showList && <MovingList />}
        {showIdeas && <Ideas />}
        <Switch>
          <Route path="/overview" component={Overview} />
          <Route path="/settings" component={Settings} />
          <Route path="/rooms"><Redirect to="/settings" replace /></Route>
          <Route path="/people"><Redirect to="/settings" replace /></Route>
          {!known && <Route component={NotFound} />}
        </Switch>
      </main>
      {isItem && <ItemModal id={Number(itemParams?.id)} onClose={closeItem} />}
      <BottomNav inert={isItem} itemTab={nextBackground} />
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
