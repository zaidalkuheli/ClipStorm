/**
 * Frame-accurate time conversion utilities
 * All timeline operations should use frame integers internally
 */

/**
 * Convert milliseconds to frames (rounded to nearest integer)
 */
export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms * fps) / 1000);
}

/**
 * Convert frames to milliseconds (rounded to nearest integer)
 */
export function framesToMs(frames: number, fps: number): number {
  return Math.round((frames * 1000) / fps);
}

/**
 * Quantize milliseconds to nearest frame boundary
 * This ensures all timeline positions are frame-aligned
 */
export function quantizeMsToFrame(ms: number, fps: number): number {
  return framesToMs(msToFrames(ms, fps), fps);
}

/**
 * Convert pixels to frames based on zoom level and fps
 */
export function pxToFrames(px: number, pxPerSec: number, fps: number): number {
  const ms = (px / pxPerSec) * 1000;
  return msToFrames(ms, fps);
}

/**
 * Convert frames to pixels based on zoom level and fps
 */
export function framesToPx(frames: number, pxPerSec: number, fps: number): number {
  const ms = framesToMs(frames, fps);
  return (ms / 1000) * pxPerSec;
}

