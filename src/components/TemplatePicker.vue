<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, Check, SlidersHorizontal, SearchX } from "@lucide/vue";
import RbsCanvas from "./RbsCanvas.vue";
import {
  filterTemplates,
  arrangementLabels,
  createTemplate,
  type TemplateKind,
  type TemplateArrangement,
  type TemplateTone,
} from "../core/templates";
import { parseRbs } from "../core/xml";
import { createSimulation } from "../core/simulator";
const props = defineProps<{
  modelValue: TemplateKind | null;
  slots: number;
  width: number;
  height: number;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: TemplateKind | null];
  "update:slots": [value: number];
}>();
const arrangement = ref<TemplateArrangement | "all">("all");
const tone = ref<TemplateTone | "all">("all");
const filtered = computed(() =>
  filterTemplates(props.slots, arrangement.value, tone.value),
);
// A hidden choice must never be created by the dialog's primary action.
watch(
  filtered,
  (items) => {
    if (!items.some((t) => t.id === props.modelValue))
      emit("update:modelValue", items[0]?.id ?? null);
  },
  { immediate: true },
);
const selected = computed(() =>
  filtered.value.find((t) => t.id === props.modelValue),
);
function resetFilters() {
  arrangement.value = "all";
  tone.value = "all";
}
const sim = createSimulation();
const previews = computed(() =>
  filtered.value.map((t) => ({
    ...t,
    doc: parseRbs(createTemplate(t.id, props.width, props.height, props.slots)),
  })),
);
</script>
<template>
  <div class="template-filters" role="group" aria-label="Vorlagen filtern">
    <label class="stack-label"
      >Fahreranzahl
      <select
        :value="slots"
        aria-label="Fahreranzahl der Vorlage"
        @change="
          emit(
            'update:slots',
            Number(($event.target as HTMLSelectElement).value),
          )
        "
      >
        <option v-for="n in 8" :key="n" :value="n">{{ n }} Fahrer</option>
      </select>
    </label>
    <label class="stack-label"
      >Fahrer-Anordnung
      <select v-model="arrangement" aria-label="Fahrer-Anordnung filtern">
        <option value="all">Alle Anordnungen</option>
        <option value="vertical">Vertikal · untereinander</option>
        <option value="horizontal">Horizontal · nebeneinander</option>
        <option value="grid">Raster · mehrere Reihen</option>
      </select>
    </label>
    <label class="stack-label"
      >Farbwelt
      <select v-model="tone" aria-label="Farbwelt filtern">
        <option value="all">Alle Farben</option>
        <option value="light">Hell &amp; freundlich</option>
        <option value="dark">Dunkel</option>
      </select>
    </label>
  </div>
  <div class="template-result-summary">
    <span role="status"
      ><SlidersHorizontal :size="13" /> {{ filtered.length }}
      {{ filtered.length === 1 ? "Vorlage" : "Vorlagen" }} für
      {{ slots }} Fahrer</span
    >
    <button
      v-if="arrangement !== 'all' || tone !== 'all'"
      class="template-reset"
      @click="resetFilters"
    >
      Filter zurücksetzen
    </button>
  </div>
  <div
    v-if="previews.length"
    class="template-options"
    aria-label="RBS-Vorlagen"
  >
    <button
      v-for="t in previews"
      :key="t.id"
      type="button"
      :class="{ chosen: modelValue === t.id }"
      :aria-pressed="modelValue === t.id"
      :aria-label="t.name"
      :data-template="t.id"
      @click="emit('update:modelValue', t.id)"
    >
      <div
        class="template-preview"
        :class="{ blank: t.id === 'blank' }"
        aria-hidden="true"
      >
        <Plus v-if="t.id === 'blank'" :size="30" />
        <RbsCanvas
          v-else
          :doc="t.doc"
          :sim="sim"
          :selected="[]"
          :assets="{}"
          :zoom="1"
          :grid="false"
          :snap="false"
          :busy="false"
          :preview="true"
          embedded
        />
        <Check v-if="modelValue === t.id" class="template-check" :size="20" />
      </div>
      <strong>{{ t.name }}</strong
      ><span class="template-description">{{ t.description }}</span>
      <span class="template-meta"
        ><span>{{ arrangementLabels[t.arrangement] }}</span
        ><span
          >{{
            t.minDrivers === t.maxDrivers
              ? t.minDrivers
              : `${t.minDrivers}–${t.maxDrivers}`
          }}
          Fahrer</span
        ></span
      >
    </button>
  </div>
  <div v-else class="template-empty">
    <SearchX :size="28" />
    <strong>Keine passende Vorlage</strong>
    <p>
      Wähle eine andere Fahreranzahl oder setze die Anordnung und Farbwelt
      zurück.
    </p>
    <button @click="resetFilters">Filter zurücksetzen</button>
  </div>
  <p class="template-selection" aria-live="polite">
    {{
      selected
        ? `Ausgewählt: ${selected.name} · ${slots} Fahrer`
        : "Keine Vorlage ausgewählt"
    }}<span v-if="selected"
      >Vorschau und Rennbildschirm verwenden diese Fahreranzahl.</span
    >
  </p>
</template>
