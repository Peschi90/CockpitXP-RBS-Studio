<script setup lang="ts">
import { computed } from "vue";
import { driverFor, type Simulation } from "../core/simulator";
import { gridColumns, gridCell } from "../core/runtime";
import type { XmlNode } from "../core/xml";
const props = defineProps<{
  node: XmlNode;
  nodes: XmlNode[];
  sim: Simulation;
  width: number;
  height: number;
}>();
const columns = computed(() => gridColumns(props.node, props.nodes));
const rows = computed(() =>
  [...driverFor(props.node, props.sim).history].reverse(),
);
function csv() {
  const lines = [
    columns.value.map((c) => c.text),
    ...rows.value.map((r) =>
      columns.value.map((c) =>
        gridCell(c.attrs.variable!, r, Number(c.attrs.mst) || 1),
      ),
    ),
  ];
  const content = lines
    .map((row) => row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(";"))
    .join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" }),
  );
  a.download = `Runden-Spur-${props.node.attrs.nr}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>
<template>
  <foreignObject :width="width" :height="height"
    ><div
      xmlns="http://www.w3.org/1999/xhtml"
      style="
        background: #18212b;
        height: 100%;
        overflow: auto;
        font: 14px Arial;
        color: white;
      "
      @pointerdown.stop
    >
      <div style="display: flex; justify-content: space-between; padding: 4px">
        <b>{{ node.text || "Rundenhistorie" }}</b
        ><button @click="csv">CSV exportieren</button>
      </div>
      <table style="border-collapse: collapse; width: 100%">
        <thead>
          <tr>
            <th
              v-for="c in columns"
              :key="c.id"
              :style="{
                minWidth: (Number(c.attrs.len) || 60) + 'px',
                border: '1px solid #536071',
                padding: '4px',
              }"
            >
              {{ c.text }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.lap">
            <td
              v-for="c in columns"
              :key="c.id"
              style="border: 1px solid #354250; padding: 4px"
            >
              {{ gridCell(c.attrs.variable!, r, Number(c.attrs.mst) || 1) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" style="padding: 8px">
        Noch keine abgeschlossenen Runden.
      </p>
    </div></foreignObject
  >
</template>
