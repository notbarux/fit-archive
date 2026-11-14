<script setup lang="ts">
import { computed } from 'vue'
import { distributionStats } from '../utils/analytics'
import { numberFmt, oneDecimal } from '../utils/numbers'

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
  const top = 66
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

  // Labels are positioned at actual histogram-bin centers, not at an unrelated
  // evenly-spaced scale. This keeps every X tick tied to a visible bar.
  const tickCount = Math.min(6, stats.bins.length)
  const tickIndices = [...new Set(Array.from({ length: tickCount }, (_, index) =>
    Math.round(index * (stats.bins.length - 1) / Math.max(1, tickCount - 1)),
  ))]
  const axisTicks = tickIndices.map((index) => {
    const bin = stats.bins[index]
    return {
      x: x(bin.center),
      text: props.kind === 'steps' ? numberFmt.format(Math.round(bin.center)) : oneDecimal.format(bin.center),
    }
  })

  const meanText = props.kind === 'steps'
    ? numberFmt.format(Math.round(stats.mean))
    : oneDecimal.format(stats.mean)
  const medianText = props.kind === 'steps'
    ? numberFmt.format(Math.round(stats.median))
    : oneDecimal.format(stats.median)
  const labelWidth = Math.max(meanText.length, medianText.length) * 8 + 12
  const labelsNeedStacking = Math.abs(x(stats.mean) - x(stats.median)) < labelWidth
  const yTicks: Array<{ value: number; y: number }> = []
  for (let value = 0; value <= yMax + yStep * 0.001; value += yStep) {
    yTicks.push({ value, y: y(value) })
  }

  return {
    width,
    height,
    left,
    right,
    top,
    plotWidth,
    plotHeight,
    yTicks,
    axisTicks,
    bars,
    curvePath,
    meanX: x(stats.mean),
    medianX: x(stats.median),
    meanText,
    medianText,
    meanLabelY: 17,
    medianLabelY: labelsNeedStacking ? 36 : 17,
    sampleCount: stats.count,
    deviationText: props.kind === 'steps'
      ? `${numberFmt.format(Math.round(stats.deviation))} passi`
      : `${oneDecimal.format(stats.deviation)} h`,
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
      <text class="distribution-marker-label distribution-marker-label-mean" :x="model.meanX" :y="model.meanLabelY" text-anchor="middle">{{ model.meanText }}</text>
      <text class="distribution-marker-label distribution-marker-label-median" :x="model.medianX" :y="model.medianLabelY" text-anchor="middle">{{ model.medianText }}</text>

      <line class="distribution-axis-baseline" :x1="model.left" :x2="model.width - model.right" :y1="model.top + model.plotHeight" :y2="model.top + model.plotHeight" />
      <g v-for="(tick, index) in model.axisTicks" :key="`${tick.x}-${index}`">
        <line class="distribution-axis-tick" :x1="tick.x" :x2="tick.x" :y1="model.top + model.plotHeight" :y2="model.top + model.plotHeight + 6" />
        <text class="distribution-axis-label" :x="tick.x" :y="model.height - 30" text-anchor="middle">{{ tick.text }}</text>
      </g>
      <text class="distribution-axis-title" :x="model.left + model.plotWidth / 2" :y="model.height - 3" text-anchor="middle">
        {{ kind === 'steps' ? 'Passi registrati nel giorno' : 'Durata del sonno per notte (ore)' }}
      </text>
      <text class="distribution-axis-title distribution-y-axis-title" :transform="`translate(17 ${model.top + model.plotHeight / 2}) rotate(-90)`" text-anchor="middle">
        {{ kind === 'steps' ? 'Numero di giorni' : 'Numero di notti' }}
      </text>
    </svg>
    <div class="distribution-stats">
      <span>Campione <strong>{{ numberFmt.format(model.sampleCount) }}</strong></span>
      <span>Media <strong>{{ model.meanText }}{{ kind === 'steps' ? ' passi' : ' h' }}</strong></span>
      <span>Mediana <strong>{{ model.medianText }}{{ kind === 'steps' ? ' passi' : ' h' }}</strong></span>
      <span>Deviazione standard <strong>{{ model.deviationText }}</strong></span>
    </div>
  </div>
  <div v-else class="empty-chart">Dati insufficienti per la distribuzione.</div>
</template>
