export function parseTimestamp(value: unknown, unit: 'auto' | 'ms' | 'ns' = 'auto'): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()))) {
    const number = Number(value)
    if (!Number.isFinite(number)) return Number.NaN
    if (unit === 'ns' || number > 1e17) return number / 1e6
    if (unit === 'ms' || number > 1e11) return number
    if (number > 1e9) return number * 1000
    return Number.NaN
  }
  if (typeof value === 'string') {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime()
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  return Number.NaN
}

export function dateKey(timestamp: number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function localMidnightAfter(timestamp: number): number {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setDate(copy.getDate() + days)
  return copy
}

export function mondayWeekKey(date: string): string {
  const current = dateFromKey(date)
  const day = (current.getDay() + 6) % 7
  current.setDate(current.getDate() - day)
  return dateKey(current)
}

export function formatDate(date: string | Date, options: Intl.DateTimeFormatOptions = {}): string {
  const value = typeof date === 'string' ? dateFromKey(date) : date
  return new Intl.DateTimeFormat('it-IT', options).format(value)
}

export function monthLabel(key: string, includeYear = true): string {
  const [year, month] = key.split('-')
  const formatted = new Intl.DateTimeFormat('it-IT', { month: 'short' }).format(new Date(Number(year), Number(month) - 1, 1))
  return includeYear ? `${formatted} '${year.slice(2)}` : formatted
}

export function dateRangeLabel(items: Array<{ date: string }>): string {
  if (!items.length) return 'nessun dato disponibile'
  return `${formatDate(items[0].date, { day: '2-digit', month: '2-digit', year: 'numeric' })} – ${formatDate(items[items.length - 1].date, { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}
