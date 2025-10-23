"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { msToFrames } from "@/lib/timebase";
import { muxAvcChunksToMp4 } from "@/lib/mp4Mux";
import { muxVp9ChunksToWebm } from "@/lib/webmMux";

/**
 * Check if WebCodecs VideoEncoder is supported
 */
export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/**
 * Progress callback for video rendering
 */
export type ProgressCallback = (progress: {
  currentFrame: number;
  totalFrames: number;
  percent: number;
  stage: 'encoding' | 'muxing' | 'complete';
}) => void;

/**
 * Cancellation token for aborting video export
 */
export class CancellationToken {
  private _cancelled = false;
  
  cancel() {
    this._cancelled = true;
  }
  
  get cancelled() {
    return this._cancelled;
  }
}

/**
 * Deterministic, frame-accurate offline render using WebCodecs.
 * Encodes exactly N frames with exact timestamps (CFR) and muxes to MP4 (H.264) when available.
 * Currently supports image clips with transforms (x, y, scale).
 */
export async function renderTimelineToWebM(opts: {
  onProgress?: ProgressCallback;
  cancellationToken?: CancellationToken;
} = {}): Promise<Blob> {
  if (!isWebCodecsSupported()) {
    throw new Error('WebCodecs is not supported in this browser. Please use Chrome/Edge 94+.');
  }
  
  const { onProgress, cancellationToken } = opts;
  
  // Get timeline state from stores
  const editorState = useEditorStore.getState();
  const assetsState = useAssetsStore.getState();
  
  const { scenes, durationMs, fps, resolution } = editorState;
  
  // Parse resolution
  const [width, height] = resolution.split('x').map(Number);
  
  // Determine visual duration using IMAGE SCENES ONLY (ignore audio length)
  const imageScenesForDuration = scenes.filter(s => {
    const asset = s.assetId ? assetsState.getById(s.assetId) : null;
    return asset && asset.type === 'image';
  });

  // Compute total frames from image scene frame data when available; fallback to ms
  let totalFrames = 0;
  if (imageScenesForDuration.length > 0) {
    totalFrames = Math.max(
      0,
      ...imageScenesForDuration.map(s => {
        const startF = s.startF !== undefined ? s.startF : msToFrames(s.startMs, fps);
        const durF = s.durF !== undefined ? s.durF : msToFrames(Math.max(0, s.endMs - s.startMs), fps);
        return startF + durF;
      })
    );
  } else {
    // No image scenes; nothing to render
    totalFrames = 0;
  }
  const durationSec = totalFrames / fps;
  
  console.log('🎬 Starting video render:', {
    width,
    height,
    fps,
    durationMs,
    totalFrames,
    scenesCount: scenes.length,
    resolution
  });
  
  // Filter to only image scenes
  const imageScenes = scenes.filter(scene => {
    const asset = scene.assetId ? assetsState.getById(scene.assetId) : null;
    return asset && asset.type === 'image';
  });
  
  console.log('🎬 Image scenes:', imageScenes.length);
  
  // EXTENSIVE DEBUG LOGGING
  console.log('🎬 DETAILED SCENE ANALYSIS:', {
    totalScenes: scenes.length,
    imageScenesCount: imageScenes.length,
    imageScenes: imageScenes.map(s => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      durationMs: s.endMs - s.startMs,
      startF: s.startF,
      durF: s.durF,
      assetId: s.assetId,
      assetName: s.assetId ? assetsState.getById(s.assetId)?.name : 'unknown'
    }))
  });

  // Calculate expected timeline duration from image scenes
  const maxImageEndMs = Math.max(...imageScenes.map(s => s.endMs));
  const minImageStartMs = Math.min(...imageScenes.map(s => s.startMs));
  const imageTimelineDurationMs = maxImageEndMs - minImageStartMs;
  
  console.log('🎬 TIMELINE DURATION ANALYSIS:', {
    minImageStartMs,
    maxImageEndMs,
    imageTimelineDurationMs,
    imageTimelineDurationSec: imageTimelineDurationMs / 1000,
    totalFramesFromDuration: Math.ceil(imageTimelineDurationMs * fps / 1000),
    totalFramesCalculated: totalFrames,
    framesMatch: Math.ceil(imageTimelineDurationMs * fps / 1000) === totalFrames,
    projectDurationMs: durationMs,
    projectDurationSec: durationMs / 1000
  });
  
  if (imageScenes.length === 0) {
    throw new Error('No image clips found in timeline. Video export currently only supports image clips.');
  }
  
  // Canvas for frame rendering (offscreen)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Failed to create canvas context');
  
  // Load all image assets
  const imageAssets = new Map<string, HTMLImageElement>();
  for (const scene of imageScenes) {
    if (!scene.assetId) continue;
    
    const asset = assetsState.getById(scene.assetId);
    if (!asset || asset.type !== 'image') continue;
    
    if (!imageAssets.has(asset.id)) {
      const img = await loadImage(asset.url);
      imageAssets.set(asset.id, img);
      console.log('🎬 Loaded image:', asset.name, img.width, 'x', img.height);
    }
  }
  
  // Configure encoder (prefer H.264 for MP4, fallback to VP9 for WebM)
  // Try multiple H.264 codec strings for broader support across drivers
  const avcCandidates: VideoEncoderConfig[] = [
    { codec: 'avc1.42E01E', width, height, framerate: fps, bitrate: Math.max(500_000, Math.floor(width * height * fps * 0.08)), latencyMode: 'quality' } as any,
    { codec: 'avc1.64001E', width, height, framerate: fps, bitrate: Math.max(500_000, Math.floor(width * height * fps * 0.08)), latencyMode: 'quality' } as any,
    { codec: 'avc1.4D401E', width, height, framerate: fps, bitrate: Math.max(500_000, Math.floor(width * height * fps * 0.08)), latencyMode: 'quality' } as any,
    { codec: 'avc1.42001E', width, height, framerate: fps, bitrate: Math.max(500_000, Math.floor(width * height * fps * 0.08)), latencyMode: 'quality' } as any
  ];

  const vp9Config: VideoEncoderConfig = {
    codec: 'vp09.00.10.08',
    width,
    height,
    framerate: fps,
    bitrate: Math.max(500_000, Math.floor(width * height * fps * 0.08)),
    latencyMode: 'quality'
  } as any;

  let avcSupported = false;
  let avcConfig: VideoEncoderConfig | null = null;
  for (const cfg of avcCandidates) {
    try {
      const support = await (VideoEncoder as any).isConfigSupported(cfg);
      if (support?.supported) {
        avcSupported = true;
        avcConfig = cfg;
        break;
      }
    } catch {}
  }

  let vp9Supported = false;
  try {
    const support = await (VideoEncoder as any).isConfigSupported(vp9Config);
    vp9Supported = !!support?.supported;
  } catch {}

  if (!avcSupported && !vp9Supported) {
    throw new Error('No supported video encoders found. Please use Chrome/Edge 94+ with WebCodecs support.');
  }

  const chunks: { chunk: EncodedVideoChunk; metadata: EncodedVideoChunkMetadata }[] = [];
  const encoder = new VideoEncoder({
    output: (chunk, meta) => chunks.push({ chunk, metadata: meta! }),
    error: (e) => console.error('🎬 Encoder error:', e)
  });

  const useAvc = avcSupported && !!avcConfig;
  const configToUse = useAvc ? (avcConfig as VideoEncoderConfig) : vp9Config;
  
  console.log('🎬 Using encoder:', useAvc ? 'H.264 (MP4)' : 'VP9 (WebM)');
  
  await encoder.configure(configToUse as any);

  // CFR timing (microseconds)
  const frameDurationUs = Math.round(1_000_000 / fps);
  
  // Render and encode offline (no real-time pacing)
  console.log('🎬 STARTING FRAME-BY-FRAME ENCODING:', {
    totalFrames,
    frameDurationUs,
    frameDurationMs: frameDurationUs / 1000,
    expectedVideoDurationSec: totalFrames / fps
  });

  let framesWithContent = 0;
  let lastContentFrame = -1;
  let firstContentFrame = -1;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    if (cancellationToken?.cancelled) {
      try { encoder.close(); } catch {}
      throw new Error('Export cancelled by user');
    }

    const tMs = (frameIndex / fps) * 1000;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Draw visible scenes and track content
    let frameHasContent = false;
    for (const scene of imageScenes) {
      if (tMs >= scene.startMs && tMs < scene.endMs) {
        const asset = scene.assetId ? assetsState.getById(scene.assetId) : null;
        if (!asset) continue;
        const img = imageAssets.get(asset.id);
        if (!img) continue;
        renderSceneToCanvas(ctx, img, scene, width, height);
        frameHasContent = true;
        
        if (frameIndex % 30 === 0) { // Log every 30 frames
          console.log(`🎬 Frame ${frameIndex}: Drawing scene ${scene.id} at ${tMs}ms (${(tMs/1000).toFixed(2)}s)`);
        }
      }
    }

    if (frameHasContent) {
      framesWithContent++;
      if (firstContentFrame === -1) firstContentFrame = frameIndex;
      lastContentFrame = frameIndex;
    }

    const tsUs = frameIndex * frameDurationUs;
    const vf = new VideoFrame(canvas, { timestamp: tsUs, duration: frameDurationUs });
    const keyFrame = frameIndex % (fps * 2) === 0;
    encoder.encode(vf, { keyFrame });
    vf.close();

    // Backpressure: prevent unbounded queue growth on long renders
    if (encoder.encodeQueueSize > 16) {
      await encoder.flush();
    }

    // Keep UI responsive during very long renders
    if (frameIndex % (fps * 2) === 0 && frameIndex !== 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (onProgress && frameIndex % 10 === 0) {
      onProgress({ currentFrame: frameIndex, totalFrames, percent: (frameIndex / totalFrames) * 100, stage: 'encoding' });
    }
  }

  console.log('🎬 ENCODING COMPLETE - CONTENT ANALYSIS:', {
    totalFramesEncoded: totalFrames,
    framesWithContent,
    firstContentFrame,
    lastContentFrame,
    contentDurationFrames: lastContentFrame - firstContentFrame + 1,
    contentDurationSec: (lastContentFrame - firstContentFrame + 1) / fps,
    expectedVideoDurationSec: totalFrames / fps,
    emptyFramesAtStart: firstContentFrame,
    emptyFramesAtEnd: totalFrames - lastContentFrame - 1
  });

  await encoder.flush();
  encoder.close();

  if (onProgress) onProgress({ currentFrame: totalFrames, totalFrames, percent: 99, stage: 'muxing' });

  console.log('🎬 MUXING ANALYSIS:', {
    chunksCount: chunks.length,
    useAvc,
    codec: useAvc ? 'H.264' : 'VP9',
    container: useAvc ? 'MP4' : 'WebM',
    chunks: chunks.map(({chunk}, i) => ({
      index: i,
      timestamp: chunk.timestamp,
      duration: chunk.duration || 0,
      type: chunk.type,
      timestampMs: chunk.timestamp / 1000,
      durationMs: (chunk.duration || 0) / 1000
    }))
  });

  // Mux to appropriate container
  let blob: Blob;
  if (useAvc) {
    // MP4 (H.264) path
    console.log('🎬 Muxing to MP4 (H.264)...');
    const onlyChunks = chunks.map(c => c.chunk);
    blob = await muxAvcChunksToMp4({ chunks: onlyChunks, width, height, fps });
  } else {
    // WebM (VP9) fallback - deterministic offline muxing
    console.log('🎬 Muxing to WebM (VP9) using webm-muxer...');
    blob = muxVp9ChunksToWebm({ chunks, width, height, fps, codec: 'V_VP9' });
  }

  if (onProgress) onProgress({ currentFrame: totalFrames, totalFrames, percent: 100, stage: 'complete' });
  
  console.log('🎬 FINAL EXPORT ANALYSIS:', {
    blobSize: blob.size,
    blobType: blob.type,
    blobSizeMB: (blob.size / 1024 / 1024).toFixed(2),
    totalFramesEncoded: totalFrames,
    expectedDurationSec: totalFrames / fps,
    expectedDurationMin: (totalFrames / fps / 60).toFixed(2),
    framesWithContent,
    contentDurationSec: framesWithContent / fps,
    emptyFramesAtStart: firstContentFrame,
    emptyFramesAtEnd: totalFrames - lastContentFrame - 1,
    timelineDurationSec: imageTimelineDurationMs / 1000,
    timelineDurationMin: (imageTimelineDurationMs / 1000 / 60).toFixed(2),
    projectDurationSec: durationMs / 1000,
    projectDurationMin: (durationMs / 1000 / 60).toFixed(2)
  });

  return blob;
}

/**
 * Render a scene with transforms to the canvas
 */
function renderSceneToCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scene: any,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.save();
  
  // Get transform data or use defaults (only x, y, scale currently in schema)
  const transform = scene.transform || { x: 0, y: 0, scale: 1 };
  const x = transform.x ?? 0;
  const y = transform.y ?? 0;
  const scale = transform.scale ?? 1;
  
  // Calculate image dimensions to fit canvas while maintaining aspect ratio
  const imgAspect = img.width / img.height;
  const canvasAspect = canvasWidth / canvasHeight;
  
  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;
  
  if (imgAspect > canvasAspect) {
    // Image is wider - fit to width
    drawHeight = canvasWidth / imgAspect;
  } else {
    // Image is taller - fit to height
    drawWidth = canvasHeight * imgAspect;
  }
  
  // Apply scale
  drawWidth *= scale;
  drawHeight *= scale;
  
  // Center the image
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  
  // Translate to center + offset
  ctx.translate(centerX + x, centerY + y);
  
  // Draw image centered at origin
  ctx.drawImage(
    img,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );
  
  ctx.restore();
}

/**
 * Load an image from URL
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
