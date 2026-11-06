/** Source-preserving XML edits: only explicitly edited spans are replaced.
 * Comments, unknown nodes/attributes, whitespace and attribute order survive.
 * No external entities / DTDs are accepted. DOM is used for validation only.
 */
import { ref } from "vue";
export const systemPalette = ref<string[]>([]);
export interface XmlNode {
  id: number;
  tag: string;
  attrs: Record<string, string>;
  text: string;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  selfClosing: boolean;
  parent?: XmlNode;
  children: XmlNode[];
}
export interface RbsDocument {
  source: string;
  root: XmlNode;
  nodes: XmlNode[];
  elements: XmlNode[];
  base: XmlNode;
  width: number;
  height: number;
  slots: number;
}
export const sections = ["grafik", "texte", "variablen"];
export const shapeTags = new Set([
  "box",
  "rechteck",
  "roundbox",
  "roundrechteck",
  "linie",
]);
export const imageTags = new Set([
  "bitmap",
  "symbole_einaus",
  "bildueberaddon",
]);
export const barTags = new Set(["tankbar", "progressbar"]);
export function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
export function parseRbs(source: string): RbsDocument {
  if (source.length > 12_000_000)
    throw new Error("Die XML-Datei ist größer als 12 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error("DTD und externe Entitäten werden nicht unterstützt.");
  const dom = new DOMParser().parseFromString(source, "application/xml");
  const error = dom.querySelector("parsererror");
  if (error)
    throw new Error(`Ungültiges XML: ${error.textContent?.slice(0, 260)}`);
  if (dom.documentElement.tagName !== "RennScreen")
    throw new Error("Keine Cockpit-XP-RBS-Datei: <RennScreen> fehlt.");
  const domNodes = [
    dom.documentElement,
    ...dom.documentElement.querySelectorAll("*"),
  ];
  const nodes: XmlNode[] = [],
    stack: XmlNode[] = [];
  const token =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w:.-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  for (const match of source.matchAll(token)) {
    const raw = match[0],
      start = match.index!;
    if (raw.startsWith("<?") || raw.startsWith("<!")) continue;
    if (raw.startsWith("</")) {
      const n = stack.pop()!;
      n.closeStart = start;
      n.end = start + raw.length;
      continue;
    }
    const d = domNodes[nodes.length];
    if (!d) throw new Error("XML-Struktur konnte nicht zugeordnet werden.");
    const n: XmlNode = {
      id: nodes.length,
      tag: d.tagName,
      attrs: Object.fromEntries(
        [...d.attributes].map((a) => [a.name, a.value]),
      ),
      text: d.textContent ?? "",
      start,
      openEnd: start + raw.length,
      closeStart: start + raw.length,
      end: start + raw.length,
      selfClosing: /\/\s*>$/.test(raw),
      parent: stack.at(-1),
      children: [],
    };
    n.parent?.children.push(n);
    nodes.push(n);
    if (!n.selfClosing) stack.push(n);
  }
  if (nodes.length !== domNodes.length || stack.length)
    throw new Error("XML-Struktur ist nicht vollständig lesbar.");
  const root = nodes[0]!;
  const base = root.children
    .find((n) => n.tag === "base")
    ?.children.find((n) => n.tag === "dim" || n.tag === "framepos");
  if (!base)
    throw new Error(
      "Bildschirmgröße fehlt: base/dim oder base/framepos erforderlich.",
    );
  const width = Number(base.attrs.xmax ?? base.attrs.w),
    height = Number(base.attrs.ymax ?? base.attrs.h);
  if (!(width > 0 && height > 0 && width <= 16384 && height <= 16384))
    throw new Error("Ungültige Bildschirmgröße (1–16384 Pixel).");
  // Cockpit draws graphics, static text, then variables in their native sections.
  const elements = sections.flatMap((s) =>
    root.children
      .filter((n) => n.tag === s)
      .flatMap((n) => n.children.filter((c) => c.tag !== "defaults")),
  );
  return {
    source,
    root,
    nodes,
    elements,
    base,
    width,
    height,
    slots: Math.max(1, Math.min(8, Number(base.attrs.slots) || 6)),
  };
}
type Patch = { start: number; end: number; value: string };
export function applyPatches(source: string, patches: Patch[]) {
  const ordered = [...patches].sort((a, b) => b.start - a.start);
  let nextStart = source.length + 1;
  for (const p of ordered) {
    if (p.end > nextStart) throw new Error("Überlappende XML-Änderungen.");
    source = source.slice(0, p.start) + p.value + source.slice(p.end);
    nextStart = p.start;
  }
  return source;
}
export function setAttributes(
  doc: RbsDocument,
  edits: { node: XmlNode; attrs: Record<string, string | number | null> }[],
) {
  return applyPatches(
    doc.source,
    edits.map(({ node, attrs }) => {
      let opening = doc.source.slice(node.start, node.openEnd);
      for (const [name, value] of Object.entries(attrs)) {
        if (!/^[A-Za-z_][\w:.-]*$/.test(name))
          throw new Error("Ungültiger Attributname.");
        let found = false;
        opening = opening.replace(
          /(\s+)([A-Za-z_][\w:.-]*)(\s*=\s*)(["'])([\s\S]*?)\4/g,
          (all, ws, key, eq, quote) => {
            if (key !== name) return all;
            found = true;
            return value === null
              ? ""
              : `${ws}${key}${eq}${quote}${escapeXml(String(value))}${quote}`;
          },
        );
        if (!found && value !== null)
          opening = opening.replace(
            /\s*\/?\s*>$/,
            (tail) => ` ${name}="${escapeXml(String(value))}"${tail}`,
          );
      }
      return { start: node.start, end: node.openEnd, value: opening };
    }),
  );
}
export function setText(doc: RbsDocument, node: XmlNode, value: string) {
  if (node.tag === "text")
    return setAttributes(doc, [{ node, attrs: { text: value } }]);
  if (node.children.length)
    throw new Error(
      "Element enthält Unterelemente. Bitte im XML-Editor bearbeiten.",
    );
  if (node.selfClosing)
    return applyPatches(doc.source, [
      {
        start: node.start,
        end: node.end,
        value:
          doc.source.slice(node.start, node.openEnd).replace(/\/\s*>$/, ">") +
          escapeXml(value) +
          `</${node.tag}>`,
      },
    ]);
  return applyPatches(doc.source, [
    { start: node.openEnd, end: node.closeStart, value: escapeXml(value) },
  ]);
}
export function insertXml(doc: RbsDocument, section: string, xml: string) {
  const target = doc.root.children.find((n) => n.tag === section);
  const nl = doc.source.includes("\r\n") ? "\r\n" : "\n";
  if (!target)
    return applyPatches(doc.source, [
      {
        start: doc.root.closeStart,
        end: doc.root.closeStart,
        value: `  <${section}>${nl}    ${xml}${nl}  </${section}>${nl}`,
      },
    ]);
  if (target.selfClosing)
    return applyPatches(doc.source, [
      {
        start: target.start,
        end: target.end,
        value:
          doc.source
            .slice(target.start, target.openEnd)
            .replace(/\/\s*>$/, ">") + `${nl}    ${xml}${nl}  </${section}>`,
      },
    ]);
  return applyPatches(doc.source, [
    {
      start: target.closeStart,
      end: target.closeStart,
      value: `    ${xml}${nl}  `,
    },
  ]);
}
export function deleteNodes(doc: RbsDocument, ids: number[]) {
  return applyPatches(
    doc.source,
    doc.elements
      .filter((n) => ids.includes(n.id))
      .map((n) => ({ start: n.start, end: n.end, value: "" })),
  );
}
export const numeric = (n: XmlNode, key: string, fallback = 0) =>
  Number.isFinite(Number(n.attrs[key])) && n.attrs[key] !== undefined
    ? Number(n.attrs[key])
    : fallback;
export function geometry(n: XmlNode) {
  const x = numeric(
    n,
    "left",
    numeric(n, "links", numeric(n, "xpos", numeric(n, "x1"))),
  );
  const y = numeric(n, "top", numeric(n, "ypos", numeric(n, "y1")));
  const sized = "breite" in n.attrs || "x2" in n.attrs;
  return {
    x,
    y,
    width: numeric(n, "breite", numeric(n, "x2", x + 140) - x),
    height: numeric(
      n,
      "hoehe",
      numeric(n, "y2", y + Math.abs(numeric(n, "fh", 28)) * 1.35) - y,
    ),
    sized,
  };
}
export function geometryAttributes(
  n: XmlNode,
  g: Partial<ReturnType<typeof geometry>>,
) {
  const old = geometry(n),
    v = { ...old, ...g };
  const attrs: Record<string, number> = {};
  // Preserve coordinate dialect, including endpoints when moving legacy graphics.
  if ("x1" in n.attrs) {
    attrs.x1 = v.x;
    attrs.y1 = v.y;
    if ("x2" in n.attrs || g.width !== undefined) attrs.x2 = v.x + v.width;
    if ("y2" in n.attrs || g.height !== undefined) attrs.y2 = v.y + v.height;
  } else if ("links" in n.attrs && !("left" in n.attrs)) {
    attrs.links = v.x;
    attrs.top = v.y;
  } else if ("xpos" in n.attrs && !("left" in n.attrs)) {
    attrs.xpos = v.x;
    attrs.ypos = v.y;
  } else {
    attrs.left = v.x;
    attrs.top = v.y;
  }
  if (
    "breite" in n.attrs ||
    (!("x1" in n.attrs) &&
      (g.width !== undefined || g.height !== undefined) &&
      old.sized)
  ) {
    attrs.breite = v.width;
    attrs.hoehe = v.height;
  }
  return attrs;
}
export const slotColors = [
  "#ed5b56",
  "#55a9f5",
  "#f8cd57",
  "#5cd0a5",
  "#b38bea",
  "#f59c62",
  "#d9e4ee",
  "#ea81ba",
];
export const slotTextColors = Array<string>(8).fill("#10151b");
export function toCssColor(
  value = "",
  slot = 1,
  fallback = "#e4e8ed",
  palette?: { background: string; font: string },
) {
  const index = (Math.max(1, slot) - 1) % 8;
  if (value.toLowerCase() === "slotcolorbg")
    return palette?.background ?? slotColors[index]!;
  if (value.toLowerCase() === "slotcolor")
    return palette?.font ?? slotTextColors[index]!;
  if (!/^[0-9a-f]{1,8}$/i.test(value)) return fallback;
  const v = value.padStart(8, "0");
  if (v.startsWith("80"))
    return systemPalette.value[parseInt(v.slice(-2), 16)] ?? fallback;
  return `#${v.slice(-2)}${v.slice(-4, -2)}${v.slice(-6, -4)}`;
}
export function fromCssColor(value: string) {
  return `00${value.slice(5, 7)}${value.slice(3, 5)}${value.slice(1, 3)}`.toUpperCase();
}
export function inheritedAttributes(n: XmlNode, doc: RbsDocument) {
  const globals =
    doc.root.children
      .find((c) => c.tag === "base")
      ?.children.filter((c) => c.tag === "defaults") ?? [];
  const preceding =
    n.parent?.children.filter(
      (c) => c.tag === "defaults" && c.start < n.start,
    ) ?? [];
  return Object.assign(
    {},
    ...globals.map((c) => c.attrs),
    ...preceding.map((c) => c.attrs),
    n.attrs,
  ) as Record<string, string>;
}
