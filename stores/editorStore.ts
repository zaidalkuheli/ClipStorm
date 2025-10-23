"use client";
import { create } from "zustand";
import { nanoid } from "nanoid";
import { History, HistorySnapshot, makeSnapshot, cloneSnapshot, applySnapshot } from "./history";
import { useAssetsStore } from "./assetsStore";
import { msToFrames, framesToMs, quantizeMsToFrame } from "@/lib/timebase";

// Tuned to feel noticeable but not sticky
export const SNAP_PX = 8;      // ~8px snaps & links
export const UNLINK_PX = 14;   // need a wider gap to break a link

const pxToMs = (px: number, pxPerSec: number) => (px / pxPerSec) * 1000;

const bounds = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const snapToGrid = (v: number, gridMs: number) =>
  gridMs > 1 ? Math.round(v / gridMs) * gridMs : v;

// Link / unlink utilities - frame-accurate
function linkRight(cur: Scene, next?: Scene, triggerAnimation?: (id: string) => void, fps?: number) {
  if (!next) return;
  cur.linkRightId = next.id;
  next.linkLeftId = cur.id;
  // ensure perfect contact using frames if available
  if (fps && cur.startF !== undefined && cur.durF !== undefined && next.startF !== undefined) {
    const endF = cur.startF + cur.durF;
    cur.endMs = framesToMs(endF, fps);
    next.startMs = cur.endMs;
  } else {
    cur.endMs = next.startMs;
  }
  // Trigger snap animation
  if (triggerAnimation) {
    triggerAnimation(cur.id);
    triggerAnimation(next.id);
  }
}

function unlinkRight(cur: Scene, next?: Scene) {
  if (!next) return;
  if (cur.linkRightId === next.id) cur.linkRightId = null;
  if (next.linkLeftId === cur.id) next.linkLeftId = null;
}

function linkLeft(cur: Scene, prev?: Scene, triggerAnimation?: (id: string) => void, fps?: number) {
  if (!prev) return;
  cur.linkLeftId = prev.id;
  prev.linkRightId = cur.id;
  // ensure perfect contact using frames if available
  if (fps && prev.startF !== undefined && prev.durF !== undefined && cur.startF !== undefined) {
    const prevEndF = prev.startF + prev.durF;
    cur.startMs = framesToMs(prevEndF, fps);
    cur.startF = prevEndF;
  } else {
    cur.startMs = prev.endMs;
  }
  // Trigger snap animation
  if (triggerAnimation) {
    triggerAnimation(cur.id);
    triggerAnimation(prev.id);
  }
}

function unlinkLeft(cur: Scene, prev?: Scene) {
  if (!prev) return;
  if (cur.linkLeftId === prev.id) cur.linkLeftId = null;
  if (prev.linkRightId === cur.id) prev.linkRightId = null;
}

// Frame-accurate helpers: ensure scenes/clips always have frame values and sync ms
function ensureFrameData(item: Scene | AudioClip, fps: number): void {
  // If frame data is missing, derive from ms
  if (item.startF === undefined) {
    item.startF = msToFrames(item.startMs, fps);
  }
  if (item.durF === undefined) {
    item.durF = msToFrames(item.endMs - item.startMs, fps);
  }
  // Always sync ms from frames (frames are source of truth)
  item.startMs = framesToMs(item.startF, fps);
  item.endMs = item.startMs + framesToMs(item.durF, fps);
}

// Sync all items in arrays to have frame data
function ensureAllFrameData(scenes: Scene[], audioClips: AudioClip[], fps: number): void {
  scenes.forEach(s => ensureFrameData(s, fps));
  audioClips.forEach(a => ensureFrameData(a, fps));
}

export type Track = {
  id: string;
  name: string;
  type: "video" | "audio";
  muted?: boolean;
  soloed?: boolean;
};

export type Scene = { 
  id: string; 
  label?: string; 
  // Frame-accurate storage (primary source of truth)
  startF?: number; // Start time in frames (integer)
  durF?: number;   // Duration in frames (integer)
  // Millisecond values (legacy - computed from frames when present)
  startMs: number; 
  endMs: number;
  // NEW: explicit neighbor links (only to immediate neighbors)
  linkLeftId?: string | null;
  linkRightId?: string | null;
  assetId?: string | null; // NEW optional asset binding
  trackId?: string; // NEW track assignment
  // Transform data for media editing
  transform?: {
    x: number;
    y: number;
    scale: number;
  } | null;
  // Audio control for video scenes
  gain?: number; // Volume level (0..1)
  muted?: boolean; // Mute state
  // Video duration constraint
  originalDurationMs?: number; // Store the original video file duration
  // Video trim offset (like audioOffsetMs but for video)
  videoOffsetMs?: number;
};

export type AudioClip = {
  id: string;
  // Frame-accurate storage (primary source of truth)
  startF?: number; // Start time in frames (integer)
  durF?: number;   // Duration in frames (integer)
  // Millisecond values (legacy - computed from frames when present)
  startMs: number;
  endMs: number;
  assetId: string;
  kind: "vo" | "music";
  gain?: number;
  originalDurationMs: number; // Store the original audio file duration
  audioOffsetMs?: number; // Offset within the original audio file (for cut clips)
  trackId?: string; // Track assignment for vertical drag
  // Fade controls (remain in ms for sub-frame precision)
  fadeInMs?: number; // fade in duration in milliseconds
  fadeOutMs?: number; // fade out duration in milliseconds
};
export type AspectRatio = "9:16" | "1:1" | "16:9";
export type Resolution = "1080x1920" | "720x1280";
export type FrameRate = 30 | 24 | 60;

interface EditorState {
  // video
  durationMs: number;
  fps: FrameRate;
  aspect: AspectRatio;
  resolution: Resolution;
  showSafeArea: boolean;
  showGrid: boolean;

  // timeline
  playheadMs: number;
  pxPerSec: number; // zoom level (pixels per second)
  isPlaying: boolean;
  playbackSpeed: number; // 1.0 = normal speed

  tracks: Track[];
  scenes: Scene[];
  selectedSceneId: string | null;
  snapAnimationId: string | null; // Track which scene just snapped for animation
  
  // audio
  audioClips: AudioClip[];
  setAudioGain: (id: string, gain: number) => void;
  toggleAudioMute: (id: string) => void;
  setAudioFadeIn: (id: string, fadeInMs: number) => void;
  setAudioFadeOut: (id: string, fadeOutMs: number) => void;
  setSceneGain: (id: string, gain: number) => void;
  toggleSceneMute: (id: string) => void;
  
  // history
  history: History;

  // actions
  setAspect: (aspect: AspectRatio) => void;
  setResolution: (resolution: Resolution) => void;
  setFps: (fps: FrameRate) => void;
  toggleSafeArea: () => void;
  toggleGrid: () => void;

  setTracks: (tracks: Track[]) => void;
  addTrack: (track: Omit<Track, 'id'>) => void;
  removeTrack: (id: string) => void;
  renameTrack: (id: string, name: string) => void;
  toggleTrackMute: (id: string) => void;
  toggleTrackSolo: (id: string) => void;
  setScenes: (scenes: Scene[]) => void;
  setAudioClips: (audioClips: AudioClip[]) => void;
  setDuration: (durationMs: number) => void;
  addScene: (scene: Omit<Scene, 'id'>) => void;
  // Replace media on existing blocks
  replaceSceneAsset: (sceneId: string, newAssetId: string) => void;
  replaceAudioAsset: (audioId: string, newAssetId: string) => void;
  removeScene: (id: string) => void;
  moveScene: (id: string, newStartMs: number, pxPerSec: number) => void;
  resizeScene: (id: string, edge: "left" | "right", deltaMs: number, minMs: number, gridMs: number) => void;
  resizeSceneTo: (id: string, edge: "left" | "right", targetMs: number, minMs: number, gridMs: number, pxPerSec: number) => void;
  selectScene: (id: string | null) => void;
  triggerSnapAnimation: (id: string) => void;
  updateSceneTransform: (id: string, transform: { x: number; y: number; scale: number }) => void;
  moveSceneToTrack: (sceneId: string, trackId: string) => void;
  moveAudioToTrack: (audioId: string, trackId: string) => void;

  // core editing actions
  selectedAudioId: string | null;
  splitAt: (ms: number) => void;
  deleteSelection: (opts?: { ripple?: boolean }) => void;
  duplicateSelection: () => void;
  findSceneAt: (ms: number) => string | null;
  findAudioAt: (ms: number) => string | null;
  shiftRightFrom: (ms: number, deltaMs: number) => void;

  // helpers
  msPerPx: () => number;
  pxToMs: (px: number) => number;
  msToPx: (ms: number) => number;
  computeInsertMs: (trackId?: string) => number;
  computeAudioInsertMs: (trackId?: string) => number;
  normalizeDuration: () => void;
  addSceneFromAsset: (assetId: string, opts?: { atMs?: number; durationMs?: number; label?: string; trackId?: string }) => string;
  addAudioFromAsset: (assetId: string, kind: "vo"|"music", opts?: { atMs?: number; durationMs?: number; trackId?: string }) => string;

  // audio manipulation actions
  selectAudio: (id: string | null) => void;
  moveAudio: (id: string, newStartMs: number, pxPerSec: number) => void;
  resizeAudioTo: (id: string, edge: "left" | "right", targetMs: number, minMs: number, gridMs: number, pxPerSec: number) => void;

  // history actions
  getSnapshot: () => HistorySnapshot;
  beginTx: (label?: string) => void;
  commitTx: () => void;
  cancelTx: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // serialization
  getSerializableState: () => {
    tracks: Track[];
    scenes: Scene[];
    audioClips: AudioClip[];
    durationMs: number;
    fps: FrameRate;
    aspect: AspectRatio;
    resolution: Resolution;
  };

  // timeline actions
  setPlayhead: (ms: number) => void;
  nudgePlayhead: (deltaMs: number) => void;
  setZoom: (pxPerSec: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToPlayhead: () => number;

  // playback actions
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
}

const initialTracks = [
  { id: "video-track-1", name: "Media 1", type: "video" as const },
  { id: "audio-track-1", name: "Audio 1", type: "audio" as const }
];

const initialScenes: Scene[] = [];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Calculate total duration based on scene blocks and audio clips
const calculateTotalDuration = (scenes: Scene[], audioClips?: AudioClip[]): number => {
  const maxSceneEnd = scenes.length > 0 ? Math.max(...scenes.map(s => s.endMs)) : 0;
  const maxAudioEnd = audioClips && audioClips.length > 0 ? Math.max(...audioClips.map(a => a.endMs)) : 0;
  const maxEndMs = Math.max(maxSceneEnd, maxAudioEnd);
  
  // Add some padding (2 seconds) for better UX
  return maxEndMs > 0 ? maxEndMs + 2000 : 20000; // default 20s if no content
};

export const useEditorStore = create<EditorState>((set, get) => ({
  durationMs: calculateTotalDuration(initialScenes),
  fps: 30,
  aspect: "9:16",
  resolution: "1080x1920",
  showSafeArea: true,
  showGrid: true,

  playheadMs: 0,
  pxPerSec: 100, // sensible default
  isPlaying: false,
  playbackSpeed: 1.0,

  tracks: initialTracks,
  scenes: initialScenes,
  selectedSceneId: null,
  snapAnimationId: null,
  
  // audio
  audioClips: [],
  selectedAudioId: null,
  setAudioGain: (id, gain) => set(state => ({
    audioClips: state.audioClips.map(a => a.id === id ? { ...a, gain: bounds(gain, 0, 1) } : a)
  })),
  toggleAudioMute: (id) => set(state => ({
    audioClips: state.audioClips.map(a => a.id === id ? { ...a, gain: (a.gain ?? 1) > 0 ? 0 : 1 } : a)
  })),
  setAudioFadeIn: (id, fadeInMs) => set(state => ({
    audioClips: state.audioClips.map(a => a.id === id ? { ...a, fadeInMs: Math.max(0, fadeInMs) } : a)
  })),
  setAudioFadeOut: (id, fadeOutMs) => set(state => ({
    audioClips: state.audioClips.map(a => a.id === id ? { ...a, fadeOutMs: Math.max(0, fadeOutMs) } : a)
  })),
  setSceneGain: (id, gain) => set(state => ({
    scenes: state.scenes.map(s => s.id === id ? { ...s, gain: bounds(gain, 0, 1) } : s)
  })),
  toggleSceneMute: (id) => set(state => ({
    scenes: state.scenes.map(s => s.id === id ? { ...s, muted: !s.muted } : s)
  })),
  
  // history
  history: { past: [], future: [], inTx: false, max: 100 },

      setAspect: (aspect) => set({ aspect }),
  setResolution: (resolution) => set({ resolution }),
  setFps: (fps) => set({ fps }),
  toggleSafeArea: () => set(state => ({ showSafeArea: !state.showSafeArea })),
  toggleGrid: () => set(state => ({ showGrid: !state.showGrid })),

  setTracks: (tracks) => set({ tracks }),
  
  addTrack: (trackData) => {
    const newTrack: Track = {
      id: nanoid(),
      ...trackData
    };
    set(state => ({ tracks: [...state.tracks, newTrack] }));
  },
  
  removeTrack: (id) => {
    const { tracks, scenes, audioClips } = get();
    const trackToDelete = tracks.find(t => t.id === id);
    if (trackToDelete) {
      // Always delete scenes that belong to this track
      const updatedScenes = scenes.filter(scene => scene.trackId !== id);
      
      // If deleting an audio track, only delete audio clips that belong to this track
      const updatedAudioClips = trackToDelete.type === 'audio' 
        ? audioClips.filter(audio => audio.trackId !== id)
        : audioClips;
      
      set({ 
        tracks: tracks.filter(t => t.id !== id),
        scenes: updatedScenes,
        audioClips: updatedAudioClips
      });
    }
  },
  
  renameTrack: (id, name) => {
    set(state => ({
      tracks: state.tracks.map(track => 
        track.id === id ? { ...track, name } : track
      )
    }));
  },

  toggleTrackMute: (id) => {
    set(state => {
      const updatedTracks = state.tracks.map(track => {
        if (track.id === id) {
          // Toggle mute on the clicked track
          return { ...track, muted: !track.muted, soloed: false }; // Clear solo when muting
        }
        return track;
      });
      const mutedTrack = updatedTracks.find(t => t.id === id);
      console.log('🔇 Track mute toggled:', { trackId: id, trackName: mutedTrack?.name, muted: mutedTrack?.muted });
      return { tracks: updatedTracks };
    });
  },

  toggleTrackSolo: (id) => {
    set(state => {
      const tracks = state.tracks.map(track => {
        if (track.id === id) {
          // Toggle solo on the clicked track
          return { ...track, soloed: !track.soloed, muted: false }; // Clear mute when soloing
        } else if (track.soloed) {
          // If any other track is soloed, unsolo it
          return { ...track, soloed: false };
        }
        return track;
      });
      
      const soloedTrack = tracks.find(t => t.soloed);
      console.log('🎵 Track solo toggled:', { trackId: id, soloedTrack: soloedTrack?.name, soloed: soloedTrack?.soloed });
      
      return { tracks };
    });
  },

  setScenes: (scenes) => {
    const { audioClips, fps } = get();
    // Ensure all scenes have frame data and sync ms values
    ensureAllFrameData(scenes, audioClips, fps);
    const newDuration = calculateTotalDuration(scenes, audioClips);
    console.log('📏 Updating duration based on scenes:', { 
      sceneCount: scenes.length, 
      maxEndMs: scenes.length > 0 ? Math.max(...scenes.map(s => s.endMs)) : 0,
      newDurationMs: newDuration 
    });
    set({ scenes, durationMs: newDuration });
  },

  setAudioClips: (audioClips) => {
    const { scenes, fps } = get();
    // Ensure all audio clips have frame data and sync ms values
    ensureAllFrameData(scenes, audioClips, fps);
    const newDuration = calculateTotalDuration(scenes, audioClips);
    console.log('📏 Updating duration based on audio clips:', { 
      audioCount: audioClips.length, 
      maxEndMs: audioClips.length > 0 ? Math.max(...audioClips.map(a => a.endMs)) : 0,
      newDurationMs: newDuration 
    });
    set({ audioClips, durationMs: newDuration });
  },

  // Replace the asset bound to a scene without changing timing/links/track
  replaceSceneAsset: (sceneId, newAssetId) => {
    const { scenes } = get();
    const asset = useAssetsStore.getState().getById(newAssetId);

    // Immediate update: swap assetId and label only
    set(state => ({
      scenes: state.scenes.map(s => s.id === sceneId ? {
        ...s,
        assetId: newAssetId,
        // keep existing label if user renamed; otherwise use asset name
        label: s.label && s.label.trim().length > 0 ? s.label : (asset?.name || s.label)
      } : s)
    }));

    // If the new asset is a video, determine its actual duration and clamp the scene length
    if (asset && asset.type === 'video') {
      const applyClampWithDuration = (durationMs: number) => {
        // Ignore invalid durations
        if (!isFinite(durationMs) || durationMs <= 0) return;

        const fps = get().fps;

        set(state => {
          const scenes = state.scenes.map(s => ({ ...s }));
          const idx = scenes.findIndex(sc => sc.id === sceneId);
          if (idx < 0) return { scenes: state.scenes };

          const cur = scenes[idx];

          // Frame-accurate clamp: scene duration cannot exceed video duration
          const startF = cur.startF ?? msToFrames(cur.startMs, fps);
          const curDurF = cur.durF ?? msToFrames(cur.endMs - cur.startMs, fps);
          const maxDurF = msToFrames(durationMs, fps);
          const newDurF = Math.max(0, Math.min(curDurF, maxDurF));

          cur.originalDurationMs = Math.round(durationMs);
          cur.startF = startF;
          cur.durF = newDurF;
          // Sync ms from frames
          cur.startMs = framesToMs(cur.startF, fps);
          cur.endMs = framesToMs(cur.startF + cur.durF, fps);

          // If linked, ensure links are valid after clamping; otherwise break the link(s)
          // Right link: if cur no longer touches next.startMs exactly, break the link
          if (cur.linkRightId) {
            const nextIdx = scenes.findIndex(sc => sc.id === cur.linkRightId);
            if (nextIdx >= 0) {
              const next = scenes[nextIdx];
              const touchesRight = cur.endMs === next.startMs;
              if (!touchesRight) {
                if (next.linkLeftId === cur.id) next.linkLeftId = null;
                cur.linkRightId = null;
              }
            } else {
              cur.linkRightId = null;
            }
          }

          // Left link: startMs shouldn't change here, but defensively ensure validity
          if (cur.linkLeftId) {
            const prevIdx = scenes.findIndex(sc => sc.id === cur.linkLeftId);
            if (prevIdx >= 0) {
              const prev = scenes[prevIdx];
              const touchesLeft = prev.endMs === cur.startMs;
              if (!touchesLeft) {
                if (prev.linkRightId === cur.id) prev.linkRightId = null;
                cur.linkLeftId = null;
              }
            } else {
              cur.linkLeftId = null;
            }
          }

          return { scenes };
        });
      };

      // Synchronous clamp if we already know the duration from assets store
      if (typeof asset.durationMs === 'number' && isFinite(asset.durationMs) && asset.durationMs > 0) {
        applyClampWithDuration(asset.durationMs);
      }

      // Prefer file when available for accurate metadata; otherwise try URL (skip missing placeholders)
      const tryFromFile = async () => {
        try {
          if (!asset.file) return false;
          const url = URL.createObjectURL(asset.file);
          await new Promise<void>((resolve, reject) => {
            const v = document.createElement('video');
            const cleanup = () => { URL.revokeObjectURL(url); };
            v.preload = 'metadata';
            v.onloadedmetadata = () => {
              try { applyClampWithDuration(Math.round(v.duration * 1000)); } finally { cleanup(); }
              resolve();
            };
            v.onerror = (e) => { cleanup(); reject(e); };
            v.src = url;
            v.load();
          });
          return true;
        } catch (e) {
          console.warn('🎬 Failed to read video metadata from file; will try URL fallback', e);
          return false;
        }
      };

      const tryFromUrl = async () => {
        try {
          if (!asset.url || asset.url.startsWith('missing:')) return false;
          await new Promise<void>((resolve, reject) => {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = () => {
              applyClampWithDuration(Math.round(v.duration * 1000));
              resolve();
            };
            v.onerror = (e) => reject(e);
            v.src = asset.url;
            v.load();
          });
          return true;
        } catch (e) {
          console.warn('🎬 Failed to read video metadata from URL', e);
          return false;
        }
      };

      // Kick off async metadata probing (file first, then URL)
      (async () => {
        const ok = await tryFromFile();
        if (!ok) await tryFromUrl();
      })();
    } else {
      // Non-video replacement: clear any previous video constraint to avoid accidental limits
      set(state => ({
        scenes: state.scenes.map(s => s.id === sceneId ? { ...s, originalDurationMs: undefined } : s)
      }));
    }
  },

  // Replace the asset bound to an audio clip; keep timing and kind
  // Update originalDurationMs if we can determine the new file duration
  replaceAudioAsset: (audioId, newAssetId) => {
    const waveformData = useAssetsStore.getState().waveforms[newAssetId];
    const assets = useAssetsStore.getState();
    const asset = assets.getById(newAssetId);
    set(state => ({
      audioClips: state.audioClips.map(a => a.id === audioId ? {
        ...a,
        assetId: newAssetId,
        originalDurationMs: waveformData?.durationMs ?? a.originalDurationMs
      } : a)
    }));
  },

  setDuration: (durationMs) => set({ durationMs }),

  addScene: (sceneData) => {
    const { scenes, durationMs, audioClips, fps } = get();
    const newScene: Scene = {
      id: nanoid(),
      ...sceneData
    };
    // Ensure frame data for the new scene
    ensureFrameData(newScene, fps);
    const updatedScenes = [...scenes, newScene].sort((a, b) => a.startMs - b.startMs);
    const newDuration = calculateTotalDuration(updatedScenes, audioClips);
    console.log('➕ Added new scene:', { newScene, newDurationMs: newDuration, startF: newScene.startF, durF: newScene.durF });
    set({ scenes: updatedScenes, durationMs: newDuration });
  },

  removeScene: (id) => {
    const { scenes, audioClips } = get();
    const updatedScenes = scenes.filter(s => s.id !== id);
    const newDuration = calculateTotalDuration(updatedScenes, audioClips);
    console.log('➖ Removed scene:', { id, newDurationMs: newDuration });
    set({ scenes: updatedScenes, durationMs: newDuration });
  },

  moveScene: (id, newStartMs, pxPerSec) => {
    const { scenes, durationMs, triggerSnapAnimation, fps } = get();
    const sceneIndex = scenes.findIndex(s => s.id === id);
    if (sceneIndex < 0) return;

    const scene = scenes[sceneIndex];
    // Work in frames for precision
    const newStartF = msToFrames(newStartMs, fps);
    const durF = scene.durF ?? msToFrames(scene.endMs - scene.startMs, fps);
    const adjustedStartF = Math.max(0, newStartF);

    // Create updated scene with frame-accurate values
    const updatedScene = {
      ...scene,
      startF: adjustedStartF,
      durF: durF,
      startMs: framesToMs(adjustedStartF, fps),
      endMs: framesToMs(adjustedStartF + durF, fps)
    };

    // Update scenes array
    const updatedScenes = [...scenes];
    updatedScenes[sceneIndex] = updatedScene;

    // Sort scenes by start time
    updatedScenes.sort((a, b) => a.startMs - b.startMs);

    // Apply magnetic linking after move (only within the same track)
    const sortedScenes = [...updatedScenes].sort((a, b) => a.startMs - b.startMs);
    const movedIndex = sortedScenes.findIndex(s => s.id === id);
    const movedScene = sortedScenes[movedIndex];
    
    // Only consider scenes in the same track for magnetic linking
    const scenesInSameTrack = sortedScenes.filter(s => s.trackId === movedScene.trackId);
    const movedIndexInTrack = scenesInSameTrack.findIndex(s => s.id === id);
    const prevScene = movedIndexInTrack > 0 ? scenesInSameTrack[movedIndexInTrack - 1] : null;
    const nextScene = movedIndexInTrack < scenesInSameTrack.length - 1 ? scenesInSameTrack[movedIndexInTrack + 1] : null;

    const snapMs = pxToMs(SNAP_PX, pxPerSec);
    const unlinkMs = pxToMs(UNLINK_PX, pxPerSec);

    // Check left edge magnetic linking (only within same track)
    if (prevScene && prevScene.trackId === movedScene.trackId) {
      const gap = movedScene.startMs - prevScene.endMs;
      if (gap >= 0 && gap <= snapMs) {
        // Snap & link to previous scene - frame-accurate
        linkLeft(movedScene, prevScene, triggerSnapAnimation, fps);
        movedScene.endMs = movedScene.startMs + framesToMs(durF, fps);
        movedScene.durF = durF;
      } else if (movedScene.linkLeftId === prevScene.id && (gap > unlinkMs || gap < 0)) {
        // Break link if pulled apart
        unlinkLeft(movedScene, prevScene);
      }
    }

    // Check right edge magnetic linking (only within same track)
    if (nextScene && nextScene.trackId === movedScene.trackId) {
      const gap = nextScene.startMs - movedScene.endMs;
      if (gap >= 0 && gap <= snapMs) {
        // Snap & link to next scene - frame-accurate
        const nextStartF = nextScene.startF ?? msToFrames(nextScene.startMs, fps);
        movedScene.startF = nextStartF - durF;
        movedScene.startMs = framesToMs(movedScene.startF, fps);
        movedScene.endMs = nextScene.startMs;
        movedScene.durF = durF;
        linkRight(movedScene, nextScene, triggerSnapAnimation, fps);
      } else if (movedScene.linkRightId === nextScene.id && (gap > unlinkMs || gap < 0)) {
        // Break link if pulled apart
        unlinkRight(movedScene, nextScene);
      }
    }

    // Update duration
    const { audioClips } = get();
    const newDuration = calculateTotalDuration(sortedScenes, audioClips);
    
    console.log('🎬 Moved scene with magnetic linking:', { 
      id, 
      from: scene.startMs, 
      to: movedScene.startMs,
      duration: framesToMs(durF, fps),
      newDurationMs: newDuration,
      linkedLeft: !!movedScene.linkLeftId,
      linkedRight: !!movedScene.linkRightId
    });

    set({ scenes: sortedScenes, durationMs: newDuration });
  },

      resizeScene: (id, edge, deltaMs, minMs, gridMs) => {
        const snap = (v: number) => Math.round(v / gridMs) * gridMs;
        deltaMs = snap(deltaMs);
        const scenes = [...get().scenes].sort((a, b) => a.startMs - b.startMs);
        const idx = scenes.findIndex(s => s.id === id);
        if (idx < 0) return;
        
        const prev = scenes[idx - 1];
        const cur = scenes[idx];
        const next = scenes[idx + 1];

        if (edge === "left") {
          const newStart = Math.max(prev ? prev.endMs + minMs : 0, cur.startMs + deltaMs);
          const maxStart = cur.endMs - minMs;
          cur.startMs = Math.min(newStart, maxStart);
          if (prev) prev.endMs = cur.startMs;
        } else {
          const newEnd = next ? next.startMs - minMs : cur.endMs + deltaMs;
          const minEnd = cur.startMs + minMs;
          cur.endMs = Math.max(newEnd, minEnd);
          if (next) next.startMs = cur.endMs;
        }
        
        // Update duration based on new scene positions
        const newDuration = calculateTotalDuration(scenes);
        set({ scenes, durationMs: newDuration });
      },

      // Magnetic linking resize action - FRAME-ACCURATE
      resizeSceneTo: (id: string, edge: "left" | "right", targetMs: number, minMs: number, gridMs: number, pxPerSec: number) => {
        const { scenes: s, durationMs, triggerSnapAnimation, fps } = get();
        const sortedScenes = [...s].sort((a,b)=>a.startMs-b.startMs);

        const i = sortedScenes.findIndex(sc => sc.id === id);
        if (i < 0) return;

        const cur = sortedScenes[i];
        
        // Ensure frame data exists
        if (cur.startF === undefined || cur.durF === undefined) {
          ensureFrameData(cur, fps);
        }
        
        // Get asset information to determine if this is a video or image
        const asset = cur.assetId ? useAssetsStore.getState().getById(cur.assetId) : null;
        
        // Only consider scenes in the same track for magnetic linking
        const scenesInSameTrack = sortedScenes.filter(sc => sc.trackId === cur.trackId);
        const iInTrack = scenesInSameTrack.findIndex(sc => sc.id === id);
        const prev = iInTrack > 0 ? scenesInSameTrack[iInTrack - 1] : null;
        const next = iInTrack < scenesInSameTrack.length - 1 ? scenesInSameTrack[iInTrack + 1] : null;

        // Ensure neighbor frame data exists before using frame math
        if (prev && (prev.startF === undefined || prev.durF === undefined)) {
          ensureFrameData(prev, fps);
        }
        if (next && (next.startF === undefined || next.durF === undefined)) {
          ensureFrameData(next, fps);
        }

        const snapMs = pxToMs(SNAP_PX, pxPerSec);
        const unlinkMs = pxToMs(UNLINK_PX, pxPerSec);

        // Use the stored original duration to constrain resizing (like audio blocks)
        // Only apply duration constraints for videos, not images (images can be resized unlimited)
        const maxDurationMs = (asset?.type === 'video' && cur.originalDurationMs) ? cur.originalDurationMs : Infinity;
        const maxDurF = msToFrames(maxDurationMs, fps);
        const minDurF = msToFrames(minMs, fps);

        if (edge === "left") {
          // Work in frames for precision
          const targetF = msToFrames(targetMs, fps);
          const endF = cur.startF! + cur.durF!;
          
          // Calculate bounds in frames (for non-linked behavior)
          const lowF = prev ? (prev.startF! + prev.durF! + minDurF) : 0;
          const highF = endF - minDurF;
          const maxStartF = endF - maxDurF;

          // Quantize to frame and clamp
          let newStartF = targetF;
          newStartF = Math.max(Math.max(lowF, maxStartF), Math.min(newStartF, highF));

          const wasLinked = !!cur.linkLeftId && prev && cur.linkLeftId === prev.id;

          if (wasLinked && prev) {
            // LINKED LEFT EDGE: move the junction directly, and resize both without feedback loops
            const prevStartF = prev.startF!;
            const minJunctionF = prevStartF + minDurF; // prev must keep at least min duration
            const maxJunctionByCurF = endF - minDurF;  // cur must keep at least min duration
            // If cur has a finite max duration (video), it enforces a LOWER bound on junction (start cannot go left of endF - maxDurF)
            const junctionLowByCurMax = Number.isFinite(maxDurF) ? (endF - maxDurF) : Number.NEGATIVE_INFINITY;
            const junctionLowF = Math.max(minJunctionF, junctionLowByCurMax);
            const junctionHighF = maxJunctionByCurF;


            let junctionF = targetF;
            junctionF = Math.max(junctionLowF, Math.min(junctionF, junctionHighF));

            // If no effective change after quantization/clamp, exit early
            if (junctionF === cur.startF) {
              // still ensure frame->ms sync
              cur.startMs = framesToMs(cur.startF!, fps);
              cur.endMs = framesToMs(endF, fps);
              prev.endMs = framesToMs(prev.startF! + prev.durF!, fps);
              return;
            }

            // Resize prev to end at the junction, respecting its min duration
            prev.durF = Math.max(minDurF, junctionF - prevStartF);
            prev.endMs = framesToMs(prevStartF + prev.durF, fps);

            // Set current to start at the junction, keeping its original endF
            cur.startF = junctionF;
            cur.durF = endF - junctionF;
            cur.startMs = framesToMs(cur.startF, fps);
            cur.endMs = framesToMs(endF, fps);

          } else {
            // not linked: don't affect prev
            cur.startF = newStartF;
            cur.durF = endF - newStartF;
            cur.startMs = framesToMs(cur.startF, fps);
            cur.endMs = framesToMs(endF, fps);

            // magnet: if close enough to prev.end => snap + link (only within same track)
            if (prev && prev.trackId === cur.trackId) {
              const gap = cur.startMs - prev.endMs; // >= 0 if separated
              if (gap >= 0 && gap <= snapMs) {
                // snap & link
                linkLeft(cur, prev, triggerSnapAnimation, fps);
                cur.durF = endF - cur.startF!;
                cur.endMs = framesToMs(endF, fps);
              } else {
                // if previously linked, only break when gap is clearly big
                if (cur.linkLeftId === prev?.id && (gap > unlinkMs || gap < 0)) {
                  unlinkLeft(cur, prev);
                }
              }
            }
          }
        } else {
          // RIGHT EDGE - frame-accurate
          const targetF = msToFrames(targetMs, fps);
          const startF = cur.startF!;
          
          // Calculate bounds in frames
          const lowF = startF + minDurF;
          const highF = next ? (next.startF! - minDurF) : Number.MAX_SAFE_INTEGER;
          const maxEndF = startF + maxDurF;

          let newEndF = targetF;
          newEndF = Math.max(lowF, Math.min(newEndF, Math.min(highF, maxEndF)));

          const wasLinked = !!cur.linkRightId && next && cur.linkRightId === next.id;

          if (wasLinked && next) {
            // LINKED RIGHT EDGE: move the junction directly, resizing both without feedback
            const nextEndF = next.startF! + next.durF!; // keep next's end fixed, trim its left
            const minJunctionF = startF + minDurF; // cur must keep at least min duration
            const maxJunctionByNextF = nextEndF - minDurF; // next must keep at least min duration
            
            // Only apply video duration constraint if the current block is a video
            // Images can be resized unlimited, so don't constrain the junction
            const maxJunctionByCurDurF = Number.isFinite(maxDurF) ? (startF + maxDurF) : Number.POSITIVE_INFINITY;
            const junctionHighF = Math.min(maxJunctionByNextF, maxJunctionByCurDurF);


            let junctionF = targetF;
            junctionF = Math.max(minJunctionF, Math.min(junctionF, junctionHighF));

            // If no effective change after quantization/clamp, exit early
            if (junctionF === startF + cur.durF!) {
              // ensure ms sync
              cur.endMs = framesToMs(startF + cur.durF!, fps);
              next.startMs = framesToMs(next.startF!, fps);
              next.endMs = framesToMs(nextEndF, fps);
              return;
            }

            // Resize current to end at the junction
            cur.durF = junctionF - startF;
            cur.endMs = framesToMs(junctionF, fps);

            // Move next's start to the junction, keeping its end
            next.startF = junctionF;
            next.durF = Math.max(minDurF, nextEndF - next.startF);
            next.startMs = framesToMs(next.startF, fps);
            next.endMs = framesToMs(nextEndF, fps);

          } else {
            // not linked: don't affect next
            cur.durF = newEndF - startF;
            cur.endMs = framesToMs(newEndF, fps);

            // magnet: close to next.start => snap + link (only within same track)
            if (next && next.trackId === cur.trackId) {
              const gap = next.startMs - cur.endMs; // >= 0 if separated
              if (gap >= 0 && gap <= snapMs) {
                cur.durF = next.startF! - startF;
                cur.endMs = next.startMs;
                linkRight(cur, next, triggerSnapAnimation, fps);
              } else {
                if (cur.linkRightId === next?.id && (gap > unlinkMs || gap < 0)) {
                  unlinkRight(cur, next);
                }
              }
            }
          }
        }

        set({ scenes: sortedScenes });
        get().normalizeDuration(); // Extend timeline if needed
      },

      selectScene: (id) => set({ selectedSceneId: id, selectedAudioId: id ? null : null }),

      triggerSnapAnimation: (id) => {
        set({ snapAnimationId: id });
        // Clear animation after it completes
        setTimeout(() => set({ snapAnimationId: null }), 400);
      },

  updateSceneTransform: (id, transform) => {
    set(state => ({
      scenes: state.scenes.map(scene => 
        scene.id === id ? { ...scene, transform } : scene
      )
    }));
  },

  moveSceneToTrack: (sceneId, trackId) => {
    console.log('🎬 MOVING SCENE TO TRACK:', { sceneId, trackId });
    set(state => ({
      scenes: state.scenes.map(scene => {
        if (scene.id === sceneId) {
          console.log('🎬 SCENE TRACK UPDATED:', { 
            sceneId, 
            oldTrackId: scene.trackId, 
            newTrackId: trackId,
            sceneStartMs: scene.startMs,
            sceneEndMs: scene.endMs,
            hadLinks: { left: scene.linkLeftId, right: scene.linkRightId }
          });
          // Break all magnetic links when moving between tracks
          return { 
            ...scene, 
            trackId,
            linkLeftId: null,
            linkRightId: null
          };
        }
        return scene;
      })
    }));
  },

  moveAudioToTrack: (audioId, trackId) => {
    set(state => ({
      audioClips: state.audioClips.map(audio => 
        audio.id === audioId ? { ...audio, trackId } : audio
      )
    }));
  },

  setPlayhead: (ms) => {
    const durationMs = get().durationMs;
    set({ playheadMs: clamp(ms, 0, durationMs) });
  },
  nudgePlayhead: (deltaMs) => {
    const { playheadMs, durationMs } = get();
    set({ playheadMs: clamp(playheadMs + deltaMs, 0, durationMs) });
  },

  setZoom: (pxPerSec) => set({ pxPerSec: clamp(pxPerSec, 5, 1000) }),
  zoomIn: () => set(state => ({ pxPerSec: clamp(state.pxPerSec * 1.2, 5, 1000) })),
  zoomOut: () => set(state => ({ pxPerSec: clamp(state.pxPerSec / 1.2, 5, 1000) })),
  zoomToPlayhead: () => {
    const { playheadMs, pxPerSec } = get();
    // Calculate the playhead position in pixels
    const playheadPx = (playheadMs / 1000) * pxPerSec;
    // Return the pixel position for the component to handle scrolling
    return playheadPx;
  },

  // playback actions
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlayback: () => set(state => ({ isPlaying: !state.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: clamp(speed, 0.1, 4.0) }),

  // history actions
  getSnapshot: (): HistorySnapshot => {
    const { tracks, scenes, audioClips, durationMs, playheadMs } = get();
    // ensure scenes and audio clips are sorted & normalized
    const sortedTracks = [...tracks].map(t=>({ ...t }));
    const sortedScenes = [...scenes].sort((a,b)=>a.startMs-b.startMs).map(s=>({ ...s }));
    const sortedAudioClips = [...audioClips].sort((a,b)=>a.startMs-b.startMs).map(a=>({ ...a }));
    return makeSnapshot({ tracks: sortedTracks, scenes: sortedScenes, audioClips: sortedAudioClips, durationMs, playheadMs });
  },

  beginTx: () => {
    const { history } = get();
    if (history.inTx) return;
    const base = get().getSnapshot();
    set({ history: { ...history, inTx: true, txBase: base }});
  },

  commitTx: () => {
    const { history } = get();
    if (!history.inTx || !history.txBase) return;
    const after = get().getSnapshot();

    // If nothing changed, just end
    const beforeJson = JSON.stringify(history.txBase);
    const afterJson  = JSON.stringify(after);
    if (beforeJson === afterJson) {
      set({ history: { past: history.past, future: [], inTx: false, txBase: undefined, max: history.max }});
      return;
    }

    const newPast = [...history.past, cloneSnapshot(history.txBase)];
    while (newPast.length > history.max) newPast.shift();

    set({ history: { past: newPast, future: [], inTx: false, txBase: undefined, max: history.max }});
  },

  cancelTx: () => {
    const { history } = get();
    if (!history.inTx || !history.txBase) { 
      set({ history: { ...history, inTx: false, txBase: undefined }}); 
      return; 
    }
    applySnapshot(
      { 
        setTracks: (tracks)=> set({ tracks }),
        setScenes: (scenes)=> set({ scenes }),
        setAudioClips: (audioClips)=> set({ audioClips }),
        setDuration: (ms)=> set({ durationMs: ms }),
        setPlayhead: (ms)=> set({ playheadMs: ms }) 
      },
      history.txBase
    );
    set({ history: { past: history.past, future: history.future, inTx: false, txBase: undefined, max: history.max }});
  },

  undo: () => {
    const { history } = get();
    if (history.inTx) get().commitTx();
    const prev = history.past[history.past.length - 1];
    if (!prev) return;
    const curr = get().getSnapshot();
    applySnapshot(
      { 
        setTracks: (tracks)=> set({ tracks }),
        setScenes: (scenes)=> set({ scenes }),
        setAudioClips: (audioClips)=> set({ audioClips }),
        setDuration: (ms)=> set({ durationMs: ms }),
        setPlayhead: (ms)=> set({ playheadMs: ms }) 
      },
      prev
    );
    const newPast = history.past.slice(0, -1);
    const newFuture = [curr, ...history.future];
    set({ history: { past: newPast, future: newFuture, inTx: false, txBase: undefined, max: history.max }});
  },

  redo: () => {
    const { history } = get();
    if (history.inTx) get().commitTx();
    const next = history.future[0];
    if (!next) return;
    const curr = get().getSnapshot();
    applySnapshot(
      { 
        setTracks: (tracks)=> set({ tracks }),
        setScenes: (scenes)=> set({ scenes }),
        setAudioClips: (audioClips)=> set({ audioClips }),
        setDuration: (ms)=> set({ durationMs: ms }),
        setPlayhead: (ms)=> set({ playheadMs: ms }) 
      },
      next
    );
    const newFuture = history.future.slice(1);
    const newPast = [...history.past, curr];
    set({ history: { past: newPast, future: newFuture, inTx: false, txBase: undefined, max: history.max }});
  },

  canUndo: () => get().history.past.length > 0,
  canRedo: () => get().history.future.length > 0,

  // serialization
  getSerializableState: () => {
    const { tracks, scenes, audioClips, durationMs, fps, aspect, resolution } = get();
    return {
      tracks: [...tracks],
      scenes: [...scenes].sort((a, b) => a.startMs - b.startMs),
      audioClips: [...audioClips].sort((a, b) => a.startMs - b.startMs),
      durationMs,
      fps,
      aspect,
      resolution,
    };
  },

  // helpers
  msPerPx: () => 1000 / get().pxPerSec,
  pxToMs: (px) => Math.max(0, Math.round(px * (1000 / get().pxPerSec))),
  msToPx: (ms) => Math.max(0, Math.round(ms * (get().pxPerSec / 1000))),

  computeInsertMs: (trackId) => {
    const { playheadMs, scenes } = get();
    // Filter scenes by trackId if provided, otherwise use all scenes
    const relevantScenes = trackId ? scenes.filter(s => s.trackId === trackId) : scenes;
    const maxSceneEnd = relevantScenes.length ? Math.max(...relevantScenes.map(s => s.endMs)) : 0;
    
    console.log('🎬 computeInsertMs:', { 
      trackId, 
      relevantScenesCount: relevantScenes.length,
      maxSceneEnd,
      allScenesCount: scenes.length 
    });
    
    // For video/image media, only consider scenes in the specific track
    // If no scenes exist in this track, start at timeline beginning (0ms)
    // Otherwise, insert at the end of the last scene in this track
    return maxSceneEnd;
  },

  computeAudioInsertMs: (trackId) => {
    const { playheadMs, audioClips } = get();
    // Filter audio clips by trackId if provided, otherwise use all audio clips
    const relevantAudioClips = trackId ? audioClips.filter(a => a.trackId === trackId) : audioClips;
    const maxAudioEnd = relevantAudioClips.length ? Math.max(...relevantAudioClips.map(a => a.endMs)) : 0;
    // For audio media, only consider audio clips in the specific track
    // If no audio clips exist in this track, start at timeline beginning (0ms)
    // Otherwise, insert at the end of the last audio clip in this track
    return maxAudioEnd;
  },

  normalizeDuration: () => {
    const { scenes, audioClips } = get();
    const maxSceneEnd = scenes.length > 0 ? Math.max(...scenes.map(s => s.endMs)) : 0;
    const maxAudioEnd = audioClips.length > 0 ? Math.max(...audioClips.map(a => a.endMs)) : 0;
    const end = Math.max(maxSceneEnd, maxAudioEnd);
    set({ durationMs: Math.max(end, 1000) });
  },

  addSceneFromAsset: (assetId, opts) => {
    const { scenes, audioClips, tracks } = get();
    const asset = useAssetsStore.getState().getById(assetId);
    const trackType = asset?.type === 'image' || asset?.type === 'video' ? 'video' : 'audio';
    
    // Find appropriate track based on asset type or provided trackId
    let defaultTrack = tracks.find(t => t.id === opts?.trackId) || tracks.find(t => t.type === trackType);
    
    // If no track of the required type exists, create one
    if (!defaultTrack) {
      const trackCount = tracks.filter(t => t.type === trackType).length;
      const trackName = `${trackType === "video" ? "Media" : "Audio"} ${trackCount + 1}`;
      const newTrack: Track = { id: nanoid(), name: trackName, type: trackType };
      
      // If this is the first track being created, only create the track type needed
      if (tracks.length === 0) {
        if (trackType === 'video') {
          // Only create media track for video content
          set(state => ({ tracks: [newTrack] }));
          defaultTrack = newTrack;
        } else {
          // Only create audio track for audio content
          set(state => ({ tracks: [newTrack] }));
          defaultTrack = newTrack;
        }
      } else {
        // Insert new track in the correct position (media tracks before audio tracks)
        const mediaTracks = tracks.filter(t => t.type === 'video');
        const audioTracks = tracks.filter(t => t.type === 'audio');
        
        let newTracks;
        if (trackType === 'video') {
          newTracks = [...mediaTracks, newTrack, ...audioTracks];
        } else {
          newTracks = [...mediaTracks, ...audioTracks, newTrack];
        }
        
        set(state => ({ tracks: newTracks }));
        defaultTrack = newTrack;
      }
    }
    
    // Now determine insertion position using the final track ID
    const finalTrackId = defaultTrack.id;
    const isTrackEmpty = scenes.filter(s => s.trackId === finalTrackId).length === 0;
    const at = typeof opts?.atMs === "number" ? Math.max(0, opts.atMs) : (isTrackEmpty ? 0 : get().computeInsertMs(finalTrackId));
    const dflt = opts?.durationMs ?? 3000; // images=3s, videos=5s set by caller
    const id = crypto.randomUUID();
    const label = opts?.label;
    
    console.log('🎬 Track-specific insertion:', { 
      finalTrackId, 
      trackName: defaultTrack.name,
      isTrackEmpty, 
      scenesInTrack: scenes.filter(s => s.trackId === finalTrackId).length,
      totalScenes: scenes.length,
      insertionMs: at,
      allScenes: scenes.map(s => ({ id: s.id, trackId: s.trackId, startMs: s.startMs, endMs: s.endMs }))
    });
    
    const { fps } = get();
    const scene: Scene = { 
      id, 
      startMs: at, 
      endMs: at + dflt, 
      label, 
      assetId, 
      trackId: defaultTrack.id,
      linkLeftId: null, 
      linkRightId: null,
      // Only set originalDurationMs for videos, not images (images can be resized unlimited)
      ...(asset?.type === 'video' ? { originalDurationMs: dflt } : {})
    };
    
    // Ensure frame data for new scene
    ensureFrameData(scene, fps);
    
    console.log('🎬 FINAL SCENE CREATION (FRAME-ACCURATE):', { 
      sceneId: id, 
      trackId: defaultTrack.id, 
      trackName: defaultTrack.name,
      startF: scene.startF,
      durF: scene.durF,
      startMs: scene.startMs, 
      endMs: scene.endMs,
      isTrackEmpty,
      scenesInTrack: scenes.filter(s => s.trackId === finalTrackId).length
    });
    // prevent overlap: shift if needed
    const updatedScenes = [...scenes, scene].sort((a,b)=>a.startMs-b.startMs);
    set({ scenes: updatedScenes });
    get().normalizeDuration();
    set(state => ({ history: { ...state.history, future: [] }})); // clear redo on new insert
    return id;
  },

  addAudioFromAsset: (assetId, kind, opts) => {
    const { scenes, audioClips, tracks } = get();
    const trackType = 'audio';
    
    // Find appropriate track based on asset type or provided trackId
    let defaultTrack = tracks.find(t => t.id === opts?.trackId) || tracks.find(t => t.type === trackType);
    
    // If no audio track exists, create one
    if (!defaultTrack) {
      const trackCount = tracks.filter(t => t.type === trackType).length;
      const trackName = `Audio ${trackCount + 1}`;
      const newTrack: Track = { id: nanoid(), name: trackName, type: trackType };
      
      // If this is the first track being created, only create the track type needed
      if (tracks.length === 0) {
        // Only create audio track for audio content
        set(state => ({ tracks: [newTrack] }));
        defaultTrack = newTrack;
      } else {
        // Insert new track in the correct position (media tracks before audio tracks)
        const mediaTracks = tracks.filter(t => t.type === 'video');
        const audioTracks = tracks.filter(t => t.type === 'audio');
        
        const newTracks = [...mediaTracks, ...audioTracks, newTrack];
        set(state => ({ tracks: newTracks }));
        defaultTrack = newTrack;
      }
    }
    
    // Now determine insertion position using the final track ID
    const finalTrackId = defaultTrack.id;
    const isTrackEmpty = audioClips.filter(a => a.trackId === finalTrackId).length === 0;
    const at = typeof opts?.atMs === "number" ? Math.max(0, opts.atMs) : (isTrackEmpty ? 0 : get().computeAudioInsertMs(finalTrackId));
    const dflt = opts?.durationMs ?? 30000; // 30s default, will be updated with actual duration
    const id = crypto.randomUUID();
    
    console.log('🎵 Track-specific audio insertion:', { 
      finalTrackId, 
      trackName: defaultTrack.name,
      isTrackEmpty, 
      audioClipsInTrack: audioClips.filter(a => a.trackId === finalTrackId).length,
      totalAudioClips: audioClips.length,
      insertionMs: at,
      allAudioClips: audioClips.map(a => ({ id: a.id, trackId: a.trackId, startMs: a.startMs, endMs: a.endMs }))
    });
    
    const { fps } = get();
    
    // Try to get actual audio duration FIRST before creating the clip
    const asset = useAssetsStore.getState().getById(assetId);
    let actualDurationMs = dflt;
    
    // FIRST: Check if waveform data already has the duration (most reliable)
    const waveformData = useAssetsStore.getState().waveforms[assetId];
    if (waveformData && waveformData.durationMs > 0) {
      actualDurationMs = waveformData.durationMs;
      console.log('🎵 Using duration from waveform data:', { assetId, durationMs: actualDurationMs });
    }
    
    // If asset has a URL and we don't have duration yet, try to get it from audio metadata
    if (asset && asset.url && actualDurationMs === dflt) {
      const audio = new Audio(asset.url);
      // Set up async loading for duration
      audio.addEventListener('loadedmetadata', () => {
        const loadedDurationMs = audio.duration * 1000;
        if (loadedDurationMs > 0 && loadedDurationMs !== Infinity) {
          console.log('🎵 Loading actual audio duration:', { assetId, loadedDurationMs, clipId: id });
          const currentFps = get().fps;
          set(state => ({
            audioClips: state.audioClips.map(c => {
              if (c.id === id) {
                const updated: AudioClip = { 
                  ...c, 
                  endMs: c.startMs + loadedDurationMs, 
                  originalDurationMs: loadedDurationMs 
                };
                // Recalculate frames with new duration
                ensureFrameData(updated, currentFps);
                console.log('🎵 Updated audio clip with actual duration:', {
                  clipId: id,
                  oldDurF: c.durF,
                  newDurF: updated.durF,
                  oldEndMs: c.endMs,
                  newEndMs: updated.endMs,
                  originalDurationMs: loadedDurationMs
                });
                return updated;
              }
              return c;
            })
          }));
          get().normalizeDuration();
        }
      });
      audio.addEventListener('error', (e) => {
        console.warn('🎵 Failed to load audio metadata:', e);
      });
      // Load the audio to trigger metadata loading
      audio.load();
    }
    
    // Create the clip with the initial duration (will be updated when metadata loads)
    const clip: AudioClip = { 
      id, 
      startMs: at, 
      endMs: at + actualDurationMs, 
      assetId, 
      kind, 
      originalDurationMs: actualDurationMs, 
      trackId: defaultTrack.id 
    };
    
    // Ensure frame data for new audio clip
    ensureFrameData(clip, fps);
    
    console.log('🎵 Created audio clip:', {
      clipId: id,
      startF: clip.startF,
      durF: clip.durF,
      startMs: clip.startMs,
      endMs: clip.endMs,
      originalDurationMs: actualDurationMs
    });
    
    set({ audioClips: [...get().audioClips, clip].sort((a,b)=>a.startMs-b.startMs) });
    get().normalizeDuration();
    set(state => ({ history: { ...state.history, future: [] }}));
    
    return id;
  },

  // Core editing actions
  findSceneAt: (ms) => {
    const { selectedSceneId, scenes } = get();
    // If a scene is selected and playhead is inside it, use that
    if (selectedSceneId) {
      const selected = scenes.find(s => s.id === selectedSceneId);
      if (selected && ms >= selected.startMs && ms < selected.endMs) {
        return selectedSceneId;
      }
    }
    // Otherwise find first scene at that time
    const scene = scenes.find(s => ms >= s.startMs && ms < s.endMs);
    return scene?.id || null;
  },

  findAudioAt: (ms) => {
    const { selectedAudioId, audioClips } = get();
    // If audio is selected and playhead is inside it, use that
    if (selectedAudioId) {
      const selected = audioClips.find(a => a.id === selectedAudioId);
      if (selected && ms >= selected.startMs && ms < selected.endMs) {
        return selectedAudioId;
      }
    }
    // Otherwise find first audio at that time
    const audio = audioClips.find(a => ms >= a.startMs && ms < a.endMs);
    return audio?.id || null;
  },

  splitAt: (ms) => {
    const { selectedSceneId, selectedAudioId, scenes, audioClips, fps } = get();
    
    // Calculate frame-accurate split point
    const snappedF = msToFrames(ms, fps);
    const snappedMs = framesToMs(snappedF, fps);
    
    // Try to split selected scene first
    if (selectedSceneId) {
      const scene = scenes.find(s => s.id === selectedSceneId);
      if (scene && snappedMs > scene.startMs && snappedMs < scene.endMs) {
        get().beginTx("Split scene at playhead");
        
        const startF = scene.startF ?? msToFrames(scene.startMs, fps);
        const splitF = snappedF;
        const endF = startF + (scene.durF ?? msToFrames(scene.endMs - scene.startMs, fps));
        
        const sceneA: Scene = {
          ...scene,
          id: nanoid(),
          startF: startF,
          durF: splitF - startF,
          startMs: framesToMs(startF, fps),
          endMs: snappedMs,
          linkRightId: null
        };
        
        const sceneB: Scene = {
          ...scene,
          id: nanoid(),
          startF: splitF,
          durF: endF - splitF,
          startMs: snappedMs,
          endMs: framesToMs(endF, fps),
          linkLeftId: null
        };
        
        // Link A and B together
        sceneA.linkRightId = sceneB.id;
        sceneB.linkLeftId = sceneA.id;
        
        // Replace original with A and B
        const newScenes = scenes.filter(s => s.id !== selectedSceneId);
        newScenes.push(sceneA, sceneB);
        newScenes.sort((a, b) => a.startMs - b.startMs);
        
        set({ scenes: newScenes });
        get().normalizeDuration();
        get().commitTx();
        return;
      }
    }
    
    // Try to split selected audio
    if (selectedAudioId) {
      const audio = audioClips.find(a => a.id === selectedAudioId);
      if (audio && snappedMs > audio.startMs && snappedMs < audio.endMs) {
        get().beginTx("Split audio at playhead");
        
        const startF = audio.startF ?? msToFrames(audio.startMs, fps);
        const splitF = snappedF;
        const endF = startF + (audio.durF ?? msToFrames(audio.endMs - audio.startMs, fps));
        
        // Calculate the audio offset for each segment (stays in ms for sub-frame precision)
        const originalAudioOffset = audio.audioOffsetMs || 0;
        const timelineOffset = snappedMs - audio.startMs;
        
        const audioA: AudioClip = {
          ...audio,
          id: nanoid(),
          startF: startF,
          durF: splitF - startF,
          startMs: framesToMs(startF, fps),
          endMs: snappedMs,
          audioOffsetMs: originalAudioOffset // First segment starts at original offset
        };
        
        const audioB: AudioClip = {
          ...audio,
          id: nanoid(),
          startF: splitF,
          durF: endF - splitF,
          startMs: snappedMs,
          endMs: framesToMs(endF, fps),
          audioOffsetMs: originalAudioOffset + timelineOffset // Second segment continues from cut point
        };
        
        console.log('🎵 AUDIO SPLIT DEBUG (FRAME-ACCURATE):', {
          originalClip: { 
            id: audio.id,
            startF: audio.startF,
            durF: audio.durF,
            startMs: audio.startMs, 
            endMs: audio.endMs, 
            durationMs: audio.endMs - audio.startMs,
            audioOffsetMs: audio.audioOffsetMs,
            assetId: audio.assetId
          },
          splitAt: snappedMs,
          splitF: snappedF,
          timelineOffset,
          audioA: { 
            id: audioA.id,
            startF: audioA.startF,
            durF: audioA.durF,
            startMs: audioA.startMs, 
            endMs: audioA.endMs, 
            durationMs: audioA.endMs - audioA.startMs,
            audioOffsetMs: audioA.audioOffsetMs,
            assetId: audioA.assetId
          },
          audioB: { 
            id: audioB.id,
            startF: audioB.startF,
            durF: audioB.durF,
            startMs: audioB.startMs, 
            endMs: audioB.endMs, 
            durationMs: audioB.endMs - audioB.startMs,
            audioOffsetMs: audioB.audioOffsetMs,
            assetId: audioB.assetId
          }
        });
        
        const newAudioClips = audioClips.filter(a => a.id !== selectedAudioId);
        newAudioClips.push(audioA, audioB);
        newAudioClips.sort((a, b) => a.startMs - b.startMs);
        
        set({ audioClips: newAudioClips });
        get().normalizeDuration();
        get().commitTx();
        return;
      }
    }
    
    // Try to find any scene at playhead
    const sceneId = get().findSceneAt(snappedMs);
    if (sceneId) {
      set({ selectedSceneId: sceneId });
      get().splitAt(snappedMs);
      return;
    }
    
    // Try to find any audio at playhead
    const audioId = get().findAudioAt(snappedMs);
    if (audioId) {
      set({ selectedAudioId: audioId });
      get().splitAt(snappedMs);
      return;
    }
  },

  shiftRightFrom: (ms, deltaMs) => {
    const { scenes, audioClips, fps } = get();
    
    // Convert delta to frames for precision
    const deltaF = msToFrames(deltaMs, fps);
    
    // Shift scenes
    const newScenes = scenes.map(scene => {
      if (scene.startMs >= ms) {
        const startF = (scene.startF ?? msToFrames(scene.startMs, fps)) + deltaF;
        const durF = scene.durF ?? msToFrames(scene.endMs - scene.startMs, fps);
        return { 
          ...scene, 
          startF: Math.max(0, startF),
          durF: durF,
          startMs: Math.max(0, framesToMs(startF, fps)), 
          endMs: Math.max(0, framesToMs(startF + durF, fps)) 
        };
      }
      return scene;
    });
    
    // Shift audio clips
    const newAudioClips = audioClips.map(audio => {
      if (audio.startMs >= ms) {
        const startF = (audio.startF ?? msToFrames(audio.startMs, fps)) + deltaF;
        const durF = audio.durF ?? msToFrames(audio.endMs - audio.startMs, fps);
        return { 
          ...audio, 
          startF: Math.max(0, startF),
          durF: durF,
          startMs: Math.max(0, framesToMs(startF, fps)), 
          endMs: Math.max(0, framesToMs(startF + durF, fps)) 
        };
      }
      return audio;
    });
    
    set({ scenes: newScenes, audioClips: newAudioClips });
  },

  deleteSelection: (opts = {}) => {
    const { ripple = false } = opts;
    const { selectedSceneId, selectedAudioId, scenes, audioClips } = get();
    
    if (selectedSceneId) {
      get().beginTx(ripple ? "Ripple delete scene" : "Delete scene");
      
      const scene = scenes.find(s => s.id === selectedSceneId);
      if (!scene) return;
      
      const gapMs = scene.endMs - scene.startMs;
      
      // Remove the scene
      const newScenes = scenes.filter(s => s.id !== selectedSceneId);
      
      // Clear links pointing to this scene
      newScenes.forEach(s => {
        if (s.linkLeftId === selectedSceneId) s.linkLeftId = null;
        if (s.linkRightId === selectedSceneId) s.linkRightId = null;
      });
      
      if (ripple) {
        // First remove the scene from state, then shift to close the gap
        set({ scenes: newScenes });
        get().shiftRightFrom(scene.endMs, -gapMs);
      }
      
      // Select next scene or previous, or clear selection
      const remainingScenes = ripple ? get().scenes : newScenes;
      const nextScene = remainingScenes.find(s => s.startMs >= scene.startMs);
      const prevScene = remainingScenes.find(s => s.endMs <= scene.startMs);
      
      set({ 
        scenes: ripple ? get().scenes : newScenes,
        selectedSceneId: nextScene?.id || prevScene?.id || null
      });
      
      get().normalizeDuration();
      get().commitTx();
    } else if (selectedAudioId) {
      get().beginTx(ripple ? "Ripple delete audio" : "Delete audio");
      
      const audio = audioClips.find(a => a.id === selectedAudioId);
      if (!audio) return;
      
      const gapMs = audio.endMs - audio.startMs;
      
      // Remove the audio
      const newAudioClips = audioClips.filter(a => a.id !== selectedAudioId);
      
      if (ripple) {
        // First remove the audio from state, then shift to close the gap
        set({ audioClips: newAudioClips });
        get().shiftRightFrom(audio.endMs, -gapMs);
      }
      
      // Select next audio or previous, or clear selection
      const remainingAudio = ripple ? get().audioClips : newAudioClips;
      const nextAudio = remainingAudio.find(a => a.startMs >= audio.startMs);
      const prevAudio = remainingAudio.find(a => a.endMs <= audio.startMs);
      
      set({ 
        audioClips: ripple ? get().audioClips : newAudioClips,
        selectedAudioId: nextAudio?.id || prevAudio?.id || null
      });
      
      get().normalizeDuration();
      get().commitTx();
    }
  },

  duplicateSelection: () => {
    const { selectedSceneId, selectedAudioId, scenes, audioClips, fps } = get();
    
    if (selectedSceneId) {
      get().beginTx("Duplicate scene");
      
      const scene = scenes.find(s => s.id === selectedSceneId);
      if (!scene) return;
      
      const durF = scene.durF ?? msToFrames(scene.endMs - scene.startMs, fps);
      const endF = (scene.startF ?? msToFrames(scene.startMs, fps)) + durF;
      const newStartF = endF;
      
      const duplicatedScene: Scene = {
        ...scene,
        id: nanoid(),
        startF: newStartF,
        durF: durF,
        startMs: framesToMs(newStartF, fps),
        endMs: framesToMs(newStartF + durF, fps),
        linkLeftId: null,
        linkRightId: null
      };
      
      const newScenes = [...scenes, duplicatedScene].sort((a, b) => a.startMs - b.startMs);
      set({ scenes: newScenes, selectedSceneId: duplicatedScene.id });
      get().normalizeDuration();
      get().commitTx();
    } else if (selectedAudioId) {
      get().beginTx("Duplicate audio");
      
      const audio = audioClips.find(a => a.id === selectedAudioId);
      if (!audio) return;
      
      const durF = audio.durF ?? msToFrames(audio.endMs - audio.startMs, fps);
      const endF = (audio.startF ?? msToFrames(audio.startMs, fps)) + durF;
      const newStartF = endF;
      
      const duplicatedAudio: AudioClip = {
        ...audio,
        id: nanoid(),
        startF: newStartF,
        durF: durF,
        startMs: framesToMs(newStartF, fps),
        endMs: framesToMs(newStartF + durF, fps)
      };
      
      const newAudioClips = [...audioClips, duplicatedAudio].sort((a, b) => a.startMs - b.startMs);
      set({ audioClips: newAudioClips, selectedAudioId: duplicatedAudio.id });
      get().normalizeDuration();
      get().commitTx();
    }
  },

  // Audio manipulation actions
  selectAudio: (id) => set({ selectedAudioId: id, selectedSceneId: null }),

  moveAudio: (id, newStartMs, pxPerSec) => {
    const { audioClips, durationMs, triggerSnapAnimation, fps } = get();
    const audioIndex = audioClips.findIndex(a => a.id === id);
    if (audioIndex < 0) return;

    const audio = audioClips[audioIndex];
    // Work in frames for precision
    const newStartF = msToFrames(newStartMs, fps);
    const durF = audio.durF ?? msToFrames(audio.endMs - audio.startMs, fps);
    const adjustedStartF = Math.max(0, newStartF);

    // Create updated audio with frame-accurate values
    const updatedAudio = {
      ...audio,
      startF: adjustedStartF,
      durF: durF,
      startMs: framesToMs(adjustedStartF, fps),
      endMs: framesToMs(adjustedStartF + durF, fps)
    };

    // Update audio array
    const updatedAudioClips = [...audioClips];
    updatedAudioClips[audioIndex] = updatedAudio;

    // Sort audio by start time
    updatedAudioClips.sort((a, b) => a.startMs - b.startMs);

    // Apply magnetic linking after move
    const movedIndex = updatedAudioClips.findIndex(a => a.id === id);
    const movedAudio = updatedAudioClips[movedIndex];
    const prevAudio = movedIndex > 0 ? updatedAudioClips[movedIndex - 1] : null;
    const nextAudio = movedIndex < updatedAudioClips.length - 1 ? updatedAudioClips[movedIndex + 1] : null;

    const snapMs = pxToMs(SNAP_PX, pxPerSec);

    // Check left edge magnetic linking
    if (prevAudio) {
      const gap = movedAudio.startMs - prevAudio.endMs;
      if (gap >= 0 && gap <= snapMs) {
        // Snap to previous audio - frame-accurate
        const prevEndF = (prevAudio.startF ?? msToFrames(prevAudio.startMs, fps)) + 
                         (prevAudio.durF ?? msToFrames(prevAudio.endMs - prevAudio.startMs, fps));
        movedAudio.startF = prevEndF;
        movedAudio.startMs = framesToMs(prevEndF, fps);
        movedAudio.endMs = framesToMs(prevEndF + durF, fps);
        if (triggerSnapAnimation) {
          triggerSnapAnimation(movedAudio.id);
          triggerSnapAnimation(prevAudio.id);
        }
      }
    }

    // Check right edge magnetic linking
    if (nextAudio) {
      const gap = nextAudio.startMs - movedAudio.endMs;
      if (gap >= 0 && gap <= snapMs) {
        // Snap to next audio - frame-accurate
        const nextStartF = nextAudio.startF ?? msToFrames(nextAudio.startMs, fps);
        movedAudio.startF = nextStartF - durF;
        movedAudio.startMs = framesToMs(movedAudio.startF, fps);
        movedAudio.endMs = nextAudio.startMs;
        if (triggerSnapAnimation) {
          triggerSnapAnimation(movedAudio.id);
          triggerSnapAnimation(nextAudio.id);
        }
      }
    }

    // Update duration
    const { scenes } = get();
    const newDuration = calculateTotalDuration(scenes, updatedAudioClips);
    
    console.log('🎵 Moved audio with magnetic linking:', { 
      id, 
      from: audio.startMs, 
      to: movedAudio.startMs,
      duration: framesToMs(durF, fps),
      newDurationMs: newDuration
    });

    set({ audioClips: updatedAudioClips, durationMs: newDuration });
  },

  resizeAudioTo: (id: string, edge: "left" | "right", targetMs: number, minMs: number, gridMs: number, pxPerSec: number) => {
    console.log('🎵 RESIZE AUDIO TO CALLED:', {
      id,
      edge,
      targetMs,
      minMs,
      gridMs,
      pxPerSec
    });
    
    const { audioClips: a, durationMs, triggerSnapAnimation, fps } = get();
    const audioClips = [...a]; // Don't sort here, assume already sorted

    const i = audioClips.findIndex(ac => ac.id === id);
    if (i < 0) {
      console.log('🎵 RESIZE AUDIO TO: Clip not found:', id);
      return;
    }

    const cur = audioClips[i];
    
    // Ensure frame data exists
    if (cur.startF === undefined || cur.durF === undefined) {
      ensureFrameData(cur, fps);
    }
    
    console.log('🎵 RESIZE AUDIO TO: Found clip:', {
      id: cur.id,
      startF: cur.startF,
      durF: cur.durF,
      startMs: cur.startMs,
      endMs: cur.endMs,
      audioOffsetMs: cur.audioOffsetMs,
      originalDurationMs: cur.originalDurationMs,
      trackId: cur.trackId
    });
    
    // Find prev/next clips ON THE SAME TRACK ONLY
    const prev = audioClips.slice(0, i).reverse().find(ac => ac.trackId === cur.trackId);
    const next = audioClips.slice(i + 1).find(ac => ac.trackId === cur.trackId);

    // Use the stored original duration to constrain resizing
    const audioOffsetMs = cur.audioOffsetMs || 0;
    const originalDurationMs = cur.originalDurationMs || Infinity;
    const minDurF = msToFrames(minMs, fps);
    
    console.log('🎵 RESIZE AUDIO CONSTRAINTS:', {
      clipId: cur.id,
      originalDurationMs,
      audioOffsetMs,
      minDurF,
      currentDurF: cur.durF
    });

    const snapMs = pxToMs(SNAP_PX, pxPerSec);

    if (edge === "left") {
      // Work in frames for precision
      const targetF = msToFrames(targetMs, fps);
      const endF = cur.startF! + cur.durF!;
      
      // Calculate bounds in frames
      const prevEndF = prev ? ((prev.startF ?? msToFrames(prev.startMs, fps)) + (prev.durF ?? msToFrames(prev.endMs - prev.startMs, fps))) : 0;
      const lowF = prev ? prevEndF : 0; // Can't go before previous clip
      const highF = endF - minDurF; // Can't make duration less than minDurF
      
      // For left edge expansion: we need to check how much we can "reveal" from the audio offset
      // Maximum expansion is when audioOffsetMs reaches 0 (showing the very start of the audio)
      // So minStartF should be calculated considering that we can expand until audioOffsetMs = 0
      const currentOffsetFrames = msToFrames(audioOffsetMs, fps);
      const minStartF = cur.startF! - currentOffsetFrames; // Earliest we can go (when offset = 0)
      
      console.log('🔍 LEFT EDGE CONSTRAINTS:', {
        clipId: cur.id,
        targetF,
        targetMs,
        currentStartF: cur.startF,
        currentOffsetMs: audioOffsetMs,
        currentOffsetFrames,
        endF,
        lowF: `${lowF} (prev end)`,
        highF: `${highF} (min dur)`,
        minStartF: `${minStartF} (max expansion when offset=0)`,
        currentDurF: cur.durF
      });

      // Quantize to frame and clamp
      let newStartF = targetF;
      // Clamp: can't go before prev (lowF), can't expand beyond audio start (minStartF), can't go past highF (min duration)
      newStartF = Math.max(Math.max(lowF, minStartF), Math.min(newStartF, highF));

      // Calculate the change in timeline position IN MILLISECONDS (for audioOffsetMs)
      const oldStartMs = framesToMs(cur.startF!, fps);
      const newStartMs = framesToMs(newStartF, fps);
      const timelineOffsetChange = newStartMs - oldStartMs;
      
      // Update audioOffsetMs to reflect the trim (stays in ms for sub-frame audio precision)
      const currentAudioOffset = cur.audioOffsetMs || 0;
      const newAudioOffset = currentAudioOffset + timelineOffsetChange;
      
      console.log('🎵 LEFT EDGE TRIM DEBUG (FRAME-ACCURATE):', {
        clipId: cur.id,
        oldStartF: cur.startF,
        newStartF: newStartF,
        oldStartMs,
        newStartMs,
        timelineOffsetChange,
        oldAudioOffsetMs: currentAudioOffset,
        newAudioOffsetMs: newAudioOffset,
        clipDurationMs: framesToMs(cur.durF!, fps)
      });

      cur.startF = newStartF;
      cur.durF = endF - newStartF;
      cur.startMs = newStartMs;
      cur.endMs = framesToMs(endF, fps);
      cur.audioOffsetMs = newAudioOffset;

      // magnet: if close enough to prev.end => snap + link
      if (prev) {
        const gap = cur.startMs - prev.endMs; // >= 0 if separated
        if (gap >= 0 && gap <= snapMs) {
          // snap & link - recalculate audioOffsetMs after snap
          const snapStartF = prevEndF;
          const snapStartMs = framesToMs(snapStartF, fps);
          const snapOffsetChange = snapStartMs - newStartMs;
          cur.startF = snapStartF;
          cur.durF = endF - snapStartF;
          cur.startMs = snapStartMs;
          cur.audioOffsetMs = newAudioOffset + snapOffsetChange;
          
          if (triggerSnapAnimation) {
            triggerSnapAnimation(cur.id);
            triggerSnapAnimation(prev.id);
          }
        }
      }
    } else {
      // RIGHT EDGE - frame-accurate
      const targetF = msToFrames(targetMs, fps);
      const startF = cur.startF!;
      
      // Calculate bounds in frames
      const lowF = startF + minDurF; // Minimum duration
      const nextStartF = next ? (next.startF ?? msToFrames(next.startMs, fps)) : Number.MAX_SAFE_INTEGER;
      const highF = next ? (nextStartF - minDurF) : Number.MAX_SAFE_INTEGER; // Can't overlap with next clip
      
      // For right edge: max extension is when we've used all of the original audio
      // Current position in audio = audioOffsetMs
      // Remaining audio = originalDurationMs - audioOffsetMs
      const remainingDurationMs = originalDurationMs - audioOffsetMs;
      const maxDurF = msToFrames(remainingDurationMs, fps);
      const maxEndF = startF + maxDurF; // Can't extend beyond original audio length

      console.log('🔍 RIGHT EDGE CONSTRAINTS:', {
        clipId: cur.id,
        targetF, 
        startF,
        audioOffsetMs,
        originalDurationMs,
        remainingDurationMs,
        lowF: `${lowF} (min dur)`, 
        highF: `${highF} (next clip)`, 
        maxEndF: `${maxEndF} (audio length)`,
        maxDurF,
        nextStartF,
        hasNext: !!next
      });

      let newEndF = targetF;
      newEndF = Math.max(lowF, Math.min(newEndF, Math.min(highF, maxEndF)));

      console.log('🔍 RIGHT EDGE RESULT:', 
        'newEndF:', newEndF, 
        'newDurF:', newEndF - startF,
        'clamped by:', newEndF === lowF ? 'lowF (MIN)' : newEndF === highF ? 'highF (NEXT CLIP)' : newEndF === maxEndF ? 'maxEndF (AUDIO LENGTH)' : 'target'
      );

      cur.durF = newEndF - startF;
      cur.endMs = framesToMs(newEndF, fps);
      // Note: audioOffsetMs stays the same for right edge trimming
      // Only the visible duration changes, not the starting point in the audio file

      // magnet: close to next.start => snap + link
      if (next) {
        const gap = next.startMs - cur.endMs; // >= 0 if separated
        if (gap >= 0 && gap <= snapMs) {
          cur.durF = nextStartF - startF;
          cur.endMs = next.startMs;
          if (triggerSnapAnimation) {
            triggerSnapAnimation(cur.id);
            triggerSnapAnimation(next.id);
          }
        }
      }
    }

    console.log('🎵 RESIZE AUDIO TO: Final clip state (FRAME-ACCURATE):', {
      id: cur.id,
      startF: cur.startF,
      durF: cur.durF,
      startMs: cur.startMs,
      endMs: cur.endMs,
      audioOffsetMs: cur.audioOffsetMs,
      durationMs: cur.endMs - cur.startMs
    });
    
    set({ audioClips });
    get().normalizeDuration(); // Extend timeline if needed
    
    console.log('🎵 RESIZE AUDIO TO: State updated successfully');
  },
}));