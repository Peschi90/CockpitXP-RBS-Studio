export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SnapGuide {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
}
export function selectionBounds(rects: SnapRect[]): SnapRect {
  const x = Math.min(...rects.map((r) => Math.min(r.x, r.x + r.width)));
  const y = Math.min(...rects.map((r) => Math.min(r.y, r.y + r.height)));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => Math.max(r.x, r.x + r.width))) - x,
    height: Math.max(...rects.map((r) => Math.max(r.y, r.y + r.height))) - y,
  };
}
/** Work in document pixels; tolerance is constant in screen pixels. The caller
 * freezes rendered (including measured text) bounds at pointer-down. */
export function snapMove(
  moving: SnapRect,
  targets: SnapRect[],
  dx: number,
  dy: number,
  zoom: number,
  grid: boolean,
  smart: boolean,
) {
  const step = grid ? 8 : 1;
  const result = {
    dx: Math.round(dx / step) * step,
    dy: Math.round(dy / step) * step,
    guides: [] as SnapGuide[],
  };
  if (!smart) return result;
  const tolerance = 6 / Math.max(0.1, zoom);
  const matches: { axis: "x" | "y"; target: SnapRect; position: number }[] = [];
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "width" : "height";
    const delta = axis === "x" ? dx : dy;
    let best = Infinity;
    let chosen:
      { target: SnapRect; position: number; delta: number } | undefined;
    for (const target of targets) {
      for (const t of [0, 0.5, 1]) {
        const position = target[axis] + target[size] * t;
        for (const m of [0, 0.5, 1]) {
          const exact = position - moving[axis] - moving[size] * m;
          // XML coordinates are integer pixels; commit and preview must agree.
          const snapped = Math.round(exact);
          const distance = Math.abs(snapped - delta);
          if (distance <= tolerance && distance < best) {
            best = distance;
            chosen = { target, position, delta: snapped };
          }
        }
      }
    }
    if (chosen) {
      result[axis === "x" ? "dx" : "dy"] = chosen.delta;
      matches.push({ axis, ...chosen });
    }
  }
  for (const { axis, target, position } of matches) {
    const cross = axis === "x" ? "y" : "x";
    const size = axis === "x" ? "height" : "width";
    const start = moving[cross] + (axis === "x" ? result.dy : result.dx);
    result.guides.push({
      axis,
      position,
      start: Math.min(start, target[cross]) - 10 / zoom,
      end:
        Math.max(start + moving[size], target[cross] + target[size]) +
        10 / zoom,
    });
  }
  return result;
}
