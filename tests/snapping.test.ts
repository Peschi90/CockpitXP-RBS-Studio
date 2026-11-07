import { expect, it } from "vitest";
import { snapMove, selectionBounds } from "../src/core/snapping";
const moving = { x: 70, y: 110, width: 80, height: 40 };
const target = { x: 340, y: 270, width: 110, height: 70 };
it("normalises backwards-drawn lines before computing the selection bounds", () => {
  expect(selectionBounds([{ x: 100, y: 90, width: -80, height: -60 }])).toEqual(
    { x: 20, y: 30, width: 80, height: 60 },
  );
});
it("snaps to edges and centres on both axes ahead of grid snapping", () => {
  const snapped = snapMove(moving, [target], 266, 156, 1, true, true);
  expect(snapped).toMatchObject({ dx: 270, dy: 155 });
  expect(snapped.guides).toMatchObject([
    { axis: "x", position: 340 },
    { axis: "y", position: 305 },
  ]);
  // Match the moving centre with the target centre.
  expect(snapMove(moving, [target], 283, 174, 1, false, true)).toMatchObject({
    dx: 285,
    dy: 175,
  });
});
it("uses six screen pixels of tolerance at every zoom", () => {
  expect(snapMove(moving, [target], 260, 0, 0.5, false, true).dx).toBe(270);
  expect(snapMove(moving, [target], 260, 0, 1, false, true).guides).toEqual([]);
  expect(snapMove(moving, [target], 267, 0, 3, false, true).dx).toBe(267);
});
it("disabling guides leaves independent grid and free movement available", () => {
  expect(snapMove(moving, [target], 266, 156, 1, false, false)).toEqual({
    dx: 266,
    dy: 156,
    guides: [],
  });
  expect(snapMove(moving, [target], 266, 156, 1, true, false)).toEqual({
    dx: 264,
    dy: 160,
    guides: [],
  });
});
it("snaps a selection as one group and includes the artboard centre and edges", () => {
  const group = selectionBounds([
    moving,
    { x: 190, y: 160, width: 60, height: 50 },
  ]);
  expect(group).toEqual({ x: 70, y: 110, width: 180, height: 100 });
  const page = { x: 0, y: 0, width: 800, height: 600 };
  expect(snapMove(group, [page], 237, 138, 1, false, true)).toMatchObject({
    dx: 240,
    dy: 140,
  });
  expect(snapMove(group, [page], -68, -108, 1, false, true)).toMatchObject({
    dx: -70,
    dy: -110,
  });
});
it("chooses the nearest candidate and commits integer pixels for measured text", () => {
  const text = { x: 4, y: 10, width: 83.7, height: 31.2 };
  const next = snapMove(
    text,
    [{ x: 100.4, y: 95.2, width: 100, height: 30 }],
    13,
    0,
    1,
    false,
    true,
  );
  expect(next.dx).toBe(13);
  expect(Number.isInteger(next.dy)).toBe(true);
  expect(next.guides[0]?.position).toBe(100.4);
});
