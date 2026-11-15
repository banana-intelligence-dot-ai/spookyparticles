import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import type { Actor } from "@/lib/actor";
import { WRITE_ROUTE_TOOLS } from "./coverage";
import { toolsFor } from "./tools";

const root = join(process.cwd(), "src/app/api/v1");
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? routes(path) : entry.name === "route.ts" ? [path] : [];
  });
}

it("accounts for every REST write route and offers every mapped tool", () => {
  const actual = new Set<string>();
  for (const file of routes(root)) {
    const text = readFileSync(file, "utf8");
    const path = relative(root, file).replace(/\/route\.ts$/, "").replace(/\\/g, "/").replace(/\/$/, "");
    for (const match of text.matchAll(/export\s+(?:const\s+|async\s+function\s+)(GET|POST|PATCH|PUT|DELETE)\b/g)) {
      if (match[1] !== "GET") actual.add(`${match[1]} ${path}`);
    }
  }
  const mapped = new Set(Object.keys(WRITE_ROUTE_TOOLS));
  const missing = [...actual].filter((key) => !mapped.has(key)).sort();
  const stale = [...mapped].filter((key) => !actual.has(key)).sort();
  const actor: Actor = { userId: "test", via: "api_key", scopes: ["read", "write", "approve"], label: "test" };
  const offered = toolsFor(actor);
  const missingTools = Object.entries(WRITE_ROUTE_TOOLS).flatMap(([route, entry]) => "tools" in entry ? entry.tools.filter((name) => !offered[name]).map((name) => `${route}: ${name}`) : []);
  const emptyReasons = Object.entries(WRITE_ROUTE_TOOLS).filter(([, entry]) => "humanOnly" in entry && !entry.humanOnly.trim()).map(([route]) => route);
  expect({ missing, stale, missingTools, emptyReasons }, `MCP write route coverage: missing routes ${missing.join(", ")}; stale keys ${stale.join(", ")}; unavailable tools ${missingTools.join(", ")}; empty human-only reasons ${emptyReasons.join(", ")}`).toEqual({ missing: [], stale: [], missingTools: [], emptyReasons: [] });
});
