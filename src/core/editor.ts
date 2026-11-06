import { computed, ref, watch } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  parseRbs,
  setAttributes,
  deleteNodes,
  geometry,
  geometryAttributes,
  insertXml,
  setText,
  type XmlNode,
} from "./xml";
import { elementXml, sectionFor } from "./catalog";
import { createTemplate } from "./templates";
import { withGridColumns } from "./runtime";
import { createSimulation } from "./simulator";
import { layoutGeometry } from "./text-layout";
export interface Opened {
  path: string;
  source: string;
  encoding: string;
  hash: string;
  assets: Record<string, string>;
  warnings: string[];
}
export interface LibraryEntry {
  path: string;
  name: string;
  category: string;
}
export function useEditor() {
  const source = ref(createTemplate("race")),
    savedSource = ref(source.value),
    path = ref(""),
    encoding = ref("latin1"),
    fileHash = ref<string | null>(null);
  const doc = computed(() => parseRbs(source.value)),
    selected = ref<number[]>([]),
    assets = ref<Record<string, string>>({}),
    assetWarnings = ref<string[]>([]);
  const busy = ref(false),
    notice = ref(
      "Bereit. Öffne einen vorhandenen Rennbildschirm oder starte mit einer Vorlage.",
    ),
    error = ref("");
  const history = ref<string[]>([]),
    future = ref<string[]>([]),
    library = ref<LibraryEntry[]>([]),
    libraryRoot = ref(""),
    libraryBusy = ref(false);
  const sim = createSimulation(),
    dirty = computed(() => source.value !== savedSource.value),
    active = computed(() =>
      doc.value.elements.find((n) => n.id === selected.value[0]),
    );
  const title = computed(() =>
    path.value
      ? path.value.split(/[\\/]/).slice(-2).join(" / ")
      : "Neuer Rennbildschirm",
  );
  const recoveryKey = "rbs-studio-recovery-v1";
  let recovery:
    | {
        source: string;
        savedSource: string;
        path: string;
        encoding: string;
        hash: string | null;
      }
    | undefined;
  try {
    recovery =
      JSON.parse(localStorage.getItem(recoveryKey) || "null") ?? undefined;
  } catch {}
  const canRecover = ref(!!recovery);
  let recoverTimer: ReturnType<typeof setTimeout>;
  watch([source, path, encoding, savedSource], () => {
    clearTimeout(recoverTimer);
    recoverTimer = setTimeout(() => {
      try {
        if (dirty.value)
          localStorage.setItem(
            recoveryKey,
            JSON.stringify({
              source: source.value,
              savedSource: savedSource.value,
              path: path.value,
              encoding: encoding.value,
              hash: fileHash.value,
            }),
          );
        else if (!canRecover.value) localStorage.removeItem(recoveryKey);
      } catch {
        notice.value =
          "Wiederherstellungsspeicher voll. Bitte die XML-Datei speichern.";
      }
    }, 500);
  });
  function commit(next: string, selection?: number[]) {
    if (busy.value || next === source.value) return;
    try {
      parseRbs(next);
      history.value.push(source.value);
      if (history.value.length > 80) history.value.shift();
      future.value = [];
      source.value = next;
      if (selection) selected.value = selection;
      error.value = "";
    } catch (e) {
      error.value = String(e);
    }
  }
  function undo() {
    if (busy.value) return;
    const s = history.value.pop();
    if (s !== undefined) {
      future.value.push(source.value);
      source.value = s;
      selected.value = [];
    }
  }
  function redo() {
    if (busy.value) return;
    const s = future.value.pop();
    if (s !== undefined) {
      history.value.push(source.value);
      source.value = s;
      selected.value = [];
    }
  }
  function update(
    attrs: Record<string, string | number | null>,
    ids = selected.value,
  ) {
    const grouped =
      "nr" in attrs ? withGridColumns(ids, doc.value.elements) : ids;
    commit(
      setAttributes(
        doc.value,
        doc.value.nodes
          .filter((n) => grouped.includes(n.id))
          .map((node) => ({
            node,
            attrs: ids.includes(node.id) ? attrs : { nr: attrs.nr! },
          })),
      ),
    );
  }
  function move(dx: number, dy: number) {
    commit(
      setAttributes(
        doc.value,
        doc.value.elements
          .filter((n) => selected.value.includes(n.id))
          .map((node) => {
            const g = geometry(node);
            return {
              node,
              attrs: geometryAttributes(node, {
                x: Math.round(g.x + dx),
                y: Math.round(g.y + dy),
              }),
            };
          }),
      ),
    );
  }
  function updateGeometry(g: Partial<ReturnType<typeof geometry>>) {
    if (active.value)
      commit(
        setAttributes(doc.value, [
          { node: active.value, attrs: geometryAttributes(active.value, g) },
        ]),
      );
  }
  function add(tag: string) {
    const next = insertXml(
      doc.value,
      sectionFor(tag),
      elementXml(
        tag,
        Math.round(doc.value.width * 0.1),
        Math.round(doc.value.height * 0.2),
      ),
    );
    commit(next);
    selected.value = [
      doc.value.elements
        .filter((n) => n.tag === tag && !n.attrs.variable)
        .at(-1)!.id,
    ];
  }
  function remove() {
    commit(
      deleteNodes(
        doc.value,
        withGridColumns(selected.value, doc.value.elements),
      ),
      [],
    );
  }
  function changeText(value: string) {
    if (active.value) commit(setText(doc.value, active.value, value));
  }
  function duplicate(slot?: number, offset = 24) {
    const ids = withGridColumns(selected.value, doc.value.elements);
    const modified = parseRbs(
      setAttributes(
        doc.value,
        doc.value.elements
          .filter((n) => ids.includes(n.id))
          .map((node) => {
            const g = geometry(node);
            return {
              node,
              attrs: {
                ...(node.tag === "datagrid" && node.attrs.variable
                  ? {}
                  : geometryAttributes(node, {
                      x: g.x + (slot === undefined ? offset : 0),
                      y: g.y + offset,
                    })),
                ...(slot === undefined ? {} : { nr: slot }),
              },
            };
          }),
      ),
    );
    const snippets = modified.elements
      .filter((n) => ids.includes(n.id))
      .map((n) => ({
        section: n.parent!.tag,
        xml: modified.source.slice(n.start, n.end),
      }));
    let next = source.value;
    for (const s of snippets)
      next = insertXml(parseRbs(next), s.section, s.xml);
    commit(next, []);
  }
  function align(mode: "left" | "top" | "center" | "distribute") {
    const nodes = doc.value.elements.filter((n) =>
      selected.value.includes(n.id),
    );
    if (nodes.length < 2) return;
    const sorted = [...nodes].sort((a, b) => geometry(a).y - geometry(b).y),
      first = geometry(sorted[0]!),
      last = geometry(sorted.at(-1)!);
    const minX = Math.min(...nodes.map((n) => geometry(n).x)),
      minY = Math.min(...nodes.map((n) => geometry(n).y));
    commit(
      setAttributes(
        doc.value,
        nodes.map((node) => ({
          node,
          attrs: geometryAttributes(
            node,
            mode === "left"
              ? { x: minX }
              : mode === "top"
                ? { y: minY }
                : mode === "center"
                  ? {
                      x: Math.round(
                        (doc.value.width -
                          layoutGeometry(node, doc.value).width) /
                          2,
                      ),
                    }
                  : {
                      y: Math.round(
                        first.y +
                          ((last.y - first.y) * sorted.indexOf(node)) /
                            (nodes.length - 1),
                      ),
                    },
          ),
        })),
      ),
    );
  }
  async function mayDiscard() {
    return (
      !dirty.value ||
      (isTauri()
        ? await invoke<boolean>("confirm_discard")
        : window.confirm("Ungespeicherte Änderungen verwerfen?"))
    );
  }
  function load(data: Opened) {
    parseRbs(data.source);
    source.value = data.source;
    savedSource.value = data.source;
    path.value = data.path;
    encoding.value = data.encoding;
    fileHash.value = data.hash;
    assets.value = data.assets;
    assetWarnings.value = data.warnings;
    selected.value = [];
    history.value = [];
    future.value = [];
    sim.running = false;
    error.value = "";
    notice.value =
      "Rennbildschirm geladen. Original bleibt bis zum Speichern unverändert.";
    canRecover.value = false;
  }
  async function open(filePath?: string) {
    if (busy.value || !(await mayDiscard())) return;
    if (!isTauri()) {
      document.getElementById("browser-file")?.click();
      return;
    }
    busy.value = true;
    try {
      const data = await invoke<Opened | null>("open_document", {
        path: filePath ?? null,
      });
      if (data) load(data);
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }
  async function browserFile(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const header = new TextDecoder().decode(bytes.slice(0, 200));
      const latin = /iso-8859-1|windows-1252/i.test(header);
      const text = latin
        ? Array.from(bytes, (b) => String.fromCharCode(b)).join("")
        : new TextDecoder().decode(bytes);
      load({
        path: file.name,
        source: text,
        encoding: latin ? "latin1" : "utf-8",
        hash: "",
        assets: {},
        warnings: [
          "Browser-Vorschau: Bilddateien und native Sicherungen sind in der Windows-App verfügbar.",
        ],
      });
    } catch (e) {
      error.value = String(e);
    }
  }
  async function save(copy = false) {
    if (busy.value) return;
    try {
      parseRbs(source.value);
      if (!isTauri()) {
        const xml = source.value.replace(
          /encoding\s*=\s*["'][^"']+["']/,
          'encoding="utf-8"',
        );
        const a = document.createElement("a");
        a.href = URL.createObjectURL(
          new Blob([xml], { type: "application/xml" }),
        );
        a.download = "Rennen.xml";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        savedSource.value = source.value;
        notice.value = "XML-Kopie heruntergeladen (UTF-8).";
        return;
      }
      busy.value = true;
      let target = path.value;
      if (copy || !target) {
        const chosen = await invoke<string | null>("choose_save_path", {
          suggested: target || "Rennen.xml",
        });
        if (!chosen) return;
        target = chosen;
      }
      const snapshot = source.value;
      const result = await invoke<{
        path: string;
        hash: string;
        backup: string | null;
        encoding: string;
      }>("save_document", {
        request: {
          path: target,
          source: snapshot,
          encoding: encoding.value,
          expectedHash:
            target.toLowerCase() === path.value.toLowerCase()
              ? fileHash.value
              : null,
          sourcePath: path.value || null,
        },
      });
      path.value = result.path;
      encoding.value = result.encoding;
      fileHash.value = result.hash;
      savedSource.value = snapshot;
      notice.value = result.backup
        ? "Gespeichert. Die vorherige Datei wurde als .bak gesichert."
        : "Gespeichert.";
      error.value = "";
      canRecover.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }
  async function newDocument(
    kind: "blank" | "race",
    width: number,
    height: number,
    slots: number,
  ) {
    if (busy.value || !(await mayDiscard())) return false;
    const next = createTemplate(kind, width, height, slots);
    parseRbs(next);
    source.value = next;
    savedSource.value = "";
    path.value = "";
    encoding.value = "latin1";
    fileHash.value = null;
    assets.value = {};
    assetWarnings.value = [];
    selected.value = [];
    history.value = [];
    future.value = [];
    error.value = "";
    canRecover.value = false;
    return true;
  }
  async function refreshLibrary(choose = false) {
    if (!isTauri()) {
      notice.value =
        "Die lokale RBS-Bibliothek steht in der Windows-App zur Verfügung.";
      return;
    }
    libraryBusy.value = true;
    try {
      if (choose) {
        const root = await invoke<string | null>("choose_library");
        if (!root) return;
        libraryRoot.value = root;
      }
      library.value = await invoke<LibraryEntry[]>("list_library", {
        root: libraryRoot.value || null,
      });
    } catch (e) {
      error.value = String(e);
    } finally {
      libraryBusy.value = false;
    }
  }
  async function refreshAssets() {
    if (path.value && isTauri()) {
      try {
        const [images, warnings] = await invoke<
          [Record<string, string>, string[]]
        >("load_assets", { path: path.value, source: source.value });
        assets.value = images;
        assetWarnings.value = warnings;
      } catch (e) {
        error.value = String(e);
      }
    }
  }
  async function importImage(background = false) {
    if (!isTauri()) {
      notice.value = "Bilder hinzufügen ist in der Windows-App verfügbar.";
      return;
    }
    try {
      const name = await invoke<string | null>("import_image", {
        documentPath: path.value || null,
      });
      if (!name) return;
      if (background) update({ bimage: name }, [doc.value.base.id]);
      else if (active.value)
        update({
          [active.value.tag === "symbole_einaus" ? "symbolname" : "file"]: name,
        });
      await refreshAssets();
    } catch (e) {
      error.value = String(e);
    }
  }
  async function restore() {
    if (!recovery) return;
    try {
      parseRbs(recovery.source);
      source.value = recovery.source;
      savedSource.value = recovery.savedSource;
      path.value = recovery.path;
      encoding.value = recovery.encoding;
      fileHash.value = recovery.hash;
      history.value = [];
      future.value = [];
      selected.value = [];
      canRecover.value = false;
      await refreshAssets();
      notice.value = "Letzten ungespeicherten Stand wiederhergestellt.";
    } catch (e) {
      error.value = String(e);
    }
  }
  function dismissRecovery() {
    canRecover.value = false;
    recovery = undefined;
    localStorage.removeItem(recoveryKey);
  }
  async function installCloseGuard() {
    if (isTauri())
      return getCurrentWindow().onCloseRequested(async (event) => {
        if (dirty.value || busy.value) {
          event.preventDefault();
          if (!busy.value && (await mayDiscard()))
            await getCurrentWindow().destroy();
        }
      });
  }
  return {
    source,
    doc,
    selected,
    assets,
    assetWarnings,
    busy,
    notice,
    error,
    history,
    future,
    library,
    libraryBusy,
    sim,
    dirty,
    active,
    title,
    path,
    encoding,
    canRecover,
    commit,
    undo,
    redo,
    update,
    move,
    updateGeometry,
    add,
    remove,
    changeText,
    duplicate,
    align,
    open,
    browserFile,
    save,
    newDocument,
    refreshLibrary,
    refreshAssets,
    importImage,
    restore,
    dismissRecovery,
    installCloseGuard,
  };
}
export type Editor = ReturnType<typeof useEditor>;
