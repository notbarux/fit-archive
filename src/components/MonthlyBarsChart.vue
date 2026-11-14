<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AggregateRow } from '../types/fit'
import { monthLabel } from '../utils/date'
import { formatCompact, formatDuration, oneDecimal, numberFmt } from '../utils/numbers'

const props = defineProps<{
  items: AggregateRow[]
  metric: 'steps' | 'sleep'
  heading?: string
}>()

const viewport = ref<HTMLDivElement | null>(null)
const scrollLeft = ref(0)
const viewportWidth = ref(0)
const contentWidth = ref(0)

const bars = computed(() => {
  const entries = props.items.slice().sort((a, b) => a.key.localeCompare(b.key))
  const max = Math.max(...entries.map((item) => item.average), 1)

  return entries.map((item) => {
    const display = props.metric === 'steps'
      ? formatCompact(item.average)
      : oneDecimal.format(item.average / 3_600_000)
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

const canScrollLeft = computed(() => scrollLeft.value > 2)
const canScrollRight = computed(() => scrollLeft.value + viewportWidth.value < contentWidth.value - 2)

function syncScrollState() {
  const element = viewport.value
  if (!element) return
  scrollLeft.value = element.scrollLeft
  viewportWidth.value = element.clientWidth
  contentWidth.value = element.scrollWidth
}

function move(direction: -1 | 1) {
  const element = viewport.value
  if (!element) return
  element.scrollBy({ left: direction * Math.max(260, element.clientWidth * 0.78), behavior: 'smooth' })
}

function handleWheel(event: WheelEvent) {
  const element = viewport.value
  if (!element || element.scrollWidth <= element.clientWidth + 1) return

  // Convert a conventional vertical wheel into horizontal navigation.
  // Shift+wheel and horizontal trackpad gestures are handled as well.
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (delta === 0) return
  const maxScroll = element.scrollWidth - element.clientWidth
  const atLeftEdge = element.scrollLeft <= 1
  const atRightEdge = element.scrollLeft >= maxScroll - 1
  if ((delta < 0 && atLeftEdge) || (delta > 0 && atRightEdge)) return
  event.preventDefault()
  element.scrollBy({ left: delta, behavior: 'auto' })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
  const element = viewport.value
  if (!element) return
  event.preventDefault()
  if (event.key === 'Home') element.scrollTo({ left: 0, behavior: 'smooth' })
  else if (event.key === 'End') element.scrollTo({ left: element.scrollWidth, behavior: 'smooth' })
  else move(event.key === 'ArrowLeft' ? -1 : 1)
}

let resizeObserver: ResizeObserver | undefined

onMounted(async () => {
  await nextTick()
  syncScrollState()
  if (viewport.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(syncScrollState)
    resizeObserver.observe(viewport.value)
  }
})

onBeforeUnmount(() => resizeObserver?.disconnect())
watch(() => bars.value.length, async () => {
  await nextTick()
  syncScrollState()
})
</script>

<template>
  <div v-if="bars.length" class="monthly-chart-shell">
    <div class="monthly-chart-toolbar">
      <span class="monthly-scroll-hint">{{ bars.length }} mesi · scorri per esplorare tutto lo storico</span>
      <div class="monthly-scroll-controls" aria-label="Navigazione grafico mensile">
        <button type="button" class="monthly-scroll-button" :disabled="!canScrollLeft" aria-label="Scorri verso i mesi precedenti" @click="move(-1)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" /></svg>
        </button>
        <button type="button" class="monthly-scroll-button" :disabled="!canScrollRight" aria-label="Scorri verso i mesi successivi" @click="move(1)">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
        </button>
      </div>
    </div>
    <div
      ref="viewport"
      class="monthly-chart-viewport"
      tabindex="0"
      role="region"
      aria-label="Grafico mensile scorrevole"
      @wheel="handleWheel"
      @scroll.passive="syncScrollState"
      @keydown="handleKeydown"
    >
      <div class="bar-chart" :class="{ 'sleep-bars': metric === 'sleep' }">
        <div v-for="bar in bars" :key="bar.key" class="bar-col" :title="`${bar.label}: ${bar.title}`">
          <span class="bar-value">{{ bar.display }}</span>
          <div class="bar-track"><div class="bar-fill" :style="{ height: `${bar.height}%` }" /></div>
          <span class="bar-month">{{ bar.label }}</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="empty-chart">Dati mensili non disponibili.</div>
</template>
