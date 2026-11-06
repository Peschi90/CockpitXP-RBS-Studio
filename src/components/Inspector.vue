<script setup lang="ts">
import { computed } from "vue";
import {
  geometry,
  inheritedAttributes,
  toCssColor,
  fromCssColor,
  shapeTags,
  type RbsDocument,
  type XmlNode,
} from "../core/xml";
import { driverFor, type Simulation } from "../core/simulator";
import { label } from "../core/catalog";
import {
  SlidersHorizontal,
  ImagePlus,
  Copy,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  ChevronDown,
} from "@lucide/vue";
const props = defineProps<{
  doc: RbsDocument;
  node?: XmlNode;
  count: number;
  encoding: string;
  sim: Simulation;
}>();
const emit = defineEmits<{
  attrs: [attrs: Record<string, string | number | null>];
  geometry: [g: Partial<ReturnType<typeof geometry>>];
  text: [value: string];
  base: [attrs: Record<string, string | number | null>];
  image: [background: boolean];
  duplicate: [];
  remove: [];
  repeat: [];
}>();
const g = computed(() => (props.node ? geometry(props.node) : undefined)),
  a = computed(() =>
    props.node ? inheritedAttributes(props.node, props.doc) : {},
  );
const color = (value?: string) => {
  const driver = props.node
    ? driverFor({ ...props.node, attrs: a.value }, props.sim)
    : props.sim.drivers[0]!;
  return toCssColor(value, driver.id, "#e4e8ed", driver);
};
const val = (event: Event) => (event.target as HTMLInputElement).value;
const num = (event: Event) => Math.round(Number(val(event)));
const attr = (key: string, event: Event) =>
  emit("attrs", { [key]: val(event) });
function styleToggle(letter: string) {
  const current = a.value.fs ?? "";
  emit("attrs", {
    fs: current.includes(letter)
      ? current.replaceAll(letter, "")
      : current + letter,
  });
}
const shape = computed(() => props.node && shapeTags.has(props.node.tag));
const isImage = computed(
  () => props.node && ["bitmap", "symbole_einaus"].includes(props.node.tag),
);
</script>
<template>
  <aside class="inspector panel">
    <div class="panel-heading">
      <span><SlidersHorizontal :size="15" /> Eigenschaften</span
      ><span class="tiny-badge">{{ count || "RBS" }}</span>
    </div>
    <template v-if="node && g">
      <div class="property-section selected-heading">
        <div class="eyebrow">{{ node.parent?.tag.toUpperCase() }}</div>
        <h2>{{ label(node.tag) }}</h2>
        <code>&lt;{{ node.tag }}&gt;</code>
        <p v-if="count > 1" class="muted">
          {{ count }} Elemente ausgewählt. Attribute gelten für die gesamte
          Auswahl; Maße für das erste Element.
        </p>
      </div>
      <section class="property-section">
        <h3>Position &amp; Größe</h3>
        <div class="field-grid">
          <label
            ><span>X</span
            ><input
              aria-label="Position X"
              type="number"
              :value="g.x"
              @change="emit('geometry', { x: num($event) })" /></label
          ><label
            ><span>Y</span
            ><input
              aria-label="Position Y"
              type="number"
              :value="g.y"
              @change="emit('geometry', { y: num($event) })" /></label
          ><label v-if="g.sized"
            ><span>B</span
            ><input
              aria-label="Breite"
              type="number"
              min="0"
              :value="g.width"
              @change="
                emit('geometry', { width: Math.max(0, num($event)) })
              " /></label
          ><label v-if="g.sized"
            ><span>H</span
            ><input
              aria-label="Höhe"
              type="number"
              min="0"
              :value="g.height"
              @change="emit('geometry', { height: Math.max(0, num($event)) })"
          /></label>
        </div>
      </section>
      <section v-if="!g.sized" class="property-section">
        <h3>{{ node.tag === "text" ? "Text" : "Vorschautext" }}</h3>
        <textarea
          aria-label="Elementtext"
          rows="2"
          :value="node.attrs.text ?? node.text"
          @change="emit('text', val($event))"
        ></textarea>
        <h3>Typografie</h3>
        <select
          aria-label="Schriftart"
          :value="a.ft || 'Arial'"
          @change="attr('ft', $event)"
        >
          <option
            v-if="
              ![
                'Arial',
                'Arial Black',
                'Segoe UI',
                'Bahnschrift',
                'Consolas',
                'Tahoma',
                'Verdana',
              ].includes(a.ft || '')
            "
          >
            {{ a.ft }}
          </option>
          <option>Arial</option>
          <option>Arial Black</option>
          <option>Segoe UI</option>
          <option>Bahnschrift</option>
          <option>Consolas</option>
          <option>Tahoma</option>
          <option>Verdana</option>
        </select>
        <div class="type-row">
          <input
            aria-label="Schriftgröße"
            type="number"
            min="1"
            max="500"
            :value="a.fh || 28"
            @change="emit('attrs', { fh: Math.max(1, num($event)) })"
          /><button
            :class="{ active: (a.fs || '').includes('b') }"
            title="Fett"
            @click="styleToggle('b')"
          >
            <Bold :size="15" /></button
          ><button
            :class="{ active: (a.fs || '').includes('i') }"
            title="Kursiv"
            @click="styleToggle('i')"
          >
            <Italic :size="15" />
          </button>
        </div>
        <div class="segmented">
          <button
            v-for="(icon, i) in [AlignLeft, AlignCenter, AlignRight]"
            :key="i"
            :class="{
              active: (a.fa || 'left') === ['left', 'center', 'right'][i],
            }"
            :title="['Linksbündig', 'Zentriert', 'Rechtsbündig'][i]"
            @click="emit('attrs', { fa: ['left', 'center', 'right'][i]! })"
          >
            <component :is="icon" :size="15" />
          </button>
        </div>
        <label class="stack-label"
          >Farbquelle<select
            aria-label="Textfarbquelle"
            :value="
              ['slotcolor', 'slotcolorbg'].includes(a.fc || '') ? a.fc : 'fixed'
            "
            @change="
              emit('attrs', {
                fc:
                  val($event) === 'fixed'
                    ? fromCssColor(color(a.fc))
                    : val($event),
              })
            "
          >
            <option value="fixed">Feste Farbe</option>
            <option value="slotcolor">Slot-Schriftfarbe</option>
            <option value="slotcolorbg">Slot-Hintergrundfarbe</option>
          </select></label
        >
        <label class="color-field"
          ><input
            aria-label="Textfarbe"
            type="color"
            :value="color(a.fc)"
            @change="emit('attrs', { fc: fromCssColor(val($event)) })"
          /><span>Textfarbe</span><code>{{ a.fc || "Standard" }}</code></label
        ><label class="stack-label"
          >Cockpit-Farbwert<input
            aria-label="Cockpit-Textfarbe"
            :value="a.fc"
            placeholder="00FFFFFF / slotcolor (Text)"
            @change="attr('fc', $event)"
        /></label>
      </section>
      <section v-if="shape" class="property-section">
        <h3>Darstellung</h3>
        <label class="stack-label"
          >Farbquelle<select
            aria-label="Flächenfarbquelle"
            :value="
              ['slotcolor', 'slotcolorbg'].includes(a.c || '') ? a.c : 'fixed'
            "
            @change="
              emit('attrs', {
                c:
                  val($event) === 'fixed'
                    ? fromCssColor(color(a.c))
                    : val($event),
              })
            "
          >
            <option value="fixed">Feste Farbe</option>
            <option value="slotcolorbg">Slot-Hintergrundfarbe</option>
            <option value="slotcolor">Slot-Schriftfarbe</option>
          </select></label
        >
        <label class="color-field"
          ><input
            aria-label="Füllfarbe"
            type="color"
            :value="color(a.c)"
            @change="emit('attrs', { c: fromCssColor(val($event)) })"
          /><span>Fläche / Linie</span></label
        ><label class="color-field"
          ><input
            aria-label="Standardfarbe der Fläche"
            type="color"
            :value="color(a.dc)"
            @change="emit('attrs', { dc: fromCssColor(val($event)) })"
          /><span>Slot-Standardfarbe im Editor</span></label
        >
        <div class="field-grid">
          <label
            ><span>Linie</span
            ><input
              type="number"
              min="0"
              :value="a.w || 0"
              @change="attr('w', $event)"
          /></label>
        </div>
        <label class="stack-label"
          >Cockpit-Farbwert<input
            :value="a.c"
            placeholder="slotcolorbg"
            @change="attr('c', $event)"
        /></label>
      </section>
      <section v-if="node.tag === 'symbole_einaus'" class="property-section">
        <h3>Ereignisse</h3>
        <label class="stack-label"
          >Ein-Ereignis<input
            type="number"
            :value="a.audioid_ein || 0"
            @change="attr('audioid_ein', $event)"
        /></label>
        <label class="stack-label"
          >Aus-Ereignis<input
            type="number"
            :value="a.audioid_aus || 0"
            @change="attr('audioid_aus', $event)"
        /></label>
      </section>
      <section
        v-if="['tankbar', 'progressbar'].includes(node.tag)"
        class="property-section"
      >
        <h3>Balken</h3>
        <label class="stack-label"
          >Richtung<select
            :value="a.tbtyp || 'h'"
            @change="attr('tbtyp', $event)"
          >
            <option value="h">Horizontal</option>
            <option value="v">Vertikal</option>
          </select></label
        >
        <label v-if="node.tag === 'progressbar'" class="stack-label"
          >Balkentyp<select
            :value="a.typ || 'AddonBar'"
            @change="attr('typ', $event)"
          >
            <option value="AddonBar">AddOn</option>
            <option value="rennzeit">Rennzeit</option>
            <option value="strafe">Strafe</option>
            <option value="strafe2">Strafe 2</option>
          </select></label
        >
        <label
          v-for="[key, name] in [
            ['nc', 'Normalfarbe'],
            ['tc', 'Reservefarbe'],
            ['lc', 'Rahmenfarbe'],
          ]"
          :key="key"
          class="color-field"
          ><input
            type="color"
            :aria-label="name"
            :value="color(a[key!])"
            @change="emit('attrs', { [key!]: fromCssColor(val($event)) })"
          /><span>{{ name }}</span></label
        >
      </section>
      <section v-if="node.tag === 'bitmap'" class="property-section">
        <label class="stack-label"
          >Transparenzfarbe (Cockpit-Farbwert)<input
            :value="a.tc || ''"
            placeholder="Leer = keine"
            @change="attr('tc', $event)"
        /></label>
      </section>
      <section v-if="isImage" class="property-section">
        <h3>Bilddatei</h3>
        <input
          aria-label="Bildpfad"
          :value="a.file ?? a.symbolname ?? ''"
          @change="attr(node.tag === 'bitmap' ? 'file' : 'symbolname', $event)"
        /><button class="wide-button" @click="emit('image', false)">
          <ImagePlus :size="15" /> Bild hinzufügen…
        </button>
      </section>
      <section
        v-if="node.tag !== 'text' && node.tag !== 'bitmap'"
        class="property-section"
      >
        <h3>Datenquelle</h3>
        <div class="field-grid">
          <label
            ><span>Spur</span
            ><input
              aria-label="Spur"
              type="number"
              min="-1"
              max="8"
              :value="a.nr || 0"
              @change="attr('nr', $event)" /></label
          ><label v-if="!g.sized"
            ><span>NKS</span
            ><input
              aria-label="Nachkommastellen"
              type="number"
              min="0"
              max="6"
              :value="a.nks || 0"
              @change="attr('nks', $event)"
          /></label>
        </div>
        <select
          aria-label="Zuordnung"
          :value="a.sort || '0'"
          @change="attr('sort', $event)"
        >
          <option value="0">Feste Spur / Fahrzeug-ID</option>
          <option value="1">Nach Rennposition</option></select
        ><label class="stack-label"
          >AddOn-Variablenname<input
            :value="a.addonvariablename || ''"
            placeholder="z. B. PC_StatusText"
            @change="attr('addonvariablename', $event)"
        /></label>
        <div v-if="!g.sized" class="field-grid">
          <label
            ><span>Vor</span
            ><input
              :value="a.prefix || ''"
              @change="attr('prefix', $event)" /></label
          ><label
            ><span>Nach</span
            ><input :value="a.post || ''" @change="attr('post', $event)"
          /></label>
        </div>
      </section>
      <section v-if="!g.sized && node.tag !== 'text'" class="property-section">
        <h3>Format</h3>
        <label class="stack-label"
          >Messstelle / Historienposition<input
            type="number"
            :value="a.mst || 0"
            @change="attr('mst', $event)"
        /></label>
        <label class="stack-label"
          >Platzhalterlänge<input
            type="number"
            min="0"
            :value="a.len || 0"
            @change="attr('len', $event)"
        /></label>
        <label class="stack-label"
          >Option<input
            :value="a.option || ''"
            placeholder="z. B. h, R#, Z#, SR#, SZ#"
            @change="attr('option', $event)"
        /></label>
      </section>
      <section class="property-section">
        <button class="wide-button" @click="emit('repeat')">
          <Copy :size="15" /> Für weitere Spur kopieren…
        </button>
        <div class="button-pair">
          <button @click="emit('duplicate')">
            <Copy :size="14" /> Duplizieren</button
          ><button class="danger-quiet" @click="emit('remove')">
            <Trash2 :size="14" /> Löschen
          </button>
        </div>
      </section>
      <details class="property-section raw-attributes">
        <summary>Alle XML-Attribute <ChevronDown :size="14" /></summary>
        <p class="muted">
          Originalwerte. Cockpit-spezifische Optionen bleiben erhalten.
        </p>
        <label v-for="(value, key) in node.attrs" :key="key" class="stack-label"
          ><code>{{ key }}</code
          ><input
            :aria-label="`XML ${key}`"
            :value="value"
            @change="attr(String(key), $event)"
        /></label>
      </details>
    </template>
    <template v-else>
      <div class="property-section selected-heading">
        <div class="eyebrow">ARBEITSFLÄCHE</div>
        <h2>Rennbildschirm</h2>
        <p class="muted">
          Wähle ein Element auf der Fläche oder in der Ebenenliste aus.
        </p>
      </div>
      <section class="property-section">
        <h3>Auflösung</h3>
        <div class="field-grid">
          <label
            ><span>B</span
            ><input
              aria-label="Bildschirmbreite"
              type="number"
              min="1"
              max="16384"
              :value="doc.width"
              @change="
                emit('base', {
                  [doc.base.tag === 'dim' ? 'xmax' : 'w']: num($event),
                })
              " /></label
          ><label
            ><span>H</span
            ><input
              aria-label="Bildschirmhöhe"
              type="number"
              min="1"
              max="16384"
              :value="doc.height"
              @change="
                emit('base', {
                  [doc.base.tag === 'dim' ? 'ymax' : 'h']: num($event),
                })
              "
          /></label>
        </div>
        <label class="stack-label"
          >Fahrer / Spuren<select
            :value="doc.slots"
            @change="emit('base', { slots: num($event) })"
          >
            <option v-for="n in 8" :key="n" :value="n">{{ n }} Fahrer</option>
          </select></label
        ><label class="stack-label"
          >Fahrerposition<select
            :value="doc.base.attrs.fahrerposfix ?? '-1'"
            @change="emit('base', { fahrerposfix: val($event) })"
          >
            <option value="1">Feste Fahrerposition</option>
            <option value="0">Nach Rennposition</option>
            <option value="-1">Cockpit-Einstellung übernehmen</option>
          </select></label
        >
      </section>
      <section class="property-section">
        <h3>Hintergrund</h3>
        <label class="color-field"
          ><input
            aria-label="Hintergrundfarbe"
            type="color"
            :value="toCssColor(doc.base.attrs.bcolor)"
            @change="emit('base', { bcolor: fromCssColor(val($event)) })"
          /><span>Farbe</span><code>{{ doc.base.attrs.bcolor }}</code></label
        ><input
          aria-label="Hintergrundbild"
          :value="doc.base.attrs.bimage || ''"
          placeholder="Kein Hintergrundbild"
          @change="emit('base', { bimage: val($event) })"
        /><button class="wide-button" @click="emit('image', true)">
          <ImagePlus :size="15" /> Hintergrund hinzufügen…
        </button>
      </section>
      <section class="property-section">
        <h3>Dateiformat</h3>
        <div class="format-info">
          <span>Cockpit-XP XML</span><code>{{ encoding.toUpperCase() }}</code>
        </div>
        <p class="muted">
          Beim Überschreiben entsteht eine Sicherung der vorherigen Datei.
          Unbearbeitete XML-Bereiche bleiben erhalten.
        </p>
      </section>
      <section class="property-section shortcut-list">
        <h3>Tastenkürzel</h3>
        <p>Speichern <kbd>Strg S</kbd></p>
        <p>Rückgängig <kbd>Strg Z</kbd></p>
        <p>Duplizieren <kbd>Strg D</kbd></p>
        <p>Verschieben <kbd>↑ ↓ ← →</kbd></p>
        <p>10 Pixel <kbd>Umschalt ↑</kbd></p>
        <p>Mehrfachauswahl <kbd>Umschalt Klick</kbd></p>
      </section>
    </template>
  </aside>
</template>
