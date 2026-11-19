import { Link } from "wouter";
import People from "./People.tsx";
import Rooms from "./Rooms.tsx";

export default function Settings() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {/* From 768px the top bar holds the tabs, so the back arrow is phone-only. */}
        <Link
          href="/"
          aria-label="Back"
          className="-ml-2 inline-flex min-h-10 min-w-10 items-center justify-center rounded text-xl md:hidden"
        >
          ←
        </Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>
      <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <section aria-label="Rooms">
          <Rooms />
        </section>
        <section aria-label="People">
          <People />
        </section>
      </div>
    </div>
  );
}
