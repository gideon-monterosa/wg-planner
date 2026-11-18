import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Overview from "../../src/web/pages/Overview";

afterEach(() => vi.unstubAllGlobals());

it("explains exactly what Planned counts", async () => {
  const mode = { me: { ownCents: 0, sharedCents: 0, totalCents: 0 }, rows: [] };
  vi.stubGlobal("fetch", vi.fn(async (path: string) =>
    new Response(JSON.stringify(path === "/api/overview" ? { planned: mode, spent: mode } : []), { status: 200 })));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Overview /></QueryClientProvider>);
  expect(
    await screen.findByText(
      "Planned counts what was paid for bought items, otherwise the starred idea's price, otherwise the item's own price. Price ranges and owned items count as zero.",
    ),
  ).toBeInTheDocument();
});
