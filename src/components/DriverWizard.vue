<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ChevronLeft, ChevronRight, Plus, X } from "@lucide/vue";
import RbsCanvas from "./RbsCanvas.vue";
import { label } from "../core/catalog";
import { createSimulation } from "../core/simulator";
import { parseRbs, type RbsDocument } from "../core/xml";
import {
  driverArea,
  driverBounds,
  driverElements,
  resizeDrivers,
  suggestDriverGroups,
  type DriverArea,
  type DriverRect,
} from "../core/driver-layout";

const props = defineProps<{
  doc: RbsDocument;
  assets: Record<string, string>;
  selected: number[];
}>();
const emit = defineEmits<{ close: []; apply: [source: string] }>();
const dialog = ref<HTMLDialogElement>();
const viewport = ref<HTMLElement>();
const stage = ref<"selection" | "layout">("selection");
const zoom = ref(0);
const count = ref(props.doc.slots);
const guides = ref(false);
const useExamples = ref(true);
const activeArea = ref(0);
const activeSlot = ref(1);
const imageSizes = ref<Record<string, { width: number; height: number }>>({});
const elements = computed(() => driverElements(props.doc, imageSizes.value));
const sim = createSimulation();

function createArea(preselected: number[], excluded: Set<number>) {
  const available = elements.value.filter((el) => !excluded.has(el.node.id));
  const slots = [...new Set(available.map((el) => el.slot))]
    .filter((slot) => slot > 0 && slot <= props.doc.slots)
    .sort((a, b) => a - b);
  const chosen = available.find(
    (el) => preselected.includes(el.node.id) && slots.includes(el.slot),
  )?.slot;
  let best: { area: DriverArea; score: number } | undefined;
  for (const reference of chosen ? [chosen] : slots.length ? slots : [1]) {
    const groups = suggestDriverGroups(
      elements.value,
      props.doc.slots,
      reference,
      preselected,
      excluded,
    );
    const score = Object.values(groups).reduce(
      (total, group) => total + group.length,
      0,
    );
    if (!best || score > best.score)
      best = { area: driverArea(elements.value, reference, groups), score };
  }
  return best!.area;
}

const areas = ref<DriverArea[]>([createArea(props.selected, new Set())]);
const area = computed(() => areas.value[activeArea.value]!);
activeSlot.value = area.value.reference;
const excluded = computed(
  () =>
    new Set(
      areas.value.flatMap((a, i) =>
        i === activeArea.value ? [] : Object.values(a.groups).flat(),
      ),
    ),
);
const choices = computed(() => {
  const otherSlots = new Set(
    Object.entries(area.value.groups).flatMap(([slot, ids]) =>
      Number(slot) === activeSlot.value ? [] : ids,
    ),
  );
  return elements.value.filter(
    (el) =>
      (el.slot === activeSlot.value || el.slot === 0) &&
      !excluded.value.has(el.node.id) &&
      !otherSlots.has(el.node.id),
  );
});
const picked = computed(() => area.value.groups[activeSlot.value] ?? []);
const selectionBounds = computed(() =>
  areas.value.flatMap((a, i) =>
    Object.entries(a.groups).flatMap(([slot, ids]) => {
      const box = driverBounds(
        elements.value
          .filter((el) => ids.includes(el.node.id))
          .map((el) => el.box),
      );
      return box ? [{ box, slot: Number(slot), area: i }] : [];
    }),
  ),
);
const ready = computed(() =>
  areas.value.every((a) => a.groups[a.reference]?.length),
);
type Draft = ReturnType<typeof resizeDrivers> & { doc: RbsDocument };
const result = computed<(Partial<Draft> & { error: string }) | undefined>(
  () => {
    if (stage.value !== "layout" || !ready.value) return;
    try {
      const candidate = resizeDrivers(
        props.doc,
        elements.value,
        areas.value,
        count.value,
      );
      return { ...candidate, doc: parseRbs(candidate.source), error: "" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  },
);
const previewDoc = computed(() => result.value?.doc ?? props.doc);
const previewSim = computed(() => ({
  ...sim,
  enabled: stage.value === "layout" && useExamples.value,
  activeSlots: previewDoc.value.slots,
}));
const toolLabel = (el: (typeof elements.value)[number]) =>
  el.attrs.text ||
  el.attrs.addonvariablename ||
  el.attrs.symboladdonname ||
  el.attrs.file ||
  el.attrs.symbolname ||
  label(el.node.tag);

function showArea(index: number) {
  activeArea.value = index;
  activeSlot.value = area.value.reference;
}

function addArea() {
  const used = new Set(
    areas.value.flatMap((a) => Object.values(a.groups).flat()),
  );
  for (const a of areas.value) if (a.fill === "screen") a.fill = "area";
  areas.value.push(createArea([], used));
  showArea(areas.value.length - 1);
}

function removeArea() {
  areas.value.splice(activeArea.value, 1);
  showArea(Math.min(activeArea.value, areas.value.length - 1));
}

function updateSelection(ids: number[]) {
  const { reference } = area.value;
  if (activeSlot.value === reference && ids.length) {
    areas.value[activeArea.value] = driverArea(
      elements.value,
      reference,
      suggestDriverGroups(
        elements.value,
        props.doc.slots,
        reference,
        ids,
        excluded.value,
      ),
    );
  } else area.value.groups[activeSlot.value] = ids;
}

function toggle(id: number) {
  updateSelection(
    picked.value.includes(id)
      ? picked.value.filter((value) => value !== id)
      : [...picked.value, id],
  );
}

function useAsReference() {
  const ids = picked.value;
  if (!ids.length) return;
  area.value.reference = activeSlot.value;
  updateSelection(ids);
}

const drag = ref<{
  x: number;
  y: number;
  endX: number;
  endY: number;
  additive: boolean;
}>();
const marquee = computed<DriverRect | undefined>(
  () =>
    drag.value && {
      x: Math.min(drag.value.x, drag.value.endX),
      y: Math.min(drag.value.y, drag.value.endY),
      width: Math.abs(drag.value.endX - drag.value.x),
      height: Math.abs(drag.value.endY - drag.value.y),
    },
);

function point(event: PointerEvent) {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * props.doc.width) / rect.width,
    y: ((event.clientY - rect.top) * props.doc.height) / rect.height,
  };
}

function start(event: PointerEvent) {
  if (event.button !== 0) return;
  const { x, y } = point(event);
  drag.value = {
    x,
    y,
    endX: x,
    endY: y,
    additive: event.shiftKey || event.ctrlKey,
  };
  (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag.value) return;
  const { x, y } = point(event);
  drag.value.endX = x;
  drag.value.endY = y;
}
function finish(event: PointerEvent) {
  if (!drag.value) return;
  move(event);
  const region = marquee.value!;
  const additive = drag.value.additive;
  drag.value = undefined;
  if (Math.max(region.width, region.height) * zoom.value < 5) {
    const { x, y } = point(event);
    const hit = [...choices.value]
      .reverse()
      .find(
        ({ box }) =>
          x >= box.x &&
          x <= box.x + box.width &&
          y >= box.y &&
          y <= box.y + box.height,
      );
    if (hit) toggle(hit.node.id);
    return;
  }
  const ids = choices.value
    .filter(
      ({ box }) =>
        box.x >= region.x &&
        box.y >= region.y &&
        box.x + box.width <= region.x + region.width &&
        box.y + box.height <= region.y + region.height,
    )
    .map((el) => el.node.id);
  updateSelection(additive ? [...new Set([...picked.value, ...ids])] : ids);
}

let observer: ResizeObserver | undefined;
onMounted(() => {
  dialog.value?.showModal();
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    zoom.value = Math.min(
      entry.contentRect.width / props.doc.width,
      entry.contentRect.height / props.doc.height,
    );
  });
  if (viewport.value) observer.observe(viewport.value);
  for (const [key, src] of Object.entries(props.assets)) {
    const image = new Image();
    image.onload = () => {
      imageSizes.value[key] = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    };
    image.src = src;
  }
});
onUnmounted(() => observer?.disconnect());

function setNumber(
  event: Event,
  current: number,
  min: number,
  max: number,
  save: (value: number) => void,
) {
  const input = event.target as HTMLInputElement;
  const value = Math.min(max, Math.max(min, Math.round(input.valueAsNumber)));
  if (Number.isFinite(value)) save(value);
  if (event.type === "change")
    input.value = String(Number.isFinite(value) ? value : current);
}

function apply() {
  if (result.value?.source !== undefined) emit("apply", result.value.source);
}
</script>

<template>
  <dialog
    ref="dialog"
    class="modal driver-wizard"
    aria-labelledby="driver-wizard-title"
    @cancel.prevent="emit('close')"
  >
    <header class="modal-heading">
      <h2 id="driver-wizard-title">Fahrerplätze anpassen</h2>
      <button
        autofocus
        type="button"
        aria-label="Assistent schließen"
        @click="emit('close')"
      >
        <X :size="19" />
      </button>
    </header>
    <div class="wizard-body">
      <aside class="wizard-settings">
        <div v-if="stage === 'selection'" class="wizard-section">
          <h3>Fahrerbereiche</h3>
          <p>
            Markiere auf dem Rennbildschirm die Elemente eines Fahrerplatzes.
            Der Assistent sucht in den anderen Spuren nach passenden Elementen.
          </p>
          <div class="wizard-area-list" aria-label="Fahrerbereiche">
            <button
              v-for="(a, index) in areas"
              :key="index"
              :class="{ active: activeArea === index }"
              :aria-pressed="activeArea === index"
              @click="showArea(index)"
            >
              Bereich {{ index + 1 }}
            </button>
            <button
              aria-label="Bereich hinzufügen"
              title="Bereich hinzufügen"
              @click="addArea"
            >
              <Plus :size="15" />
            </button>
          </div>
          <div class="wizard-control-row">
            <label
              >Zuordnung prüfen
              <select v-model.number="activeSlot">
                <option v-for="slot in doc.slots" :key="slot" :value="slot">
                  Fahrer {{ slot }} ·
                  {{ area.groups[slot]?.length ?? 0 }} Elemente{{
                    slot === area.reference ? " (Vorlage)" : ""
                  }}
                </option>
              </select>
            </label>
            <button
              v-if="areas.length > 1"
              title="Bereich entfernen"
              aria-label="Bereich entfernen"
              @click="removeArea"
            >
              <X :size="15" />
            </button>
          </div>
          <button
            v-if="activeSlot !== area.reference"
            :disabled="!picked.length"
            @click="useAsReference"
          >
            Als Vorlage verwenden
          </button>
          <p v-if="activeSlot === area.reference">
            Ein Klick schaltet ein Element um. Ziehe einen Rahmen, um mehrere zu
            markieren. Mit Umschalt ergänzt du die Auswahl.
          </p>
          <p v-else>
            Hier kannst du die Zuordnung für diesen Fahrer korrigieren.
          </p>
          <details>
            <summary>Elemente auswählen ({{ picked.length }})</summary>
            <div class="wizard-elements">
              <label
                v-for="el in choices"
                :key="el.node.id"
                class="wizard-check"
              >
                <input
                  type="checkbox"
                  :checked="picked.includes(el.node.id)"
                  @change="toggle(el.node.id)"
                />
                <span :title="toolLabel(el)"
                  >{{ toolLabel(el) }}
                  <small
                    >({{ Math.round(el.box.x) }},
                    {{ Math.round(el.box.y) }})</small
                  ></span
                >
              </label>
            </div>
          </details>
          <p v-if="!ready" class="wizard-warning">
            Markiere für jeden Bereich mindestens ein Vorlagenelement.
          </p>
        </div>
        <div v-else class="wizard-section">
          <h3>Anordnung</h3>
          <label
            >Fahrerzahl
            <select v-model.number="count">
              <option v-for="n in 8" :key="n" :value="n">{{ n }} Fahrer</option>
            </select>
          </label>
          <div
            v-if="areas.length > 1"
            class="wizard-area-list"
            aria-label="Fahrerbereiche"
          >
            <button
              v-for="(a, index) in areas"
              :key="index"
              :aria-pressed="activeArea === index"
              :class="{ active: activeArea === index }"
              @click="showArea(index)"
            >
              Bereich {{ index + 1 }}
            </button>
          </div>
          <label
            >Fläche
            <select v-model="area.fill">
              <option value="area">Bisherigen Fahrerbereich ausfüllen</option>
              <option value="screen" :disabled="areas.length > 1">
                Ganzen Rennbildschirm ausfüllen
              </option>
              <option value="compact">Kompakt anordnen</option>
            </select>
          </label>
          <label
            >Spalten
            <select v-model.number="area.columns">
              <option v-for="n in 8" :key="n" :value="n">
                {{ n }}{{ n === 1 ? " · Untereinander" : "" }}
              </option>
            </select>
          </label>
          <label v-if="area.columns > 1 && area.columns < count"
            >Reihenfolge
            <select v-model="area.order">
              <option value="rows">Zeilenweise</option>
              <option value="columns">Spaltenweise</option>
            </select>
          </label>
          <div class="wizard-fields">
            <label
              >Horizontaler Abstand (px)
              <input
                type="number"
                min="0"
                :max="doc.width"
                :value="area.gapX"
                @input="
                  setNumber(
                    $event,
                    area.gapX,
                    0,
                    doc.width,
                    (value) => (area.gapX = value),
                  )
                "
                @change="
                  setNumber(
                    $event,
                    area.gapX,
                    0,
                    doc.width,
                    (value) => (area.gapX = value),
                  )
                "
              />
            </label>
            <label
              >Vertikaler Abstand (px)
              <input
                type="number"
                min="0"
                :max="doc.height"
                :value="area.gapY"
                @input="
                  setNumber(
                    $event,
                    area.gapY,
                    0,
                    doc.height,
                    (value) => (area.gapY = value),
                  )
                "
                @change="
                  setNumber(
                    $event,
                    area.gapY,
                    0,
                    doc.height,
                    (value) => (area.gapY = value),
                  )
                "
              />
            </label>
          </div>
          <label v-if="area.fill === 'screen'"
            >Außenrand (px)
            <input
              type="number"
              min="0"
              :max="Math.floor(Math.min(doc.width, doc.height) / 2)"
              :value="area.margin"
              @input="
                setNumber(
                  $event,
                  area.margin,
                  0,
                  Math.floor(Math.min(doc.width, doc.height) / 2),
                  (value) => (area.margin = value),
                )
              "
              @change="
                setNumber(
                  $event,
                  area.margin,
                  0,
                  Math.floor(Math.min(doc.width, doc.height) / 2),
                  (value) => (area.margin = value),
                )
              "
            />
          </label>
          <label class="wizard-check"
            ><input v-model="guides" type="checkbox" /> Platzgrenzen
            anzeigen</label
          >
          <label class="wizard-check"
            ><input v-model="useExamples" type="checkbox" /> Beispieldaten
            anzeigen</label
          >
          <div
            v-if="
              result?.error || result?.unassigned || result?.shortAreas?.length
            "
            class="wizard-warning"
            role="status"
          >
            <p v-if="result?.error">{{ result.error }}</p>
            <p v-if="result?.unassigned">
              {{ result.unassigned }} Elemente mit höherer Fahrernummer liegen
              außerhalb der Auswahl. Prüfe die Fahrerbereiche.
            </p>
            <p v-if="result?.shortAreas?.length">
              Abweichende Elementanzahl in Bereich
              {{ result.shortAreas.join(", ") }}. Prüfe bei Bedarf die
              Zuordnungen.
            </p>
          </div>
        </div>
      </aside>
      <section class="wizard-preview" aria-label="Fahrerplatz-Vorschau">
        <h3>
          {{ stage === "selection" ? "Elemente markieren" : "Live-Vorschau" }}
        </h3>
        <div ref="viewport" class="wizard-viewport">
          <div
            v-if="zoom > 0"
            class="wizard-artboard"
            :style="{
              width: doc.width * zoom + 'px',
              height: doc.height * zoom + 'px',
            }"
          >
            <RbsCanvas
              :doc="previewDoc"
              :sim="previewSim"
              :assets="assets"
              :zoom="zoom"
              :selected="[]"
              :grid="false"
              :snap="false"
              :busy="false"
              preview
              embedded
            />
            <svg
              v-if="stage === 'selection' || guides"
              :viewBox="`0 0 ${doc.width} ${doc.height}`"
              class="wizard-overlay"
              :class="{ 'wizard-marking': stage === 'selection' }"
              aria-hidden="true"
              @pointerdown="start"
              @pointermove="move"
              @pointerup="finish"
              @pointercancel="drag = undefined"
            >
              <template v-if="stage === 'selection'">
                <rect
                  v-for="entry in selectionBounds"
                  :key="`${entry.area}-${entry.slot}`"
                  v-bind="entry.box"
                  :class="{
                    'active-box':
                      entry.area === activeArea && entry.slot === activeSlot,
                  }"
                />
                <rect
                  v-for="el in choices.filter((el) =>
                    picked.includes(el.node.id),
                  )"
                  :key="el.node.id"
                  v-bind="el.box"
                  class="picked-box"
                />
                <rect v-if="marquee" v-bind="marquee" class="marquee" />
              </template>
              <template v-else>
                <g v-for="(cells, index) in result?.cells" :key="index">
                  <g v-for="(box, i) in cells" :key="i">
                    <rect
                      v-bind="box"
                      :class="{ 'active-box': activeArea === index }"
                    />
                    <text
                      :x="box.x + 5 / zoom"
                      :y="box.y + 14 / zoom"
                      :font-size="12 / zoom"
                    >
                      {{ i + 1 }}
                    </text>
                  </g>
                </g>
              </template>
            </svg>
          </div>
        </div>
      </section>
    </div>
    <footer class="modal-footer">
      <button
        v-if="stage === 'layout'"
        class="wizard-back"
        @click="stage = 'selection'"
      >
        <ChevronLeft :size="15" /> Fahrerbereiche
      </button>
      <button @click="emit('close')">Abbrechen</button>
      <button
        v-if="stage === 'selection'"
        class="primary"
        :disabled="!ready"
        @click="stage = 'layout'"
      >
        Anordnung <ChevronRight :size="15" />
      </button>
      <button
        v-else
        class="primary"
        :disabled="!result?.doc || result.source === doc.source"
        @click="apply"
      >
        Übernehmen
      </button>
    </footer>
  </dialog>
</template>

<style scoped>
.driver-wizard {
  width: min(1320px, calc(100vw - 38px));
  height: min(830px, calc(100vh - 38px));
  max-height: none;
  margin: auto;
  padding: 18px 22px;
  color: #dce2e8;
}

.driver-wizard[open] {
  display: flex;
  flex-direction: column;
}

.driver-wizard::backdrop {
  background: #06090dbb;
  backdrop-filter: blur(5px);
}
.modal-heading {
  margin-bottom: 14px;
}
.modal-heading h2 {
  margin: 0;
}
.wizard-body {
  display: grid;
  grid-template-columns: minmax(235px, 300px) minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  flex: 1;
}
.wizard-settings {
  overflow: auto;
  padding: 1px 8px 2px 0;
}
.wizard-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
h3 {
  margin: 0;
  font-size: 15px;
  color: #eef3f8;
}
p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}
.wizard-area-list {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.wizard-area-list button {
  padding: 6px 9px;
}
label {
  display: grid;
  gap: 5px;
  color: #c1cbd8;
  font-size: 12px;
}
.wizard-control-row {
  display: flex;
  align-items: end;
  gap: 6px;
}
.wizard-control-row label {
  flex: 1;
}
.wizard-control-row button {
  height: 33px;
}
.wizard-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
select,
input[type="number"] {
  width: 100%;
  min-width: 0;
}
.wizard-check {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wizard-check input {
  flex: none;
  width: auto;
  margin: 0;
}
.wizard-check span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wizard-check small {
  color: #a4b0bf;
}
.wizard-elements {
  display: grid;
  gap: 6px;
  max-height: 220px;
  padding: 8px 0 2px;
  overflow: auto;
}
summary {
  cursor: pointer;
  font-size: 12px;
}
.wizard-warning {
  border: 1px solid #8a6836;
  background: #402e22;
  border-radius: 6px;
  padding: 8px;
  color: #ffdfab;
}
.wizard-warning p + p {
  margin-top: 5px;
}
.wizard-preview {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #111823;
}
.wizard-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
}
.wizard-artboard {
  position: relative;
}
.wizard-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.wizard-marking {
  pointer-events: auto;
  cursor: crosshair;
  touch-action: none;
}
.wizard-overlay rect {
  fill: #4ca6ff0a;
  stroke: #a1bad2;
  stroke-dasharray: 5 4;
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
.wizard-overlay rect.active-box,
.wizard-overlay rect.marquee {
  fill: #60ccfb26;
  stroke: #85e5ff;
  stroke-width: 2px;
  stroke-dasharray: none;
}
.wizard-overlay rect.picked-box {
  fill: #60ccfb19;
  stroke: #85e5ff;
  stroke-dasharray: none;
}
.wizard-overlay text {
  fill: #fff;
  stroke: #172536;
  stroke-width: 3px;
  vector-effect: non-scaling-stroke;
  paint-order: stroke;
  font-weight: bold;
}
.modal-footer {
  margin-top: 14px;
  padding-top: 12px;
}
.wizard-back {
  margin-right: auto;
}
</style>
