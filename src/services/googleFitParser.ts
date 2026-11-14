import JSZip from 'jszip'
import type {
  DailyCsvRow,
  DataPoint,
  FitAnalytics,
  ParseProgress,
  SleepSession,
} from '../types/fit'
import { dateKey, localMidnightAfter, parseTimestamp } from '../utils/date'
import { parseLocalizedNumber } from '../utils/numbers'

interface PointContext {
  source?: string
  type?: string
}

interface CsvDailyBucket {
  steps: number | null
  distanceKm: number | null
  paths: string[]
}

/** Opens and parses a Google Takeout ZIP entirely in memory in the browser. */
export async function parseFitArchive(
  file: File,
  onProgress?: (progress: ParseProgress) => void,
): Promise<FitAnalytics> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Seleziona un archivio ZIP di Google Takeout.')
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { checkCRC32: false, createFolders: false })
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && isFitDataFile(entry.name))
  if (!entries.length) {
    throw new Error('Nell’archivio non trovo file JSON o CSV riconducibili alla cartella Fit. Verifica di aver esportato il prodotto “Fit” da Google Takeout.')
  }

  const points: DataPoint[] = []
  const sessions: SleepSession[] = []
  const dailyCsvRows: DailyCsvRow[] = []
  const pointSeen = new Set<object>()
  const sessionSeen = new Set<object>()
  const warnings: string[] = []
  let jsonCount = 0
  let csvCount = 0

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const path = entry.name
    try {
      const extension = path.split('.').pop()?.toLowerCase()
      const contents = await entry.async('string')
      if (extension === 'json') {
        jsonCount += 1
        let root: unknown
        try {
          root = JSON.parse(contents) as unknown
        } catch {
          warnings.push(`JSON non leggibile: ${path}`)
          continue
        }
        walkJson(root, path, points, sessions, pointSeen, sessionSeen)
      } else if (extension === 'csv') {
        csvCount += 1
        parseDailyCsv(contents, path, dailyCsvRows)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'errore di lettura'
      warnings.push(`File ignorato: ${path} (${message})`)
    }

    onProgress?.({
      processed: index + 1,
      total: entries.length,
      percent: 4 + Math.round(((index + 1) / entries.length) * 92),
      filename: file.name,
    })
    if ((index + 1) % 8 === 0) await nextPaint()
  }

  const analyticsBase = buildAnalytics(points, sessions, dailyCsvRows)
  const analytics: FitAnalytics = {
    ...analyticsBase,
    meta: {
    jsonCount,
    csvCount,
    fileCount: entries.length,
    pointCount: points.length,
    sessionCount: sessions.length,
    warnings,
    filename: file.name,
    },
  }

  if (!analytics.steps.length && !analytics.sleep.length) {
    throw new Error('Ho letto l’archivio, ma non ho trovato registrazioni utilizzabili di passi o sonno. Verifica che l’esportazione contenga “All Data”, “Daily activity metrics” o “All sessions”.')
  }
  return analytics
}

function isFitDataFile(path: string): boolean {
  const lower = path.toLowerCase()
  if (!/\.(json|csv)$/.test(lower)) return false
  return /(^|\/)fit(\/|$)/i.test(path)
    || /daily activity metrics|all sessions|all data/i.test(path)
    || /takeout\/fit\//i.test(path)
}

function walkJson(
  root: unknown,
  path: string,
  points: DataPoint[],
  sessions: SleepSession[],
  pointSeen: Set<object>,
  sessionSeen: Set<object>,
): void {
  const pathType = inferMetric(`${path} ${path.split('/').pop()}`)
  const pathSource = path.split('/').pop()?.replace(/\.json$/i, '') ?? path

  function visit(value: unknown, context: PointContext): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, context))
      return
    }

    const node = value as Record<string, any>
    const nestedSource = node.dataSource?.dataStreamId || node.dataSource?.dataSourceId
    const source = String(node.dataSourceId || node.dataStreamId || nestedSource || context.source || pathSource)
    const nestedType = node.dataType?.name || node.dataType?.dataTypeName
    const type = String(node.dataTypeName || nestedType || node.metricName || context.type || pathType)
    const nextContext = { source, type }

    for (const key of ['point', 'points', 'dataPoints']) {
      const entries = node[key]
      if (!Array.isArray(entries)) continue
      entries.forEach((point: unknown) => {
        if (!point || typeof point !== 'object' || pointSeen.has(point)) return
        pointSeen.add(point)
        const record = normalizePoint(point as Record<string, any>, nextContext, path)
        if (record) points.push(record)
      })
    }

    // Some exports store a point directly instead of wrapping it in a dataset.
    if ((node.startTimeNanos != null || node.startTimeMillis != null || node.startTime != null)
      && (node.value != null || node.intValue != null || node.floatValue != null)
      && !pointSeen.has(node)) {
      pointSeen.add(node)
      const record = normalizePoint(node, nextContext, path)
      if (record) points.push(record)
    }

    if (looksLikeSession(node) && !sessionSeen.has(node)) {
      sessionSeen.add(node)
      const session = normalizeSession(node, path)
      if (session) sessions.push(session)
    }

    // Google Takeout generations use different names for session collections.
    for (const [key, child] of Object.entries(node)) {
      if (['point', 'points', 'dataPoints'].includes(key)) continue
      if (key === 'session' || key === 'sessions') {
        if (Array.isArray(child)) child.forEach((item) => visit(item, nextContext))
        else visit(child, nextContext)
      } else if (child && typeof child === 'object') {
        visit(child, nextContext)
      }
    }
  }

  visit(root, { source: pathSource, type: pathType })
}

function normalizePoint(point: Record<string, any>, context: PointContext, path: string): DataPoint | null {
  const type = String(point.dataTypeName || point.dataType?.name || point.metricName || context.type || inferMetric(`${path} ${context.source || ''}`) || '').toLowerCase()
  const metric = classifyMetric(type)
  if (!metric) return null

  const start = readTimestamp(point, 'start')
  const end = readTimestamp(point, 'end')
  if (!Number.isFinite(start)) return null
  const safeEnd = Number.isFinite(end) && end >= start ? end : start
  const value = readPointValue(point)
  if (!Number.isFinite(value)) return null

  let normalizedValue = value
  if (metric === 'distance') {
    const sourceText = `${type} ${context.source || ''} ${path}`.toLowerCase()
    if (/kilomet|\bkm\b/.test(sourceText)) normalizedValue *= 1000
  }

  return {
    metric,
    type,
    start,
    end: safeEnd,
    value: normalizedValue,
    stage: metric === 'sleep' ? Math.round(value) : null,
    source: String(point.dataSourceId || context.source || point.originDataSourceId || path),
    path,
  }
}

function readTimestamp(object: Record<string, any>, which: 'start' | 'end'): number {
  const candidates: Array<[string, 'ns' | 'ms' | 'auto']> = which === 'start'
    ? [['startTimeNanos', 'ns'], ['startTimeMillis', 'ms'], ['startTime', 'auto'], ['start', 'auto'], ['timestamp', 'auto']]
    : [['endTimeNanos', 'ns'], ['endTimeMillis', 'ms'], ['endTime', 'auto'], ['end', 'auto']]
  for (const [key, unit] of candidates) {
    if (object[key] != null) return parseTimestamp(object[key], unit)
  }
  return Number.NaN
}

function readPointValue(point: Record<string, any>): number {
  const value = point.value
  if (Array.isArray(value) && value.length) {
    const first = value[0]
    if (first && typeof first === 'object') {
      for (const key of ['intVal', 'fpVal', 'floatVal', 'doubleVal', 'longVal', 'value']) {
        if (first[key] != null && Number.isFinite(Number(first[key]))) return Number(first[key])
      }
    }
    if (typeof first === 'number') return first
  }
  if (value != null && !Array.isArray(value) && Number.isFinite(Number(value))) return Number(value)
  for (const key of ['intValue', 'floatValue', 'fpValue', 'intVal', 'floatVal', 'value']) {
    if (point[key] != null && Number.isFinite(Number(point[key]))) return Number(point[key])
  }
  return Number.NaN
}

function inferMetric(text: string): string {
  const value = String(text || '').toLowerCase().replace(/[_\s-]+/g, '.')
  if (value.includes('step.count') || value.includes('steps')) return 'com.google.step_count.delta'
  if (value.includes('distance')) return 'com.google.distance.delta'
  if (value.includes('sleep.segment') || value.includes('sleep')) return 'com.google.sleep.segment'
  return ''
}

function classifyMetric(type: string): DataPoint['metric'] | null {
  const normalized = String(type || '').toLowerCase()
  if (normalized.includes('step_count') || normalized.includes('step.count') || normalized.includes('steps')) return 'steps'
  if (normalized.includes('distance')) return 'distance'
  if (normalized.includes('sleep.segment')) return 'sleep'
  return null
}

function looksLikeSession(node: Record<string, any>): boolean {
  const hasStart = node.startTime != null || node.startTimeMillis != null || node.startTimeNanos != null || node.start != null
  const hasEnd = node.endTime != null || node.endTimeMillis != null || node.endTimeNanos != null || node.end != null
  const hasKind = node.activityType != null || node.fitnessActivity != null || node.name != null || node.sessionName != null
  return hasStart && hasEnd && hasKind
}

function normalizeSession(node: Record<string, any>, path: string): SleepSession | null {
  const start = readTimestamp(node, 'start')
  const end = readTimestamp(node, 'end')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const activityType = Number(node.activityType)
  const description = [node.fitnessActivity, node.name, node.sessionName, node.description, node.activity]
    .filter(Boolean).join(' ').toLowerCase()
  const isSleep = activityType === 72 || /sleep|sonno|sleeping|nap|riposo|pisolino/.test(description)
  return { start, end, isSleep, label: description || (isSleep ? 'sleep' : 'activity'), path }
}

function parseDailyCsv(text: string, path: string, output: DailyCsvRow[]): void {
  const rows = parseCsv(text)
  if (rows.length < 2) return
  const headers = rows[0].map(normalizeHeader)
  const findColumn = (patterns: RegExp[]) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))
  const dateIndex = findColumn([/^date$/, /timestamp/, /start.?time/, /datetime/, /^time$/])
  const stepsIndex = findColumn([/step.?count/, /^steps?$/, /number.?of.?steps/, /passi/])
  const distanceIndex = findColumn([/distance/, /distanza/])
  if (stepsIndex < 0 && distanceIndex < 0) return

  const filenameDate = (path.match(/(\d{4})[-_](\d{2})[-_](\d{2})/) || []).slice(1)
  const fallbackDate = filenameDate.length === 3 ? filenameDate.join('-') : null
  const dateTimeSeen = new Set<string>()

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]
    if (!row?.length) continue
    const rawDate = dateIndex >= 0 ? row[dateIndex] : null
    const timestamp = rawDate ? parseTimestamp(rawDate, 'auto') : Number.NaN
    const date = Number.isFinite(timestamp) ? dateKey(timestamp) : fallbackDate
    if (!date) continue

    const rawSteps = stepsIndex >= 0 ? parseLocalizedNumber(row[stepsIndex]) : Number.NaN
    const rawDistance = distanceIndex >= 0 ? parseLocalizedNumber(row[distanceIndex]) : Number.NaN
    const steps = Number.isFinite(rawSteps) ? Math.max(0, rawSteps) : null
    let distanceKm = Number.isFinite(rawDistance) ? Math.max(0, rawDistance) : null
    if (distanceKm != null && !/\bkm\b|kilomet/.test(headers[distanceIndex])) distanceKm /= 1000
    if (steps == null && distanceKm == null) continue

    const signature = `${date}|${rawDate || index}|${steps}|${distanceKm}`
    if (dateTimeSeen.has(signature)) continue
    dateTimeSeen.add(signature)
    output.push({ date, steps, distanceKm, signature, path })
  }
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
    } else {
      cell += char
    }
  }
  row.push(cell)
  if (row.some((value) => value.trim() !== '')) rows.push(row)
  return rows
}

function normalizeHeader(value: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function buildAnalytics(points: DataPoint[], sessions: SleepSession[], dailyCsvRows: DailyCsvRow[]): Omit<FitAnalytics, 'meta'> {
  const stepPoints = points.filter((point) => point.metric === 'steps')
  const distancePoints = points.filter((point) => point.metric === 'distance')
  const sleepPoints = points.filter((point) => point.metric === 'sleep')
  const stepDaily = aggregatePointMetric(stepPoints, 'steps')
  const distanceDaily = aggregatePointMetric(distancePoints, 'distance')
  const csvDaily = new Map<string, CsvDailyBucket>()
  const csvSeen = new Set<string>()

  dailyCsvRows.forEach((row) => {
    if (csvSeen.has(row.signature)) return
    csvSeen.add(row.signature)
    if (!csvDaily.has(row.date)) csvDaily.set(row.date, { steps: null, distanceKm: null, paths: [] })
    const item = csvDaily.get(row.date)!
    if (row.steps != null) item.steps = (item.steps || 0) + row.steps
    if (row.distanceKm != null) item.distanceKm = (item.distanceKm || 0) + row.distanceKm
    item.paths.push(row.path)
  })

  const allDates = new Set([...stepDaily.keys(), ...distanceDaily.keys(), ...csvDaily.keys()])
  const steps = [...allDates].flatMap((date) => {
    const stepPoint = stepDaily.get(date)
    const distancePoint = distanceDaily.get(date)
    const csv = csvDaily.get(date)
    const stepValue = stepPoint ? stepPoint.value : (csv?.steps ?? null)
    const distanceValue = distancePoint ? distancePoint.value / 1000 : (csv?.distanceKm ?? null)
    if (stepValue == null && distanceValue == null) return []
    return [{
      date,
      steps: stepValue == null ? null : Math.round(stepValue),
      km: distanceValue,
      stepsSource: stepPoint?.source ?? (csv?.steps != null ? 'Daily activity metrics (CSV)' : null),
      distanceSource: distancePoint?.source ?? (csv?.distanceKm != null ? 'Daily activity metrics (CSV)' : null),
    }]
  }).sort((a, b) => a.date.localeCompare(b.date))

  const sleep = buildSleepNights(sleepPoints, sessions)
  return {
    steps,
    sleep,
    rawStats: {
      rawStepPoints: stepPoints.length,
      rawDistancePoints: distancePoints.length,
      sleepStagePoints: sleepPoints.length,
      dailyCsvRows: dailyCsvRows.length,
      sessions: sessions.length,
    },
  }
}

function aggregatePointMetric(points: DataPoint[], metric: 'steps' | 'distance') {
  const dayCandidates = new Map<string, Array<DataPoint & { priority: number }>>()
  for (const point of points) {
    for (const part of splitAcrossLocalDays(point)) {
      if (!dayCandidates.has(part.date)) dayCandidates.set(part.date, [])
      dayCandidates.get(part.date)!.push({ ...point, ...part, priority: sourcePriority(point.source, metric) })
    }
  }

  const result = new Map<string, { value: number; source: string; sources: string[]; count: number }>()
  for (const [date, candidates] of dayCandidates.entries()) {
    const sorted = candidates.sort((a, b) => b.priority - a.priority || a.start - b.start)
    const selected: Array<DataPoint & { priority: number }> = []
    const exactSeen = new Set<string>()
    for (const candidate of sorted) {
      const signature = `${candidate.start}|${candidate.end}|${candidate.value}`
      if (exactSeen.has(signature)) continue
      exactSeen.add(signature)
      if (selected.some((existing) => intervalsOverlap(existing, candidate))) continue
      selected.push(candidate)
    }
    if (!selected.length) continue
    const total = selected.reduce((sum, item) => sum + item.value, 0)
    selected.sort((a, b) => b.priority - a.priority)
    const sources = [...new Set(selected.map((item) => item.source))]
    result.set(date, { value: total, source: sources[0], sources, count: selected.length })
  }
  return result
}

function splitAcrossLocalDays(point: DataPoint): Array<{ date: string; start: number; end: number; value: number }> {
  const start = point.start
  const end = Math.max(point.end, start)
  if (end <= start) return [{ date: dateKey(start), start, end: start, value: point.value }]
  const duration = end - start
  const parts: Array<{ date: string; start: number; end: number; value: number }> = []
  let cursor = start
  let guard = 0
  while (cursor < end && guard < 370) {
    const date = dateKey(cursor)
    const partEnd = Math.min(end, localMidnightAfter(cursor))
    parts.push({ date, start: cursor, end: partEnd, value: point.value * ((partEnd - cursor) / duration) })
    cursor = partEnd
    guard += 1
  }
  return parts
}

function intervalsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  if (a.start === a.end && b.start === b.end) return a.start === b.start
  if (a.start === a.end) return a.start >= b.start && a.start < b.end
  if (b.start === b.end) return b.start >= a.start && b.start < a.end
  return Math.max(a.start, b.start) < Math.min(a.end, b.end)
}

function sourcePriority(source: string, metric: string): number {
  const text = String(source || '').toLowerCase()
  if (metric === 'steps' && text.includes('estimated_steps')) return 1200
  if (text.includes('derived:')) return 1000
  if (text.includes('google.android.gms')) return 800
  if (text.includes('mobvoi') || text.includes('ticwatch')) return 650
  if (text.includes('daily activity metrics')) return 500
  if (text.includes('raw:')) return 300
  return 100
}

function buildSleepNights(sleepPoints: DataPoint[], sessions: SleepSession[]) {
  const stageCandidates = sleepPoints
    .filter((point) => point.end > point.start && point.stage != null && [0, 2, 4, 5, 6].includes(point.stage))
    .slice().sort((a, b) => sourcePriority(b.source, 'sleep') - sourcePriority(a.source, 'sleep') || a.start - b.start)
  const stageIntervals: DataPoint[] = []
  const stageSeen = new Set<string>()
  for (const point of stageCandidates) {
    const signature = `${point.start}|${point.end}|${point.stage}`
    if (stageSeen.has(signature)) continue
    stageSeen.add(signature)
    if (stageIntervals.some((existing) => intervalsOverlap(existing, point))) continue
    stageIntervals.push(point)
  }
  stageIntervals.sort((a, b) => a.start - b.start)

  let nights: Array<{ date: string; ms: number; method: string; source: string }> = []
  if (stageIntervals.length) {
    const groups: Array<{ start: number; end: number; duration: number; source: string }> = []
    let current: { start: number; end: number; duration: number; source: string } | null = null
    for (const interval of stageIntervals) {
      if (!current || interval.start - current.end > 3 * 60 * 60 * 1000) {
        if (current) groups.push(current)
        current = { start: interval.start, end: interval.end, duration: interval.end - interval.start, source: interval.source }
      } else {
        current.end = Math.max(current.end, interval.end)
        current.duration += interval.end - interval.start
      }
    }
    if (current) groups.push(current)
    nights = groups.map((group) => ({ date: dateKey(group.end), ms: group.duration, method: 'Fasi del sonno', source: group.source }))
  } else {
    const sleepSessions = sessions.filter((session) => session.isSleep).sort((a, b) => a.start - b.start)
    const merged: Array<{ start: number; end: number; source: string }> = []
    for (const session of sleepSessions) {
      const last = merged[merged.length - 1]
      if (last && session.start <= last.end) last.end = Math.max(last.end, session.end)
      else merged.push({ start: session.start, end: session.end, source: session.path })
    }
    nights = merged.map((session) => ({ date: dateKey(session.end), ms: session.end - session.start, method: 'Durata sessione', source: session.source }))
  }

  const perDate = new Map<string, { date: string; ms: number; methods: Set<string>; sources: Set<string> }>()
  for (const night of nights) {
    if (!night.date || !Number.isFinite(night.ms) || night.ms <= 0) continue
    if (!perDate.has(night.date)) perDate.set(night.date, { date: night.date, ms: 0, methods: new Set(), sources: new Set() })
    const item = perDate.get(night.date)!
    item.ms += night.ms
    item.methods.add(night.method)
    if (night.source) item.sources.add(night.source)
  }
  return [...perDate.values()].map((item) => ({
    date: item.date,
    ms: item.ms,
    hours: item.ms / 3_600_000,
    method: [...item.methods].join(' + '),
    source: [...item.sources][0] || '',
  })).sort((a, b) => a.date.localeCompare(b.date))
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
