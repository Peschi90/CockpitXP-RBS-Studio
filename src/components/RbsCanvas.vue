<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, useId } from "vue";
import {
  parseRbs,
  geometry,
  inheritedAttributes,
  numeric,
  toCssColor,
  shapeTags,
  imageTags,
  barTags,
  type RbsDocument,
  type XmlNode,
} from "../core/xml";
import { displayText, driverFor, type Simulation } from "../core/simulator";
import { fieldSample, fontRequest, measureRbsText } from "../core/text-layout";
import ColorKeyImage from "./ColorKeyImage.vue";
import DataGrid from "./DataGrid.vue";
import { symbolVisible, barPercent, bindingKey } from "../core/runtime";
const props = defineProps<{
  doc: RbsDocument;
  selected: number[];
  assets: Record<string, string>;
  sim: Simulation;
  zoom: number;
  grid: boolean;
  snap: boolean;
  busy: boolean;
  preview: boolean;
  embedded?: boolean;
}>();
const emit = defineEmits<{
  select: [ids: number[]];
  move: [dx: number, dy: number];
  resize: [width: number, height: number];
  fit: [zoom: number];
}>();
const viewport = ref<HTMLElement>(),
  drag = ref<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    resize: boolean;
    width: number;
    height: number;
  } | null>(null);
const clipPrefix = useId();
const imageSizes = ref<Record<string, { width: number; height: number }>>({});
const loadingImages = new Set<string>();
watch(
  () => [
    ...Object.values(props.assets),
    ...props.sim.drivers.flatMap((d) => Object.values(d.pictures)),
  ],
  (sources) => {
    for (const src of new Set(sources)) {
      if (!src || imageSizes.value[src] || loadingImages.has(src)) continue;
      loadingImages.add(src);
      const img = new Image();
      img.onload = () => {
        imageSizes.value[src] = {
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        loadingImages.delete(src);
      };
      img.onerror = () => loadingImages.delete(src);
      img.src = src;
    }
  },
  { immediate: true },
);
const overlayScreens = computed(() =>
  props.embedded
    ? []
    : props.sim.overlays
        .filter((o) => !o.hidden)
        .map((o) => ({ ...o, doc: parseRbs(o.source) })),
);
const rendered = computed(() =>
  props.doc.elements
    .filter((n) => n.tag !== "datagrid" || !n.attrs.variable)
    .map((n) => {
      const a = inheritedAttributes(n, props.doc),
        g = geometry({ ...n, attrs: a }),
        slot = driverFor({ ...n, attrs: a }, props.sim).id,
        palette = props.sim.drivers[slot - 1]!;
      const text = displayText({ ...n, attrs: a }, props.sim),
        request = fontRequest(a, props.doc.base.attrs.fontsizefaktor, text),
        metrics = measureRbsText(request),
        field = measureRbsText({ ...request, text: fieldSample(n, a) }),
        fontSize = metrics.emSize,
        fontFamily = metrics.family,
        bold = request.bold,
        italic = request.italic;
      const type = shapeTags.has(n.tag)
        ? "shape"
        : imageTags.has(n.tag) || n.tag.startsWith("bild")
          ? "image"
          : barTags.has(n.tag)
            ? "bar"
            : n.tag === "datagrid"
              ? "unknown"
              : "text";
      const image =
        driverFor(n, props.sim).pictures[n.tag] ||
        props.assets[a.file || a.symbolname || ""];
      const natural = imageSizes.value[image || ""];
      const width =
        "breite" in a || "x2" in a
          ? g.width
          : type === "text"
            ? Math.max(1, field.width)
            : type === "image"
              ? (natural?.width ?? g.width)
              : g.width;
      const height =
        "hoehe" in a || "y2" in a
          ? g.height
          : type === "text"
            ? field.height
            : type === "image"
              ? (natural?.height ?? g.height)
              : g.height;
      const selected = props.selected.includes(n.id),
        offset =
          selected && drag.value && !drag.value.resize
            ? drag.value
            : { dx: 0, dy: 0 };
      return {
        n,
        a,
        x: g.x + offset.dx,
        y: g.y + offset.dy,
        width:
          selected && drag.value?.resize
            ? Math.max(2, drag.value.width + drag.value.dx)
            : width,
        height:
          selected && drag.value?.resize
            ? Math.max(2, drag.value.height + drag.value.dy)
            : height,
        type,
        text,
        image,
        fontSize,
        baseline: metrics.baseline,
        textWidth: metrics.width,
        fontFamily,
        bold,
        italic,
        color:
          props.sim.addonColors[`${a.addonvariablename}:1`] ||
          toCssColor(
            !props.sim.enabled && /^slotcolor(bg)?$/i.test(a.fc || "")
              ? a.fdc
              : a.fc,
            slot,
            "#e4e8ed",
            palette,
          ),
        fill:
          props.sim.addonColors[`${a.addonvariablename}:1`] ||
          (typeof props.sim.addonValues[
            `${a.addonvariablename}:${Number(a.nr) === 0 ? 0 : slot}`
          ] === "number"
            ? toCssColor(
                (
                  Number(
                    props.sim.addonValues[
                      `${a.addonvariablename}:${Number(a.nr) === 0 ? 0 : slot}`
                    ],
                  ) >>> 0
                ).toString(16),
              )
            : toCssColor(
                !props.sim.enabled && /^slotcolor(bg)?$/i.test(a.c || "")
                  ? a.dc
                  : a.c,
                slot,
                "#27313b",
                palette,
              )),
        lineWidth: Number(a.w) || 0,
        selected,
        visible: n.tag !== "symbole_einaus" || symbolVisible(n, props.sim),
        barColor:
          props.sim.barColors[bindingKey(n)] ||
          props.sim.addonColors[
            `bar:${a.addonvariablename}:${Number(a.nr) === 0 ? 0 : slot}`
          ] ||
          toCssColor(
            n.tag === "tankbar" &&
              driverFor(n, props.sim).fuel <= props.sim.reserve
              ? a.tc
              : a.nc,
            slot,
            "#b9e66b",
            palette,
          ),
        percent: barPercent(n, props.sim),
      };
    }),
);
function down(event: PointerEvent, n: XmlNode, resize = false) {
  if (props.preview || props.busy || event.button !== 0) return;
  event.stopPropagation();
  event.preventDefault();
  let ids = props.selected;
  if (event.shiftKey || event.ctrlKey) {
    ids = ids.includes(n.id) ? ids.filter((id) => id !== n.id) : [...ids, n.id];
    emit("select", ids);
    if (!ids.includes(n.id)) return;
  } else if (!ids.includes(n.id)) {
    ids = [n.id];
    emit("select", ids);
  }
  const g = geometry(n);
  drag.value = {
    x: event.clientX,
    y: event.clientY,
    dx: 0,
    dy: 0,
    resize,
    width: g.width,
    height: g.height,
  };
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  if (!drag.value) return;
  const snap = props.snap && !event.altKey ? 8 : 1;
  drag.value.dx =
    Math.round((event.clientX - drag.value.x) / props.zoom / snap) * snap;
  drag.value.dy =
    Math.round((event.clientY - drag.value.y) / props.zoom / snap) * snap;
}
function pointerUp() {
  const d = drag.value;
  if (!d) return;
  drag.value = null;
  if (!d.dx && !d.dy) return;
  if (d.resize)
    emit("resize", Math.max(2, d.width + d.dx), Math.max(2, d.height + d.dy));
  else emit("move", d.dx, d.dy);
}
function fit() {
  if (viewport.value)
    emit(
      "fit",
      Math.min(
        1.5,
        Math.max(
          0.1,
          Math.min(
            (viewport.value.clientWidth - 96) / props.doc.width,
            (viewport.value.clientHeight - 96) / props.doc.height,
          ),
        ),
      ),
    );
}
let observer: ResizeObserver;
onMounted(() => {
  observer = new ResizeObserver(() => {
    if (props.zoom === 0) fit();
  });
  if (viewport.value) observer.observe(viewport.value);
  fit();
  window.addEventListener("pointerup", pointerUp);
});
onUnmounted(() => {
  observer?.disconnect();
  window.removeEventListener("pointerup", pointerUp);
});
watch(
  () => [props.doc.width, props.doc.height],
  () => fit(),
);
defineExpose({ fit });
</script>
<template>
  <div
    ref="viewport"
    class="canvas-viewport"
    :class="{ 'preview-mode': preview, embedded }"
    @pointerdown.self="emit('select', [])"
  >
    <div
      class="artboard-shell"
      :style="{
        width: doc.width * zoom + 'px',
        height: doc.height * zoom + 'px',
      }"
    >
      <div v-if="!embedded" class="artboard-caption">
        <span>{{ doc.width }} × {{ doc.height }}</span
        ><span>{{ preview ? "SIMULIERTE VORSCHAU" : "RENNBILDSCHIRM" }}</span>
      </div>
      <svg
        class="artboard"
        :width="doc.width * zoom"
        :height="doc.height * zoom"
        :viewBox="`0 0 ${doc.width} ${doc.height}`"
        xmlns="http://www.w3.org/2000/svg"
        @pointermove="pointerMove"
        @pointerup="pointerUp"
        @pointercancel="drag = null"
        @pointerdown.self="emit('select', [])"
      >
        <defs>
          <clipPath
            v-for="r in rendered.filter(
              (r) => r.type === 'text' && r.n.tag !== 'text',
            )"
            :id="`${clipPrefix}-text-${r.n.id}`"
            :key="r.n.id"
            clipPathUnits="userSpaceOnUse"
          >
            <rect
              x="0"
              y="0"
              :width="Math.max(0, r.width)"
              :height="Math.max(0, r.height)"
            />
          </clipPath>
          <pattern
            id="studio-grid"
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".8" fill="#c4d3df" opacity=".22" />
          </pattern>
        </defs>
        <rect
          :width="doc.width"
          :height="doc.height"
          :fill="toCssColor(doc.base.attrs.bcolor, 1, '#10151b')"
          @pointerdown="emit('select', [])"
        />
        <image
          v-if="assets[doc.base.attrs.bimage || '']"
          :href="assets[doc.base.attrs.bimage || '']"
          :width="doc.width"
          :height="doc.height"
          preserveAspectRatio="none"
          pointer-events="none"
        />
        <g
          v-for="r in rendered"
          :key="r.n.id"
          :data-element-id="r.n.id"
          :opacity="r.visible ? 1 : preview ? 0 : 0.18"
          :transform="`translate(${r.x},${r.y})`"
          :class="{ 'rbs-element': !preview }"
          @pointerdown="down($event, r.n)"
        >
          <template v-if="r.type === 'shape'">
            <line
              v-if="r.n.tag === 'linie'"
              x1="0"
              y1="0"
              :x2="r.width"
              :y2="r.height"
              :stroke="r.fill"
              :stroke-width="r.lineWidth || 1"
            />
            <rect
              v-else
              x="0"
              y="0"
              :width="Math.max(0, r.width)"
              :height="Math.max(0, r.height)"
              :rx="r.n.tag.startsWith('round') ? 12 : 0"
              :fill="r.n.tag.includes('rechteck') ? 'none' : r.fill"
              :stroke="r.fill"
              :stroke-width="r.lineWidth"
            />
          </template>
          <template v-else-if="r.type === 'image'">
            <ColorKeyImage
              v-if="r.image"
              :src="r.image"
              :color-key="r.n.tag === 'bitmap' ? r.a.tc : undefined"
              :width="r.width"
              :height="r.height"
              preserveAspectRatio="none"
            />
            <g v-else>
              <rect
                :width="r.width"
                :height="r.height"
                fill="#65798c"
                fill-opacity=".14"
                stroke="#75889b"
                stroke-dasharray="5 5"
              />
              <path
                :d="`M ${r.width * 0.25} ${r.height * 0.65} L ${r.width * 0.43} ${r.height * 0.37} L ${r.width * 0.6} ${r.height * 0.58} L ${r.width * 0.72} ${r.height * 0.45}`"
                fill="none"
                stroke="#8b9ca7"
                stroke-width="2"
              />
              <text
                :x="r.width / 2"
                :y="r.height * 0.86"
                text-anchor="middle"
                :font-size="Math.min(17, r.width / 12)"
                fill="#99a8b4"
              >
                {{ r.n.tag === "bitmap" ? "BILD" : r.n.tag.toUpperCase() }}
              </text>
            </g>
          </template>
          <template v-else-if="r.type === 'bar'">
            <rect
              :width="r.width"
              :height="r.height"
              :fill="'transparent'"
              :stroke="toCssColor(r.a.lc)"
              :stroke-width="Number.parseInt(r.a.lc || '0', 16) ? 1 : 0"
            />
            <rect
              :x="0"
              :y="r.a.tbtyp === 'v' ? r.height * (1 - r.percent / 100) : 0"
              :width="r.a.tbtyp === 'v' ? r.width : (r.width * r.percent) / 100"
              :height="
                r.a.tbtyp === 'v' ? (r.height * r.percent) / 100 : r.height
              "
              :fill="r.barColor"
            />
          </template>
          <DataGrid
            v-else-if="r.n.tag === 'datagrid'"
            :node="r.n"
            :nodes="doc.elements"
            :sim="sim"
            :width="r.width"
            :height="r.height"
          />
          <text
            v-else
            :x="
              r.a.fa === 'right'
                ? r.width
                : r.a.fa === 'center'
                  ? r.width / 2
                  : 0
            "
            :y="r.baseline"
            :textLength="r.textWidth > 0 ? r.textWidth : undefined"
            lengthAdjust="spacingAndGlyphs"
            font-kerning="none"
            :clip-path="
              r.n.tag !== 'text'
                ? `url(#${clipPrefix}-text-${r.n.id})`
                : undefined
            "
            :text-anchor="
              r.a.fa === 'right'
                ? 'end'
                : r.a.fa === 'center'
                  ? 'middle'
                  : 'start'
            "
            :font-family="r.fontFamily"
            :font-size="r.fontSize"
            :font-weight="r.bold ? '700' : '400'"
            :font-style="r.italic ? 'italic' : 'normal'"
            :text-decoration="
              (r.a.fs || '').includes('u') ? 'underline' : undefined
            "
            :fill="r.color"
            xml:space="preserve"
          >
            {{ r.text }}
          </text>
          <rect
            v-if="!preview"
            :x="Math.min(0, r.width)"
            :y="Math.min(0, r.height)"
            :width="Math.max(8, Math.abs(r.width))"
            :height="Math.max(8, Math.abs(r.height))"
            fill="transparent"
          />
        </g>
        <foreignObject
          v-for="o in overlayScreens"
          :key="o.handle"
          :x="o.x"
          :y="o.y"
          :width="o.doc.width"
          :height="o.doc.height"
          pointer-events="none"
        >
          <RbsCanvas
            :doc="o.doc"
            :selected="[]"
            :assets="o.assets"
            :sim="{
              ...sim,
              dynamicSlot: o.slot ?? sim.dynamicSlot,
              packageValues: o.packageValues ?? sim.packageValues,
            }"
            :zoom="1"
            :grid="false"
            :snap="false"
            :busy="false"
            :preview="true"
            embedded
          />
        </foreignObject>
        <rect
          v-if="grid && !preview"
          :width="doc.width"
          :height="doc.height"
          fill="url(#studio-grid)"
          pointer-events="none"
        />
        <g v-if="!preview" class="selections">
          <template
            v-for="r in rendered.filter((r) => r.selected)"
            :key="r.n.id"
          >
            <rect
              :x="r.x - 3 / zoom"
              :y="r.y - 3 / zoom"
              :width="Math.max(8, r.width) + 6 / zoom"
              :height="Math.max(8, r.height) + 6 / zoom"
              fill="none"
              stroke="#76c7ff"
              :stroke-width="1.3 / zoom"
              pointer-events="none"
            />
            <rect
              v-if="selected.length === 1 && geometry(r.n).sized"
              :x="r.x + r.width - 4 / zoom"
              :y="r.y + r.height - 4 / zoom"
              :width="8 / zoom"
              :height="8 / zoom"
              fill="#76c7ff"
              stroke="#172014"
              :stroke-width="1 / zoom"
              style="cursor: nwse-resize"
              @pointerdown="down($event, r.n, true)"
            />
          </template>
        </g>
      </svg>
    </div>
    <div v-if="!doc.elements.length" class="canvas-empty">
      <strong>Dein Layout beginnt hier.</strong
      ><span>Füge links Texte, Formen oder Renndaten hinzu.</span>
    </div>
  </div>
</template>

<style scoped>
.canvas-viewport.embedded {
  display: block;
  padding: 0;
  overflow: hidden;
  background: transparent;
  min-width: 0;
  min-height: 0;
}
.embedded .artboard {
  border: 0;
  display: block;
}
</style>
