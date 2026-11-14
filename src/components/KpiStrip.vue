<script setup lang="ts">
import { computed } from 'vue'
import type { FitAnalytics } from '../types/fit'
import { dateRangeLabel } from '../utils/date'
import { compactNumber, countLabel, formatDuration, formatLongDuration, numberFmt } from '../utils/numbers'
import { handleShiftWheelScroll } from '../composables/useShiftWheelScroll'

const props = defineProps<{ data: FitAnalytics }>()

const cards = computed(() => {
  const stepDays = props.data.steps.filter((item) => item.steps != null)
  const totalSteps = stepDays.reduce((sum, item) => sum + (item.steps ?? 0), 0)
  const averageSteps = stepDays.length ? totalSteps / stepDays.length : null
  const sleepDays = props.data.sleep
  const totalSleep = sleepDays.reduce((sum, item) => sum + item.ms, 0)
  const averageSleep = sleepDays.length ? totalSleep / sleepDays.length : null
  const stepsRange = dateRangeLabel(stepDays)
  const sleepRange = dateRangeLabel(sleepDays)

  return [
    {
      label: 'MEDIA PASSI / GIORNO · ALL-TIME',
      value: averageSteps == null ? '—' : numberFmt.format(Math.round(averageSteps)),
      foot: `${countLabel(stepDays.length, 'giorno', 'giorni')} · ${stepsRange}`,
      accent: true,
    },
    {
      label: 'TOTALE PASSI · ALL-TIME',
      value: totalSteps ? compactNumber(totalSteps) : '—',
      foot: `${countLabel(stepDays.length, 'giorno', 'giorni')} · ${stepsRange}`,
      accent: false,
    },
    {
      label: 'MEDIA SONNO / NOTTE · ALL-TIME',
      value: averageSleep == null ? '—' : formatDuration(averageSleep),
      foot: `${countLabel(sleepDays.length, 'notte', 'notti')} · ${sleepRange}`,
      accent: true,
    },
    {
      label: 'SONNO TOTALE · ALL-TIME',
      value: totalSleep ? formatLongDuration(totalSleep) : '—',
      foot: `${countLabel(sleepDays.length, 'notte', 'notti')} · ${sleepRange}`,
      accent: false,
    },
  ]
})
</script>

<template>
  <div class="kpi-grid" aria-label="Indicatori all-time" @wheel="handleShiftWheelScroll">
    <article v-for="card in cards" :key="card.label" class="kpi-card">
      <div class="kpi-label">{{ card.label }}</div>
      <div class="kpi-value" :class="{ 'kpi-accent': card.accent }">{{ card.value }}</div>
      <div class="kpi-foot">{{ card.foot }}</div>
    </article>
  </div>
</template>
