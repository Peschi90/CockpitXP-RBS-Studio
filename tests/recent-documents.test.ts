import { beforeEach, it, expect, vi } from "vitest";
import { useRecentDocuments, RECENT_KEY } from "../src/core/recent-documents";
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it("persists recent paths, deduplicates Windows paths and bounds history", () => {
  const r = useRecentDocuments();
  for (let i = 0; i < 14; i++)
    r.remember({
      path: `C:/RBS/${i}.xml`,
      native: true,
      width: 1920,
      height: 1080,
      source: "not stored",
    });
  r.remember({
    path: "c:\\rbs\\13.xml",
    native: true,
    width: 1920,
    height: 1080,
    source: "not stored",
  });
  expect(r.documents.value).toHaveLength(12);
  expect(useRecentDocuments().documents.value).toEqual(r.documents.value);
  expect(localStorage.getItem(RECENT_KEY)).not.toContain("not stored");
  r.setThumbnail("C:/RBS/13.xml", true, "data:image/webp;base64,AA==");
  expect(useRecentDocuments().documents.value[0]!.thumbnail).toContain(
    "data:image/webp",
  );
  r.remove(r.documents.value[0]!.key);
  expect(useRecentDocuments().documents.value).toHaveLength(11);
});
it("ignores damaged history and survives full storage without blocking documents", () => {
  localStorage.setItem(RECENT_KEY, '{"broken":true}');
  expect(useRecentDocuments().documents.value).toEqual([]);
  const r = useRecentDocuments();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() =>
    r.remember({
      path: "C:/RBS/a.xml",
      native: true,
      width: 100,
      height: 100,
      source: "",
    }),
  ).not.toThrow();
});
