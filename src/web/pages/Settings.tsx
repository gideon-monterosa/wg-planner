import { Link } from "wouter";
import People from "./People.tsx";
import Rooms from "./Rooms.tsx";

export default function Settings() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link href="/" aria-label="Back" className="-ml-2 rounded px-2 py-1 text-xl">
          ←
        </Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>
      <section aria-label="Rooms" className="mb-8">
        <Rooms />
      </section>
      <section aria-label="People">
        <People />
      </section>
    </div>
  );
}
