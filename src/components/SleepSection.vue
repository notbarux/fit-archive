<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FitAnalytics, SleepNight } from '../types/fit'
import { aggregateByMonth, annualSleep, compareSleepDesc, IT_WEEKDAYS, monthlySleep, sleepWeeks, weekdaySleepStats } from '../utils/analytics'
import { addDays, dateKey, formatDate } from '../utils/date'
import { capitalize, formatDuration, formatHours, formatLongDuration, numberFmt, oneDecimal } from '../utils/numbers'
import MonthlyBarsChart from './MonthlyBarsChart.vue'
import DistributionChart from './DistributionChart.vue'
import { handleShiftWheelScroll } from '../composables/useShiftWheelScroll'

const props = defineProps<{ data: FitAnalytics }>()
const weekRankMode = ref<'average' | 'total'>('average')

const sleepDays = computed(() => props.data.sleep)
const totalSleep = computed(() => sleepDays.value.reduce((sum, item) => sum + item.ms, 0))
const averageSleep = computed(() => sleepDays.value.length ? totalSleep.value / sleepDays.value.length : null)
const bestNight = computed(() => sleepDays.value.slice().sort(compareSleepDesc)[0] ?? null)
const worstNight = computed(() => sleepDays.value.slice().sort((a, b) => a.ms - b.ms || a.date.localeCompare(b.date))[0] ?? null)
const years = computed(() => [...new Set(sleepDays.value.map((item) => item.date.slice(0, 4)))])
const monthly = computed(() => [...aggregateByMonth(sleepDays.value, 'ms').values()].sort((a, b) => a.key.localeCompare(b.key)))
const yearly = computed(() => annualSleep(props.data))
const monthlyRows = computed(() => monthlySleep(props.data))
const weekdays = computed(() => weekdaySleepStats(sleepDays.value))
const bestWeekday = computed(() => weekdays.value[0] ?? null)
const worstWeekday = computed(() => weekdays.value[weekdays.value.length - 1] ?? null)
const dayRankings = computed(() => {
  const sorted = sleepDays.value.slice().sort(compareSleepDesc)
  return { best: sorted.slice(0, 10), worst: sorted.slice(-10).reverse() }
})
const weekRankings = computed(() => sleepWeeks(props.data, weekRankMode.value))

function fullDate(date: string) {
  return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function weekLabel(start: string) {
  const end = dateKey(addDays(new Date(`${start}T12:00:00`), 6))
  return `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function sleepDayHours(item: SleepNight) {
  return oneDecimal.format(item.hours)
}
</script>

<template>
  <section class="data-section" id="sleepSection">
    <div class="section-heading">
      <div>
        <div class="section-index">02 / RECUPERO</div>
        <h2>Sonno</h2>
        <p>Durata delle notti registrate, distribuzione e regolarità nel tempo.</p>
      </div>
      <div class="section-meta">{{ numberFmt.format(sleepDays.length) }} notti · {{ years.length }} anni · {{ sleepDays[0]?.method ?? 'nessun metodo' }}</div>
    </div>

    <div class="sleep-kpis" @wheel="handleShiftWheelScroll">
      <div class="sleep-kpi"><small>DURATA COMPLESSIVA</small><strong>{{ totalSleep ? formatLongDuration(totalSleep) : '—' }}</strong></div>
      <div class="sleep-kpi"><small>MEDIA PER NOTTE</small><strong>{{ averageSleep == null ? '—' : formatDuration(averageSleep) }}</strong></div>
      <div class="sleep-kpi"><small>NOTTE PIÙ LUNGA</small><strong>{{ bestNight ? formatDuration(bestNight.ms) : '—' }}</strong></div>
    </div>

    <div class="two-column">
      <article class="panel panel-large">
        <div class="panel-heading"><div><span class="panel-label">ANDAMENTO MENSILE</span><h3>Media ore per notte</h3></div><span class="unit-tag">ore / notte</span></div>
        <MonthlyBarsChart :items="monthly" metric="sleep" />
        <div class="chart-footnote">Le notti sono attribuite al giorno del risveglio. Sono inclusi solo i giorni con una sessione di sonno.</div>
      </article>
      <article class="panel highlight-panel sleep-highlight">
        <span class="panel-label">IL TUO ANDAMENTO</span>
        <div class="hero-stat"><strong>{{ bestWeekday ? capitalize(IT_WEEKDAYS[bestWeekday.day]) : '—' }}</strong><span>Il giorno in cui dormi mediamente di più</span></div>
        <div class="highlight-divider" />
        <div class="highlight-metrics">
          <div class="highlight-metric"><small>Media del giorno migliore</small><strong>{{ bestWeekday ? `${capitalize(IT_WEEKDAYS[bestWeekday.day])} · ${formatHours(bestWeekday.average)}` : '—' }}</strong></div>
          <div class="highlight-metric"><small>Media del giorno minore</small><strong>{{ worstWeekday ? `${capitalize(IT_WEEKDAYS[worstWeekday.day])} · ${formatHours(worstWeekday.average)}` : '—' }}</strong></div>
          <div class="highlight-metric"><small>Notte più lunga</small><strong>{{ bestNight ? formatDate(bestNight.date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }}</strong></div>
          <div class="highlight-metric"><small>Notte più corta</small><strong>{{ worstNight ? formatDate(worstNight.date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }}</strong></div>
        </div>
      </article>
    </div>

    <article class="panel distribution-panel sleep-distribution-panel">
      <div class="panel-heading"><div><span class="panel-label">DISTRIBUZIONE DEI DATI</span><h3>Distribuzione della durata del sonno</h3><p>Frequenza delle notti per fascia oraria, con media, mediana e curva normale di riferimento.</p></div><span class="unit-tag">notti per fascia</span></div>
      <div class="distribution-plot"><DistributionChart :values="sleepDays.map((item) => item.hours)" kind="sleep" /></div>
      <div class="distribution-legend">
        <span><i class="legend-bar sleep-legend-bar" /> Notti registrate</span><span><i class="legend-line sleep-legend-line" /> Curva normale di riferimento</span><span><i class="legend-mean" /> Media</span><span><i class="legend-median" /> Mediana</span>
      </div>
    </article>

    <div class="summary-grid">
      <article class="panel">
        <div class="panel-heading"><div><span class="panel-label">CONFRONTO ANNUALE</span><h3>Sonno per anno</h3></div></div>
        <div class="table-scroll">
          <table class="compact-table"><thead><tr><th>Anno</th><th>Totale</th><th>Media / notte</th><th>Notti</th></tr></thead>
            <tbody><tr v-for="item in yearly" :key="item.key"><td>{{ item.key }}</td><td>{{ formatLongDuration(item.total) }}</td><td><strong>{{ formatDuration(item.average) }}</strong></td><td>{{ numberFmt.format(item.count) }}</td></tr>
              <tr v-if="!yearly.length"><td colspan="4">Nessuna notte disponibile.</td></tr></tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><span class="panel-label">DETTAGLIO MENSILE</span><h3>Sonno per mese</h3></div></div>
        <div class="table-scroll">
          <table class="compact-table"><thead><tr><th>Mese</th><th>Totale</th><th>Media / notte</th><th>Notti</th></tr></thead>
            <tbody><tr v-for="item in monthlyRows" :key="item.key"><td>{{ formatDate(`${item.key}-01`, { month: 'short', year: 'numeric' }) }}</td><td>{{ formatLongDuration(item.total) }}</td><td><strong>{{ formatDuration(item.average) }}</strong></td><td>{{ numberFmt.format(item.count) }}</td></tr>
              <tr v-if="!monthlyRows.length"><td colspan="4">Nessuna notte disponibile.</td></tr></tbody>
          </table>
        </div>
      </article>
    </div>

    <div class="ranking-grid">
      <article class="panel table-panel">
        <div class="panel-heading"><div><span class="panel-label">CLASSIFICA NOTTI</span><h3>Hai dormito di più</h3></div></div>
        <div class="table-scroll">
          <table><thead><tr><th>#</th><th>Notte (risveglio)</th><th>Durata</th><th>Ore</th></tr></thead>
            <tbody><tr v-for="(item, index) in dayRankings.best" :key="item.date"><td>{{ String(index + 1).padStart(2, '0') }}</td><td>{{ fullDate(item.date) }}</td><td><span class="rank-value">{{ formatDuration(item.ms) }}</span></td><td>{{ sleepDayHours(item) }} h</td></tr>
              <tr v-if="!dayRankings.best.length"><td colspan="4" class="matrix-muted">Nessuna notte disponibile.</td></tr></tbody>
          </table>
        </div>
      </article>
      <article class="panel table-panel">
        <div class="panel-heading"><div><span class="panel-label">CLASSIFICA NOTTI</span><h3>Hai dormito di meno</h3></div></div>
        <div class="table-scroll">
          <table><thead><tr><th>#</th><th>Notte (risveglio)</th><th>Durata</th><th>Ore</th></tr></thead>
            <tbody><tr v-for="(item, index) in dayRankings.worst" :key="item.date"><td>{{ String(index + 1).padStart(2, '0') }}</td><td>{{ fullDate(item.date) }}</td><td><span class="rank-value">{{ formatDuration(item.ms) }}</span></td><td>{{ sleepDayHours(item) }} h</td></tr>
              <tr v-if="!dayRankings.worst.length"><td colspan="4" class="matrix-muted">Nessuna notte disponibile.</td></tr></tbody>
          </table>
        </div>
      </article>
    </div>

    <article class="panel table-panel weekly-panel">
      <div class="panel-heading responsive-heading">
        <div><span class="panel-label">CLASSIFICA SETTIMANALE</span><h3>Le settimane con più e meno sonno</h3><p>La classifica può usare la media per notte o il totale della settimana.</p></div>
        <label class="select-wrap"><span>Ordina per</span><select v-model="weekRankMode"><option value="average">Media per notte</option><option value="total">Totale settimanale</option></select></label>
      </div>
      <div class="weekly-columns">
        <div>
          <div class="mini-heading positive-heading">Più sonno</div>
          <div class="table-scroll"><table><thead><tr><th>#</th><th>Settimana</th><th>Media / notte</th><th>Totale</th><th>Notti</th></tr></thead>
            <tbody><tr v-for="(item, index) in weekRankings.best" :key="item.key"><td>{{ String(index + 1).padStart(2, '0') }}</td><td>{{ weekLabel(item.start) }}</td><td><strong>{{ formatDuration(item.average) }}</strong></td><td>{{ formatLongDuration(item.total) }}</td><td>{{ item.count }}</td></tr>
              <tr v-if="!weekRankings.best.length"><td colspan="5" class="matrix-muted">Nessuna settimana disponibile.</td></tr></tbody>
          </table></div>
        </div>
        <div>
          <div class="mini-heading negative-heading">Meno sonno</div>
          <div class="table-scroll"><table><thead><tr><th>#</th><th>Settimana</th><th>Media / notte</th><th>Totale</th><th>Notti</th></tr></thead>
            <tbody><tr v-for="(item, index) in weekRankings.worst" :key="item.key"><td>{{ String(index + 1).padStart(2, '0') }}</td><td>{{ weekLabel(item.start) }}</td><td><strong>{{ formatDuration(item.average) }}</strong></td><td>{{ formatLongDuration(item.total) }}</td><td>{{ item.count }}</td></tr>
              <tr v-if="!weekRankings.worst.length"><td colspan="5" class="matrix-muted">Nessuna settimana disponibile.</td></tr></tbody>
          </table></div>
        </div>
      </div>
    </article>
  </section>
</template>
