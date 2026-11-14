import { computed, ref } from 'vue'
import type { FitAnalytics, ParseProgress } from '../types/fit'
import { parseFitArchive } from '../services/googleFitParser'

export function useFitArchive() {
  const data = ref<FitAnalytics | null>(null)
  const fileName = ref('')
  const isImporting = ref(false)
  const status = ref('Nessun archivio caricato')
  const statusKind = ref<'success' | 'error' | ''>('')
  const progress = ref<ParseProgress | null>(null)
  const errorMessage = ref('')
  const toastMessage = ref('')

  const headerSummary = computed(() => {
    if (!data.value) return ''
    const meta = data.value.meta
    return `${meta.fileCount.toLocaleString('it-IT')} file · ${meta.jsonCount.toLocaleString('it-IT')} JSON · ${meta.csvCount.toLocaleString('it-IT')} CSV · ${meta.pointCount.toLocaleString('it-IT')} punti · ${meta.sessionCount.toLocaleString('it-IT')} sessioni`
  })

  async function loadFile(file: File) {
    if (!/\.zip$/i.test(file.name)) {
      status.value = 'Seleziona un archivio ZIP di Google Takeout.'
      statusKind.value = 'error'
      return
    }

    isImporting.value = true
    data.value = null
    fileName.value = file.name
    errorMessage.value = ''
    status.value = `Apertura di ${file.name}…`
    statusKind.value = ''
    progress.value = { processed: 0, total: 0, percent: 3, filename: file.name }

    try {
      const parsed = await parseFitArchive(file, (nextProgress) => {
        progress.value = nextProgress
        status.value = `Analisi dell’archivio… ${nextProgress.processed.toLocaleString('it-IT')} / ${nextProgress.total.toLocaleString('it-IT')} file`
      })
      data.value = parsed
      progress.value = { processed: parsed.meta.fileCount, total: parsed.meta.fileCount, percent: 100, filename: file.name }
      status.value = `Importazione completata · ${parsed.steps.length.toLocaleString('it-IT')} giorni con passi · ${parsed.sleep.length.toLocaleString('it-IT')} notti`
      statusKind.value = 'success'
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Errore durante la lettura dell’archivio.'
      errorMessage.value = message
      status.value = message
      statusKind.value = 'error'
      data.value = null
    } finally {
      isImporting.value = false
    }
  }

  function showToast(message: string) {
    toastMessage.value = message
    window.setTimeout(() => {
      if (toastMessage.value === message) toastMessage.value = ''
    }, 2600)
  }

  return {
    data,
    fileName,
    isImporting,
    status,
    statusKind,
    progress,
    errorMessage,
    toastMessage,
    headerSummary,
    loadFile,
    showToast,
  }
}
