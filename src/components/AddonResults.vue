<script setup lang="ts">
import { type AddonEngine } from "../core/addons";
import type { ObjectValue, Value } from "../core/pascal";
import type { VirtualTable } from "../core/addonObjects";
import { toCssColor } from "../core/xml";
const props = defineProps<{ engine: AddonEngine }>();
const array = (v: Value | undefined): Value[] =>
  v && typeof v === "object" && "array" in v ? v.array : [];
function chart(c: ObjectValue) {
  const series = array(c.props.series)
    .filter(
      (v): v is ObjectValue => !!v && typeof v === "object" && "object" in v,
    )
    .map((s) => ({
      title: String(s.props.title ?? ""),
      points: array(s.props.points).map((p) => array(p)),
    }));
  const points = series.flatMap((s) => s.points),
    maxX = Math.max(1, ...points.map((p) => Number(p[0]))),
    maxY = Math.max(1, ...points.map((p) => Number(p[1])));
  return {
    series: series.map((s) => ({
      ...s,
      color: toCssColor((Number(s.points[0]?.[3] ?? 255) >>> 0).toString(16)),
      polyline: s.points
        .map(
          (p) =>
            `${45 + (Number(p[0]) / maxX) * 500},${225 - (Number(p[1]) / maxY) * 190}`,
        )
        .join(" "),
    })),
    maxX,
    maxY,
  };
}
function rows(t: VirtualTable) {
  const r = new Map<number, Record<number, Value>>();
  for (const [key, value] of Object.entries(t.cells)) {
    const [row, col] = key.split(":").map(Number);
    if (!r.has(row!)) r.set(row!, {});
    r.get(row!)![col!] = value;
  }
  return [...r.entries()].sort((a, b) => a[0] - b[0]);
}
function columns(t: VirtualTable) {
  return Math.min(
    256,
    Math.max(0, ...Object.keys(t.cells).map((k) => Number(k.split(":")[1]))),
  );
}
function download(name: string, data: string) {
  const url = URL.createObjectURL(
      new Blob([data], { type: "text/plain;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(t: VirtualTable) {
  const width = columns(t);
  return rows(t)
    .map(([, row]) =>
      Array.from(
        { length: width },
        (_, i) => '"' + String(row[i + 1] ?? "").replaceAll('"', '""') + '"',
      ).join(";"),
    )
    .join("\r\n");
}
</script>
<template>
  <section class="addon-results" aria-label="AddOn-Ausgaben">
    <Teleport to="body">
      <section
        v-for="(win, index) in engine.objects.state.windows.filter(
          (w) => w.visible,
        )"
        :key="win.id"
        class="virtual-window"
        role="dialog"
        :aria-label="win.title"
        :style="{
          width: win.width + 24 + 'px',
          top: 6 + index * 2 + 'vh',
          zIndex: 1000 + index,
        }"
      >
        <header>
          <strong>{{ win.title }}</strong
          ><span>Simulierter AddOn-Dialog</span
          ><button @click="engine.objects.close(win.id)">
            Dialog schließen
          </button>
        </header>
        <div v-if="win.controls.length" class="form-viewport">
          <div
            class="form"
            :style="{ width: win.width + 'px', height: win.height + 'px' }"
          >
            <template v-for="control in win.controls" :key="control.id">
              <component
                :is="control.object === 'tbutton' ? 'button' : 'span'"
                v-if="control.props.visible !== false"
                :style="{
                  left: Number(control.props.left) + 'px',
                  top: Number(control.props.top) + 'px',
                  width: Number(control.props.width) + 'px',
                  minHeight: Number(control.props.height) + 'px',
                }"
                :disabled="
                  control.props.enabled === false || !engine.state.running
                "
                @click="
                  control.object === 'tbutton' &&
                  engine.objects.click(control.id)
                "
                >{{ control.props.caption }}</component
              >
            </template>
          </div>
        </div>
        <figure v-for="c in win.charts" :key="c.id">
          <svg
            viewBox="0 0 580 265"
            role="img"
            aria-label="Rundenzeiten-Diagramm"
          >
            <path d="M45 25V225H550" fill="none" stroke="#a7b1bf" />
            <text x="48" y="20" fill="#dfe7f2">
              {{ chart(c).maxY.toFixed(2) }} s
            </text>
            <text x="470" y="250" fill="#dfe7f2">
              {{ chart(c).maxX }} Runden
            </text>
            <g v-for="series in chart(c).series" :key="series.title">
              <polyline
                :points="series.polyline"
                :stroke="series.color"
                stroke-width="2"
                fill="none"
              />
              <circle
                v-for="(p, i) in series.polyline.split(' ').filter(Boolean)"
                :key="i"
                :cx="p.split(',')[0]"
                :cy="p.split(',')[1]"
                r="3"
                :fill="series.color"
              />
            </g>
          </svg>
          <figcaption>
            <span
              v-for="series in chart(c).series"
              :key="series.title"
              :style="{ color: series.color }"
              >{{ series.title }}</span
            >
          </figcaption>
        </figure>
      </section>
    </Teleport>
    <details
      v-for="(table, index) in engine.objects.state.tables"
      :key="index"
      open
    >
      <summary>{{ table.title }} · {{ rows(table).length }} Zeilen</summary>
      <button @click="download('AddOn-Auswertung.csv', csv(table))">
        CSV exportieren
      </button>
      <div class="table-scroll">
        <table>
          <tbody>
            <tr v-for="[row, cells] in rows(table).slice(0, 100)" :key="row">
              <td v-for="col in columns(table)" :key="col">
                {{ cells[col] ?? "" }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="rows(table).length > 100">
        Vorschau: erste 100 Zeilen. Der CSV-Export enthält alle Zeilen.
      </p>
    </details>
    <details v-if="engine.files.size">
      <summary>Virtuelle Dateien ({{ engine.files.size }})</summary>
      <details v-for="[name, data] in engine.files" :key="name">
        <summary>{{ name }} · {{ data.length }} Zeichen</summary>
        <button @click="download(name.split('\\').at(-1) || 'AddOn.txt', data)">
          Datei exportieren
        </button>
        <pre>{{ data.slice(0, 20000) }}</pre>
      </details>
    </details>
    <details v-if="Object.keys(engine.outputs).length" open>
      <summary>Simulierte Ausgänge</summary>
      <div class="outputs">
        <span v-for="(value, name) in engine.outputs" :key="name"
          >{{ name }}: <strong>{{ value ? "Ein" : "Aus" }}</strong></span
        >
      </div>
    </details>
  </section>
</template>
<style scoped>
.addon-results {
  margin-top: 14px;
}
.virtual-window {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  max-width: 95vw;
  max-height: 86vh;
  overflow: auto;
  box-shadow: 0 24px 90px #000b;
  margin: 12px 0;
  border: 1px solid #56677d;
  border-radius: 8px;
  background: #131d2b;
  font:
    13px Inter,
    Segoe UI,
    sans-serif;
  color: #e6edf5;
}
header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px;
  background: #253449;
}
header button {
  background: #354c69;
  color: #fff;
  padding: 6px;
  border: 1px solid #7791ae;
  border-radius: 4px;
  cursor: pointer;
}
header span {
  flex: 1;
  color: #a7b1bf;
  font-size: 12px;
}
.form-viewport {
  overflow: auto;
}
.form {
  position: relative;
}
.form > span,
.form > button {
  position: absolute;
  padding: 3px 7px;
  box-sizing: border-box;
  white-space: pre-wrap;
}
.form > span {
  color: #e6edf5;
}
.form > button {
  color: #edf4ff;
  background: #354c69;
  border: 1px solid #7791ae;
}
.table-scroll {
  overflow: auto;
  max-height: 300px;
}
td {
  border: 1px solid #46576c;
  padding: 5px 10px;
  white-space: nowrap;
}
table {
  border-collapse: collapse;
  margin-top: 8px;
}
details {
  margin: 8px 0;
}
summary {
  cursor: pointer;
}
pre {
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  background: #111820;
  padding: 8px;
}
.outputs,
figcaption {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
figure {
  margin: 12px;
}
svg {
  max-width: 800px;
  width: 100%;
  background: #0c131d;
}
</style>
