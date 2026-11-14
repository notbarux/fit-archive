<script setup lang="ts">
import { computed, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import HelpDialog from './components/HelpDialog.vue'
import KpiStrip from './components/KpiStrip.vue'
import StepsSection from './components/StepsSection.vue'
import SleepSection from './components/SleepSection.vue'
import { useFitArchive } from './composables/useFitArchive'
import { downloadDailyCsv } from './services/exportCsv'
import { formatDate } from './utils/date'

const {
  data,
  isImporting,
  status,
  statusKind,
  progress,
  errorMessage,
  toastMessage,
  headerSummary,
  loadFile,
  showToast,
} = useFitArchive()

const helpOpen = ref(false)
const combinedRange = computed(() => {
  if (!data.value) return ''
  const dates = [...data.value.steps.map((item) => item.date), ...data.value.sleep.map((item) => item.date)].sort()
  if (!dates.length) return data.value.meta.filename
  return `${formatDate(dates[0], { day: 'numeric', month: 'long', year: 'numeric' })} — ${formatDate(dates[dates.length - 1], { day: 'numeric', month: 'long', year: 'numeric' })} · ${data.value.meta.filename}`
})

const dataNotice = computed(() => {
  if (!data.value) return ''
  const warnings: string[] = []
  if (!data.value.steps.some((item) => item.steps != null)) warnings.push('Non sono stati rilevati dati di passi: verifica che l’archivio contenga le metriche giornaliere o il dataset step_count.delta.')
  if (!data.value.steps.some((item) => item.km != null)) warnings.push('Non è stata trovata una misura di distanza giornaliera. I km resteranno vuoti: non vengono stimati dai passi.')
  if (!data.value.sleep.length) warnings.push('Non sono state trovate sessioni o fasi di sonno. Il sonno potrebbe non essere stato sincronizzato in Google Fit.')
  if (data.value.meta.warnings.length) warnings.push(`${data.value.meta.warnings.length} file non sono stati letti; i conteggi tecnici sono nell’header.`)
  return ['Elaborazione completata nel browser: il contenuto dell’archivio non viene inviato a nessun server.', ...warnings].join(' ')
})

const hasNoticeWarning = computed(() => Boolean(data.value && (
  !data.value.steps.some((item) => item.steps != null)
  || !data.value.steps.some((item) => item.km != null)
  || !data.value.sleep.length
  || data.value.meta.warnings.length
)))

async function handleFile(file: File) {
  await loadFile(file)
  if (data.value) {
    showToast('Archivio analizzato correttamente.')
    document.getElementById('dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function exportCsv() {
  if (!data.value) return
  downloadDailyCsv(data.value)
  showToast('CSV giornaliero esportato.')
}
</script>

<template>
  <div class="app-root">
    <AppHeader
      :meta="data?.meta ?? null"
      :status="status"
      :status-kind="statusKind"
      :progress="progress"
      :importing="isImporting"
      :summary="headerSummary"
      @select-file="handleFile"
      @show-help="helpOpen = true"
    />

    <main class="page-shell">
      <section v-if="!data" class="empty-state" aria-live="polite">
        <p>{{ errorMessage || 'Carica un archivio ZIP di Google Fit per visualizzare le statistiche.' }}</p>
      </section>

      <section v-else id="dashboard" class="dashboard">
        <div class="dashboard-head">
          <div>
            <div class="eyebrow"><span class="eyebrow-line" /> GOOGLE FIT · ANALISI STORICA</div>
            <h1>Dashboard attività e sonno</h1>
            <p class="data-range">{{ combinedRange }}</p>
          </div>
          <div class="dashboard-actions">
            <button class="button button-quiet" type="button" @click="exportCsv">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 14v2.5h12V14" /></svg>
              Esporta CSV giornaliero
            </button>
          </div>
        </div>

        <div class="notice-bar" :class="{ warning: hasNoticeWarning }">{{ dataNotice }}</div>
        <KpiStrip :data="data" />
        <StepsSection :data="data" />
        <SleepSection :data="data" />
      </section>
    </main>

    <div v-if="toastMessage" class="toast show" role="status" aria-live="polite">{{ toastMessage }}</div>
    <HelpDialog :open="helpOpen" @close="helpOpen = false" />
  </div>
</template>
