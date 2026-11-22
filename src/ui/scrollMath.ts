/**
 * Scroll math for a "stick to the bottom, but never fight the user" transcript.
 *
 * Kept as pure functions (no DOM, no React) so the rule that decides whether to
 * follow the stream is unit-tested instead of eyeballed.
 */

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How far the viewport is from the end of the content. Never negative. */
export function distanceFromBottom(metrics: ScrollMetrics): number {
  const distance = metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
  return Math.max(0, distance);
}

/**
 * Whether the transcript is close enough to the bottom that new tokens should
 * scroll into view. The threshold absorbs sub-pixel rounding and the fact that
 * the container grows while a flush is being painted.
 */
export function isNearBottom(metrics: ScrollMetrics, threshold = 48): boolean {
  return distanceFromBottom(metrics) <= threshold;
}

/**
 * The scroll offset that puts the last line in view. Computed rather than read
 * from the DOM after scrolling, so a burst of flushes costs one layout read.
 */
export function bottomTarget(metrics: ScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight);
}
