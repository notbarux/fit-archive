import type { FitAnalytics } from '../types/fit'
import { csvEscape } from '../utils/numbers'

export function buildDailyCsv(data: FitAnalytics): string {
  const headers = ['Data', 'Passi', 'Distanza_km', 'Sonno_ore', 'Fonte_passi', 'Fonte_distanza', 'Metodo_sonno']
  const sleepByDate = new Map(data.sleep.map((item) => [item.date, item]))
  const allDates = [...new Set([...data.steps.map((item) => item.date), ...data.sleep.map((item) => item.date)])].sort()
  const rows = [headers.join(';')]

  for (const date of allDates) {
    const step = data.steps.find((item) => item.date === date)
    const sleep = sleepByDate.get(date)
    rows.push([
      date,
      step?.steps != null ? String(Math.round(step.steps)) : '',
      step?.km != null ? String(Number(step.km.toFixed(3))).replace('.', ',') : '',
      sleep ? String(Number(sleep.hours.toFixed(2))).replace('.', ',') : '',
      step?.stepsSource ? csvEscape(step.stepsSource) : '',
      step?.distanceSource ? csvEscape(step.distanceSource) : '',
      sleep ? csvEscape(sleep.method) : '',
    ].join(';'))
  }
  return `\ufeff${rows.join('\r\n')}`
}

export function downloadDailyCsv(data: FitAnalytics): void {
  const blob = new Blob([buildDailyCsv(data)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'fit-archive-statistiche-giornaliere.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
