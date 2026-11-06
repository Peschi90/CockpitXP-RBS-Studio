import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { AddonPackage } from "../src/core/addons";
export const addonRoot =
  process.env.COCKPIT_ADDON_ROOT || "C:\\ProgramData\\Cockpit-V2\\AddOn";
export function readText(file: string) {
  const bytes = fs.readFileSync(file);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
export function installedAddons() {
  const result: { pkg: AddonPackage; file: string; hash: string }[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 3) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (
        entry.isDirectory() &&
        !/backup|RBS-Studio|node_modules|\.git/i.test(entry.name)
      )
        walk(full, depth + 1);
      if (entry.isFile() && entry.name.toLowerCase() === "addon.cps.xml") {
        const source = readText(full),
          cfg = path.join(dir, "ConfigPackage.xml"),
          config = fs.existsSync(cfg) ? readText(cfg) : "",
          screens: AddonPackage["screens"] = {},
          files: Record<string, string> = {};
        for (const name of fs.readdirSync(dir)) {
          const f = path.join(dir, name);
          if (!fs.statSync(f).isFile() || fs.statSync(f).size > 2_000_000)
            continue;
          if (
            name.endsWith(".xml") &&
            name !== "AddOn.cps.xml" &&
            name !== "ConfigPackage.xml"
          ) {
            const s = readText(f);
            if (s.includes("<RennScreen"))
              screens[name] = { source: s, assets: {} };
          }
          if (/\.txt$/i.test(name)) files[name] = readText(f);
        }
        result.push({
          file: full,
          hash: createHash("sha256")
            .update(fs.readFileSync(full))
            .digest("hex"),
          pkg: {
            name: path.relative(addonRoot, dir),
            source,
            config,
            screens,
            files,
          },
        });
      }
    }
  }
  if (fs.existsSync(addonRoot)) walk(addonRoot, 0);
  return result.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
}
