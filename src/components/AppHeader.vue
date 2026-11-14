<script setup lang="ts">
import { ref } from 'vue'
import type { FitMeta, ParseProgress } from '../types/fit'

// Vite replaces this compile-time constant with package.json's version.
const appVersion = __APP_VERSION__

withDefaults(defineProps<{
  meta: FitMeta | null
  status: string
  statusKind: '' | 'success' | 'error'
  progress: ParseProgress | null
  importing: boolean
  summary: string
}>(), {
  meta: null,
  status: 'Nessun archivio caricato',
  statusKind: '',
  progress: null,
  importing: false,
  summary: '',
})

const emit = defineEmits<{
  selectFile: [file: File]
  showHelp: []
}>()

const input = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

function openFilePicker() {
  input.value?.click()
}

function onInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) emit('selectFile', file)
  target.value = ''
}

function onDragEnter(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function onDragLeave(event: DragEvent) {
  event.preventDefault()
  const related = event.relatedTarget as Node | null
  if (related && (event.currentTarget as HTMLElement).contains(related)) return
  dragOver.value = false
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('selectFile', file)
}
</script>

<template>
  <header
    id="topbar"
    class="topbar"
    :class="{ dragover: dragOver }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <a class="brand" href="./" aria-label="Fit Archive">
      <span class="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" /></svg></span>
      <span class="brand-wordmark">
        <span>fit<span class="brand-light">archive</span></span>
        <span class="brand-version" :aria-label="`Versione ${appVersion}`">v{{ appVersion }}</span>
      </span>
    </a>

    <div class="header-center" aria-live="polite">
      <div v-if="meta" class="header-archive-meta">
        <div class="header-file-name">{{ meta.filename }}</div>
        <div class="parse-summary">{{ summary }}</div>
      </div>
      <div v-else class="header-import-status">
        <span class="import-status" :class="statusKind">{{ status }}</span>
        <div v-if="progress && importing" class="progress-track">
          <span :style="{ width: `${progress.percent}%` }" />
        </div>
      </div>
    </div>

    <div class="header-actions">
      <span class="privacy-pill"><span class="privacy-dot" /> Solo locale</span>
      <button class="button button-quiet header-help" type="button" aria-haspopup="dialog" @click="emit('showHelp')">
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M7.9 7.5a2.2 2.2 0 1 1 3.8 1.5c-1 .9-1.7 1.2-1.7 2.5M10 14.4v.1" /></svg>
        Come recuperare i dati
      </button>
      <button class="button button-primary" type="button" :disabled="importing" @click="openFilePicker">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M3.5 12.5v3A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5v-3" /></svg>
        Carica ZIP
      </button>
      <input ref="input" type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden @change="onInputChange" />
    </div>
  </header>
</template>
