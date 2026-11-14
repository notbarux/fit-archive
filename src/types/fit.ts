export type MetricKind = 'steps' | 'distance' | 'sleep'

export interface DataPoint {
  metric: MetricKind
  type: string
  start: number
  end: number
  value: number
  stage: number | null
  source: string
  path: string
}

export interface SleepSession {
  start: number
  end: number
  isSleep: boolean
  label: string
  path: string
}

export interface DailyCsvRow {
  date: string
  steps: number | null
  distanceKm: number | null
  signature: string
  path: string
}

export interface DailyStep {
  date: string
  steps: number | null
  km: number | null
  stepsSource: string | null
  distanceSource: string | null
}

export interface SleepNight {
  date: string
  ms: number
  hours: number
  method: string
  source: string
}

export interface ParseProgress {
  processed: number
  total: number
  percent: number
  filename: string
}

export interface FitMeta {
  jsonCount: number
  csvCount: number
  fileCount: number
  pointCount: number
  sessionCount: number
  warnings: string[]
  filename: string
}

export interface RawStats {
  rawStepPoints: number
  rawDistancePoints: number
  sleepStagePoints: number
  dailyCsvRows: number
  sessions: number
}

export interface FitAnalytics {
  steps: DailyStep[]
  sleep: SleepNight[]
  rawStats: RawStats
  meta: FitMeta
}

export interface AggregateRow {
  key: string
  total: number
  count: number
  average: number
}

export interface WeekAggregate extends AggregateRow {
  score: number
  start: string
}

export interface DistributionBin {
  start: number
  end: number
  center: number
  count: number
}

export interface DistributionStats {
  count: number
  mean: number
  median: number
  deviation: number
  min: number
  max: number
  bins: DistributionBin[]
  curve: Array<{ x: number; y: number }>
}

export interface CsvExportRow {
  date: string
  steps: number | null
  km: number | null
  sleepHours: number | null
  stepsSource: string | null
  distanceSource: string | null
  sleepMethod: string | null
}
