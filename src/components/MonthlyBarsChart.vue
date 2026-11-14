<script setup lang="ts">
import { computed } from 'vue'
import type { AggregateRow } from '../types/fit'
import { monthLabel } from '../utils/date'
import { formatCompact, formatDuration, oneDecimal, numberFmt } from '../utils/numbers'

const props = defineProps<{
  items: AggregateRow[]
  metric: 'steps' | 'sleep'
  heading?: string
}>()

const bars = computed(() => {
  const entries = props.items.slice().sort((a, b) => a.key.localeCompare(b.key)).slice(-15)
  const max = Math.max(...entries.map((item) => item.average), 1)
  return entries.map((item) => {
    const display = props.metric === 'steps' ? formatCompact(item.average) : oneDecimal.format(item.average / 3_600_000)
    const title = props.metric === 'steps'
      ? `${numberFmt.format(Math.round(item.average))} passi medi`
      : `${formatDuration(item.average)} medi per notte`
    return {
      key: item.key,
      label: monthLabel(item.key),
      display,
      title,
      height: Math.max(2, Math.round((item.average / max) * 100)),
    }
  })
})
</script>

<template>
  <div v-if="bars.length" class="bar-chart" :class="{ 'sleep-bars': metric === 'sleep' }">
    <div v-for="bar in bars" :key="bar.key" class="bar-col" :title="`${bar.label}: ${bar.title}`">
      <span class="bar-value">{{ bar.display }}</span>
      <div class="bar-track"><div class="bar-fill" :style="{ height: `${bar.height}%` }" /></div>
      <span class="bar-month">{{ bar.label }}</span>
    </div>
  </div>
  <div v-else class="empty-chart">Dati mensili non disponibili.</div>
</template>
