<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  reactive,
  watch,
} from "vue";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { systemPalette } from "./core/xml";
import {
  FolderOpen,
  Save,
  Plus,
  Undo2,
  Redo2,
  MousePointer2,
  Grid2X2,
  Magnet,
  Scan,
  Minus,
  Play,
  Pause,
  RotateCcw,
  Flag,
  Layers,
  Library,
  Shapes,
  Search,
  ChevronRight,
  ChevronDown,
  FileCode2,
  Monitor,
  X,
  Check,
  Copy,
  AlignStartVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  BetweenHorizontalStart,
  AlertTriangle,
  Folder,
  CircleHelp,
  SlidersHorizontal,
  Fuel,
  Gauge,
  ArrowUpRight,
} from "@lucide/vue";
import RbsCanvas from "./components/RbsCanvas.vue";
import Inspector from "./components/Inspector.vue";
import RuntimePanel from "./components/RuntimePanel.vue";
import { useEditor } from "./core/editor";
import { catalog, label } from "./core/catalog";
import {
  geometry,
  shapeTags,
  imageTags,
  barTags,
  parseRbs,
  slotColors,
} from "./core/xml";
import {
  tick,
  resetSimulation,
  timeText,
  simulatedTags,
} from "./core/simulator";
const e = reactive(useEditor()),
  canvas = ref<InstanceType<typeof RbsCanvas>>();
const tab = ref<"layers" | "elements" | "library">("layers"),
  search = ref(""),
  zoom = ref(0.5),
  grid = ref(false),
  snap = ref(true),
  preview = ref(false),
  simPanel = ref(false);
const modal = ref<"new" | "xml" | "repeat" | "help" | "issues" | null>(null),
  xmlDraft = ref(""),
  xmlError = ref(""),
  newKind = ref<"race" | "blank">("race"),
  newWidth = ref(1920),
  newHeight = ref(1080),
  newSlots = ref(6),
  repeatSlot = ref(2),
  repeatOffset = ref(118);
const categories = [...new Set(catalog.map((c) => c[2]))];
const visibleElements = computed(() =>
  [...e.doc.elements]
    .reverse()
    .filter((n) =>
      `${label(n.tag)} ${n.attrs.text ?? n.text} ${n.attrs.addonvariablename ?? ""} ${n.attrs.nr ?? ""}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
    ),
);
const filteredLibrary = computed(() =>
  e.library.filter((n) =>
    n.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const groups = computed(() =>
  categories
    .map((category) => ({
      category,
      items: catalog.filter(
        (c) =>
          c[2] === category &&
          `${c[0]} ${c[1]}`.toLowerCase().includes(search.value.toLowerCase()),
      ),
    }))
    .filter((g) => g.items.length),
);
const issues = computed(() => {
  const result = [...e.assetWarnings],
    names = new Map<string, number>();
  for (const n of e.doc.elements) {
    const g = geometry(n);
    if (g.x < 0 || g.y < 0 || g.x > e.doc.width || g.y > e.doc.height)
      result.push(
        `${label(n.tag)} (Spur ${n.attrs.nr || 0}) liegt außerhalb der Arbeitsfläche.`,
      );
    if (n.attrs.addonvariablename)
      names.set(
        n.attrs.addonvariablename,
        (names.get(n.attrs.addonvariablename) || 0) + 1,
      );
  }
  for (const [name, count] of names)
    if (count > 1)
      result.push(
        `AddOn-Name „${name}“ wird ${count}× verwendet. Prüfe, ob dies beabsichtigt ist.`,
      );
  const unknown = [
    ...new Set(
      e.doc.elements
        .filter(
          (n) =>
            !shapeTags.has(n.tag) &&
            !imageTags.has(n.tag) &&
            !barTags.has(n.tag) &&
            !n.tag.startsWith("bild") &&
            !simulatedTags.has(n.tag),
        )
        .map((n) => n.tag),
    ),
  ];
  if (unknown.length)
    result.push(
      `Ohne Simulatormodell (Original-Vorschautext bleibt sichtbar): ${unknown.join(", ")}.`,
    );
  return result;
});
function select(id: number, event?: MouseEvent) {
  if (event?.shiftKey || event?.ctrlKey)
    e.selected = e.selected.includes(id)
      ? e.selected.filter((n) => n !== id)
      : [...e.selected, id];
  else e.selected = [id];
}
function switchTab(next: typeof tab.value) {
  tab.value = next;
  search.value = "";
  if (next === "library" && !e.library.length) e.refreshLibrary();
}
function openXml() {
  xmlDraft.value = e.source;
  xmlError.value = "";
  modal.value = "xml";
}
function applyXml() {
  try {
    const normalized = xmlDraft.value.replaceAll("\r\n", "\n");
    const next =
      normalized === e.source.replaceAll("\r\n", "\n")
        ? e.source
        : e.source.includes("\r\n")
          ? normalized.replaceAll("\n", "\r\n")
          : normalized;
    parseRbs(next);
    e.commit(next, []);
    modal.value = null;
    e.refreshAssets();
  } catch (err) {
    xmlError.value = String(err);
  }
}
async function createNew() {
  if (
    await e.newDocument(
      newKind.value,
      newWidth.value,
      newHeight.value,
      newSlots.value,
    )
  ) {
    modal.value = null;
    tab.value = "layers";
    canvas.value?.fit();
  }
}
function setResolution(event: Event) {
  const [w, h] = (event.target as HTMLSelectElement).value
    .split("x")
    .map(Number);
  newWidth.value = w!;
  newHeight.value = h!;
}
function keydown(event: KeyboardEvent) {
  const editing = (event.target as HTMLElement)?.closest(
    'input,textarea,select,[contenteditable="true"]',
  );
  if (event.key === "Escape") {
    modal.value = null;
    e.selected = [];
    preview.value = false;
    return;
  }
  if (modal.value) return;
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "s") {
    event.preventDefault();
    e.save(event.shiftKey);
    return;
  }
  if (mod && event.key.toLowerCase() === "o") {
    event.preventDefault();
    e.open();
    return;
  }
  if (editing || e.busy) return;
  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? e.redo() : e.undo();
  } else if (mod && event.key.toLowerCase() === "y") {
    event.preventDefault();
    e.redo();
  } else if (mod && event.key.toLowerCase() === "d") {
    event.preventDefault();
    e.duplicate();
  } else if (mod && event.key.toLowerCase() === "a") {
    event.preventDefault();
    e.selected = e.doc.elements.map((n) => n.id);
  } else if (event.key === "Delete") {
    event.preventDefault();
    e.remove();
  } else if (event.key.startsWith("Arrow") && e.selected.length) {
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    e.move(
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
    );
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (e.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
}
let timer: ReturnType<typeof setInterval>, unlisten: (() => void) | undefined;
onMounted(async () => {
  if (isTauri())
    try {
      systemPalette.value = await invoke<string[]>("system_palette");
    } catch {}
  window.addEventListener("keydown", keydown);
  window.addEventListener("beforeunload", beforeUnload);
  timer = setInterval(() => tick(e.sim, 0.1), 100);
  unlisten = await e.installCloseGuard();
});
onUnmounted(() => {
  window.removeEventListener("keydown", keydown);
  window.removeEventListener("beforeunload", beforeUnload);
  clearInterval(timer);
  unlisten?.();
});
watch(
  () => e.source,
  () => {
    e.sim.symbols = {};
    e.sim.events = {};
  },
);
watch([simPanel, preview], async () => {
  await nextTick();
  canvas.value?.fit();
});
watch(
  () =>
    [
      e.doc.base.attrs.bimage,
      ...e.doc.elements
        .map((n) => n.attrs.file || n.attrs.symbolname)
        .filter(Boolean),
    ].join("|"),
  () => {
    e.refreshAssets();
  },
);
</script>
<template>
  <div class="app-shell" :class="{ 'simulation-expanded': simPanel }">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">R<span>•</span></div>
        <div>
          <strong>RBS <span>STUDIO</span></strong
          ><small>COCKPIT-XP EDITOR</small>
        </div>
        <span class="version-tag">PREVIEW 0.4.1</span>
      </div>
      <div class="document-title">
        <span class="document-dot" :class="{ dirty: e.dirty }"></span
        ><span :title="e.path || e.title">{{ e.title }}</span
        ><small>{{
          e.dirty ? "Ungespeichert" : "Gespeichert / Vorlage"
        }}</small>
      </div>
      <div class="top-actions">
        <button
          title="Neuer Rennbildschirm"
          :disabled="e.busy"
          @click="modal = 'new'"
        >
          <Plus :size="16" /> Neu</button
        ><button :disabled="e.busy" @click="e.open()">
          <FolderOpen :size="16" /> Öffnen
        </button>
        <div class="save-group">
          <button class="primary" :disabled="e.busy" @click="e.save()">
            <Save :size="15" /> Speichern</button
          ><button
            class="primary save-copy"
            title="Speichern unter · Strg Umschalt S"
            :disabled="e.busy"
            @click="e.save(true)"
          >
            <ChevronDown :size="14" />
          </button>
        </div>
      </div>
    </header>
    <div class="toolbar">
      <div class="tool-group">
        <button
          title="Rückgängig · Strg Z"
          :disabled="!e.history.length || e.busy"
          @click="e.undo()"
        >
          <Undo2 :size="17" /></button
        ><button
          title="Wiederholen · Strg Y"
          :disabled="!e.future.length || e.busy"
          @click="e.redo()"
        >
          <Redo2 :size="17" />
        </button>
      </div>
      <div class="tool-group">
        <button class="active" title="Auswählen">
          <MousePointer2 :size="16" /></button
        ><button
          :class="{ active: grid }"
          title="Raster anzeigen"
          @click="grid = !grid"
        >
          <Grid2X2 :size="16" /></button
        ><button
          :class="{ active: snap }"
          title="An 8-Pixel-Raster ausrichten · Alt zum Übergehen"
          @click="snap = !snap"
        >
          <Magnet :size="16" />
        </button>
      </div>
      <div class="tool-group">
        <button
          title="Links ausrichten"
          :disabled="e.selected.length < 2"
          @click="e.align('left')"
        >
          <AlignStartVertical :size="17" /></button
        ><button
          title="Oben ausrichten"
          :disabled="e.selected.length < 2"
          @click="e.align('top')"
        >
          <AlignStartHorizontal :size="17" /></button
        ><button
          title="Auf Bildschirm zentrieren"
          :disabled="e.selected.length < 2"
          @click="e.align('center')"
        >
          <AlignCenterHorizontal :size="17" /></button
        ><button
          title="Vertikal gleichmäßig verteilen"
          :disabled="e.selected.length < 3"
          @click="e.align('distribute')"
        >
          <BetweenHorizontalStart :size="17" />
        </button>
      </div>
      <span class="toolbar-hint">{{
        e.selected.length
          ? `${e.selected.length} Element${e.selected.length === 1 ? "" : "e"} ausgewählt`
          : "Entwerfen. Testen. Auf die Strecke."
      }}</span>
      <div class="tool-group zoom-group">
        <button title="Verkleinern" @click="zoom = Math.max(0.1, zoom - 0.1)">
          <Minus :size="15" /></button
        ><button class="zoom-label" title="Auf 100 % setzen" @click="zoom = 1">
          {{ Math.round(zoom * 100) }} %</button
        ><button title="Vergrößern" @click="zoom = Math.min(3, zoom + 0.1)">
          <Plus :size="15" /></button
        ><button title="An Arbeitsbereich anpassen" @click="canvas?.fit()">
          <Scan :size="16" />
        </button>
      </div>
      <button class="text-tool" @click="openXml()">
        <FileCode2 :size="16" /> XML</button
      ><button
        class="text-tool"
        :class="{ active: preview }"
        @click="preview = !preview"
      >
        <Monitor :size="16" /> Vorschau</button
      ><button
        class="sim-toggle"
        :class="{ active: simPanel }"
        @click="simPanel = !simPanel"
      >
        <Play :size="14" /> Simulator <span class="beta">BETA</span>
      </button>
    </div>
    <div v-if="e.error" class="message error-message" role="alert">
      <AlertTriangle :size="17" /><span>{{ e.error }}</span
      ><button title="Meldung schließen" @click="e.error = ''">
        <X :size="16" />
      </button>
    </div>
    <div v-if="e.canRecover" class="message recovery-message">
      <RotateCcw :size="17" /><span
        >Ein ungespeicherter Arbeitsstand ist vorhanden.</span
      ><button @click="e.restore()">Wiederherstellen</button
      ><button @click="e.dismissRecovery()">Verwerfen</button>
    </div>
    <main
      class="workspace"
      :class="{ 'full-preview': preview }"
      :inert="e.busy || undefined"
    >
      <aside v-show="!preview" class="left-panel panel">
        <nav class="panel-tabs">
          <button
            :class="{ active: tab === 'layers' }"
            @click="switchTab('layers')"
          >
            <Layers :size="16" /> Ebenen</button
          ><button
            :class="{ active: tab === 'elements' }"
            @click="switchTab('elements')"
          >
            <Shapes :size="16" /> Elemente</button
          ><button
            :class="{ active: tab === 'library' }"
            title="Lokale RBS-Bibliothek"
            @click="switchTab('library')"
          >
            <Library :size="16" />
          </button>
        </nav>
        <div class="search-field">
          <Search :size="14" /><input
            v-model="search"
            :placeholder="
              tab === 'library'
                ? 'Rennbildschirm suchen…'
                : tab === 'elements'
                  ? 'Element suchen…'
                  : 'Ebenen durchsuchen…'
            "
          /><kbd>⌕</kbd>
        </div>
        <div v-if="tab === 'layers'" class="layer-summary">
          <span>RENNBILDSCHIRM</span
          ><span>{{ e.doc.elements.length }} Elemente</span>
        </div>
        <div class="left-scroll">
          <template v-if="tab === 'layers'">
            <button
              v-for="node in visibleElements"
              :key="node.id"
              class="layer-row"
              :class="{ selected: e.selected.includes(node.id) }"
              :title="`${node.tag} · ${node.attrs.addonvariablename || node.attrs.text || node.text.trim()}`"
              @click="select(node.id, $event)"
            >
              <span class="layer-type">{{
                shapeTags.has(node.tag)
                  ? "□"
                  : node.tag === "text"
                    ? "T"
                    : node.tag === "bitmap"
                      ? "▧"
                      : "ƒ"
              }}</span
              ><span class="layer-text"
                ><strong>{{
                  node.attrs.addonvariablename ||
                  (node.tag === "text" ? node.attrs.text : label(node.tag))
                }}</strong
                ><small
                  >{{ node.parent?.tag
                  }}{{
                    Number(node.attrs.nr) > 0 ? ` · Spur ${node.attrs.nr}` : ""
                  }}</small
                ></span
              ><span
                v-if="Number(node.attrs.nr) > 0"
                class="slot-dot"
                :style="{
                  background: slotColors[(Number(node.attrs.nr) - 1) % 8],
                }"
              />
            </button>
            <div v-if="!visibleElements.length" class="empty-list">
              {{
                search
                  ? "Keine passenden Elemente."
                  : "Noch keine Elemente. Wähle den Reiter „Elemente“."
              }}
            </div>
          </template>
          <template v-else-if="tab === 'elements'"
            ><section
              v-for="group in groups"
              :key="group.category"
              class="catalog-section"
            >
              <h3>{{ group.category }}</h3>
              <div class="catalog-grid">
                <button
                  v-for="item in group.items"
                  :key="item[0]"
                  :aria-label="item[1]"
                  @click="e.add(item[0])"
                >
                  <span>{{
                    item[0] === "text"
                      ? "T"
                      : shapeTags.has(item[0])
                        ? "□"
                        : "ƒ"
                  }}</span
                  >{{ item[1] }}<Plus :size="12" />
                </button>
              </div></section
          ></template>
          <template v-else
            ><div class="library-intro">
              <h3>Deine RBS-Bibliothek</h3>
              <p>
                Vorhandene Bildschirme direkt aus dem Cockpit-Datenverzeichnis.
                Automatische ConvertRBS-Kopien sind ausgeblendet.
              </p>
              <button class="wide-button" @click="e.refreshLibrary(true)">
                <FolderOpen :size="14" /> Ordner wählen
              </button>
            </div>
            <div v-if="e.libraryBusy" class="empty-list">
              Bibliothek wird eingelesen…
            </div>
            <button
              v-for="entry in filteredLibrary"
              :key="entry.path"
              class="library-entry"
              @click="e.open(entry.path)"
            >
              <FileCode2 :size="18" /><span
                ><strong>{{ entry.name }}</strong
                ><small>{{ entry.category }}</small></span
              ><ChevronRight :size="13" />
            </button>
            <div
              v-if="!e.libraryBusy && !filteredLibrary.length"
              class="empty-list"
            >
              {{
                isTauri()
                  ? "Keine Rennbildschirme gefunden."
                  : "In der Windows-App kannst du deine lokale Bibliothek öffnen."
              }}
            </div></template
          >
        </div>
        <button class="left-footer" @click="modal = 'new'">
          <Plus :size="16" /><span>Neuer Rennbildschirm</span
          ><ArrowUpRight :size="14" />
        </button>
      </aside>
      <div class="center-workspace">
        <div class="canvas-topline">
          <span
            ><span class="live-dot" />
            {{ preview ? "VORSCHAU" : "DESIGN" }}</span
          ><span
            >{{ e.doc.slots }} Fahrer <i>·</i> {{ e.doc.width }} ×
            {{ e.doc.height }} <i>·</i>
            {{ e.sim.enabled ? "Beispieldaten" : "XML-Vorschautexte" }}</span
          ><button @click="e.sim.enabled = !e.sim.enabled">
            {{
              e.sim.enabled
                ? "Originaltexte anzeigen"
                : "Beispieldaten anzeigen"
            }}
          </button>
        </div>
        <RbsCanvas
          ref="canvas"
          :doc="e.doc"
          :selected="e.selected"
          :assets="e.assets"
          :sim="e.sim"
          :zoom="zoom"
          :grid="grid"
          :snap="snap"
          :busy="e.busy"
          :preview="preview"
          @select="e.selected = $event"
          @move="e.move"
          @resize="(width, height) => e.updateGeometry({ width, height })"
          @fit="zoom = $event"
        />
        <div class="canvas-bottomline">
          <span
            ><MousePointer2 :size="12" /> Ziehen zum Verschieben
            <i>·</i> Umschalt + Klick für Mehrfachauswahl</span
          ><button @click="modal = 'help'">
            <CircleHelp :size="13" /> Hilfe
          </button>
        </div>
      </div>
      <Inspector
        :sim="e.sim"
        v-show="!preview"
        :doc="e.doc"
        :node="e.active"
        :count="e.selected.length"
        :encoding="e.encoding"
        @attrs="e.update"
        @geometry="e.updateGeometry"
        @text="e.changeText"
        @base="e.update($event, [e.doc.base.id])"
        @image="e.importImage"
        @duplicate="e.duplicate()"
        @remove="e.remove()"
        @repeat="modal = 'repeat'"
      />
    </main>
    <section v-if="simPanel" class="simulator-panel">
      <div class="sim-header">
        <div>
          <Gauge :size="17" /><strong>Rennsimulation</strong
          ><span class="sim-explanation">{{
            e.sim.live
              ? "Live-Daten aus Cockpit-XP · " + e.sim.liveStatus
              : "Lokale Beispieldaten · keine Verbindung zur Bahn"
          }}</span>
        </div>
        <div class="sim-controls">
          <button
            :class="{ primary: !e.sim.running }"
            :disabled="e.sim.live"
            @click="
              e.sim.enabled = true;
              e.sim.running = !e.sim.running;
            "
          >
            <Pause v-if="e.sim.running" :size="14" /><Play v-else :size="14" />
            {{ e.sim.running ? "Pause" : "Starten" }}</button
          ><button
            title="Simulation zurücksetzen"
            :disabled="e.sim.live"
            @click="resetSimulation(e.sim)"
          >
            <RotateCcw :size="15" /></button
          ><select
            v-model.number="e.sim.speed"
            aria-label="Simulationsgeschwindigkeit"
          >
            <option :value="1">1× Tempo</option>
            <option :value="2">2× Tempo</option>
            <option :value="5">5× Tempo</option>
            <option :value="10">10× Tempo</option></select
          ><span class="sim-clock">{{ timeText(e.sim.elapsed) }}</span
          ><button title="Simulator schließen" @click="simPanel = false">
            <X :size="16" />
          </button>
        </div>
      </div>
      <div class="sim-content">
        <div class="scenario-picker">
          <span class="eyebrow">RENNPHASE</span
          ><button
            v-for="phase in ['race', 'chaos', 'safety', 'finish'] as const"
            :key="phase"
            :disabled="e.sim.live"
            :class="{ chosen: e.sim.phase === phase, [phase]: true }"
            @click="e.sim.phase = phase"
          >
            <span></span
            >{{
              {
                race: "Rennen",
                chaos: "Chaos",
                safety: "Safety Car",
                finish: "Zieleinlauf",
              }[phase]
            }}
          </button>
        </div>
        <div class="driver-cards">
          <div
            v-for="driver in e.sim.drivers.slice(0, e.doc.slots)"
            :key="driver.id"
            class="driver-card"
          >
            <div>
              <span
                class="driver-id"
                :style="{ color: slotColors[driver.id - 1] }"
                >{{ String(driver.id).padStart(2, "0") }}</span
              ><input
                v-model="driver.name"
                :aria-label="`Fahrer ${driver.id}`"
              />
            </div>
            <p>
              <strong>{{ driver.laps }}</strong> Runden
              <span>{{ driver.last.toFixed(3) }} s</span>
            </p>
            <div class="fuel-meter">
              <i
                :style="{
                  width: driver.fuel + '%',
                  background: slotColors[driver.id - 1],
                }"
              />
            </div>
            <button
              :class="{ active: driver.pit }"
              @click="
                driver.pit = !driver.pit;
                if (driver.pit) driver.stops++;
              "
            >
              <Fuel :size="12" />
              {{ driver.pit ? "Box verlassen" : "Boxenstopp" }}
              <span>{{ Math.round(driver.fuel) }} %</span>
            </button>
          </div>
        </div>
      </div>
      <div v-if="e.active?.tag === 'addonVariable'" class="addon-override">
        <label
          >AddOn-Vorschau: <code>{{ e.active.attrs.addonvariablename }}</code
          ><input
            v-model="e.sim.overrides[e.active.attrs.addonvariablename || '']"
            placeholder="Simulierter Wert für diese Variable" /></label
        ><small>Manueller Vorschauwert; übersteuert die AddOn-Ausgabe.</small>
      </div>
      <RuntimePanel :sim="e.sim" :doc="e.doc" :active="e.active" />
    </section>
    <footer class="statusbar">
      <span
        ><span class="status-dot" />
        {{ e.busy ? "Datei wird verarbeitet…" : e.notice }}</span
      >
      <div>
        <button
          v-if="issues.length"
          class="issue-button"
          @click="modal = 'issues'"
        >
          <AlertTriangle :size="12" /> {{ issues.length }} Hinweise</button
        ><span v-else><Check :size="12" /> XML gültig</span><i>·</i
        ><span>{{ isTauri() ? "Windows · Lokal" : "Browser-Vorschau" }}</span>
      </div>
    </footer>
    <input
      id="browser-file"
      type="file"
      accept=".xml"
      hidden
      @change="
        (event) => {
          const file = (event.target as HTMLInputElement).files?.[0];
          if (file) e.browserFile(file);
          (event.target as HTMLInputElement).value = '';
        }
      "
    />
    <div v-if="modal" class="modal-backdrop" @click.self="modal = null">
      <section
        class="modal"
        :class="{ 'xml-modal': modal === 'xml' }"
        role="dialog"
        aria-modal="true"
        :aria-label="
          modal === 'xml'
            ? 'XML bearbeiten'
            : modal === 'new'
              ? 'Neuer Rennbildschirm'
              : 'RBS Studio Dialog'
        "
      >
        <div class="modal-heading">
          <div>
            <span class="eyebrow">RBS STUDIO</span>
            <h2>
              {{
                {
                  new: "Neuer Rennbildschirm",
                  xml: "XML bearbeiten",
                  repeat: "Für eine weitere Spur kopieren",
                  help: "Arbeiten mit RBS Studio",
                  issues: "Prüfhinweise",
                }[modal]
              }}
            </h2>
          </div>
          <button title="Dialog schließen" @click="modal = null">
            <X :size="20" />
          </button>
        </div>
        <template v-if="modal === 'new'"
          ><p class="muted">
            Starte leer oder mit einem gestalteten Rennlayout. Alle Elemente
            bleiben einzeln bearbeitbar.
          </p>
          <div class="template-options">
            <button
              :class="{ chosen: newKind === 'race' }"
              @click="newKind = 'race'"
            >
              <div class="template-preview"><i v-for="n in 5" :key="n" /></div>
              <strong>Club Race</strong
              ><span>Modernes Rennlayout mit Fahrerzeilen</span></button
            ><button
              :class="{ chosen: newKind === 'blank' }"
              @click="newKind = 'blank'"
            >
              <div class="template-preview blank"><Plus :size="30" /></div>
              <strong>Leere Arbeitsfläche</strong
              ><span>Dein Design, von Grund auf</span>
            </button>
          </div>
          <label class="stack-label"
            >Auflösung<select @change="setResolution">
              <option value="1920x1080">Full HD · 1920 × 1080</option>
              <option value="2560x1440">QHD · 2560 × 1440</option>
              <option value="3840x2160">4K · 3840 × 2160</option>
              <option value="1280x720">HD · 1280 × 720</option>
              <option value="1024x768">Klassisch · 1024 × 768</option>
            </select></label
          >
          <div class="field-grid three">
            <label
              ><span>Breite</span
              ><input
                v-model.number="newWidth"
                type="number"
                min="1"
                max="16384" /></label
            ><label
              ><span>Höhe</span
              ><input
                v-model.number="newHeight"
                type="number"
                min="1"
                max="16384" /></label
            ><label
              ><span>Fahrer</span
              ><select v-model.number="newSlots">
                <option v-for="n in 8" :key="n">{{ n }}</option>
              </select></label
            >
          </div>
          <div class="modal-footer">
            <button @click="modal = null">Abbrechen</button
            ><button
              class="primary"
              :disabled="
                !(
                  newWidth > 0 &&
                  newWidth <= 16384 &&
                  newHeight > 0 &&
                  newHeight <= 16384
                )
              "
              @click="createNew"
            >
              <Plus :size="15" /> Rennbildschirm erstellen
            </button>
          </div></template
        >
        <template v-else-if="modal === 'xml'"
          ><p class="muted">
            Original-XML einschließlich Kommentaren und unbekannten
            Eigenschaften. Änderungen werden vor dem Übernehmen geprüft.
          </p>
          <textarea
            v-model="xmlDraft"
            class="xml-editor"
            spellcheck="false"
            aria-label="XML-Quelltext"
          ></textarea>
          <p v-if="xmlError" class="inline-error">{{ xmlError }}</p>
          <div class="modal-footer">
            <button @click="modal = null">Abbrechen</button
            ><button class="primary" @click="applyXml">
              <Check :size="15" /> Prüfen &amp; übernehmen
            </button>
          </div></template
        >
        <template v-else-if="modal === 'repeat'"
          ><p class="muted">
            Die {{ e.selected.length }} ausgewählten Elemente werden kopiert,
            vertikal versetzt und der Zielspur zugeordnet. AddOn-Namen bei
            Bedarf danach anpassen.
          </p>
          <div class="field-grid">
            <label
              ><span>Zielspur</span
              ><select v-model.number="repeatSlot">
                <option v-for="n in 8" :key="n">{{ n }}</option>
              </select></label
            ><label
              ><span>Abstand Y</span
              ><input v-model.number="repeatOffset" type="number"
            /></label>
          </div>
          <div class="modal-footer">
            <button @click="modal = null">Abbrechen</button
            ><button
              class="primary"
              @click="
                e.duplicate(repeatSlot, repeatOffset);
                modal = null;
              "
            >
              <Copy :size="15" /> Kopieren
            </button>
          </div></template
        >
        <template v-else-if="modal === 'issues'"
          ><p class="muted">
            Diese Hinweise verhindern das Speichern nicht. Nicht simulierte
            Elemente behalten ihre XML-Daten.
          </p>
          <ul class="issue-list">
            <li v-for="(issue, i) in issues" :key="i">
              <AlertTriangle :size="16" />{{ issue }}
            </li>
          </ul></template
        >
        <template v-else
          ><div class="help-content">
            <h3>Vorhandene Bildschirme</h3>
            <p>
              Öffne eine <b>Rennen.xml</b>, einen Startampel-Bildschirm oder ein
              Overlay. Die Bibliothek findet RBS in deinem Cockpit-Verzeichnis.
              Bilder werden relativ zur XML-Datei geladen.
            </p>
            <h3>Gestalten</h3>
            <p>
              Elemente auswählen und ziehen. Umschalt + Klick wählt mehrere aus.
              Pfeiltasten verschieben um 1 Pixel, mit Umschalt um 10. Formen und
              Bilder haben einen Größenanfasser unten rechts. Für Fahrerzeilen
              mehrere Elemente auswählen und „Für weitere Spur kopieren“
              verwenden.
            </p>
            <h3>Sicher speichern</h3>
            <p>
              Strg + S speichert mit einer .bak-Sicherung des vorherigen Stands.
              Strg + Umschalt + S speichert eine Kopie samt referenzierten
              Bildern. Für eine unabhängige RBS-Kopie einen neuen, leeren Ordner
              verwenden. Extern geänderte Dateien werden nicht unbemerkt
              überschrieben.
            </p>
            <h3>Vorschau und Grenzen</h3>
            <p>
              Der Simulator liefert Beispieldaten und kann Pascal-AddOns mit
              einem begrenzten Satz von Cockpit-Befehlen ausführen. Hardware und
              Dateien werden virtuell simuliert. Er ersetzt keinen Test in
              Cockpit-XP. Schriftmetriken, spezielle Variablenformate und
              Grafikoptionen können von Cockpit abweichen. Tabellen, Ereignisse,
              Balken und Datenbankbilder lassen sich im Simulator prüfen;
              Live-Daten benötigen die Cockpit-API. Unbekannte Eigenschaften
              bleiben erhalten und sind über „Alle XML-Attribute“ oder den
              XML-Editor bearbeitbar.
            </p>
            <h3>XML-Ebenen</h3>
            <p>
              Grafik, Texte und Variablen bleiben in ihren Cockpit-Sektionen.
              Ihre Reihenfolge wird beim Bearbeiten beibehalten. Die Ebenenliste
              zeigt die Vorschau-Reihenfolge von vorne nach hinten.
            </p>
          </div></template
        >
      </section>
    </div>
  </div>
</template>
