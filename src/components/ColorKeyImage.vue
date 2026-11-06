<script setup lang="ts">
import { ref, watch } from "vue";
import { toCssColor } from "../core/xml";
const props = defineProps<{
  src: string;
  colorKey?: string;
  width: number;
  height: number;
}>();
const processed = ref("");
let serial = 0;
watch(
  () => [props.src, props.colorKey],
  () => {
    const token = ++serial;
    processed.value = props.src;
    if (!props.src || props.colorKey === undefined || props.colorKey === "")
      return;
    const img = new Image();
    img.onload = () => {
      if (token !== serial || img.width * img.height > 16_000_000) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height),
          hex = toCssColor(props.colorKey);
        const r = parseInt(hex.slice(1, 3), 16),
          g = parseInt(hex.slice(3, 5), 16),
          b = parseInt(hex.slice(5, 7), 16);
        for (let i = 0; i < data.data.length; i += 4)
          if (
            data.data[i] === r &&
            data.data[i + 1] === g &&
            data.data[i + 2] === b
          )
            data.data[i + 3] = 0;
        ctx.putImageData(data, 0, 0);
        processed.value = canvas.toDataURL();
      } catch {
        processed.value = props.src;
      }
    };
    img.src = props.src;
  },
  { immediate: true },
);
</script>
<template>
  <image
    :href="processed"
    :width="width"
    :height="height"
    preserveAspectRatio="none"
  />
</template>
