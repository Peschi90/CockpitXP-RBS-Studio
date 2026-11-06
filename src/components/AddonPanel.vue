<script setup lang="ts">
import AddonResults from "./AddonResults.vue";
import { ref, shallowRef, computed, onMounted, onUnmounted } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  AddonEngine,
  AddonSession,
  demoAddon,
  type AddonPackage,
} from "../core/addons";
import type { Simulation } from "../core/simulator";
import type { RbsDocument } from "../core/xml";
const props = defineProps<{ sim: Simulation; doc: RbsDocument }>();
const session = new AddonSession(true);
const engines = shallowRef<AddonEngine[]>([]),
  engine = shallowRef(
    new AddonEngine(props.sim, () => props.doc.slots, session),
  ),
  state = computed(() => engine.value.state);
const input = ref<HTMLInputElement>(),
  error = ref(""),
  event = ref("startziel"),
  slot = ref(1),
  parameter = ref(0),
  station = ref(1),
  inputName = ref(""),
  installed = ref<{ name: string; path: string }[]>([]),
  selectedInstalled = ref("");
const source = ref(""),
  config = ref(""),
  packageName = ref("Eigenes AddOn");
let loaded: AddonPackage | undefined, timer: ReturnType<typeof setInterval>;
function load(pkg: AddonPackage) {
  try {
    if (
      engines.value.length >= 8 &&
      !engines.value.some((e) => e.state.name === pkg.name)
    )
      throw Error("Maximal acht AddOns gleichzeitig laden");
    const next = new AddonEngine(props.sim, () => props.doc.slots, session);
    next.load(pkg);
    const previous = engines.value.find((e) => e.state.name === pkg.name);
    if (previous) {
      previous.stop();
      engines.value = engines.value.filter((e) => e !== previous);
    }
    engine.value = next;
    engines.value = [...engines.value, next];
    loaded = pkg;
    source.value = pkg.source;
    config.value = pkg.config;
    packageName.value = pkg.name;
    error.value = "";
    event.value = state.value.events.includes("startziel")
      ? "startziel"
      : state.value.events[0]!;
  } catch (e) {
    error.value = String(e);
  }
}
async function open() {
  if (!isTauri()) {
    input.value?.click();
    return;
  }
  try {
    const pkg = await invoke<AddonPackage | null>("open_addon");
    if (pkg) load(pkg);
  } catch (e) {
    error.value = String(e);
  }
}
async function browserFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const data = new Uint8Array(await f.arrayBuffer());
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      text = new TextDecoder("windows-1252").decode(data);
    }
    load({ name: f.name, source: text, config: "", screens: {} });
  } catch (e) {
    error.value = String(e);
  } finally {
    (e.target as HTMLInputElement).value = "";
  }
}
function apply() {
  load({
    name: packageName.value,
    source: source.value,
    config: config.value,
    screens: loaded?.screens || {},
    files: loaded?.files,
    virtualPath: loaded?.virtualPath,
  });
}
async function scan() {
  try {
    installed.value = await invoke("list_installed_addons");
    selectedInstalled.value = installed.value[0]?.path ?? "";
  } catch (e) {
    error.value = String(e);
  }
}
async function loadInstalled() {
  try {
    const pkg = await invoke<AddonPackage>("load_installed_addon", {
      path: selectedInstalled.value,
    });
    load(pkg);
  } catch (e) {
    error.value = String(e);
  }
}
onMounted(() => {
  timer = setInterval(() => {
    for (const e of engines.value) e.advance(0.1);
  }, 100);
});
onUnmounted(() => {
  clearInterval(timer);
  for (const e of engines.value) e.stop();
});
function selectEngine(e: AddonEngine) {
  engine.value = e;
  source.value = e.sourcePackage?.source ?? "";
  config.value = e.sourcePackage?.config ?? "";
  loaded = e.sourcePackage;
  packageName.value = e.state.name;
  event.value = e.state.events[0] ?? "";
}
function removeEngine(e: AddonEngine) {
  e.stop();
  engines.value = engines.value.filter((x) => x !== e);
  if (engine.value === e) {
    if (engines.value[0]) selectEngine(engines.value[0]);
    else {
      engine.value = new AddonEngine(props.sim, () => props.doc.slots, session);
      source.value = "";
      config.value = "";
      loaded = undefined;
    }
  }
}
</script>
<template>
  <details class="addon-panel">
    <summary>AddOn-Ausführung · Pascal-Simulation</summary>
    <div v-if="engines.length" class="controls">
      <span v-for="e in engines" :key="e.state.name"
        ><button :aria-pressed="engine === e" @click="selectEngine(e)">
          {{ e.state.name }} ·
          {{ e.state.running ? "läuft" : "gestoppt" }}</button
        ><button
          :aria-label="e.state.name + ' entfernen'"
          @click="removeEngine(e)"
        >
          ×
        </button></span
      >
    </div>
    <div class="controls">
      <button v-if="isTauri()" @click="scan">Installierte AddOns suchen</button>
      <button @click="open">AddOn laden…</button
      ><button @click="load(demoAddon)">Demo-AddOn laden</button>
      <button
        :disabled="!state.events.length || sim.live"
        @click="state.running ? engine.stop() : engine.start()"
      >
        {{ state.running ? "AddOn stoppen" : "AddOn starten" }}
      </button>
      <strong>{{ state.name }}</strong
      ><span>{{ state.running ? "Läuft" : "Gestoppt" }}</span>
      <input
        ref="input"
        id="addon-file"
        type="file"
        accept=".xml"
        hidden
        @change="browserFile"
      />
    </div>
    <div v-if="installed.length" class="controls">
      <label
        >Installiertes AddOn<select v-model="selectedInstalled">
          <option v-for="a in installed" :key="a.path" :value="a.path">
            {{ a.name }}
          </option>
        </select></label
      ><button @click="loadInstalled">Ausgewähltes AddOn laden</button>
    </div>
    <p class="muted">
      Pascal-Quelltext aus AddOn.cps.xml. Runden, Boxenstopps und Rennstatus
      lösen Ereignisse automatisch aus. Mehrere geladene AddOns können
      gleichzeitig laufen. Hardware, Sprache und Dateien werden ausschließlich
      virtuell simuliert. Nicht alle Pascal- und Cockpit-Funktionen sind
      unterstützt.
    </p>
    <div v-if="state.events.length" class="controls">
      <label
        >Ereignis<select v-model="event" aria-label="AddOn-Ereignis">
          <option v-for="e in state.events" :key="e">{{ e }}</option>
        </select></label
      >
      <label
        >Spur / ID<input
          v-model.number="slot"
          aria-label="AddOn-Spur"
          type="number"
          min="1"
          max="8"
      /></label>
      <label
        >Parameter<input
          v-model.number="parameter"
          type="number"
          aria-label="AddOn-Parameter"
      /></label>
      <button
        :disabled="!state.running"
        @click="
          engine.emit(event, slot, parameter, station);
          engine.advance(0);
        "
      >
        AddOn-Ereignis auslösen
      </button>
      <label
        >Tastenstrafe (s)<input
          v-model.number="state.keyPenaltySeconds"
          type="number"
          min="0"
          max="3600"
      /></label>
      <label
        ><input
          v-model="state.analogue"
          :disabled="state.running"
          type="checkbox"
        />Analoge Bahn</label
      >
      <label
        >Sensor / Station<input
          v-model.number="station"
          aria-label="AddOn-Station"
          type="number"
          min="0"
          max="64"
      /></label>
      <label
        >Rennmodus<select v-model="state.mode" :disabled="state.running">
          <option value="R">Rennen</option>
          <option value="T">Training</option>
          <option value="Q">Qualifikation</option>
        </select></label
      >
    </div>
    <details v-if="state.events.length">
      <summary>Eingänge, Tasten und Fahrzeugwerte</summary>
      <div class="controls">
        <label v-for="(_, name) in engine.inputs" :key="name"
          ><input
            type="checkbox"
            :checked="engine.inputs[name]"
            :disabled="!state.running"
            @change="
              engine.setInput(
                String(name),
                ($event.target as HTMLInputElement).checked,
                slot,
                station,
                parameter,
              )
            "
          />{{ name }}</label
        >
      </div>
      <div class="controls">
        <label
          >Weiterer Eingang<input
            v-model="inputName"
            placeholder="z. B. ChaosTaster1" /></label
        ><button @click="inputName && (engine.inputs[inputName] = false)">
          Eingang hinzufügen
        </button>
        <button
          :disabled="!state.running"
          @click="engine.emit('KeyDown', slot, 89)"
        >
          Y · Aufzeichnung</button
        ><button
          :disabled="!state.running"
          @click="engine.emit('KeyDown', slot, 74)"
        >
          J · Joker-Dialog</button
        ><button
          :disabled="!state.running"
          @click="engine.emit('KeyDown', slot, 76)"
        >
          L · Chaos-Test
        </button>
      </div>
      <div class="controls">
        <span v-for="d in sim.drivers.slice(0, doc.slots)" :key="d.id"
          >ID {{ d.id }} · CU {{ d.cuSpeed }} · Bremse {{ d.cuBrake }} ·
          {{
            d.boxPenalty
              ? "Boxenstrafe " + d.boxPenalty.remaining.toFixed(1) + " s"
              : d.disqualified
                ? "Disqualifiziert"
                : "bereit"
          }}</span
        >
      </div>
    </details>
    <details v-if="state.events.length">
      <summary>Standard-Symbole zuordnen</summary>
      <p class="muted">
        Bei Customer-Symbolen die Ein-/Aus-Ereignis-IDs des RBS eintragen.
        AddOn-Symbole mit Namen werden automatisch zugeordnet.
      </p>
      <div class="controls">
        <label v-for="(mapping, name) in sim.symbolMappings" :key="name"
          >{{ name }} · Ein / Aus<input
            v-model.number="mapping.on"
            type="number"
            min="0"
            :aria-label="name + ' Ein-ID'" /><input
            v-model.number="mapping.off"
            type="number"
            min="0"
            :aria-label="name + ' Aus-ID'"
        /></label>
      </div>
    </details>
    <AddonResults :engine="engine" />
    <p v-for="warning in state.warnings" :key="warning" class="muted">
      {{ warning }}
    </p>
    <details v-if="state.settings.length">
      <summary>AddOn-Konfiguration (nur Simulation)</summary>
      <div class="settings">
        <label v-for="c in state.settings" :key="c.name"
          >{{ c.label
          }}<select
            v-if="c.type === 'Combo'"
            v-model="c.value"
            :disabled="state.running"
          >
            <option
              v-for="(choice, i) in c.choices"
              :key="i"
              :value="String(i)"
            >
              {{ choice }}
            </option></select
          ><input v-else v-model="c.value" :disabled="state.running"
        /></label>
      </div>
    </details>
    <details>
      <summary>Quelltext prüfen / eigenes AddOn</summary>
      <textarea
        v-model="source"
        aria-label="AddOn-Quelltext"
        rows="10"
        spellcheck="false"
        placeholder="&lt;AddOnClasses&gt;…&lt;/AddOnClasses&gt;"
      ></textarea
      ><button @click="apply">AddOn prüfen und übernehmen</button>
      <p class="muted">
        Änderungen gelten nur für diese Simulation. Die ursprünglichen
        AddOn-Dateien werden nicht überschrieben. Die Demo verwendet DemoStatus
        (Text, Spur 0), DemoTank (AddOn-Balken, Spur 1) und DemoSymbol (Symbol,
        Spur 1).
      </p>
    </details>
    <p v-if="error || state.error" role="alert" class="inline-error">
      {{ error || state.error }}
    </p>
    <details v-if="state.logs.length" open>
      <summary>Ausführungsprotokoll</summary>
      <pre class="log">{{ state.logs.slice(-20).join("\n") }}</pre>
    </details>
  </details>
</template>
<style scoped>
.addon-panel {
  border-top: 1px solid #455163;
  padding-top: 10px;
  margin: 12px 0;
}
.addon-panel summary {
  cursor: pointer;
  color: #b9e66b;
  margin: 8px 0;
}
.controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: end;
  margin: 12px 0;
}
.controls label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.controls input {
  width: 100px;
}
.settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.settings label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.log {
  max-height: 150px;
  overflow: auto;
  white-space: pre-wrap;
  background: #10151b;
  padding: 10px;
}
.addon-panel textarea {
  width: 100%;
  font-family: Consolas, monospace;
}
</style>
