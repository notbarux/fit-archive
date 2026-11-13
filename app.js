(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { data: null, filename: '', warnings: [], fileCount: 0, jsonCount: 0, csvCount: 0, pointCount: 0, sessionCount: 0 };
  const IT_MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const IT_WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const numberFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  const dropzone = $('dropzone');
  const zipInput = $('zipInput');
  const importStatus = $('importStatus');
  const progressTrack = $('progressTrack');
  const progressBar = $('progressBar');

  zipInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) handleZip(file);
    event.target.value = '';
  });

  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      zipInput.click();
    }
  });
  ['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  }));
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) handleZip(file);
  });

  $('stepTopN').addEventListener('change', () => { if (state.data) renderStepRankings(state.data); });
  $('weekRankMode').addEventListener('change', () => { if (state.data) renderWeekRankings(state.data); });
  $('exportCsvBtn').addEventListener('click', exportDailyCsv);
  $('newFileBtn').addEventListener('click', () => {
    state.data = null;
    $('dashboard').hidden = true;
    $('howItWorks').hidden = false;
    $('siteFooter').hidden = false;
    $('intro').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('In attesa del file', '');
    progressTrack.hidden = true;
  });

  async function handleZip(file) {
    if (!/\.zip$/i.test(file.name)) {
      setStatus('Seleziona un archivio ZIP di Google Takeout.', 'error');
      return;
    }
    if (!window.JSZip) {
      setStatus('Libreria ZIP non disponibile. Ricarica la pagina e riprova.', 'error');
      return;
    }

    state.filename = file.name;
    state.data = null;
    $('dashboard').hidden = true;
    $('howItWorks').hidden = false;
    $('siteFooter').hidden = false;
    state.warnings = [];
    state.fileCount = 0;
    state.jsonCount = 0;
    state.csvCount = 0;
    state.pointCount = 0;
    state.sessionCount = 0;
    setStatus(`Apertura di ${file.name}…`, '');
    progressTrack.hidden = false;
    progressBar.style.width = '3%';

    try {
      const zip = await JSZip.loadAsync(file, { checkCRC32: false, createFolders: false });
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && isFitDataFile(entry.name));
      if (!entries.length) throw new Error('Nell’archivio non trovo file JSON o CSV riconducibili alla cartella Fit. Verifica di aver esportato il prodotto “Fit” da Google Takeout.');

      const points = [];
      const sessions = [];
      const dailyCsvRows = [];
      const pointSeen = new Set();
      const sessionSeen = new Set();
      let processed = 0;

      for (const entry of entries) {
        processed += 1;
        const path = entry.name;
        try {
          const ext = path.split('.').pop().toLowerCase();
          const contents = await entry.async('string');
          if (ext === 'json') {
            state.jsonCount += 1;
            let root;
            try { root = JSON.parse(contents); }
            catch (error) {
              state.warnings.push(`JSON non leggibile: ${path}`);
              continue;
            }
            walkJson(root, path, points, sessions, pointSeen, sessionSeen);
          } else if (ext === 'csv') {
            state.csvCount += 1;
            parseDailyCsv(contents, path, dailyCsvRows);
          }
        } catch (error) {
          state.warnings.push(`File ignorato: ${path} (${error.message || 'errore di lettura'})`);
        }
        state.fileCount = processed;
        if (processed % 8 === 0 || processed === entries.length) {
          const pct = 4 + Math.round((processed / entries.length) * 92);
          progressBar.style.width = `${pct}%`;
          setStatus(`Analisi dell’archivio… ${processed.toLocaleString('it-IT')} / ${entries.length.toLocaleString('it-IT')} file`, '');
          await nextPaint();
        }
      }

      state.pointCount = points.length;
      state.sessionCount = sessions.length;
      const result = buildAnalytics(points, sessions, dailyCsvRows);
      result.meta = {
        jsonCount: state.jsonCount,
        csvCount: state.csvCount,
        fileCount: state.fileCount,
        pointCount: points.length,
        sessionCount: sessions.length,
        warnings: state.warnings.slice(),
        filename: file.name
      };
      if (!result.steps.length && !result.sleep.length) {
        throw new Error('Ho letto l’archivio, ma non ho trovato registrazioni utilizzabili di passi o sonno. Verifica che l’esportazione contenga “All Data”, “Daily activity metrics” o “All sessions”.');
      }

      state.data = result;
      renderDashboard(result);
      progressBar.style.width = '100%';
      setStatus(`Completato · ${result.steps.length.toLocaleString('it-IT')} giorni con passi · ${result.sleep.length.toLocaleString('it-IT')} notti`, 'success');
      window.setTimeout(() => { progressTrack.hidden = true; }, 900);
      $('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Errore durante la lettura dell’archivio.', 'error');
      progressTrack.hidden = true;
      showToast('Importazione non riuscita. Controlla il messaggio sotto al selettore file.');
    }
  }

  function isFitDataFile(path) {
    const lower = path.toLowerCase();
    const supported = /\.(json|csv)$/.test(lower);
    if (!supported) return false;
    return /(^|\/)fit(\/|$)/i.test(path)
      || /daily activity metrics|all sessions|all data/i.test(path)
      || /takeout\/fit\//i.test(path);
  }

  function walkJson(root, path, points, sessions, pointSeen, sessionSeen) {
    const pathType = inferMetric(`${path} ${path.split('/').pop()}`);
    const pathSource = path.split('/').pop().replace(/\.json$/i, '');

    function visit(node, context) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((child) => visit(child, context));
        return;
      }

      const source = node.dataSourceId || node.dataStreamId || (node.dataSource && (node.dataSource.dataStreamId || node.dataSource.dataSourceId)) || context.source || pathSource;
      const type = node.dataTypeName || (node.dataType && (node.dataType.name || node.dataType.dataTypeName)) || node.metricName || context.type || pathType;
      const nextContext = { source, type };

      const arrays = [node.point, node.points, node.dataPoints];
      arrays.forEach((array) => {
        if (Array.isArray(array)) {
          array.forEach((point) => {
            if (!point || typeof point !== 'object' || pointSeen.has(point)) return;
            pointSeen.add(point);
            const record = normalizePoint(point, nextContext, path);
            if (record) points.push(record);
          });
        }
      });

      // Some exports store a point directly instead of wrapping it in a dataset.
      if ((node.startTimeNanos != null || node.startTimeMillis != null || node.startTime != null) && (node.value != null || node.intValue != null || node.floatValue != null)) {
        if (!pointSeen.has(node)) {
          pointSeen.add(node);
          const record = normalizePoint(node, nextContext, path);
          if (record) points.push(record);
        }
      }

      if (looksLikeSession(node) && !sessionSeen.has(node)) {
        sessionSeen.add(node);
        const session = normalizeSession(node, path);
        if (session) sessions.push(session);
      }

      // JSON Takeout generations differ in whether arrays are named session, sessions or activity.
      for (const [key, value] of Object.entries(node)) {
        if (['point', 'points', 'dataPoints'].includes(key)) continue;
        if (key === 'session' || key === 'sessions') {
          if (Array.isArray(value)) value.forEach((item) => visit(item, nextContext));
          else visit(value, nextContext);
          continue;
        }
        if (value && typeof value === 'object') visit(value, nextContext);
      }
    }

    visit(root, { source: pathSource, type: pathType });
  }

  function normalizePoint(point, context, path) {
    const type = String(point.dataTypeName || (point.dataType && point.dataType.name) || point.metricName || context.type || inferMetric(`${path} ${context.source || ''}`) || '').toLowerCase();
    const metric = classifyMetric(type);
    if (!metric) return null;
    const start = readTimestamp(point, 'start');
    const end = readTimestamp(point, 'end');
    if (!Number.isFinite(start)) return null;
    const safeEnd = Number.isFinite(end) && end >= start ? end : start;
    const value = readPointValue(point);
    if (!Number.isFinite(value)) return null;

    let normalizedValue = value;
    if (metric === 'distance') {
      // Google Fit com.google.distance.delta stores metres; filenames can expose km explicitly.
      const sourceText = `${type} ${context.source || ''} ${path}`.toLowerCase();
      if (/kilomet|\bkm\b/.test(sourceText)) normalizedValue *= 1000;
    }
    let stage = null;
    if (metric === 'sleep') stage = Math.round(value);
    return {
      metric,
      type,
      start,
      end: safeEnd,
      value: normalizedValue,
      stage,
      source: String(point.dataSourceId || context.source || point.originDataSourceId || path),
      path
    };
  }

  function readTimestamp(object, which) {
    const candidates = which === 'start'
      ? [['startTimeNanos', 'ns'], ['startTimeMillis', 'ms'], ['startTime', 'auto'], ['start', 'auto'], ['timestamp', 'auto']]
      : [['endTimeNanos', 'ns'], ['endTimeMillis', 'ms'], ['endTime', 'auto'], ['end', 'auto']];
    for (const [key, unit] of candidates) {
      if (object[key] != null) return parseTimestamp(object[key], unit);
    }
    return NaN;
  }

  function parseTimestamp(value, unit = 'auto') {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()))) {
      const number = Number(value);
      if (!Number.isFinite(number)) return NaN;
      if (unit === 'ns' || number > 1e17) return number / 1e6;
      if (unit === 'ms' || number > 1e11) return number;
      if (number > 1e9) return number * 1000;
      return NaN;
    }
    if (typeof value === 'string') {
      const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime();
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
  }

  function readPointValue(point) {
    const value = point.value;
    if (Array.isArray(value) && value.length) {
      const first = value[0];
      if (first && typeof first === 'object') {
        for (const key of ['intVal', 'fpVal', 'floatVal', 'doubleVal', 'longVal', 'value']) {
          if (first[key] != null && Number.isFinite(Number(first[key]))) return Number(first[key]);
        }
      }
      if (typeof first === 'number') return first;
    }
    if (value != null && !Array.isArray(value) && Number.isFinite(Number(value))) return Number(value);
    for (const key of ['intValue', 'floatValue', 'fpValue', 'intVal', 'floatVal', 'value']) {
      if (point[key] != null && Number.isFinite(Number(point[key]))) return Number(point[key]);
    }
    return NaN;
  }

  function inferMetric(text) {
    const value = String(text || '').toLowerCase().replace(/[_\s-]+/g, '.');
    if (value.includes('step.count') || value.includes('steps')) return 'com.google.step_count.delta';
    if (value.includes('distance')) return 'com.google.distance.delta';
    if (value.includes('sleep.segment') || value.includes('sleep')) return 'com.google.sleep.segment';
    return '';
  }

  function classifyMetric(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('step_count') || normalized.includes('step.count') || normalized.includes('steps')) return 'steps';
    if (normalized.includes('distance')) return 'distance';
    if (normalized.includes('sleep.segment')) return 'sleep';
    return null;
  }

  function looksLikeSession(node) {
    const hasStart = node.startTime != null || node.startTimeMillis != null || node.startTimeNanos != null || node.start != null;
    const hasEnd = node.endTime != null || node.endTimeMillis != null || node.endTimeNanos != null || node.end != null;
    const hasKind = node.activityType != null || node.fitnessActivity != null || node.name != null || node.sessionName != null;
    return hasStart && hasEnd && hasKind;
  }

  function normalizeSession(node, path) {
    const start = readTimestamp(node, 'start');
    const end = readTimestamp(node, 'end');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const activityType = Number(node.activityType);
    const description = [node.fitnessActivity, node.name, node.sessionName, node.description, node.activity].filter(Boolean).join(' ').toLowerCase();
    const isSleep = activityType === 72 || /sleep|sonno|sleeping|nap|riposo|pisolino/.test(description);
    return {
      start,
      end,
      isSleep,
      label: description || (isSleep ? 'sleep' : 'activity'),
      path
    };
  }

  function parseDailyCsv(text, path, output) {
    const rows = parseCsv(text);
    if (rows.length < 2) return;
    const headers = rows[0].map(normalizeHeader);
    const findColumn = (patterns) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    const dateIndex = findColumn([/^date$/, /timestamp/, /start.?time/, /datetime/, /^time$/]);
    const stepsIndex = findColumn([/step.?count/, /^steps?$/, /number.?of.?steps/, /passi/]);
    const distanceIndex = findColumn([/distance/, /distanza/]);
    if (stepsIndex < 0 && distanceIndex < 0) return;

    const filenameDate = (path.match(/(\d{4})[-_](\d{2})[-_](\d{2})/) || []).slice(1);
    const fallbackDate = filenameDate.length === 3 ? `${filenameDate[0]}-${filenameDate[1]}-${filenameDate[2]}` : null;
    const dateTimeSeen = new Set();

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const rawDate = dateIndex >= 0 ? row[dateIndex] : null;
      const timestamp = rawDate ? parseTimestamp(rawDate, 'auto') : NaN;
      const date = Number.isFinite(timestamp) ? dateKey(timestamp) : fallbackDate;
      if (!date) continue;
      const rawSteps = stepsIndex >= 0 ? parseLocalizedNumber(row[stepsIndex]) : NaN;
      const rawDistance = distanceIndex >= 0 ? parseLocalizedNumber(row[distanceIndex]) : NaN;
      const steps = Number.isFinite(rawSteps) ? Math.max(0, rawSteps) : null;
      let distanceKm = Number.isFinite(rawDistance) ? Math.max(0, rawDistance) : null;
      if (distanceKm != null) {
        const header = headers[distanceIndex];
        if (/\bkm\b|kilomet/.test(header)) {
          // Already in kilometres.
        } else {
          distanceKm /= 1000;
        }
      }
      if (steps == null && distanceKm == null) continue;
      const signature = `${date}|${rawDate || i}|${steps}|${distanceKm}`;
      if (dateTimeSeen.has(signature)) continue;
      dateTimeSeen.add(signature);
      output.push({ date, steps, distanceKm, signature, path });
    }
  }

  function parseCsv(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell); cell = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); cell = '';
        if (row.some((value) => value.trim() !== '')) rows.push(row);
        row = [];
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    return rows;
  }

  function normalizeHeader(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function parseLocalizedNumber(value) {
    if (value == null) return NaN;
    let text = String(value).trim().replace(/\s/g, '');
    if (!text || text === '-' || text.toLowerCase() === 'null') return NaN;
    if (text.includes(',') && text.includes('.')) {
      if (text.lastIndexOf(',') > text.lastIndexOf('.')) text = text.replace(/\./g, '').replace(',', '.');
      else text = text.replace(/,/g, '');
    } else if (text.includes(',')) {
      text = text.replace(',', '.');
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }

  function buildAnalytics(points, sessions, dailyCsvRows) {
    const stepPoints = points.filter((point) => point.metric === 'steps');
    const distancePoints = points.filter((point) => point.metric === 'distance');
    const sleepPoints = points.filter((point) => point.metric === 'sleep');
    const stepDaily = aggregatePointMetric(stepPoints, 'steps');
    const distanceDaily = aggregatePointMetric(distancePoints, 'distance');
    const csvDaily = new Map();
    const csvSeen = new Set();
    dailyCsvRows.forEach((row) => {
      if (csvSeen.has(row.signature)) return;
      csvSeen.add(row.signature);
      if (!csvDaily.has(row.date)) csvDaily.set(row.date, { steps: null, distanceKm: null, paths: [] });
      const item = csvDaily.get(row.date);
      if (row.steps != null) item.steps = (item.steps || 0) + row.steps;
      if (row.distanceKm != null) item.distanceKm = (item.distanceKm || 0) + row.distanceKm;
      item.paths.push(row.path);
    });

    const allDates = new Set([...stepDaily.keys(), ...distanceDaily.keys(), ...csvDaily.keys()]);
    const steps = [];
    for (const date of allDates) {
      const stepPoint = stepDaily.get(date);
      const distancePoint = distanceDaily.get(date);
      const csv = csvDaily.get(date);
      const stepValue = stepPoint ? stepPoint.value : (csv && csv.steps != null ? csv.steps : null);
      const distanceValue = distancePoint ? distancePoint.value / 1000 : (csv && csv.distanceKm != null ? csv.distanceKm : null);
      if (stepValue == null && distanceValue == null) continue;
      steps.push({
        date,
        steps: stepValue == null ? null : Math.round(stepValue),
        km: distanceValue == null ? null : distanceValue,
        stepsSource: stepPoint ? stepPoint.source : (csv && csv.steps != null ? 'Daily activity metrics (CSV)' : null),
        distanceSource: distancePoint ? distancePoint.source : (csv && csv.distanceKm != null ? 'Daily activity metrics (CSV)' : null)
      });
    }
    steps.sort((a, b) => a.date.localeCompare(b.date));

    const sleep = buildSleepNights(sleepPoints, sessions);
    return { steps, sleep, rawStats: { rawStepPoints: stepPoints.length, rawDistancePoints: distancePoints.length, sleepStagePoints: sleepPoints.length, dailyCsvRows: dailyCsvRows.length, sessions: sessions.length } };
  }

  function aggregatePointMetric(points, metric) {
    const dayCandidates = new Map();
    for (const point of points) {
      const parts = splitAcrossLocalDays(point);
      for (const part of parts) {
        if (!dayCandidates.has(part.date)) dayCandidates.set(part.date, []);
        dayCandidates.get(part.date).push({ ...part, source: point.source, priority: sourcePriority(point.source, metric), type: point.type });
      }
    }
    const result = new Map();
    for (const [date, candidates] of dayCandidates.entries()) {
      const sorted = candidates.sort((a, b) => b.priority - a.priority || a.start - b.start);
      const selected = [];
      const exactSeen = new Set();
      for (const candidate of sorted) {
        const signature = `${candidate.start}|${candidate.end}|${candidate.value}`;
        if (exactSeen.has(signature)) continue;
        exactSeen.add(signature);
        if (selected.some((existing) => intervalsOverlap(existing, candidate))) continue;
        selected.push(candidate);
      }
      const total = selected.reduce((sum, item) => sum + item.value, 0);
      if (selected.length) {
        selected.sort((a, b) => b.priority - a.priority);
        const sources = [...new Set(selected.map((item) => item.source))];
        result.set(date, { value: total, source: sources[0], sources, count: selected.length });
      }
    }
    return result;
  }

  function splitAcrossLocalDays(point) {
    const start = point.start;
    const end = Math.max(point.end, start);
    if (end <= start) return [{ date: dateKey(start), start, end: start, value: point.value }];
    const duration = end - start;
    const parts = [];
    let cursor = start;
    // A guard against malformed exports with unusually long point intervals.
    let guard = 0;
    while (cursor < end && guard < 370) {
      const date = dateKey(cursor);
      const nextMidnight = localMidnightAfter(cursor);
      const partEnd = Math.min(end, nextMidnight);
      const fraction = (partEnd - cursor) / duration;
      parts.push({ date, start: cursor, end: partEnd, value: point.value * fraction });
      cursor = partEnd;
      guard += 1;
    }
    return parts;
  }

  function intervalsOverlap(a, b) {
    if (a.start === a.end && b.start === b.end) return a.start === b.start;
    if (a.start === a.end) return a.start >= b.start && a.start < b.end;
    if (b.start === b.end) return b.start >= a.start && b.start < a.end;
    return Math.max(a.start, b.start) < Math.min(a.end, b.end);
  }

  function sourcePriority(source, metric) {
    const text = String(source || '').toLowerCase();
    if (metric === 'steps' && text.includes('estimated_steps')) return 1200;
    if (text.includes('derived:')) return 1000;
    if (text.includes('google.android.gms')) return 800;
    if (text.includes('mobvoi') || text.includes('ticwatch')) return 650;
    if (text.includes('daily activity metrics')) return 500;
    if (text.includes('raw:')) return 300;
    return 100;
  }

  function buildSleepNights(sleepPoints, sessions) {
    const stageCandidates = sleepPoints
      .filter((point) => point.end > point.start && [0, 2, 4, 5, 6].includes(point.stage))
      .slice().sort((a, b) => sourcePriority(b.source, 'sleep') - sourcePriority(a.source, 'sleep') || a.start - b.start);
    const stageIntervals = [];
    const stageSeen = new Set();
    for (const point of stageCandidates) {
      const signature = `${point.start}|${point.end}|${point.stage}`;
      if (stageSeen.has(signature)) continue;
      stageSeen.add(signature);
      if (stageIntervals.some((existing) => intervalsOverlap(existing, point))) continue;
      stageIntervals.push(point);
    }
    stageIntervals.sort((a, b) => a.start - b.start);

    let nights = [];
    let method = 'session';
    if (stageIntervals.length) {
      method = 'stages';
      const groups = [];
      let current = null;
      for (const interval of stageIntervals) {
        if (!current || interval.start - current.end > 3 * 60 * 60 * 1000) {
          if (current) groups.push(current);
          current = { start: interval.start, end: interval.end, duration: interval.end - interval.start, source: interval.source };
        } else {
          current.end = Math.max(current.end, interval.end);
          current.duration += interval.end - interval.start;
        }
      }
      if (current) groups.push(current);
      nights = groups.map((group) => ({ date: dateKey(group.end), ms: group.duration, method: 'Fasi del sonno', source: group.source }));
    } else {
      const sleepSessions = sessions.filter((session) => session.isSleep).sort((a, b) => a.start - b.start);
      const merged = [];
      for (const session of sleepSessions) {
        const last = merged[merged.length - 1];
        if (last && session.start <= last.end) {
          last.end = Math.max(last.end, session.end);
        } else {
          merged.push({ start: session.start, end: session.end, source: session.path });
        }
      }
      nights = merged.map((session) => ({ date: dateKey(session.end), ms: session.end - session.start, method: 'Durata sessione', source: session.source }));
    }

    const perDate = new Map();
    for (const night of nights) {
      if (!night.date || !Number.isFinite(night.ms) || night.ms <= 0) continue;
      if (!perDate.has(night.date)) perDate.set(night.date, { date: night.date, ms: 0, methods: new Set(), sources: new Set() });
      const item = perDate.get(night.date);
      item.ms += night.ms;
      item.methods.add(night.method);
      if (night.source) item.sources.add(night.source);
    }
    return [...perDate.values()].map((item) => ({
      date: item.date,
      ms: item.ms,
      hours: item.ms / 3600000,
      method: [...item.methods].join(' + '),
      source: [...item.sources][0] || ''
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderDashboard(data) {
    $('dashboard').hidden = false;
    $('howItWorks').hidden = true;
    $('siteFooter').hidden = true;
    const dates = [...data.steps.map((item) => item.date), ...data.sleep.map((item) => item.date)].sort();
    $('dataRange').textContent = dates.length
      ? `${formatDate(dates[0], { day: 'numeric', month: 'long', year: 'numeric' })} — ${formatDate(dates[dates.length - 1], { day: 'numeric', month: 'long', year: 'numeric' })} · ${data.meta.filename}`
      : data.meta.filename;

    const warnings = [];
    if (!data.steps.some((item) => item.steps != null)) warnings.push('Non sono stati rilevati dati di passi: verifica che l’archivio contenga le metriche giornaliere o il dataset step_count.delta.');
    if (!data.steps.some((item) => item.km != null)) warnings.push('Non ho trovato una misura di distanza giornaliera. I km resteranno vuoti: non vengono stimati dai passi per evitare valori arbitrari.');
    if (!data.sleep.length) warnings.push('Non ho trovato sessioni o segmenti di sonno. Il sonno potrebbe non essere stato sincronizzato in Google Fit.');
    const warningFiles = data.meta.warnings.length;
    const notice = [];
    notice.push('Elaborazione completata nel browser: il contenuto dell’archivio non viene inviato a nessun server.');
    if (warnings.length) notice.push(...warnings);
    if (warningFiles) notice.push(`${warningFiles} file non sono stati letti; dettagli nel riepilogo tecnico in fondo.`);
    $('dataNotice').classList.toggle('warning', warnings.length > 0 || warningFiles > 0);
    $('dataNotice').textContent = notice.join(' ');

    renderKpis(data);
    renderSteps(data);
    renderSleep(data);
    $('parseSummary').textContent = `${data.meta.fileCount} file · ${data.meta.jsonCount} JSON · ${data.meta.csvCount} CSV · ${data.meta.pointCount} punti · ${data.meta.sessionCount} sessioni`;
  }

  function renderKpis(data) {
    const stepDays = data.steps.filter((item) => item.steps != null);
    const sumSteps = stepDays.reduce((sum, item) => sum + item.steps, 0);
    const averageSteps = stepDays.length ? sumSteps / stepDays.length : null;
    const maxSteps = stepDays.slice().sort((a, b) => b.steps - a.steps)[0];
    const sleepDays = data.sleep;
    const sumSleep = sleepDays.reduce((sum, item) => sum + item.ms, 0);
    const averageSleep = sleepDays.length ? sumSleep / sleepDays.length : null;
    const cards = [
      { label: 'MEDIA PASSI ALL-TIME / GIORNO', value: averageSteps == null ? '—' : numberFmt.format(Math.round(averageSteps)), foot: `${numberFmt.format(stepDays.length)} giorni con dati`, accent: true },
      { label: 'TOTALE PASSI', value: sumSteps ? compactNumber(sumSteps) : '—', foot: 'somma delle registrazioni giornaliere' },
      { label: 'MEDIA SONNO ALL-TIME / NOTTE', value: averageSleep == null ? '—' : formatDuration(averageSleep), foot: `${numberFmt.format(sleepDays.length)} notti registrate`, accent: true },
      { label: 'SONNO TOTALE', value: sumSleep ? formatLongDuration(sumSleep) : '—', foot: 'somma delle notti registrate' }
    ];
    $('kpiGrid').innerHTML = cards.map((card) => `<article class="kpi-card"><div class="kpi-label">${card.label}</div><div class="kpi-value ${card.accent ? 'kpi-accent' : ''}">${card.value}</div><div class="kpi-foot">${card.foot}</div></article>`).join('');
    if (maxSteps) {
      $('bestStepDay').innerHTML = `<strong>${numberFmt.format(maxSteps.steps)}</strong><span>${formatDate(maxSteps.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>`;
      const topKmDay = data.steps.filter((item) => item.km != null).sort((a, b) => b.km - a.km)[0];
      $('bestStepMetrics').innerHTML = [
        metricMarkup('Passi medi', numberFmt.format(Math.round(averageSteps || 0))),
        metricMarkup('Km in quel giorno', maxSteps.km == null ? '—' : `${oneDecimal.format(maxSteps.km)} km`),
        metricMarkup('Record distanza', topKmDay ? `${oneDecimal.format(topKmDay.km)} km` : '—'),
        metricMarkup('Totale giorni', numberFmt.format(stepDays.length))
      ].join('');
    } else {
      $('bestStepDay').innerHTML = '<strong>—</strong><span>Nessun dato di passi</span>';
      $('bestStepMetrics').innerHTML = '';
    }
  }

  function renderSteps(data) {
    const stepDays = data.steps.filter((item) => item.steps != null);
    const distanceDays = data.steps.filter((item) => item.km != null);
    const years = [...new Set(stepDays.map((item) => item.date.slice(0, 4)))];
    $('stepsMeta').textContent = `${numberFmt.format(stepDays.length)} giorni · ${years.length} anni · ${numberFmt.format(distanceDays.length)} giorni con distanza`;
    renderMonthlyBars($('stepsMonthlyChart'), aggregateByMonth(stepDays, 'steps'), 'average', 'steps');
    renderStepRankings(data);
    renderStepsAnnualAndMonthly(data);
  }

  function renderStepRankings(data) {
    const limit = Number($('stepTopN').value) || 10;
    const stepDays = data.steps.filter((item) => item.steps != null).slice().sort((a, b) => b.steps - a.steps || a.date.localeCompare(b.date));
    const rows = stepDays.slice(0, limit).map((item, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${formatDate(item.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td><span class="rank-value">${numberFmt.format(item.steps)}</span></td><td>${item.km == null ? '<span class="matrix-muted">—</span>' : `<span class="distance-value">${oneDecimal.format(item.km)} km</span>`}</td><td><span class="weekday-tag">${capitalize(IT_WEEKDAYS[dateFromKey(item.date).getDay()])}</span></td></tr>`).join('');
    $('topStepsTable').innerHTML = rows || emptyRow(5, 'Nessun giorno con dati sui passi.');
    const distanceDays = data.steps.filter((item) => item.km != null).slice().sort((a, b) => b.km - a.km || a.date.localeCompare(b.date)).slice(0, limit);
    $('topDistanceTable').innerHTML = distanceDays.map((item, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td>${formatDate(item.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td><span class="rank-value">${oneDecimal.format(item.km)} km</span></td><td>${item.steps == null ? '<span class="matrix-muted">—</span>' : numberFmt.format(item.steps)}</td></tr>`).join('') || emptyRow(4, 'Nessuna distanza giornaliera disponibile.');
  }

  function renderStepsAnnualAndMonthly(data) {
    const stepDays = data.steps.filter((item) => item.steps != null);
    const annual = aggregateBy(stepDays, (item) => item.date.slice(0, 4), 'steps');
    const annualRows = [...annual.values()].sort((a, b) => a.key.localeCompare(b.key)).map((item) => `<tr><td>${item.key}</td><td><strong>${numberFmt.format(Math.round(item.average))}</strong></td><td>${compactNumber(item.total)}</td><td>${numberFmt.format(item.count)}</td></tr>`).join('');
    $('stepsYearTable').innerHTML = annualRows || emptyRow(4, 'Nessun dato disponibile.');

    const monthly = aggregateBy(stepDays, (item) => item.date.slice(0, 7), 'steps');
    const years = [...new Set([...monthly.keys()].map((key) => key.slice(0, 4)))].sort();
    $('stepsMonthHead').innerHTML = `<tr><th>Anno</th>${IT_MONTHS.map((month) => `<th>${month}</th>`).join('')}</tr>`;
    $('stepsMonthTable').innerHTML = years.map((year) => {
      const cells = Array.from({ length: 12 }, (_, index) => {
        const key = `${year}-${String(index + 1).padStart(2, '0')}`;
        const item = monthly.get(key);
        if (!item) return '<td class="matrix-muted">—</td>';
        const max = item.average > 10000;
        return `<td class="${max ? 'matrix-hot' : ''}" title="${numberFmt.format(Math.round(item.average))} passi medi · ${item.count} giorni con dati">${formatCompact(item.average)}</td>`;
      }).join('');
      return `<tr><td>${year}</td>${cells}</tr>`;
    }).join('') || '<tr><td colspan="13">Nessun dato disponibile.</td></tr>';
  }

  function renderSleep(data) {
    const sleepDays = data.sleep;
    const total = sleepDays.reduce((sum, item) => sum + item.ms, 0);
    const average = sleepDays.length ? total / sleepDays.length : null;
    const best = sleepDays.slice().sort((a, b) => b.ms - a.ms)[0];
    const worst = sleepDays.slice().sort((a, b) => a.ms - b.ms)[0];
    const years = [...new Set(sleepDays.map((item) => item.date.slice(0, 4)))];
    $('sleepMeta').textContent = `${numberFmt.format(sleepDays.length)} notti · ${years.length} anni · ${sleepDays[0] ? sleepDays[0].method : 'nessun metodo'}`;
    $('sleepKpis').innerHTML = [
      sleepKpi('DURATA COMPLESSIVA', total ? formatLongDuration(total) : '—'),
      sleepKpi('MEDIA PER NOTTE', average == null ? '—' : formatDuration(average)),
      sleepKpi('NOTTE PIÙ LUNGA', best ? formatDuration(best.ms) : '—')
    ].join('');
    renderMonthlyBars($('sleepMonthlyChart'), aggregateByMonth(sleepDays, 'ms'), 'average', 'sleep');

    if (sleepDays.length) {
      const weekdayAverages = new Map();
      sleepDays.forEach((item) => {
        const day = dateFromKey(item.date).getDay();
        if (!weekdayAverages.has(day)) weekdayAverages.set(day, []);
        weekdayAverages.get(day).push(item.hours);
      });
      const weekdayStats = [...weekdayAverages.entries()].map(([day, values]) => ({ day, average: values.reduce((a, b) => a + b, 0) / values.length, count: values.length })).sort((a, b) => b.average - a.average);
      const bestWeekday = weekdayStats[0];
      const worstWeekday = weekdayStats[weekdayStats.length - 1];
      $('sleepWeekdayInsight').innerHTML = `<strong>${bestWeekday ? capitalize(IT_WEEKDAYS[bestWeekday.day]) : '—'}</strong><span>Il giorno in cui dormi mediamente di più</span>`;
      $('sleepHighlightMetrics').innerHTML = [
        metricMarkup('Media del giorno migliore', bestWeekday ? `${capitalize(IT_WEEKDAYS[bestWeekday.day])} · ${formatHours(bestWeekday.average)}` : '—'),
        metricMarkup('Media del giorno minore', worstWeekday ? `${capitalize(IT_WEEKDAYS[worstWeekday.day])} · ${formatHours(worstWeekday.average)}` : '—'),
        metricMarkup('Notte più lunga', best ? formatDate(best.date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
        metricMarkup('Notte più corta', worst ? formatDate(worst.date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
      ].join('');
    } else {
      $('sleepWeekdayInsight').innerHTML = '<strong>—</strong><span>Nessuna sessione di sonno trovata</span>';
      $('sleepHighlightMetrics').innerHTML = '';
    }

    renderSleepYearAndMonth(data);
    renderSleepDayRankings(data);
    renderWeekRankings(data);
  }

  function renderSleepYearAndMonth(data) {
    const yearly = aggregateBy(data.sleep, (item) => item.date.slice(0, 4), 'ms');
    const yearRows = [...yearly.values()].sort((a, b) => a.key.localeCompare(b.key)).map((item) => `<tr><td>${item.key}</td><td>${formatLongDuration(item.total)}</td><td><strong>${formatDuration(item.average)}</strong></td><td>${numberFmt.format(item.count)}</td></tr>`).join('');
    $('sleepYearTable').innerHTML = yearRows || emptyRow(4, 'Nessuna notte disponibile.');

    const monthly = aggregateBy(data.sleep, (item) => item.date.slice(0, 7), 'ms');
    const monthRows = [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)).map((item) => {
      const [year, month] = item.key.split('-');
      return `<tr><td>${IT_MONTHS[Number(month) - 1]} ${year}</td><td>${formatLongDuration(item.total)}</td><td><strong>${formatDuration(item.average)}</strong></td><td>${numberFmt.format(item.count)}</td></tr>`;
    }).join('');
    $('sleepMonthTable').innerHTML = monthRows || emptyRow(4, 'Nessuna notte disponibile.');
  }

  function renderSleepDayRankings(data) {
    const limit = 10;
    const sorted = data.sleep.slice().sort((a, b) => b.ms - a.ms);
    const best = sorted.slice(0, limit).map((item, index) => sleepDayRow(item, index + 1)).join('');
    const worst = sorted.slice(-limit).reverse().map((item, index) => sleepDayRow(item, index + 1)).join('');
    $('bestSleepDays').innerHTML = best || emptyRow(4, 'Nessuna notte disponibile.');
    $('worstSleepDays').innerHTML = worst || emptyRow(4, 'Nessuna notte disponibile.');
  }

  function renderWeekRankings(data) {
    const weeks = aggregateBy(data.sleep, (item) => mondayWeekKey(item.date), 'ms');
    const mode = $('weekRankMode').value;
    const values = [...weeks.values()].map((item) => ({ ...item, score: mode === 'total' ? item.total : item.average, start: item.key }));
    const best = values.slice().sort((a, b) => b.score - a.score).slice(0, 10);
    const worst = values.slice().sort((a, b) => a.score - b.score).slice(0, 10);
    $('bestSleepWeeks').innerHTML = best.map((item, index) => weekRow(item, index + 1)).join('') || emptyRow(5, 'Nessuna settimana disponibile.');
    $('worstSleepWeeks').innerHTML = worst.map((item, index) => weekRow(item, index + 1)).join('') || emptyRow(5, 'Nessuna settimana disponibile.');
  }

  function renderMonthlyBars(element, monthlyMap, mode, metric) {
    const entries = [...monthlyMap.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-15);
    if (!entries.length) {
      element.innerHTML = '<div class="empty-chart">Dati mensili non disponibili.</div>';
      return;
    }
    const values = entries.map((item) => mode === 'average' ? item.average : item.total);
    const max = Math.max(...values, 1);
    element.innerHTML = entries.map((item) => {
      const value = mode === 'average' ? item.average : item.total;
      const height = Math.max(2, Math.round((value / max) * 100));
      const [year, month] = item.key.split('-');
      const monthLabel = `${IT_MONTHS[Number(month) - 1]} '${year.slice(2)}`;
      const display = metric === 'steps' ? formatCompact(value) : oneDecimal.format(value / 3600000);
      const title = metric === 'steps' ? `${numberFmt.format(Math.round(value))} passi medi` : `${formatDuration(value)} medi per notte`;
      return `<div class="bar-col" title="${monthLabel}: ${title}"><span class="bar-value">${display}</span><div class="bar-track"><div class="bar-fill" style="height:${height}%"></div></div><span class="bar-month">${monthLabel}</span></div>`;
    }).join('');
  }

  function aggregateByMonth(items, field) {
    return aggregateBy(items, (item) => item.date.slice(0, 7), field);
  }

  function aggregateBy(items, keyFunction, field) {
    const result = new Map();
    for (const item of items) {
      const key = keyFunction(item);
      const value = Number(item[field]);
      if (!Number.isFinite(value)) continue;
      if (!result.has(key)) result.set(key, { key, total: 0, count: 0, average: 0 });
      const group = result.get(key);
      group.total += value;
      group.count += 1;
    }
    result.forEach((group) => { group.average = group.count ? group.total / group.count : 0; });
    return result;
  }

  function mondayWeekKey(date) {
    const current = dateFromKey(date);
    const day = (current.getDay() + 6) % 7;
    current.setDate(current.getDate() - day);
    return dateKey(current.getTime());
  }

  function weekRow(item, index) {
    const start = item.start || item.key;
    const endDate = addDays(dateFromKey(start), 6);
    const label = `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(dateKey(endDate.getTime()), { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return `<tr><td>${String(index).padStart(2, '0')}</td><td>${label}</td><td><strong>${formatDuration(item.average)}</strong></td><td>${formatLongDuration(item.total)}</td><td>${item.count}</td></tr>`;
  }

  function sleepDayRow(item, index) {
    return `<tr><td>${String(index).padStart(2, '0')}</td><td>${formatDate(item.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td><td><span class="rank-value">${formatDuration(item.ms)}</span></td><td>${oneDecimal.format(item.hours)} h</td></tr>`;
  }

  function sleepKpi(label, value) { return `<div class="sleep-kpi"><small>${label}</small><strong>${value}</strong></div>`; }
  function metricMarkup(label, value) { return `<div class="highlight-metric"><small>${label}</small><strong>${value}</strong></div>`; }
  function emptyRow(columns, message) { return `<tr><td colspan="${columns}" style="color:#77867c;padding:18px 12px;">${message}</td></tr>`; }

  function dateKey(timestamp) {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function dateFromKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function localMidnightAfter(timestamp) {
    const date = new Date(timestamp);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  }

  function addDays(date, days) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function formatDate(date, options = {}) {
    const value = typeof date === 'string' ? dateFromKey(date) : date;
    return new Intl.DateTimeFormat('it-IT', options).format(value);
  }

  function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds)) return '—';
    const minutes = Math.max(0, Math.round(milliseconds / 60000));
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${hours} h ${String(remainder).padStart(2, '0')} min`;
  }

  function formatLongDuration(milliseconds) {
    const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days) return `${days} g ${hours} h${minutes ? ` ${minutes} min` : ''}`;
    return `${hours} h${minutes ? ` ${minutes} min` : ''}`;
  }

  function formatHours(hours) {
    const totalMinutes = Math.round(hours * 60);
    return `${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, '0')} min`;
  }

  function compactNumber(value) {
    if (value >= 1000000) return `${oneDecimal.format(value / 1000000)} M`;
    if (value >= 10000) return `${oneDecimal.format(value / 1000)}k`;
    return numberFmt.format(Math.round(value));
  }

  function formatCompact(value) {
    if (value >= 10000) return `${oneDecimal.format(value / 1000)}k`;
    return numberFmt.format(Math.round(value));
  }

  function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }

  function exportDailyCsv() {
    if (!state.data) return;
    const headers = ['Data', 'Passi', 'Distanza_km', 'Sonno_ore', 'Fonte_passi', 'Fonte_distanza', 'Metodo_sonno'];
    const sleepByDate = new Map(state.data.sleep.map((item) => [item.date, item]));
    const allDates = [...new Set([...state.data.steps.map((item) => item.date), ...state.data.sleep.map((item) => item.date)])].sort();
    const rows = [headers.join(';')];
    for (const date of allDates) {
      const steps = state.data.steps.find((item) => item.date === date);
      const sleep = sleepByDate.get(date);
      rows.push([
        date,
        steps && steps.steps != null ? String(Math.round(steps.steps)) : '',
        steps && steps.km != null ? String(Number(steps.km.toFixed(3))).replace('.', ',') : '',
        sleep ? String(Number(sleep.hours.toFixed(2))).replace('.', ',') : '',
        steps && steps.stepsSource ? csvEscape(steps.stepsSource) : '',
        steps && steps.distanceSource ? csvEscape(steps.distanceSource) : '',
        sleep ? csvEscape(sleep.method) : ''
      ].join(';'));
    }
    const blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fit-archive-statistiche-giornaliere.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('CSV giornaliero esportato.');
  }

  function csvEscape(value) {
    const text = String(value).replace(/"/g, '""');
    return /[;"\r\n]/.test(text) ? `"${text}"` : text;
  }

  function setStatus(message, kind) {
    importStatus.textContent = message;
    importStatus.className = `import-status ${kind || ''}`;
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function nextPaint() { return new Promise((resolve) => window.setTimeout(resolve, 0)); }
})();
