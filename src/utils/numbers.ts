export const numberFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 })
export const oneDecimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export function parseLocalizedNumber(value: unknown): number {
  if (value == null) return Number.NaN
  let text = String(value).trim().replace(/\s/g, '')
  if (!text || text === '-' || text.toLowerCase() === 'null') return Number.NaN
  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) text = text.replace(/\./g, '').replace(',', '.')
    else text = text.replace(/,/g, '')
  } else if (text.includes(',')) {
    text = text.replace(',', '.')
  }
  const number = Number(text)
  return Number.isFinite(number) ? number : Number.NaN
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return '—'
  const minutes = Math.max(0, Math.round(milliseconds / 60_000))
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

export function formatLongDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days) return `${days} g ${hours} h${minutes ? ` ${minutes} min` : ''}`
  return `${hours} h${minutes ? ` ${minutes} min` : ''}`
}

export function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  return `${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, '0')} min`
}

export function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${oneDecimal.format(value / 1_000_000)} M`
  if (value >= 10_000) return `${oneDecimal.format(value / 1000)}k`
  return numberFmt.format(Math.round(value))
}

export function formatCompact(value: number): string {
  if (value >= 10_000) return `${oneDecimal.format(value / 1000)}k`
  return numberFmt.format(Math.round(value))
}

export function countLabel(count: number, singular: string, plural: string): string {
  return `${numberFmt.format(count)} ${count === 1 ? singular : plural}`
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function csvEscape(value: string): string {
  const text = String(value).replace(/"/g, '""')
  return /[;"\r\n]/.test(text) ? `"${text}"` : text
}
