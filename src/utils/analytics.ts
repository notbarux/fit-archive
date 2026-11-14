import type { AggregateRow, DailyStep, DistributionStats, FitAnalytics, SleepNight, WeekAggregate } from '../types/fit'
import { dateFromKey, mondayWeekKey } from './date'

export const IT_MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
export const IT_WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

export function aggregateBy<T extends { date: string }>(
  items: T[],
  keyFunction: (item: T) => string,
  field: keyof T,
): Map<string, AggregateRow> {
  const result = new Map<string, AggregateRow>()
  for (const item of items) {
    const key = keyFunction(item)
    const value = Number(item[field])
    if (!Number.isFinite(value)) continue
    if (!result.has(key)) result.set(key, { key, total: 0, count: 0, average: 0 })
    const group = result.get(key)!
    group.total += value
    group.count += 1
  }
  result.forEach((group) => { group.average = group.count ? group.total / group.count : 0 })
  return result
}

export function aggregateByMonth<T extends { date: string }>(items: T[], field: keyof T): Map<string, AggregateRow> {
  return aggregateBy(items, (item) => item.date.slice(0, 7), field)
}

export function annualSteps(data: FitAnalytics): AggregateRow[] {
  return [...aggregateBy(data.steps.filter((item) => item.steps != null), (item) => item.date.slice(0, 4), 'steps').values()]
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function monthlyStepsMatrix(data: FitAnalytics): { years: string[]; values: Map<string, AggregateRow> } {
  const monthly = aggregateBy(data.steps.filter((item) => item.steps != null), (item) => item.date.slice(0, 7), 'steps')
  return { years: [...new Set([...monthly.keys()].map((key) => key.slice(0, 4)))].sort(), values: monthly }
}

export function annualSleep(data: FitAnalytics): AggregateRow[] {
  return [...aggregateBy(data.sleep, (item) => item.date.slice(0, 4), 'ms').values()]
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function monthlySleep(data: FitAnalytics): AggregateRow[] {
  return [...aggregateBy(data.sleep, (item) => item.date.slice(0, 7), 'ms').values()]
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function sleepWeeks(data: FitAnalytics, mode: 'average' | 'total'): { best: WeekAggregate[]; worst: WeekAggregate[] } {
  const grouped = aggregateBy(data.sleep, (item) => mondayWeekKey(item.date), 'ms')
  const values: WeekAggregate[] = [...grouped.values()].map((item) => ({
    ...item,
    score: mode === 'total' ? item.total : item.average,
    start: item.key,
  }))
  return {
    best: values.slice().sort((a, b) => b.score - a.score).slice(0, 10),
    worst: values.slice().sort((a, b) => a.score - b.score).slice(0, 10),
  }
}

export function weekdaySleepStats(sleep: SleepNight[]) {
  const weekdays = new Map<number, number[]>()
  sleep.forEach((item) => {
    const day = dateFromKey(item.date).getDay()
    if (!weekdays.has(day)) weekdays.set(day, [])
    weekdays.get(day)!.push(item.hours)
  })
  return [...weekdays.entries()].map(([day, values]) => ({
    day,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    count: values.length,
  })).sort((a, b) => b.average - a.average)
}

export function distributionStats(rawValues: number[]): DistributionStats | null {
  const values = rawValues.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  if (!values.length) return null

  const count = values.length
  const mean = values.reduce((sum, value) => sum + value, 0) / count
  const median = count % 2
    ? values[(count - 1) / 2]
    : (values[count / 2 - 1] + values[count / 2]) / 2
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / count
  const deviation = Math.sqrt(variance)
  let min = values[0]
  let max = values[count - 1]
  if (max === min) { min = Math.max(0, min - 1); max += 1 }

  const binCount = Math.max(8, Math.min(18, Math.round(Math.sqrt(count))))
  const binWidth = (max - min) / binCount
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * binWidth
    return { start, end: start + binWidth, center: start + binWidth / 2, count: 0 }
  })
  values.forEach((value) => {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - min) / binWidth)))
    bins[index].count += 1
  })

  // The normal curve is a visual reference derived from the sample mean and deviation.
  const peakCount = Math.max(...bins.map((bin) => bin.count), 1)
  const yMax = peakCount * 1.22
  const curve = deviation > 0
    ? Array.from({ length: 101 }, (_, index) => {
      const x = min + ((max - min) * index / 100)
      const z = (x - mean) / deviation
      const expectedCount = count * binWidth / (deviation * Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z)
      return { x, y: Math.min(yMax * 0.96, expectedCount) }
    })
    : []

  return { count, mean, median, deviation, min, max, bins, curve }
}

export function distributionWeekdayLabel(date: string): string {
  return IT_WEEKDAYS[dateFromKey(date).getDay()]
}

export function compareStepDaysDesc(a: DailyStep, b: DailyStep): number {
  return (b.steps ?? -1) - (a.steps ?? -1) || a.date.localeCompare(b.date)
}

export function compareDistanceDaysDesc(a: DailyStep, b: DailyStep): number {
  return (b.km ?? -1) - (a.km ?? -1) || a.date.localeCompare(b.date)
}

export function compareSleepDesc(a: SleepNight, b: SleepNight): number {
  return b.ms - a.ms || a.date.localeCompare(b.date)
}
