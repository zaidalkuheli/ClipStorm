"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { msToFrames } from "@/lib/timebase";
import { muxAvcChunksToMp4 } from "@/lib/mp4Mux";
import { muxVp9ChunksToWebm, muxVp9OpusToWebm } from "@/lib/webmMux";
import { renderTimelineAudioBuffer } from "@/lib/audioRender";
import { encodeAudioBufferToOpusChunks } from "@/lib/opusEncode";

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
  
  const { scenes, durationMs, fps, resolution, aspect } = editorState;
  
  // Parse resolution and normalize to selected aspect ratio
  const [resW, resH] = resolution.split('x').map(Number);
  const [arW, arH] = (aspect || '9:16').split(':').map(Number);
  const longSide = Math.max(resW, resH);
  const shortSide = Math.min(resW, resH);
  const makeEven = (n: number) => (n % 2 === 0 ? n : n - 1);
  let width = resW;
  let height = resH;
  if (arW === arH) {
    // 1:1: pick the smaller side to avoid unintended upscales
    const side = makeEven(shortSide);
    width = side;
    height = side;
  } else if (arW > arH) {
    // Landscape e.g., 16:9 → width = longSide, height scaled
    width = makeEven(longSide);
    height = makeEven(Math.round((longSide * arH) / arW));
  } else {
    // Portrait e.g., 9:16 → height = longSide, width scaled
    height = makeEven(longSide);
    width = makeEven(Math.round((longSide * arW) / arH));
  }
  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid target dimensions computed for aspect ${aspect} from resolution ${resolution}`);
  }
  
  // Determine visual duration using image and video scenes (ignore audio length)
  const visualScenesForDuration = scenes.filter(s => {
    const asset = s.assetId ? assetsState.getById(s.assetId) : null;
    return asset && (asset.type === 'image' || asset.type === 'video');
  });

  // Compute total frames from visual scene frame data when available
  let totalFrames = 0;
  if (visualScenesForDuration.length > 0) {
    totalFrames = Math.max(
      0,
      ...visualScenesForDuration.map(s => {
        const startF = s.startF !== undefined ? s.startF : msToFrames(s.startMs, fps);
        const durF = s.durF !== undefined ? s.durF : msToFrames(Math.max(0, s.endMs - s.startMs), fps);
        return startF + durF;
      })
    );
  } else {
    totalFrames = 0;
  }
  const durationSec = totalFrames / fps;
  
  
  // Partition scenes by asset type
  const imageScenes = scenes.filter(scene => {
    const asset = scene.assetId ? assetsState.getById(scene.assetId) : null;
    return asset && asset.type === 'image';
  });
  const videoScenes = scenes.filter(scene => {
    const asset = scene.assetId ? assetsState.getById(scene.assetId) : null;
    return asset && asset.type === 'video';
  });
  
  
  if (imageScenes.length === 0 && videoScenes.length === 0) {
    throw new Error('No visual clips found in timeline.');
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
    }
  }

  // Prepare video elements (metadata only; frame sampling via seek + draw)
  const videoElements = new Map<string, HTMLVideoElement>();
  const videoSeekReady = new Map<string, Promise<void>>();
  for (const scene of videoScenes) {
    if (!scene.assetId) continue;
    const asset = assetsState.getById(scene.assetId);
    if (!asset || asset.type !== 'video') continue;
    if (!videoElements.has(asset.id)) {
      const v = document.createElement('video');
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.muted = true;
      (v as any).playsInline = true;
      v.src = asset.url;
      videoElements.set(asset.id, v);
      await new Promise<void>((resolve) => {
        const onLoaded = () => { v.removeEventListener('loadedmetadata', onLoaded); resolve(); };
        v.addEventListener('loadedmetadata', onLoaded);
        // kick off
        v.load();
      });
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
  
  
  await encoder.configure(configToUse as any);

  // CFR timing (microseconds)
  const frameDurationUs = Math.round(1_000_000 / fps);
  

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
        
      }
    }

    // Draw visible video scenes (extract frame)
    for (const scene of videoScenes) {
      if (tMs >= scene.startMs && tMs < scene.endMs) {
        const asset = scene.assetId ? assetsState.getById(scene.assetId) : null;
        if (!asset) {
          console.warn(`🎬 Video scene ${scene.id} has no asset`);
          continue;
        }
        const v = videoElements.get(asset.id);
        if (!v) {
          console.warn(`🎬 Video element not found for asset ${asset.id} (${asset.name})`);
          continue;
        }
        const sceneOffsetMs = (scene.videoOffsetMs ?? 0) + (tMs - scene.startMs);
        let mediaTimeSec = Math.max(0, sceneOffsetMs / 1000);
        const durSec = isFinite(v.duration) ? v.duration : Infinity;
        
        
        if (isFinite(durSec)) {
          // Avoid seeking exactly to end which may yield black frame
          mediaTimeSec = Math.min(mediaTimeSec, Math.max(0, durSec - (1 / fps)));
        }
        if (mediaTimeSec >= 0 && mediaTimeSec < durSec) {
          // Seek and wait for 'seeked' to guarantee frame is available
          if (Math.abs(v.currentTime - mediaTimeSec) > 0.002) {
            await new Promise<void>((resolve) => {
              let done = false;
              const cleanup = () => {
                if (done) return; done = true;
                v.removeEventListener('seeked', onSeeked);
                v.removeEventListener('loadeddata', onLoadedData);
                v.removeEventListener('canplay', onCanPlay);
                resolve();
              };
              const onSeeked = () => { 
                if (v.readyState >= 2) cleanup(); 
              };
              const onLoadedData = () => { 
                if (v.readyState >= 2) cleanup(); 
              };
              const onCanPlay = () => { 
                if (v.readyState >= 2) cleanup(); 
              };
              v.addEventListener('seeked', onSeeked);
              v.addEventListener('loadeddata', onLoadedData);
              v.addEventListener('canplay', onCanPlay);
              try { 
                v.currentTime = mediaTimeSec; 
              } catch (e) { 
                console.warn(`Video seek failed:`, e);
                cleanup(); 
              }
              // Fallback timeout in case events don't fire quickly
              setTimeout(() => {
                cleanup();
              }, 200);
            });
          }
          
          // Draw video frame via same transform method
          renderSceneToCanvas(ctx as any, v as any, scene, width, height);
          frameHasContent = true;
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


  await encoder.flush();
  encoder.close();

  if (onProgress) onProgress({ currentFrame: totalFrames, totalFrames, percent: 99, stage: 'muxing' });


  // Decide if audio is present: any timeline audio clips or video audio requested in future
  const hasAudio = useEditorStore.getState().audioClips.length > 0 || videoScenes.length > 0;
  let blob: Blob;
  if (!hasAudio && useAvc) {
    // MP4 (H.264) silent path
    console.log('🎬 Muxing to MP4 (H.264) - silent');
    const onlyChunks = chunks.map(c => c.chunk);
    blob = await muxAvcChunksToMp4({ chunks: onlyChunks, width, height, fps });
  } else {
    // WebM path with audio when present
    const audioBuffer = await renderTimelineAudioBuffer({ sampleRate: 48000 });
    const opusChunks = await encodeAudioBufferToOpusChunks(audioBuffer);
    blob = muxVp9OpusToWebm({ video: chunks, audio: opusChunks, width, height, fps });
  }

  if (onProgress) onProgress({ currentFrame: totalFrames, totalFrames, percent: 100, stage: 'complete' });

  return blob;
}

/**
 * Render a scene with transforms to the canvas
 */
function renderSceneToCanvas(
  ctx: CanvasRenderingContext2D,
  source: any, // HTMLImageElement | HTMLVideoElement | CanvasImageSource
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
  
  // Determine intrinsic media dimensions
  const naturalWidth = (typeof source.videoWidth === 'number' && source.videoWidth > 0)
    ? source.videoWidth
    : (typeof source.naturalWidth === 'number' && source.naturalWidth > 0)
      ? source.naturalWidth
      : (typeof source.width === 'number' && source.width > 0)
        ? source.width
        : 0;
  const naturalHeight = (typeof source.videoHeight === 'number' && source.videoHeight > 0)
    ? source.videoHeight
    : (typeof source.naturalHeight === 'number' && source.naturalHeight > 0)
      ? source.naturalHeight
      : (typeof source.height === 'number' && source.height > 0)
        ? source.height
        : 0;

  if (!naturalWidth || !naturalHeight) {
    console.warn('🎬 renderSceneToCanvas: missing media dimensions, skipping draw', {
      sceneId: scene?.id,
      naturalWidth,
      naturalHeight,
      haveVideoDims: { videoWidth: source?.videoWidth, videoHeight: source?.videoHeight },
      haveImageDims: { naturalWidth: source?.naturalWidth, naturalHeight: source?.naturalHeight },
    });
    ctx.restore();
    return;
  }

  // Calculate dimensions to fit canvas while maintaining aspect ratio
  const imgAspect = naturalWidth / naturalHeight;
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
    source,
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
