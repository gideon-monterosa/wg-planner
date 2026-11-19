import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="py-8 text-center">
      <h1 className="mb-2 text-xl font-semibold">Page not found</h1>
      <p className="mb-4 text-[var(--muted)]">There's nothing at this address.</p>
      <Link href="/" className="inline-flex min-h-11 items-center px-2 text-[var(--accent)] underline">
        Back to the list
      </Link>
    </div>
  );
}
