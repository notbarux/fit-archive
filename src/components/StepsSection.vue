<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FitAnalytics, DailyStep } from '../types/fit'
import { aggregateByMonth, annualSteps, compareDistanceDaysDesc, compareStepDaysDesc, IT_MONTHS, distributionWeekdayLabel, monthlyStepsMatrix } from '../utils/analytics'
import { formatDate } from '../utils/date'
import { compactNumber, countLabel, formatCompact, numberFmt, oneDecimal, capitalize } from '../utils/numbers'
import MonthlyBarsChart from './MonthlyBarsChart.vue'
import DistributionChart from './DistributionChart.vue'

const props = defineProps<{ data: FitAnalytics }>()
const topLimit = ref(10)

const stepDays = computed(() => props.data.steps.filter((item) => item.steps != null))
const distanceDays = computed(() => props.data.steps.filter((item) => item.km != null))
const years = computed(() => [...new Set(stepDays.value.map((item) => item.date.slice(0, 4)))])
const average = computed(() => stepDays.value.length
  ? stepDays.value.reduce((sum, item) => sum + (item.steps ?? 0), 0) / stepDays.value.length
  : null)
const maxSteps = computed(() => stepDays.value.slice().sort(compareStepDaysDesc)[0] ?? null)
const maxDistance = computed(() => distanceDays.value.slice().sort(compareDistanceDaysDesc)[0] ?? null)
const stepMonthly = computed(() => [...aggregateByMonth(stepDays.value, 'steps').values()].sort((a, b) => a.key.localeCompare(b.key)))
const stepYearly = computed(() => annualSteps(props.data))
const monthMatrix = computed(() => monthlyStepsMatrix(props.data))
const topSteps = computed(() => stepDays.value.slice().sort(compareStepDaysDesc).slice(0, topLimit.value))
const topDistance = computed(() => distanceDays.value.slice().sort(compareDistanceDaysDesc).slice(0, topLimit.value))

function monthValue(year: string, index: number) {
  const key = `${year}-${String(index + 1).padStart(2, '0')}`
  return monthMatrix.value.values.get(key)
}

function monthDisplay(year: string, index: number) {
  const value = monthValue(year, index)
  return value ? formatCompact(value.average) : '—'
}

function monthTooltip(year: string, index: number) {
  const value = monthValue(year, index)
  return value
    ? `${numberFmt.format(Math.round(value.average))} passi medi · ${value.count} giorni con dati`
    : 'Nessuna registrazione'
}

function weekday(date: string) {
  return capitalize(distributionWeekdayLabel(date))
}

function fullDate(date: string) {
  return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const bestDayMetrics = computed(() => {
  if (!maxSteps.value) return []
  return [
    { label: 'Passi medi', value: average.value == null ? '—' : numberFmt.format(Math.round(average.value)) },
    { label: 'Km in quel giorno', value: maxSteps.value.km == null ? '—' : `${oneDecimal.format(maxSteps.value.km)} km` },
    { label: 'Record distanza', value: maxDistance.value ? `${oneDecimal.format(maxDistance.value.km ?? 0)} km` : '—' },
    { label: 'Totale giorni', value: numberFmt.format(stepDays.value.length) },
  ]
})
</script>

<template>
  <section class="data-section" id="stepsSection">
    <div class="section-heading">
      <div>
        <div class="section-index">01 / MOVIMENTO</div>
        <h2>Passi &amp; distanza</h2>
        <p>Volume di attività, record giornalieri e distribuzione delle registrazioni.</p>
      </div>
      <div class="section-meta">{{ numberFmt.format(stepDays.length) }} giorni · {{ years.length }} anni · {{ numberFmt.format(distanceDays.length) }} giorni con distanza</div>
    </div>

    <div class="two-column">
      <article class="panel panel-large">
        <div class="panel-heading">
          <div><span class="panel-label">ANDAMENTO MENSILE</span><h3>Media passi al giorno</h3></div>
          <span class="unit-tag">passi / giorno</span>
        </div>
        <MonthlyBarsChart :items="stepMonthly" metric="steps" />
        <div class="chart-footnote">Ogni barra rappresenta la media dei passi nei giorni del mese con dati registrati.</div>
      </article>

      <article class="panel highlight-panel">
        <span class="panel-label">IL GIORNO PIÙ ATTIVO</span>
        <div class="hero-stat">
          <strong>{{ maxSteps ? numberFmt.format(maxSteps.steps ?? 0) : '—' }}</strong>
          <span>{{ maxSteps ? fullDate(maxSteps.date) : 'Nessun dato di passi' }}</span>
        </div>
        <div class="highlight-divider" />
        <div class="highlight-metrics">
          <div v-for="item in bestDayMetrics" :key="item.label" class="highlight-metric">
            <small>{{ item.label }}</small><strong>{{ item.value }}</strong>
          </div>
        </div>
      </article>
    </div>

    <article class="panel distribution-panel">
      <div class="panel-heading">
        <div><span class="panel-label">DISTRIBUZIONE DEI DATI</span><h3>Distribuzione dei passi giornalieri</h3><p>Frequenza dei giorni per fascia di passi, con media, mediana e curva normale di riferimento.</p></div>
        <span class="unit-tag">giorni per fascia</span>
      </div>
      <div class="distribution-plot"><DistributionChart :values="stepDays.map((item) => item.steps ?? 0)" kind="steps" /></div>
      <div class="distribution-legend">
        <span><i class="legend-bar" /> Giorni registrati</span><span><i class="legend-line" /> Curva normale di riferimento</span><span><i class="legend-mean" /> Media</span><span><i class="legend-median" /> Mediana</span>
      </div>
    </article>

    <article class="panel table-panel">
      <div class="panel-heading responsive-heading">
        <div><span class="panel-label">CLASSIFICA GIORNALIERA</span><h3>I giorni con più passi</h3><p>La distanza è mostrata quando presente nell’esportazione.</p></div>
        <label class="select-wrap"><span>Mostra</span><select v-model.number="topLimit"><option :value="5">Top 5</option><option :value="10">Top 10</option><option :value="20">Top 20</option></select></label>
      </div>
      <div class="table-scroll">
        <table><thead><tr><th>#</th><th>Giorno</th><th>Passi</th><th>Distanza</th><th>Giorno</th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in topSteps" :key="item.date">
              <td>{{ String(index + 1).padStart(2, '0') }}</td><td>{{ fullDate(item.date) }}</td>
              <td><span class="rank-value">{{ numberFmt.format(item.steps ?? 0) }}</span></td>
              <td><span v-if="item.km != null" class="distance-value">{{ oneDecimal.format(item.km) }} km</span><span v-else class="matrix-muted">—</span></td>
              <td><span class="weekday-tag">{{ weekday(item.date) }}</span></td>
            </tr>
            <tr v-if="!topSteps.length"><td colspan="5" class="matrix-muted">Nessun giorno con dati sui passi.</td></tr>
          </tbody>
        </table>
      </div>
    </article>

    <article class="panel table-panel">
      <div class="panel-heading"><div><span class="panel-label">CLASSIFICA DISTANZA</span><h3>I giorni con più chilometri</h3><p>Classifica separata basata sulle distanze effettivamente registrate.</p></div></div>
      <div class="table-scroll">
        <table><thead><tr><th>#</th><th>Giorno</th><th>Distanza</th><th>Passi</th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in topDistance" :key="item.date">
              <td>{{ String(index + 1).padStart(2, '0') }}</td><td>{{ fullDate(item.date) }}</td>
              <td><span class="rank-value">{{ oneDecimal.format(item.km ?? 0) }} km</span></td>
              <td>{{ item.steps == null ? '—' : numberFmt.format(item.steps) }}</td>
            </tr>
            <tr v-if="!topDistance.length"><td colspan="4" class="matrix-muted">Nessuna distanza giornaliera disponibile.</td></tr>
          </tbody>
        </table>
      </div>
    </article>

    <div class="summary-grid">
      <article class="panel">
        <div class="panel-heading"><div><span class="panel-label">CONFRONTO ANNUALE</span><h3>Media per anno</h3></div></div>
        <div class="table-scroll">
          <table class="compact-table"><thead><tr><th>Anno</th><th>Media / giorno</th><th>Totale</th><th>Giorni</th></tr></thead>
            <tbody><tr v-for="item in stepYearly" :key="item.key"><td>{{ item.key }}</td><td><strong>{{ numberFmt.format(Math.round(item.average)) }}</strong></td><td>{{ compactNumber(item.total) }}</td><td>{{ numberFmt.format(item.count) }}</td></tr>
              <tr v-if="!stepYearly.length"><td colspan="4">Nessun dato disponibile.</td></tr></tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><span class="panel-label">VISTA COMPATTA</span><h3>Media mensile</h3></div><span class="unit-tag">passi / giorno</span></div>
        <div class="table-scroll">
          <table class="month-matrix"><thead><tr><th>Anno</th><th v-for="month in IT_MONTHS" :key="month">{{ month }}</th></tr></thead>
            <tbody>
              <tr v-for="year in monthMatrix.years" :key="year">
                <td>{{ year }}</td>
                <td v-for="(month, index) in IT_MONTHS" :key="month" :class="{ 'matrix-muted': !monthValue(year, index), 'matrix-hot': (monthValue(year, index)?.average ?? 0) > 10000 }" :title="monthTooltip(year, index)">
                  {{ monthDisplay(year, index) }}
                </td>
              </tr>
              <tr v-if="!monthMatrix.years.length"><td colspan="13">Nessun dato disponibile.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="chart-footnote">Trattino = nessuna registrazione per quel mese. Scorri orizzontalmente se necessario.</div>
      </article>
    </div>
  </section>
</template>
