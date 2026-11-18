import type { Status } from "../../shared/types.ts";

const LABEL: Record<Status, string> = { needed: "Needed", decided: "Decided", bought: "Bought", owned: "Owned" };

export default function StatusPill({ status }: { status: Status }) {
  return <span className={`status-pill status-${status}`}>{LABEL[status]}</span>;
}
