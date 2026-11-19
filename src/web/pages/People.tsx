import { useState } from "react";
import { ApiError, usePeople, usePeopleMutations } from "../api.ts";
import type { Person } from "../../shared/types.ts";

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "Someone with that email already exists.";
  return "Something went wrong. Please try again.";
}

function PersonRow({ person }: { person: Person }) {
  const { patch } = usePeopleMutations();
  const [name, setName] = useState(person.name);
  const [email, setEmail] = useState(person.email);
  const [prev, setPrev] = useState(person);
  if (prev.name !== person.name || prev.email !== person.email) {
    setPrev(person);
    setName(person.name);
    setEmail(person.email);
  }
  const reset = () => {
    setName(person.name);
    setEmail(person.email);
  };
  const commit = () => {
    const n = name.trim();
    const m = email.trim();
    if (!n || !m) return reset();
    const changes: { name?: string; email?: string } = {};
    if (n !== person.name) changes.name = n;
    if (m !== person.email) changes.email = m;
    if (Object.keys(changes).length) patch.mutate({ id: person.id, ...changes }, { onError: reset });
  };
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();
  const cls = "min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--field-border)] bg-transparent px-2.5 py-1.5";
  return (
    <li className="space-y-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input aria-label={`Name of ${person.name}`} className={cls} value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={blurOnEnter} />
        <input aria-label={`Email of ${person.name}`} type="email" className={cls} value={email} onChange={(e) => setEmail(e.target.value)} onBlur={commit} onKeyDown={blurOnEnter} />
      </div>
      {patch.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorText(patch.error)}</p>}
    </li>
  );
}

export default function People() {
  const people = usePeople();
  const { create } = usePeopleMutations();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const m = email.trim();
    if (!n || !m) return;
    create.mutate({ name: n, email: m }, { onSuccess: () => { setName(""); setEmail(""); } });
  };

  if (people.isLoading) return <p className="text-[var(--muted)]">Loading…</p>;
  if (people.isError) return <p role="alert">Could not load people.</p>;

  const input = "min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--field-border)] bg-transparent px-2.5 py-1.5";
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">People</h2>
      <ul className="space-y-2">
        {(people.data ?? []).map((p) => (
          <PersonRow key={p.id} person={p} />
        ))}
      </ul>
      <form onSubmit={add} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="New person name" className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="New person email" type="email" className={input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="min-h-10 shrink-0 rounded-lg bg-[var(--accent-fill)] px-3 py-1.5 font-medium text-white" disabled={create.isPending}>
            Add person
          </button>
        </div>
        {create.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorText(create.error)}</p>}
        <p className="text-sm text-[var(--muted)]">
          Adding someone here lets them in once their email is also on the Cloudflare Access list. This also creates a room for them.
        </p>
      </form>
    </div>
  );
}
