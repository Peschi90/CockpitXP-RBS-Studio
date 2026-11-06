<script setup lang="ts">
import AddonPanel from "./AddonPanel.vue";
import { ref, onUnmounted } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { resetSimulation, type Simulation } from "../core/simulator";
import type { RbsDocument, XmlNode } from "../core/xml";
import { applySnapshot, type Snapshot } from "../core/live";
import { fireEvent, bindingKey } from "../core/runtime";
const props = defineProps<{
  sim: Simulation;
  doc: RbsDocument;
  active?: XmlNode;
}>();
interface Profile {
  id: number;
  name: string;
  picture: string;
  nation: string;
}
const roster = ref<{ drivers: Profile[]; cars: Profile[] }>(),
  slot = ref(1),
  event = ref(32),
  error = ref(""),
  base = ref("http://localhost:8080"),
  live = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined,
  epoch = 0;
async function load(choose = false) {
  error.value = "";
  try {
    if (!isTauri())
      throw Error("Datenbankzugriff ist in der Windows-App verfügbar.");
    roster.value = await invoke("load_roster", { choose });
  } catch (e) {
    error.value = String(e);
  }
}
async function assign(kind: "drivers" | "cars", id: string) {
  try {
    const profile = roster.value?.[kind].find((p) => String(p.id) === id);
    if (!profile) return;
    const d = props.sim.drivers[slot.value - 1]!;
    if (kind === "drivers") d.name = profile.name;
    else d.car = profile.name;
    if (kind === "drivers") {
      delete d.pictures.bildnation;
      if (profile.nation)
        d.pictures.bildnation = await invoke("profile_image", {
          path: profile.nation,
        });
    }
    const key = kind === "drivers" ? "bildfahrer" : "bildfahrzeug";
    delete d.pictures[key];
    if (profile.picture)
      d.pictures[key] = await invoke("profile_image", {
        path: profile.picture,
      });
  } catch (e) {
    error.value = String(e);
  }
}
function stop() {
  props.sim.live = false;
  props.sim.running = false;
  live.value = false;
  epoch++;
  clearTimeout(timer);
}
async function poll(token: number) {
  try {
    const data = await invoke<Snapshot>("cockpit_snapshot", {
      base: base.value,
    });
    if (token !== epoch) return;
    applySnapshot(props.sim, data);
    error.value = "";
    timer = setTimeout(() => poll(token), 1000);
  } catch (e) {
    if (token === epoch) {
      error.value = "Live-Verbindung beendet: " + String(e);
      stop();
    }
  }
}
async function connect() {
  if (live.value) {
    stop();
    return;
  }
  if (!isTauri()) {
    error.value = "Live-Anbindung ist in der Windows-App verfügbar.";
    return;
  }
  resetSimulation(props.sim);
  props.sim.live = true;
  live.value = true;
  await poll(++epoch);
}
onUnmounted(stop);
</script>
<template>
  <details class="runtime-panel">
    <summary>Erweiterte Simulation · Ereignisse · Cockpit-Daten</summary>
    <div class="runtime-controls">
      <label
        >Spur<select v-model.number="slot">
          <option v-for="n in doc.slots" :key="n">{{ n }}</option>
        </select></label
      ><label
        >Ereignis-ID<input
          v-model.number="event"
          type="number"
          min="1" /></label
      ><button @click="fireEvent(sim, doc.elements, slot, event)">
        Ereignis auslösen</button
      ><button @click="sim.drivers[slot - 1]!.penalty = 30">30 s Strafe</button
      ><label
        >Rennzeit (s)<input
          v-model.number="sim.duration"
          type="number"
          min="1" /></label
      ><label
        >Tankreserve (%)<input
          v-model.number="sim.reserve"
          type="number"
          min="0"
          max="100"
      /></label>
    </div>
    <div class="runtime-controls">
      <label
        >Slot-Hintergrundfarbe<input
          type="color"
          v-model="sim.drivers[slot - 1]!.background"
      /></label>
      <label
        >Slot-Textfarbe<input
          type="color"
          v-model="sim.drivers[slot - 1]!.font"
      /></label>
    </div>
    <div v-if="active" class="runtime-controls">
      <b>{{ active.attrs.addonvariablename || active.tag }}</b
      ><label v-if="active.tag === 'symbole_einaus'"
        >Symbol sichtbar<input
          v-model="sim.symbols[active.id]"
          type="checkbox" /></label
      ><template v-if="['tankbar', 'progressbar'].includes(active.tag)"
        ><label
          >Wert (%)<input
            v-model.number="sim.barValues[bindingKey(active)]"
            type="number"
            min="0"
            max="100" /></label
        ><label
          >Balkenfarbe<input
            v-model="sim.barColors[bindingKey(active)]"
            type="color" /></label></template
      ><label v-else
        >Wert für diese Spur<input
          v-model="sim.overrides[bindingKey(active)]"
          placeholder="Vorschauwert" /></label
      ><button
        @click="
          delete sim.symbols[active.id];
          delete sim.barValues[bindingKey(active)];
          delete sim.barColors[bindingKey(active)];
          delete sim.overrides[bindingKey(active)];
        "
      >
        Automatik wiederherstellen
      </button>
    </div>
    <div class="runtime-controls">
      <button @click="load()">Cockpit-Datenbank lesen</button
      ><button @click="load(true)">Andere Datenbank…</button
      ><label v-if="roster"
        >Fahrer<select
          @change="
            assign('drivers', ($event.target as HTMLSelectElement).value)
          "
        >
          <option value="">Auswählen…</option>
          <option v-for="p in roster.drivers" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      ><label v-if="roster"
        >Fahrzeug<select
          @change="assign('cars', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Auswählen…</option>
          <option v-for="p in roster.cars" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select></label
      >
    </div>
    <div class="runtime-controls">
      <label
        >Cockpit-API<input
          v-model="base"
          :disabled="live"
          placeholder="http://localhost:8080" /></label
      ><button @click="connect">
        {{ live ? "Live-Daten trennen" : "Live-Daten verbinden" }}</button
      ><span>{{
        live ? "Live · nur lesender Zugriff" : "Lokale Simulation"
      }}</span>
    </div>
    <AddonPanel :sim="sim" :doc="doc" />
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
  </details>
</template>
<style scoped>
.runtime-panel {
  padding: 10px 18px;
  border-top: 1px solid #35404c;
  max-height: 280px;
  overflow: auto;
}
.runtime-panel summary {
  cursor: pointer;
  color: #76c7ff;
}
.runtime-controls {
  display: flex;
  align-items: end;
  gap: 10px;
  margin: 12px 0;
  flex-wrap: wrap;
}
.runtime-controls label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 11px;
}
.runtime-controls input[type="number"] {
  width: 100px;
}
.runtime-controls select {
  max-width: 240px;
}
.runtime-controls button {
  border-color: #455163;
}
</style>
