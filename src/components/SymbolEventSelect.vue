<script setup lang="ts">
import { computed } from "vue";
import { cockpitEvents } from "../core/cockpit-events";

const props = defineProps<{ label: string; modelValue?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const options = [{ id: 0, label: "Kein Ereignis" }, ...cockpitEvents];
const raw = computed(() => props.modelValue ?? "0");
const known = computed(() => options.find((e) => e.id === Number(raw.value)));
const selected = computed(() =>
  known.value ? String(known.value.id) : raw.value,
);
function change(event: Event) {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
}
function changeId(event: Event) {
  const input = event.target as HTMLInputElement;
  if (
    input.value &&
    input.checkValidity() &&
    Number.isSafeInteger(Number(input.value))
  )
    emit("update:modelValue", input.value);
}
</script>

<template>
  <div class="symbol-event-select">
    <label class="stack-label">
      {{ label }}
      <select
        :aria-label="label"
        :value="selected"
        :title="known?.label"
        @change="change"
      >
        <option v-if="!known" :value="raw">
          Unbekanntes Ereignis (ID {{ raw }})
        </option>
        <option
          v-for="event in options"
          :key="event.id"
          :value="String(event.id)"
        >
          {{ event.label }}
        </option>
      </select>
    </label>
    <details>
      <summary>Ereignis-ID manuell eingeben</summary>
      <input
        :aria-label="`${label}: Ereignis-ID`"
        :value="raw"
        type="number"
        min="0"
        step="1"
        @change="changeId"
      />
    </details>
  </div>
</template>

<style scoped>
.symbol-event-select {
  margin-bottom: 14px;
}
select {
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
}
details {
  margin-top: 6px;
  font-size: 10px;
  color: var(--muted, #8b9bad);
}
summary {
  cursor: pointer;
}
details input {
  width: 100%;
  margin-top: 6px;
}
</style>
