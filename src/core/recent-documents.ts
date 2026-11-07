import { ref } from "vue";

export interface RecentDocument {
  key: string;
  path: string;
  native: boolean;
  width: number;
  height: number;
  openedAt: number;
  thumbnail: string;
  source?: string;
}
export const RECENT_KEY = "rbs-studio-recents-v1";
export function recentKey(path: string, native: boolean) {
  return `${native ? "file" : "browser"}:${path.replaceAll("\\", "/").toLowerCase()}`;
}
function read(): RecentDocument[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw
      .filter((r): r is RecentDocument => {
        if (
          !r ||
          typeof r.path !== "string" ||
          typeof r.native !== "boolean" ||
          r.key !== recentKey(r.path, r.native) ||
          !Number.isFinite(r.width) ||
          !Number.isFinite(r.height) ||
          r.width <= 0 ||
          r.height <= 0 ||
          !Number.isFinite(r.openedAt) ||
          !Number.isFinite(new Date(r.openedAt).getTime()) ||
          seen.has(r.key)
        )
          return false;
        seen.add(r.key);
        return true;
      })
      .slice(0, 12)
      .map((r) => ({
        ...r,
        thumbnail:
          typeof r.thumbnail === "string" &&
          /^data:image\/(webp|png);base64,/.test(r.thumbnail) &&
          r.thumbnail.length < 200000
            ? r.thumbnail
            : "",
        source:
          !r.native && typeof r.source === "string" && r.source.length < 500000
            ? r.source
            : undefined,
      }));
  } catch {
    return [];
  }
}
export function useRecentDocuments() {
  const documents = ref<RecentDocument[]>(read());
  function persist() {
    // Bound storage; quota/privacy errors must never prevent opening/saving RBS.
    while (documents.value.length) {
      try {
        const json = JSON.stringify(documents.value);
        if (json.length > 2_000_000 && documents.value.length > 1) {
          documents.value.pop();
          continue;
        }
        localStorage.setItem(RECENT_KEY, json);
        return;
      } catch {
        if (documents.value.length === 1) return;
        documents.value.pop();
      }
    }
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
  }
  function remember(input: {
    path: string;
    native: boolean;
    width: number;
    height: number;
    source: string;
  }) {
    const key = recentKey(input.path, input.native);
    const old = documents.value.find((r) => r.key === key);
    const entry: RecentDocument = {
      key,
      path: input.path,
      native: input.native,
      width: input.width,
      height: input.height,
      openedAt: Date.now(),
      thumbnail: old?.thumbnail || "",
      source:
        !input.native && input.source.length < 500000
          ? input.source
          : undefined,
    };
    documents.value = [
      entry,
      ...documents.value.filter((r) => r.key !== key),
    ].slice(0, 12);
    persist();
  }
  function setThumbnail(path: string, native: boolean, thumbnail: string) {
    const entry = documents.value.find(
      (r) => r.key === recentKey(path, native),
    );
    if (
      !entry ||
      !/^data:image\/(webp|png);base64,/.test(thumbnail) ||
      thumbnail.length >= 200000
    )
      return;
    entry.thumbnail = thumbnail;
    persist();
  }
  function remove(key: string) {
    documents.value = documents.value.filter((r) => r.key !== key);
    persist();
  }
  return { documents, remember, remove, setThumbnail };
}
