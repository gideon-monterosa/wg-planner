import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "src/web/styles.css"), "utf8");

/** Custom properties declared in the first `:root { ... }` block inside `scope` (light: top level, dark: the media query). */
function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]!] = m[2]!;
  return out;
}
const light = vars(css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root"))));
const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const dark = { ...light, ...vars(css.slice(darkStart, css.indexOf("}", css.indexOf(":root", darkStart)))) };

function rule(selector: string): { bg: string; fg: string } {
  const body = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return {
    bg: body.match(/background:\s*([^;]+);/)?.[1]!.trim() ?? "",
    fg: body.match(/(?:^|[\s;])color:\s*([^;]+);/)?.[1]!.trim() ?? "",
  };
}

function resolve(value: string, scope: Record<string, string>): string {
  const v = value.match(/^var\((--[\w-]+)\)$/);
  return v ? scope[v[1]!]! : value;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const expand = (hex: string) => (hex === "#fff" ? "#ffffff" : hex);

describe("status pill contrast (WCAG AA, 4.5:1 for 12px text)", () => {
  for (const selector of [".status-decided", ".status-bought"]) {
    for (const [mode, scope] of [["light", light], ["dark", dark]] as const) {
      it(`${selector} in ${mode} mode`, () => {
        const { bg, fg } = rule(selector);
        const ratio = contrast(expand(resolve(bg, scope)), expand(resolve(fg, scope)));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("theme token contrast (WCAG AA)", () => {
  // [foreground, background, minimum ratio, what it covers]
  const PAIRS: [string, string, number, string][] = [
    ["#ffffff", "--accent-fill", 4.5, "white text on filled buttons"],
    ["--accent", "--bg", 4.5, "accent text (active tab, links)"],
    ["--accent", "--surface", 4.5, "accent text on cards and the item dialog"],
    ["--danger", "--bg", 4.5, "error text"],
    ["--danger", "--surface", 4.5, "error text in the item dialog"],
    ["--muted", "--bg", 4.5, "muted text and placeholders"],
    ["--muted", "--surface", 4.5, "muted text on cards"],
    ["--fg", "--surface", 4.5, "body text on cards"],
    ["--field-border", "--bg", 3, "form control and chip borders"],
    ["--field-border", "--surface", 3, "form control borders on cards"],
    ["--together", "--bg", 3, "paid-together bar"],
    ["--unassigned", "--bg", 3, "payer-not-set bar"],
  ];
  const pick = (v: string, scope: Record<string, string>) => (v.startsWith("--") ? scope[v]! : v);
  for (const [fg, bg, min, what] of PAIRS) {
    for (const [mode, scope] of [["light", light], ["dark", dark]] as const) {
      it(`${what}: ${fg} on ${bg} in ${mode} mode >= ${min}:1`, () => {
        expect(pick(fg, scope)).toMatch(/^#[0-9a-f]{6}$/i);
        expect(pick(bg, scope)).toMatch(/^#[0-9a-f]{6}$/i);
        expect(contrast(pick(fg, scope), pick(bg, scope))).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("sets color-scheme for both themes", () => {
    expect(css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")))).toMatch(/color-scheme:\s*light/);
    expect(css.slice(darkStart, css.indexOf("}", css.indexOf(":root", darkStart)))).toMatch(/color-scheme:\s*dark/);
  });
});
