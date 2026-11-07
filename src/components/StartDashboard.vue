<script setup lang="ts">
import {
  Plus,
  FolderOpen,
  ArrowUpRight,
  Clock3,
  Monitor,
  X,
  ArrowRight,
} from "@lucide/vue";
import type { RecentDocument } from "../core/recent-documents";
defineProps<{
  documents: RecentDocument[];
  busy: boolean;
  hasDocument: boolean;
  title: string;
  dirty: boolean;
}>();
defineEmits<{
  create: [];
  open: [];
  resume: [];
  recent: [document: RecentDocument];
  remove: [key: string];
}>();
function name(path: string) {
  const parts = path.split(/[\\/]/);
  return parts.at(-1) || path;
}
function folder(path: string) {
  return path.split(/[\\/]/).slice(0, -1).join(" / ");
}
function when(time: number) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);
}
</script>
<template>
  <main class="start-dashboard" aria-label="Startdashboard">
    <div class="dashboard-content">
      <div class="dashboard-heading">
        <div>
          <span class="eyebrow">DEINE RENNBILDSCHIRME</span>
          <h1>Willkommen in RBS Studio.</h1>
          <p>
            Gestalte den nächsten Renntag. Oder arbeite dort weiter, wo du
            aufgehört hast.
          </p>
        </div>
        <span class="dashboard-local"
          ><span class="status-dot" /> Lokal auf deinem Computer</span
        >
      </div>
      <div class="dashboard-actions">
        <button
          class="dashboard-action create-action"
          :disabled="busy"
          @click="$emit('create')"
        >
          <span class="dashboard-action-icon"><Plus :size="25" /></span>
          <span
            ><strong>Neuen RBS anlegen</strong
            ><small
              >Leere Arbeitsfläche oder Rennlayout als Vorlage</small
            ></span
          ><ArrowUpRight :size="20" />
        </button>
        <button
          class="dashboard-action"
          :disabled="busy"
          @click="$emit('open')"
        >
          <span class="dashboard-action-icon"><FolderOpen :size="25" /></span>
          <span
            ><strong>RBS öffnen</strong
            ><small>Vorhandenen Rennbildschirm bearbeiten</small></span
          ><ArrowUpRight :size="20" />
        </button>
      </div>
      <button
        v-if="hasDocument"
        class="dashboard-resume"
        :disabled="busy"
        @click="$emit('resume')"
      >
        <Monitor :size="19" /><span
          >Zurück zu <strong>{{ title }}</strong
          ><small v-if="dirty">
            · Ungespeicherte Änderungen bleiben erhalten</small
          ></span
        ><ArrowRight :size="18" />
      </button>
      <div class="recent-heading">
        <h2><Clock3 :size="18" /> Zuletzt geöffnet</h2>
        <span>{{ documents.length }} / 12</span>
      </div>
      <div v-if="documents.length" class="recent-grid">
        <article
          v-for="entry in documents"
          :key="entry.key"
          class="recent-card"
        >
          <button
            class="recent-open"
            :disabled="busy"
            :title="entry.path"
            :aria-label="`${name(entry.path)} öffnen`"
            @click="$emit('recent', entry)"
          >
            <div class="recent-image">
              <img
                v-if="entry.thumbnail"
                :src="entry.thumbnail"
                :alt="`Vorschau: ${name(entry.path)}`"
              />
              <div v-else class="recent-placeholder">
                <Monitor :size="34" /><span
                  >{{ entry.width }} × {{ entry.height }}</span
                >
              </div>
              <span class="recent-dimensions"
                >{{ entry.width }} × {{ entry.height }}</span
              >
            </div>
            <div class="recent-info">
              <strong>{{ name(entry.path) }}</strong
              ><span>{{ folder(entry.path) || "Browser-Vorschaukopie" }}</span>
              <small
                >{{ when(entry.openedAt)
                }}<template v-if="!entry.native">
                  · Vorschaukopie</template
                ></small
              >
            </div>
          </button>
          <button
            class="recent-remove"
            :disabled="busy"
            :aria-label="`${name(entry.path)} aus Verlauf entfernen`"
            title="Nur aus dem Verlauf entfernen"
            @click="$emit('remove', entry.key)"
          >
            <X :size="14" />
          </button>
        </article>
      </div>
      <div v-else class="dashboard-empty">
        <div class="empty-screens"><Monitor :size="38" /></div>
        <h3>Hier stehen bald deine Rennbildschirme.</h3>
        <p>
          Öffne eine RBS-Datei. Beim nächsten Start findest du sie hier mit
          einer kleinen Vorschau wieder.
        </p>
      </div>
      <p class="dashboard-footnote">
        Der Verlauf bleibt lokal. Entfernen aus dieser Liste löscht keine
        RBS-Datei.
      </p>
    </div>
  </main>
</template>
<style scoped>
.start-dashboard {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background:
    radial-gradient(ellipse at 85% 0%, #16334c66, transparent 55%), #0d1420;
  padding: 48px 56px 28px;
}
.dashboard-content {
  max-width: 1180px;
  margin: 0 auto;
}
.dashboard-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 34px;
}
h1 {
  font-size: 30px;
  letter-spacing: -0.7px;
  font-weight: 650;
  margin: 12px 0;
}
p {
  color: #8b9caf;
  font-size: 13px;
  line-height: 1.7;
}
.dashboard-local {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #8b9caf;
  font-size: 11px;
  white-space: nowrap;
}
.dashboard-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-bottom: 24px;
}
.dashboard-action {
  padding: 24px;
  text-align: left;
  background: #172334;
  border: 1px solid #304159;
  border-radius: 12px;
  gap: 18px;
}
.dashboard-action:hover {
  border-color: #76c7ff;
  background: #1b2d42;
}
.dashboard-action > span:nth-child(2) {
  flex: 1;
}
.dashboard-action strong {
  display: block;
  font-size: 16px;
  color: #e9f1f9;
  margin-bottom: 7px;
}
.dashboard-action small {
  font-size: 12px;
  white-space: normal;
}
.dashboard-action-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  background: #253c54;
  color: #a9dcff;
  border-radius: 12px;
}
.create-action {
  background: #173049;
  border-color: #3c6485;
}
.create-action .dashboard-action-icon {
  background: #76c7ff;
  color: #0d1420;
}
.dashboard-resume {
  width: 100%;
  padding: 15px 18px;
  justify-content: flex-start;
  border: 1px solid #3f3940;
  background: #28212a;
  margin-bottom: 28px;
  color: #edb975;
}
.dashboard-resume > span {
  flex: 1;
  text-align: left;
}
.recent-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 34px 0 18px;
}
.recent-heading h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
}
.recent-heading > span {
  color: #718299;
  font-size: 11px;
}
.recent-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
.recent-card {
  position: relative;
  min-width: 0;
  background: #152131;
  border: 1px solid #2a394d;
  border-radius: 12px;
  overflow: hidden;
}
.recent-card:hover {
  border-color: #527a9d;
}
.recent-open {
  display: block;
  padding: 0;
  width: 100%;
  border: 0;
  border-radius: 0;
  text-align: left;
  white-space: normal;
}
.recent-image {
  height: 174px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #080d15;
  overflow: hidden;
}
.recent-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.recent-dimensions {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: #0b1423db;
  color: #b6c8d8;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 10px;
}
.recent-info {
  padding: 17px 18px;
}
.recent-info strong {
  display: block;
  font-size: 14px;
  color: #e1eaf4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-info > span {
  display: block;
  color: #92a5ba;
  font-size: 11px;
  margin: 6px 0 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-info small {
  font-size: 10px;
  color: #73869b;
}
.recent-remove {
  position: absolute;
  top: 9px;
  right: 9px;
  background: #0b1423df;
  border: 1px solid #3b4c61;
  padding: 5px;
}
.recent-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #58728e;
}
.dashboard-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 55px 24px;
  border: 1px dashed #304159;
  border-radius: 12px;
  background: #111c2b77;
}
.empty-screens {
  color: #57728c;
  margin-bottom: 20px;
}
.dashboard-empty h3 {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 10px;
}
.dashboard-empty p {
  max-width: 450px;
  font-size: 12px;
}
.dashboard-footnote {
  font-size: 11px;
  margin-top: 24px;
  color: #63758b;
}
@media (max-width: 1200px) {
  .start-dashboard {
    padding: 30px;
  }
  .dashboard-local {
    display: none;
  }
  .recent-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dashboard-action {
    padding: 20px;
  }
  .dashboard-action small {
    font-size: 11px;
  }
}
</style>
