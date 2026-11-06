import { invoke, isTauri } from "@tauri-apps/api/core";
import { ref } from "vue";
import {
  geometry,
  inheritedAttributes,
  shapeTags,
  imageTags,
  barTags,
  type XmlNode,
  type RbsDocument,
} from "./xml";

export interface TextRequest {
  family: string;
  height: number;
  bold: boolean;
  italic: boolean;
  text: string;
}
export interface RbsTextMetrics {
  family: string;
  emSize: number;
  height: number;
  baseline: number;
  width: number;
}
export function fontRequest(
  a: Record<string, string>,
  factor: string | undefined,
  text: string,
): TextRequest {
  const raw = Number(a.fh) || 28;
  const height = Math.max(
    1,
    Math.min(4096, Math.round((Math.abs(raw) * (Number(factor) || 100)) / 100)),
  );
  return {
    family: a.ft || "Arial",
    height: raw < 0 ? -height : height,
    bold: (a.fs || "").includes("b"),
    italic: (a.fs || "").includes("i"),
    text,
  };
}
/** A saved placeholder defines the field. Live values must never move its anchor.
 * len is a reserve for string fields, not a replacement for numeric/time masks. */
export function fieldSample(n: XmlNode, a: Record<string, string>): string {
  if (n.tag === "text") return a.text ?? n.text;
  if (n.text.trim()) return n.text.trim();
  const length = Math.max(0, Math.min(10000, Math.floor(Number(a.len) || 0)));
  return length ? "W".repeat(length) : n.tag;
}

const revision = ref(0);
const cache = new Map<string, RbsTextMetrics>();
const fallback = new Map<string, RbsTextMetrics>();
const pending = new Map<string, TextRequest>();
let context: CanvasRenderingContext2D | null;
let queued = false;
let failed = false;

function browserMetrics(r: TextRequest): RbsTextMetrics {
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("Schriftmessung nicht verfügbar");
  const font = (size: number) =>
    `${r.italic ? "italic " : ""}${r.bold ? "bold " : ""}${size}px ${JSON.stringify(r.family)}`;
  context.fontKerning = "none";
  context.font = font(1000);
  const unit = context.measureText("Mg");
  const ratio =
    (unit.fontBoundingBoxAscent + unit.fontBoundingBoxDescent) / 1000;
  // Browser-only preview: use the font's cell metrics; the Windows app replaces
  // these with GDI's integer measurements and actual substituted font family.
  const emSize =
    r.height < 0 ? -r.height : Math.max(1, Math.round(r.height / ratio));
  context.font = font(emSize);
  const m = context.measureText(r.text);
  return {
    family: r.family,
    emSize,
    height: m.fontBoundingBoxAscent + m.fontBoundingBoxDescent,
    baseline: m.fontBoundingBoxAscent,
    width: m.width,
  };
}
async function flush() {
  const batch = [...pending].slice(0, 2048);
  // Keep in-flight keys pending so reactive updates cannot enqueue duplicates.
  try {
    const results = await invoke<RbsTextMetrics[]>("measure_rbs_text", {
      requests: batch.map(([, r]) => r),
    });
    batch.forEach(([key], i) => {
      if (results[i]) cache.set(key, results[i]);
    });
    // Retain recently used strings while bounding memory during long races.
    while (cache.size > 8192) cache.delete(cache.keys().next().value!);
    revision.value++;
  } catch (error) {
    failed = true;
    console.warn(
      "Native Schriftmessung fehlgeschlagen; Browser-Schriftmaße werden verwendet.",
      error,
    );
  } finally {
    batch.forEach(([key]) => pending.delete(key));
    queued = false;
    if (!failed && pending.size) schedule();
  }
}
function schedule() {
  if (queued) return;
  queued = true;
  queueMicrotask(flush);
}
export function measureRbsText(r: TextRequest): RbsTextMetrics {
  void revision.value;
  const key = JSON.stringify(r);
  const measured = cache.get(key);
  if (measured) {
    cache.delete(key);
    cache.set(key, measured);
    return measured;
  }
  if (isTauri() && !failed) {
    pending.set(key, r);
    schedule();
  }
  let result = fallback.get(key);
  if (!result) {
    result = browserMetrics(r);
    fallback.set(key, result);
    if (fallback.size > 8192) fallback.delete(fallback.keys().next().value!);
  }
  return result;
}

/** Share text field dimensions with alignment tools (not the old 140px default). */
export function layoutGeometry(n: XmlNode, doc: RbsDocument) {
  const a = inheritedAttributes(n, doc),
    g = geometry({ ...n, attrs: a });
  if (
    shapeTags.has(n.tag) ||
    imageTags.has(n.tag) ||
    n.tag.startsWith("bild") ||
    barTags.has(n.tag) ||
    n.tag === "datagrid"
  )
    return g;
  const field = measureRbsText(
    fontRequest(a, doc.base.attrs.fontsizefaktor, fieldSample(n, a)),
  );
  return {
    ...g,
    width: "breite" in a || "x2" in a ? g.width : Math.max(1, field.width),
    height: "hoehe" in a || "y2" in a ? g.height : field.height,
  };
}
