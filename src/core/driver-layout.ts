import { gridColumns } from "./runtime";
import { isTextField, layoutGeometry } from "./text-layout";
import {
  applyPatches,
  fromCssColor,
  geometry,
  geometryAttributes,
  inheritedAttributes,
  setAttributes,
  slotColors,
  type RbsDocument,
  type XmlNode,
} from "./xml";

export interface DriverRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DriverElement {
  node: XmlNode;
  box: DriverRect;
  attrs: Record<string, string>;
  slot: number;
}

type DriverGroups = Record<number, number[]>;
export interface DriverArea {
  reference: number;
  groups: DriverGroups;
  columns: number;
  order: "rows" | "columns";
  gapX: number;
  gapY: number;
  fill: "area" | "screen" | "compact";
  margin: number;
}

const bindingNames = ["addonvariablename", "symboladdonname"] as const;
const gridColumn = (node: XmlNode) =>
  node.tag === "datagrid" && !!node.attrs.variable;
export function driverElements(
  doc: RbsDocument,
  imageSizes: Record<string, { width: number; height: number }> = {},
) {
  return doc.elements
    .filter((node) => !gridColumn(node))
    .map((node): DriverElement => {
      const attrs = inheritedAttributes(node, doc);
      const g = layoutGeometry(node, doc);
      const image = imageSizes[attrs.file || attrs.symbolname || ""];
      const w =
        image && !("breite" in attrs || "x2" in attrs) ? image.width : g.width;
      const h =
        image && !("hoehe" in attrs || "y2" in attrs) ? image.height : g.height;
      return {
        node,
        attrs,
        slot: Number(attrs.nr) || 0,
        box: {
          x: g.x + Math.min(0, w),
          y: g.y + Math.min(0, h),
          width: Math.max(1, Math.abs(w)),
          height: Math.max(1, Math.abs(h)),
        },
      };
    });
}

export function driverBounds(boxes: DriverRect[]): DriverRect | undefined {
  if (!boxes.length) return;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

function numbered(value: string, from: number, to: number) {
  return value.replace(/\d+/g, (number) =>
    Number(number) === from ? String(to).padStart(number.length, "0") : number,
  );
}

function bindingPattern(value: string, peer: string, from: number, to: number) {
  const parts = value.match(/\d+|\D+/g) ?? [];
  const other = peer.match(/\d+|\D+/g) ?? [];
  if (parts.length !== other.length) return;
  const indexes = new Set<number>();
  for (const [i, part] of parts.entries()) {
    if (part === other[i]) continue;
    if (
      !/^\d+$/.test(part) ||
      Number(part) !== from ||
      String(to).padStart(part.length, "0") !== other[i]
    )
      return;
    indexes.add(i);
  }
  if (indexes.size)
    return (slot: number) =>
      parts
        .map((part, i) =>
          indexes.has(i) ? String(slot).padStart(part.length, "0") : part,
        )
        .join("");
}

const numberedLabel =
  /^(?:fahrer(?:platz)?|spur|slot|bahn|lane|driver)\s*[#.: -]*\s*\d+\s*$/i;
function compatible(
  a: DriverElement,
  b: DriverElement,
  from: number,
  to: number,
) {
  if (a.node.tag !== b.node.tag || a.node.parent?.tag !== b.node.parent?.tag)
    return false;
  if (
    ["sort", "typ", "tbtyp", "variable"].some(
      (key) => (a.attrs[key] || "0") !== (b.attrs[key] || "0"),
    )
  )
    return false;
  if (
    bindingNames.some((key) => {
      const name = a.attrs[key] || "";
      const peer = b.attrs[key] || "";
      return name !== peer && !bindingPattern(name, peer, from, to);
    })
  )
    return false;
  if (a.node.tag === "text") {
    const label = a.attrs.text ?? a.node.text;
    const other = b.attrs.text ?? b.node.text;
    return (
      label === other ||
      (numberedLabel.test(label) && numbered(label, from, to) === other)
    );
  }
  if (a.slot <= 0) {
    if (a.slot !== b.slot) return false;
    const asset = a.attrs.file || a.attrs.symbolname || "";
    if (asset !== (b.attrs.file || b.attrs.symbolname || "")) return false;
    return (
      Math.abs(a.box.width - b.box.width) <= Math.max(4, a.box.width * 0.15) &&
      Math.abs(a.box.height - b.box.height) <= Math.max(4, a.box.height * 0.15)
    );
  }
  return true;
}

interface Match {
  a: DriverElement;
  b: DriverElement;
  dx: number;
  dy: number;
}

function matchPairs(
  references: DriverElement[],
  candidates: DriverElement[],
  from: number,
  to: number,
) {
  const pairs: Match[] = [];
  for (const a of references) {
    for (const b of candidates) {
      if (a !== b && compatible(a, b, from, to)) {
        pairs.push({ a, b, dx: b.box.x - a.box.x, dy: b.box.y - a.box.y });
      }
    }
  }
  return pairs;
}

function near(pairs: Match[], dx: number, dy: number, tolerance: number) {
  const used = new Set<DriverElement>();
  const result = new Map<DriverElement, DriverElement>();
  const distance = (p: Match) => Math.hypot(p.dx - dx, p.dy - dy);
  for (const p of pairs
    .filter((p) => distance(p) <= tolerance)
    .sort((a, b) => distance(a) - distance(b))) {
    if (result.has(p.a) || used.has(p.b)) continue;
    result.set(p.a, p.b);
    used.add(p.b);
  }
  return result;
}

function matchOffset(pairs: Match[], tolerance: number) {
  let best:
    | { dx: number; dy: number; matches: Map<DriverElement, DriverElement> }
    | undefined;
  // Bucket candidate translations so repeated shapes do not require testing every pair.
  const offsets = new Map<string, { x: number; y: number; pairs: Match[] }>();
  for (const pair of pairs) {
    const x = Math.round(pair.dx / (tolerance / 2));
    const y = Math.round(pair.dy / (tolerance / 2));
    const key = `${x},${y}`;
    const bucket = offsets.get(key);
    if (bucket) bucket.pairs.push(pair);
    else offsets.set(key, { x, y, pairs: [pair] });
  }
  for (const bucket of offsets.values()) {
    const { dx, dy } = bucket.pairs[0]!;
    const nearby: Match[] = [];
    for (let x = bucket.x - 2; x <= bucket.x + 2; x++) {
      for (let y = bucket.y - 2; y <= bucket.y + 2; y++) {
        const neighbors = offsets.get(`${x},${y}`)?.pairs ?? [];
        for (const pair of neighbors) nearby.push(pair);
      }
    }
    const matches = near(nearby, dx, dy, tolerance);
    if (
      !best ||
      matches.size > best.matches.size ||
      (matches.size === best.matches.size &&
        Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))
    ) {
      best = { dx, dy, matches };
    }
  }
  return best;
}

export function suggestDriverGroups(
  elements: DriverElement[],
  slots: number,
  reference: number,
  selection: number[],
  excluded = new Set<number>(),
): DriverGroups {
  const available = elements.filter((el) => !excluded.has(el.node.id));
  const own = available.filter((el) => el.slot === reference);
  const tolerance = 12;
  let selected = available.filter(
    (el) =>
      selection.includes(el.node.id) &&
      (el.slot === reference || el.slot === 0),
  );
  if (!selection.length) {
    const peer =
      available.find(
        (el) =>
          el.slot === (reference === slots ? reference - 1 : reference + 1),
      )?.slot ??
      available.find(
        (el) => el.slot > 0 && el.slot <= slots && el.slot !== reference,
      )?.slot ??
      reference;
    const next = available.filter((el) => el.slot === peer);
    const match = matchOffset(
      matchPairs(own, next, reference, peer),
      tolerance,
    );
    selected = match ? [...match.matches.keys()] : own;
    const bounds = driverBounds(selected.map((el) => el.box));
    if (bounds && match) {
      const staticElements = available.filter((el) => el.slot === 0);
      const decorations = staticElements.filter(
        ({ box }) =>
          box.x >= bounds.x - bounds.width * 0.1 - 8 &&
          box.y >= bounds.y - bounds.height * 0.18 - 8 &&
          box.x + box.width <= bounds.x + bounds.width * 1.1 + 8 &&
          box.y + box.height <= bounds.y + bounds.height * 1.18 + 8,
      );
      if (Math.hypot(match.dx, match.dy) > tolerance) {
        selected.push(
          ...near(
            matchPairs(decorations, staticElements, reference, peer),
            match.dx,
            match.dy,
            tolerance,
          ).keys(),
        );
      }
    }
  }
  const groups: DriverGroups = {
    [reference]: selected.map((el) => el.node.id),
  };
  const used = new Set(groups[reference]);
  for (let slot = 1; slot <= slots; slot++) {
    if (slot === reference) continue;
    const candidates = available.filter((el) => el.slot === slot);
    const offset = matchOffset(
      matchPairs(
        selected.filter((el) => el.slot > 0),
        candidates,
        reference,
        slot,
      ),
      tolerance,
    );
    if (!offset) {
      groups[slot] = [];
      continue;
    }
    const decorations = selected.filter((el) => el.slot === 0);
    const otherStatic = available.filter(
      (el) => el.slot === 0 && !used.has(el.node.id),
    );
    const staticMatches =
      Math.hypot(offset.dx, offset.dy) > tolerance
        ? near(
            matchPairs(decorations, otherStatic, reference, slot),
            offset.dx,
            offset.dy,
            tolerance,
          )
        : new Map<DriverElement, DriverElement>();
    groups[slot] = [...offset.matches.values(), ...staticMatches.values()].map(
      (el) => el.node.id,
    );
    for (const id of groups[slot]) used.add(id);
  }
  return groups;
}

function groupElements(elements: DriverElement[], ids: number[] = []) {
  const selected = new Set(ids);
  return elements.filter((el) => selected.has(el.node.id));
}

export function driverArea(
  elements: DriverElement[],
  reference: number,
  groups: DriverGroups,
): DriverArea {
  const boxes = Object.values(groups).flatMap((ids) => {
    const box = driverBounds(groupElements(elements, ids).map((el) => el.box));
    return box ? [box] : [];
  });
  const rows: DriverRect[][] = [];
  for (const box of [...boxes].sort((a, b) => a.y - b.y)) {
    const row = rows.find(
      ([first]) =>
        Math.abs(first!.y - box.y) < Math.min(first!.height, box.height) / 2,
    );
    if (row) row.push(box);
    else rows.push([box]);
  }
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const gapX = rows.flatMap((row) => {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    return sorted
      .slice(1)
      .map((box, i) => box.x - sorted[i]!.x - sorted[i]!.width);
  });
  const gapY = rows
    .slice(1)
    .map(
      ([box], i) => box!.y - Math.max(...rows[i]!.map((b) => b.y + b.height)),
    );
  return {
    reference,
    groups,
    columns,
    order:
      columns > 1 &&
      boxes.length > 1 &&
      Math.abs(boxes[1]!.x - boxes[0]!.x) < boxes[0]!.width / 2
        ? "columns"
        : "rows",
    gapX: Math.max(0, Math.round(gapX.length ? Math.min(...gapX) : 12)),
    gapY: Math.max(0, Math.round(gapY.length ? Math.min(...gapY) : 12)),
    fill: "area",
    margin: 0,
  };
}

function targetCells(
  doc: RbsDocument,
  area: DriverArea,
  bounds: DriverRect,
  sample: DriverRect,
  count: number,
) {
  const screen = area.fill === "screen";
  const margin = screen ? area.margin : 0;
  const x = screen ? margin : Math.max(0, bounds.x);
  const y = screen ? margin : Math.max(0, bounds.y);
  const width = screen
    ? doc.width - margin * 2
    : Math.min(doc.width, bounds.x + bounds.width) - x;
  const height = screen
    ? doc.height - margin * 2
    : Math.min(doc.height, bounds.y + bounds.height) - y;
  const columns = Math.min(count, area.columns);
  const rows = Math.ceil(count / columns);
  const { gapX, gapY } = area;
  const compact = area.fill === "compact";
  const transposed = area.order === "columns";
  const bands = transposed ? columns : rows;
  const bandLength = transposed ? rows : columns;
  const bandGap = transposed ? gapX : gapY;
  const cellGap = transposed ? gapY : gapX;
  const bandSpace = transposed ? width : height;
  const cellSpace = transposed ? height : width;
  const bandSize = Math.min(
    (bandSpace - (bands - 1) * bandGap) / bands,
    compact ? (transposed ? sample.width : sample.height) : Infinity,
  );
  const cells: DriverRect[] = [];
  for (let band = 0; band < bands && cells.length < count; band++) {
    const length = transposed
      ? Math.ceil((count - cells.length) / (bands - band))
      : Math.min(bandLength, count - cells.length);
    const divisions = compact ? bandLength : length;
    const size = Math.min(
      (cellSpace - (divisions - 1) * cellGap) / divisions,
      compact ? (transposed ? sample.height : sample.width) : Infinity,
    );
    if (!(bandSize >= 1 && size >= 1))
      throw new Error("Zu wenig Platz für diese Abstände und Fahrerzahl.");
    for (let i = 0; i < length; i++) {
      const bandPos = band * (bandSize + bandGap);
      const cellPos = i * (size + cellGap);
      cells.push(
        transposed
          ? { x: x + bandPos, y: y + cellPos, width: bandSize, height: size }
          : { x: x + cellPos, y: y + bandPos, width: size, height: bandSize },
      );
    }
  }
  return cells;
}

function scaleAttributes(
  el: DriverElement,
  origin: DriverRect,
  target: DriverRect,
) {
  const sx = target.width / origin.width;
  const sy = target.height / origin.height;
  const node = { ...el.node, attrs: el.attrs };
  const g = geometry(node);
  const width =
    "breite" in el.attrs || "x2" in el.attrs ? g.width : el.box.width;
  const height =
    "hoehe" in el.attrs || "y2" in el.attrs ? g.height : el.box.height;
  const x = Math.round(target.x + (g.x - origin.x) * sx);
  const y = Math.round(target.y + (g.y - origin.y) * sy);
  const w = Math.round(target.x + (g.x + width - origin.x) * sx) - x;
  const h = Math.round(target.y + (g.y + height - origin.y) * sy) - y;
  const attrs = geometryAttributes(node, {
    x,
    y,
    width: width > 0 ? Math.max(1, w) : w,
    height: height > 0 ? Math.max(1, h) : h,
  });
  if ("hoehe" in el.attrs) attrs.hoehe = height > 0 ? Math.max(1, h) : h;
  if (!isTextField(node) && !("x1" in el.attrs)) {
    attrs.breite = Math.max(1, w);
    attrs.hoehe = Math.max(1, h);
  }
  const scale = Math.min(sx, sy);
  if (isTextField(node) || "fh" in el.attrs) {
    const fh = Number(el.attrs.fh) || 28;
    attrs.fh = Math.sign(fh) * Math.max(1, Math.round(Math.abs(fh) * scale));
  }
  if (Number(el.attrs.w) > 0 && "w" in el.attrs)
    attrs.w = Math.max(1, Math.round(Number(el.attrs.w) * scale));
  return attrs;
}

export function resizeDrivers(
  doc: RbsDocument,
  elements: DriverElement[],
  areas: DriverArea[],
  count: number,
) {
  if (!Number.isInteger(count) || count < 1 || count > 8)
    throw new Error("Wähle 1 bis 8 Fahrer.");
  type Attrs = Record<string, string | number | null>;
  type Edit = { node: XmlNode; attrs: Attrs };
  const edits: Edit[] = [{ node: doc.base, attrs: { slots: count } }];
  const removed = new Set<XmlNode>();
  const handled = new Set<number>();
  const copies = new Map<number, { edits: Edit[]; label?: string }[]>();
  const cellAreas: DriverRect[][] = [];
  const shortAreas: number[] = [];
  for (const [index, area] of areas.entries()) {
    const bySlot = Object.fromEntries(
      Object.entries(area.groups).map(([slot, ids]) => [
        slot,
        groupElements(elements, ids),
      ]),
    );
    const reference = bySlot[area.reference] ?? [];
    const sample = driverBounds(reference.map((el) => el.box));
    if (!sample) continue;
    const existing = Object.values(bySlot).flat();
    for (const el of existing) {
      if (handled.has(el.node.id))
        throw new Error("Ein Element ist mehreren Fahrerplätzen zugeordnet.");
      handled.add(el.node.id);
    }
    const bounds = driverBounds(existing.map((el) => el.box))!;
    const cells = targetCells(doc, area, bounds, sample, count);
    cellAreas.push(cells);
    if (
      Object.entries(bySlot).some(
        ([slot, group]) =>
          Number(slot) <= doc.slots && group.length !== reference.length,
      )
    )
      shortAreas.push(index + 1);

    const unit = (el: DriverElement) =>
      el.node.tag === "datagrid"
        ? [el.node, ...gridColumns(el.node, doc.elements)]
        : [el.node];
    for (const [slot, group] of Object.entries(bySlot)) {
      if (Number(slot) > count)
        for (const el of group) for (const node of unit(el)) removed.add(node);
    }
    const bindingPatterns = new Map<
      DriverElement,
      Map<string, (slot: number) => string>
    >();
    for (const [slot, group] of Object.entries(bySlot)) {
      if (Number(slot) === area.reference || !group.length) continue;
      const peer = driverBounds(group.map((el) => el.box))!;
      const pairs = near(
        matchPairs(reference, group, area.reference, Number(slot)),
        peer.x - sample.x,
        peer.y - sample.y,
        24,
      );
      for (const [el, other] of pairs) {
        for (const key of bindingNames) {
          const pattern = bindingPattern(
            el.attrs[key] || "",
            other.attrs[key] || "",
            area.reference,
            Number(slot),
          );
          if (!pattern) continue;
          const keys =
            bindingPatterns.get(el) ??
            new Map<string, (slot: number) => string>();
          keys.set(key, pattern);
          bindingPatterns.set(el, keys);
        }
      }
    }
    for (const [i, target] of cells.entries()) {
      const slot = i + 1;
      const group = bySlot[slot];
      const existingBounds = group && driverBounds(group.map((el) => el.box));
      for (const el of existingBounds ? group! : reference) {
        const attrs: Attrs = scaleAttributes(
          el,
          existingBounds ?? sample,
          target,
        );
        if (el.slot > 0) attrs.nr = slot;
        const nodes = unit(el);
        const entry: Edit[] = [
          { node: el.node, attrs },
          ...nodes.slice(1).map((node) => ({
            node,
            attrs: {
              ...(el.slot > 0 ? { nr: slot } : {}),
              ...(Number(node.attrs.len) > 0
                ? {
                    len: Math.max(
                      1,
                      Math.round(
                        (Number(node.attrs.len) * target.width) /
                          (existingBounds ?? sample).width,
                      ),
                    ),
                  }
                : {}),
            },
          })),
        ];
        if (existingBounds) {
          edits.push(...entry);
          continue;
        }
        for (const [key, pattern] of bindingPatterns.get(el) ?? [])
          attrs[key] = pattern(slot);
        for (const key of ["c", "dc", "fc", "fdc"]) {
          if (
            el.attrs[key]?.toUpperCase().padStart(8, "0") ===
            fromCssColor(slotColors[area.reference - 1]!)
          ) {
            attrs[key] = fromCssColor(slotColors[slot - 1]!);
          }
        }
        const original = el.attrs.text ?? el.node.text;
        const isLabel = el.node.tag === "text" && numberedLabel.test(original);
        const isNumericExample =
          ["position", "slot"].includes(el.node.tag) &&
          original.trim() === String(area.reference);
        const label =
          el.node.children.length === 0 && (isLabel || isNumericExample)
            ? numbered(original, area.reference, slot)
            : undefined;
        if (label !== undefined && el.attrs.text !== undefined)
          attrs.text = label;
        const anchor = nodes.at(-1)!;
        const list = copies.get(anchor.end) ?? [];
        list.push({
          edits: entry,
          ...(el.attrs.text === undefined && label !== undefined
            ? { label }
            : {}),
        });
        copies.set(anchor.end, list);
      }
    }
  }
  const unassigned = elements.filter(
    (el) => el.slot > count && !handled.has(el.node.id),
  ).length;
  const captions = [];
  if (doc.slots !== count) {
    for (const el of elements) {
      if (el.node.tag !== "text" || el.slot !== 0 || handled.has(el.node.id))
        continue;
      const original =
        el.attrs.text ?? doc.source.slice(el.node.openEnd, el.node.closeStart);
      const prefix = /^\s*(\d+)(?=\s+Fahrer\s*(?:$|[/·|]))/i.exec(
        original,
      )?.[1];
      if (Number(prefix) !== doc.slots) continue;
      const text = original.replace(/\d+/, String(count));
      if (el.attrs.text !== undefined)
        edits.push({ node: el.node, attrs: { text } });
      else
        captions.push({
          start: el.node.openEnd,
          end: el.node.closeStart,
          value: text,
        });
    }
  }
  const openings = edits.map(({ node, attrs }) => ({
    start: node.start,
    end: node.openEnd,
    value: editOpening(doc, node, attrs),
  }));
  const nl = doc.source.includes("\r\n") ? "\r\n" : "\n";
  const insertions = [...copies].map(([position, list]) => ({
    start: position,
    end: position,
    value: list
      .map(({ edits, label }) =>
        edits
          .map(({ node, attrs }, index) => {
            const body =
              index === 0 && label !== undefined
                ? doc.source
                    .slice(node.openEnd, node.closeStart)
                    .replace(/\d+/, (value) => {
                      const replacement = label.match(/\d+/);
                      return replacement?.[0] ?? value;
                    }) + doc.source.slice(node.closeStart, node.end)
                : doc.source.slice(node.openEnd, node.end);
            const lineStart = doc.source.lastIndexOf("\n", node.start - 1) + 1;
            const indent =
              doc.source.slice(lineStart, node.start).match(/^\s*$/)?.[0] ??
              "    ";
            return nl + indent + editOpening(doc, node, attrs) + body;
          })
          .join(""),
      )
      .join(""),
  }));
  return {
    source: applyPatches(doc.source, [
      ...openings,
      ...captions,
      ...[...removed].map((node) => ({
        start: node.start,
        end: node.end,
        value: "",
      })),
      ...insertions,
    ]),
    cells: cellAreas,
    unassigned,
    shortAreas,
  };
}

function editOpening(
  doc: RbsDocument,
  node: XmlNode,
  attrs: Record<string, string | number | null>,
) {
  const opening = doc.source.slice(node.start, node.openEnd);
  const local = { ...node, start: 0, openEnd: opening.length };
  return setAttributes({ ...doc, source: opening }, [{ node: local, attrs }]);
}
