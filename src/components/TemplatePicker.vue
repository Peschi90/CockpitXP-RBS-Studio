<script setup lang="ts">
import { computed } from "vue";
import { Plus, Check } from "@lucide/vue";
import RbsCanvas from "./RbsCanvas.vue";
import {
  templates,
  createTemplate,
  type TemplateKind,
} from "../core/templates";
import { parseRbs } from "../core/xml";
import { createSimulation } from "../core/simulator";
const props = defineProps<{
  modelValue: TemplateKind;
  slots: number;
  width: number;
  height: number;
}>();
const emit = defineEmits<{ "update:modelValue": [value: TemplateKind] }>();
const sim = createSimulation();
const previews = computed(() =>
  templates.map((t) => ({
    ...t,
    doc: parseRbs(createTemplate(t.id, props.width, props.height, props.slots)),
  })),
);
</script>
<template>
  <div class="template-options" aria-label="RBS-Vorlagen">
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
      ><span>{{ t.description }}</span>
    </button>
  </div>
</template>
