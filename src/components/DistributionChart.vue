<script setup lang="ts">
import { computed } from 'vue'
import { distributionStats } from '../utils/analytics'
import { formatCompact, formatHours, numberFmt, oneDecimal } from '../utils/numbers'

const props = defineProps<{
  values: number[]
  kind: 'steps' | 'sleep'
}>()

function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

const model = computed(() => {
  const stats = distributionStats(props.values)
  if (!stats) return null

  const width = 940
  const height = 370
  const left = 76
  const right = 28
  const top = 70
  const bottom = 76
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const curvePeak = Math.max(0, ...stats.curve.map((point) => point.y))
  const observedPeak = Math.max(0, ...stats.bins.map((bin) => bin.count))
  const rawYMax = niceCeiling(Math.max(observedPeak, curvePeak) * 1.12)
  const yStep = niceCeiling(rawYMax / 4)
  const yMax = Math.ceil(rawYMax / yStep) * yStep
  const x = (value: number) => left + ((value - stats.min) / (stats.max - stats.min || 1)) * plotWidth
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

  const curvePath = stats.curve
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`)
    .join(' ')
  const meanText = props.kind === 'steps' ? numberFmt.format(Math.round(stats.mean)) : formatHours(stats.mean)
  const medianText = props.kind === 'steps' ? numberFmt.format(Math.round(stats.median)) : formatHours(stats.median)
  const axisLabels = Array.from({ length: 6 }, (_, index) => {
    const value = stats.min + ((stats.max - stats.min) * index / 5)
    return {
      x: x(value),
      text: props.kind === 'steps' ? formatCompact(value) : `${oneDecimal.format(value)} h`,
    }
  })
  const yTicks: Array<{ value: number; y: number }> = []
  for (let value = 0; value <= yMax + yStep * 0.001; value += yStep) {
    yTicks.push({ value, y: y(value) })
  }

  const labelWidth = props.kind === 'steps' ? 150 : 130
  const clampLabelX = (value: number) => Math.min(width - right - labelWidth / 2, Math.max(left + labelWidth / 2, value))
  const meanLabelX = clampLabelX(x(stats.mean))
  const medianLabelX = clampLabelX(x(stats.median))
  const labelsNeedStacking = Math.abs(meanLabelX - medianLabelX) < labelWidth + 8
  const meanLabelY = 6
  const medianLabelY = labelsNeedStacking ? 33 : 6

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
    meanLabelX,
    medianLabelX,
    meanLabelY,
    medianLabelY,
    labelWidth,
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
        <text class="distribution-axis-label" :x="model.left - 12" :y="tick.y + 4" text-anchor="end">{{ numberFmt.format(tick.value) }}</text>
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

      <g class="distribution-callout distribution-callout-mean" :transform="`translate(${model.meanLabelX}, ${model.meanLabelY})`">
        <rect :x="-model.labelWidth / 2" y="0" :width="model.labelWidth" height="22" rx="6" />
        <text y="15" text-anchor="middle">MEDIA · {{ model.meanText }}</text>
      </g>
      <g class="distribution-callout distribution-callout-median" :transform="`translate(${model.medianLabelX}, ${model.medianLabelY})`">
        <rect :x="-model.labelWidth / 2" y="0" :width="model.labelWidth" height="22" rx="6" />
        <text y="15" text-anchor="middle">MEDIANA · {{ model.medianText }}</text>
      </g>

      <text v-for="(label, index) in model.axisLabels" :key="index" class="distribution-axis-label" :x="label.x" :y="model.height - 30" text-anchor="middle">{{ label.text }}</text>
      <text class="distribution-axis-title" :x="model.left + model.plotWidth / 2" :y="model.height - 3" text-anchor="middle">
        {{ kind === 'steps' ? 'Passi registrati nel giorno' : 'Durata del sonno per notte' }}
      </text>
      <text class="distribution-axis-title distribution-y-axis-title" :transform="`translate(17 ${model.top + model.plotHeight / 2}) rotate(-90)`" text-anchor="middle">
        {{ kind === 'steps' ? 'Numero di giorni' : 'Numero di notti' }}
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
