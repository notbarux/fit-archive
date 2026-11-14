<script setup lang="ts">
import { computed } from 'vue'
import { distributionStats } from '../utils/analytics'
import { formatCompact, formatHours, numberFmt, oneDecimal } from '../utils/numbers'

const props = defineProps<{
  values: number[]
  kind: 'steps' | 'sleep'
}>()

const model = computed(() => {
  const stats = distributionStats(props.values)
  if (!stats) return null

  const width = 940
  const height = 330
  const left = 58
  const right = 22
  const top = 20
  const bottom = 62
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const yMax = Math.max(...stats.bins.map((bin) => bin.count), 1) * 1.22
  const x = (value: number) => left + ((value - stats.min) / (stats.max - stats.min)) * plotWidth
  const y = (count: number) => top + plotHeight - (count / yMax) * plotHeight
  const barWidth = plotWidth / stats.bins.length
  const bars = stats.bins.map((bin, index) => ({
    x: left + index * barWidth + 2,
    y: y(bin.count),
    width: Math.max(1, barWidth - 4),
    height: (bin.count / yMax) * plotHeight,
    count: bin.count,
    title: props.kind === 'steps'
      ? `${numberFmt.format(Math.round(bin.center))} passi: ${numberFmt.format(bin.count)} giorni`
      : `${oneDecimal.format(bin.center)} ore: ${numberFmt.format(bin.count)} notti`,
  }))
  const curvePath = stats.curve.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`).join(' ')
  const meanText = props.kind === 'steps' ? numberFmt.format(Math.round(stats.mean)) : formatHours(stats.mean)
  const medianText = props.kind === 'steps' ? numberFmt.format(Math.round(stats.median)) : formatHours(stats.median)
  const axisLabels = Array.from({ length: 6 }, (_, index) => {
    const value = stats.min + ((stats.max - stats.min) * index / 5)
    return {
      x: x(value),
      text: props.kind === 'steps' ? formatCompact(value) : `${oneDecimal.format(value)} h`,
    }
  })
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = Math.round(yMax * index / 3)
    return { value, y: y(value) }
  })

  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    plotWidth,
    plotHeight,
    yTicks,
    bars,
    curvePath,
    meanX: x(stats.mean),
    medianX: x(stats.median),
    axisLabels,
    meanText,
    medianText,
    sampleCount: stats.count,
    deviationText: props.kind === 'steps'
      ? `${numberFmt.format(Math.round(stats.deviation))} passi`
      : formatHours(stats.deviation),
  }
})
</script>

<template>
  <div v-if="model" class="distribution-svg-wrap">
    <svg
      class="distribution-svg"
      :viewBox="`0 0 ${model.width} ${model.height}`"
      role="img"
      :aria-label="`Istogramma della distribuzione con media ${model.meanText} e mediana ${model.medianText}`"
    >
      <g v-for="tick in model.yTicks" :key="tick.value">
        <line class="distribution-gridline" :x1="model.left" :x2="model.width - model.right" :y1="tick.y" :y2="tick.y" />
        <text class="distribution-axis-label" :x="model.left - 12" :y="tick.y + 4" text-anchor="end">{{ tick.value }}</text>
      </g>
      <rect
        v-for="(bar, index) in model.bars"
        :key="index"
        class="distribution-bar"
        :class="{ 'sleep-distribution-bar': kind === 'sleep' }"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        rx="4"
      >
        <title>{{ bar.title }}</title>
      </rect>
      <path
        v-if="model.curvePath"
        class="distribution-curve"
        :class="{ 'sleep-distribution-curve': kind === 'sleep' }"
        :d="model.curvePath"
      />
      <line class="distribution-marker distribution-mean" :x1="model.meanX" :x2="model.meanX" :y1="model.top" :y2="model.top + model.plotHeight" />
      <line class="distribution-marker distribution-median" :x1="model.medianX" :x2="model.medianX" :y1="model.top" :y2="model.top + model.plotHeight" />
      <text v-for="(label, index) in model.axisLabels" :key="index" class="distribution-axis-label" :x="label.x" :y="model.height - 25" text-anchor="middle">{{ label.text }}</text>
      <text class="distribution-axis-title" :x="model.left + model.plotWidth / 2" :y="model.height - 3" text-anchor="middle">
        {{ kind === 'steps' ? 'Passi registrati nel giorno' : 'Durata del sonno per notte' }}
      </text>
    </svg>
    <div class="distribution-stats">
      <span>Campione <strong>{{ numberFmt.format(model.sampleCount) }}</strong></span>
      <span>Media <strong>{{ model.meanText }}{{ kind === 'steps' ? ' passi' : '' }}</strong></span>
      <span>Mediana <strong>{{ model.medianText }}{{ kind === 'steps' ? ' passi' : '' }}</strong></span>
      <span>Deviazione standard <strong>{{ model.deviationText }}</strong></span>
    </div>
  </div>
  <div v-else class="empty-chart">Dati insufficienti per la distribuzione.</div>
</template>
