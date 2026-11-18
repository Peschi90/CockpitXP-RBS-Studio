<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

const props = defineProps<{
  dirty: boolean;
  editorBusy: boolean;
  save: () => Promise<void>;
}>();
const emit = defineEmits<{
  open: [value: boolean];
  busy: [value: boolean];
}>();
const offer = ref<{ version: string; currentVersion: string; size: number }>();
const dialog = ref<HTMLDialogElement>();
const busy = ref(false);
const error = ref("");
const downloaded = ref(0);
const status = ref("");
const percent = computed(() =>
  offer.value
    ? Math.min(100, Math.floor((downloaded.value * 100) / offer.value.size))
    : 0,
);

onMounted(async () => {
  if (!isTauri()) return;
  try {
    const available = await invoke<typeof offer.value>("check_for_update");
    if (!available) return;
    offer.value = available;
    await nextTick();
    dialog.value?.showModal();
    emit("open", true);
  } catch {
    // Startup remains silent when offline or when GitHub is unavailable.
  }
});

function dismiss() {
  if (busy.value) return;
  dialog.value?.close();
  emit("open", false);
}

async function install() {
  if (busy.value || props.editorBusy) return;
  busy.value = true;
  emit("busy", true);
  error.value = "";
  downloaded.value = 0;
  try {
    if (props.dirty) {
      status.value = "Rennbildschirm wird gespeichert …";
      await props.save();
      await nextTick();
      if (props.dirty) {
        error.value =
          "Der Rennbildschirm wurde nicht gespeichert. Bitte speichern oder das Update auf später verschieben.";
        return;
      }
    }
    status.value = "Installer wird heruntergeladen …";
    const progress = new Channel<{ downloaded: number; total: number }>();
    progress.onmessage = (value) => {
      downloaded.value = value.downloaded;
      if (value.downloaded === value.total)
        status.value = "Installer wird geprüft und gestartet …";
    };
    await invoke("install_update", { progress });
    status.value = "Installer gestartet. RBS Studio wird geschlossen …";
  } catch (reason) {
    error.value = `Das Update konnte nicht gestartet werden. ${String(reason)}`;
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
</script>

<template>
  <dialog
    v-if="offer"
    ref="dialog"
    class="update-dialog"
    aria-labelledby="update-title"
    @cancel.prevent="dismiss"
  >
    <h2 id="update-title">Update verfügbar</h2>
    <p>
      RBS Studio {{ offer.version }} ist verfügbar. Installiert ist Version
      {{ offer.currentVersion }}.
    </p>
    <p>
      Jetzt aktualisieren? Der Installer wird von GitHub geladen und gestartet.
      RBS Studio schließt sich dafür.
    </p>
    <p v-if="dirty">Dein geänderter Rennbildschirm wird vorher gespeichert.</p>
    <div v-if="busy" role="status" aria-live="polite">
      <p>{{ status }}</p>
      <progress
        :value="downloaded"
        :max="offer.size"
        aria-label="Update herunterladen"
      />
      <span
        >{{ percent }} % · {{ (offer.size / 1024 / 1024).toFixed(1) }} MB</span
      >
    </div>
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
    <div class="update-actions">
      <button :disabled="busy" autofocus @click="dismiss">Später</button>
      <button class="primary" :disabled="busy || editorBusy" @click="install">
        {{ dirty ? "Speichern und aktualisieren" : "Jetzt aktualisieren" }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.update-dialog {
  margin: auto;
  width: min(520px, calc(100vw - 48px));
  padding: 28px;
  background: #1b222b;
  color: #eef3f8;
  border: 1px solid #414d5c;
  border-radius: 14px;
  box-shadow: 0 30px 120px #0008;
}
.update-dialog::backdrop {
  background: #06090dbb;
  backdrop-filter: blur(5px);
}
h2 {
  margin: 0 0 16px;
}
p {
  margin: 12px 0;
  line-height: 1.6;
}
progress {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  accent-color: #b9e66b;
}
.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
