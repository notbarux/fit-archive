/**
 * Adds deliberate horizontal navigation to a horizontal scroller.
 * - Desktop: Shift + mouse wheel / Shift + trackpad gesture.
 * - Without Shift: preserve normal vertical page scrolling.
 * - Horizontal trackpad gestures and touch swipes remain native browser behavior.
 */
export function handleShiftWheelScroll(event: WheelEvent): void {
  if (!event.shiftKey) return

  const element = event.currentTarget
  if (!(element instanceof HTMLElement)) return

  // Browsers differ: some report Shift+wheel as deltaX, others as deltaY.
  const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY
  if (delta === 0) return

  const maxScrollLeft = element.scrollWidth - element.clientWidth
  if (maxScrollLeft <= 1) return

  const next = Math.max(0, Math.min(maxScrollLeft, element.scrollLeft + delta))
  if (Math.abs(next - element.scrollLeft) < 0.5) return

  event.preventDefault()
  element.scrollLeft = next
}
