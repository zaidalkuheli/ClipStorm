"use client";
import { create } from "zustand";
import { nanoid } from "nanoid";
import { History, HistorySnapshot, makeSnapshot, cloneSnapshot, applySnapshot } from "./history";
import { useAssetsStore } from "./assetsStore";

// Tuned to feel noticeable but not sticky
export const SNAP_PX = 8;      // ~8px snaps & links
export const UNLINK_PX = 14;   // need a wider gap to break a link

const pxToMs = (px: number, pxPerSec: number) => (px / pxPerSec) * 1000;

const bounds = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const snapToGrid = (v: number, gridMs: number) =>
  gridMs > 1 ? Math.round(v / gridMs) * gridMs : v;

// Link / unlink utilities
function linkRight(cur: Scene, next?: Scene, triggerAnimation?: (id: string) => void) {
  if (!next) return;
  cur.linkRightId = next.id;
  next.linkLeftId = cur.id;
  // ensure perfect contact
  cur.endMs = next.startMs;
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

function linkLeft(cur: Scene, prev?: Scene, triggerAnimation?: (id: string) => void) {
  if (!prev) return;
  cur.linkLeftId = prev.id;
  prev.linkRightId = cur.id;
  // ensure perfect contact
  cur.startMs = prev.endMs;
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

export type Track = {
  id: string;
  name: string;
  type: "video" | "audio";
};

export type Scene = { 
  id: string; 
  label?: string; 
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
};

export type AudioClip = {
  id: string;
  startMs: number;
  endMs: number;
  assetId: string;
  kind: "vo" | "music";
  gain?: number;
  originalDurationMs: number; // Store the original audio file duration
  audioOffsetMs?: number; // Offset within the original audio file (for cut clips)
  trackId?: string; // Track assignment for vertical drag
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
  setScenes: (scenes: Scene[]) => void;
  setAudioClips: (audioClips: AudioClip[]) => void;
  setDuration: (durationMs: number) => void;
  addScene: (scene: Omit<Scene, 'id'>) => void;
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
      
      // If deleting an audio track, also delete all audio clips
      let updatedAudioClips = audioClips;
      if (trackToDelete.type === 'audio') {
        updatedAudioClips = [];
      }
      
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

  setScenes: (scenes) => {
    const { audioClips } = get();
    const newDuration = calculateTotalDuration(scenes, audioClips);
    console.log('📏 Updating duration based on scenes:', { 
      sceneCount: scenes.length, 
      maxEndMs: Math.max(...scenes.map(s => s.endMs)),
      newDurationMs: newDuration 
    });
    set({ scenes, durationMs: newDuration });
  },

  setAudioClips: (audioClips) => {
    const { scenes } = get();
    const newDuration = calculateTotalDuration(scenes, audioClips);
    console.log('📏 Updating duration based on audio clips:', { 
      audioCount: audioClips.length, 
      maxEndMs: Math.max(...audioClips.map(a => a.endMs)),
      newDurationMs: newDuration 
    });
    set({ audioClips, durationMs: newDuration });
  },

  setDuration: (durationMs) => set({ durationMs }),

  addScene: (sceneData) => {
    const { scenes, durationMs, audioClips } = get();
    const newScene: Scene = {
      id: nanoid(),
      ...sceneData
    };
    const updatedScenes = [...scenes, newScene].sort((a, b) => a.startMs - b.startMs);
    const newDuration = calculateTotalDuration(updatedScenes, audioClips);
    console.log('➕ Added new scene:', { newScene, newDurationMs: newDuration });
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
    const { scenes, durationMs, triggerSnapAnimation } = get();
    const sceneIndex = scenes.findIndex(s => s.id === id);
    if (sceneIndex < 0) return;

    const scene = scenes[sceneIndex];
    const sceneDuration = scene.endMs - scene.startMs;
    const newEndMs = newStartMs + sceneDuration;
    const adjustedStartMs = Math.max(0, newEndMs - sceneDuration);

    // Create updated scene
    const updatedScene = {
      ...scene,
      startMs: adjustedStartMs,
      endMs: newEndMs
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
        // Snap & link to previous scene
        movedScene.startMs = prevScene.endMs;
        movedScene.endMs = movedScene.startMs + sceneDuration;
        linkLeft(movedScene, prevScene, triggerSnapAnimation);
      } else if (movedScene.linkLeftId === prevScene.id && (gap > unlinkMs || gap < 0)) {
        // Break link if pulled apart
        unlinkLeft(movedScene, prevScene);
      }
    }

    // Check right edge magnetic linking (only within same track)
    if (nextScene && nextScene.trackId === movedScene.trackId) {
      const gap = nextScene.startMs - movedScene.endMs;
      if (gap >= 0 && gap <= snapMs) {
        // Snap & link to next scene
        movedScene.endMs = nextScene.startMs;
        movedScene.startMs = movedScene.endMs - sceneDuration;
        linkRight(movedScene, nextScene, triggerSnapAnimation);
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
      duration: sceneDuration,
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

      // Magnetic linking resize action
      resizeSceneTo: (id: string, edge: "left" | "right", targetMs: number, minMs: number, gridMs: number, pxPerSec: number) => {
        const { scenes: s, durationMs, triggerSnapAnimation } = get();
        const sortedScenes = [...s].sort((a,b)=>a.startMs-b.startMs);

        const i = sortedScenes.findIndex(sc => sc.id === id);
        if (i < 0) return;

        const cur = sortedScenes[i];
        
        // Only consider scenes in the same track for magnetic linking
        const scenesInSameTrack = sortedScenes.filter(sc => sc.trackId === cur.trackId);
        const iInTrack = scenesInSameTrack.findIndex(sc => sc.id === id);
        const prev = iInTrack > 0 ? scenesInSameTrack[iInTrack - 1] : null;
        const next = iInTrack < scenesInSameTrack.length - 1 ? scenesInSameTrack[iInTrack + 1] : null;

        const snapMs = pxToMs(SNAP_PX, pxPerSec);
        const unlinkMs = pxToMs(UNLINK_PX, pxPerSec);

        if (edge === "left") {
          const low  = prev ? (prev.startMs + minMs) : 0;
          const high = cur.endMs - minMs;

          // snap, then clamp
          let newStart = snapToGrid(targetMs, gridMs);
          newStart = bounds(newStart, low, high);

          const wasLinked = !!cur.linkLeftId && prev && cur.linkLeftId === prev.id;

          if (wasLinked && prev) {
            // ripple only if linked: keep contact and trim prev
            const delta = newStart - cur.startMs;
            cur.startMs = newStart;
            prev.endMs  = bounds(prev.endMs + delta, prev.startMs + minMs, cur.startMs);
            // keep exact contact
            cur.startMs = prev.endMs;
          } else {
            // not linked: don't affect prev
            cur.startMs = newStart;

            // magnet: if close enough to prev.end => snap + link (only within same track)
            if (prev && prev.trackId === cur.trackId) {
              const gap = cur.startMs - prev.endMs; // >= 0 if separated
              if (gap >= 0 && gap <= snapMs) {
                // snap & link
                cur.startMs = prev.endMs;
                linkLeft(cur, prev, triggerSnapAnimation);
              } else {
                // if previously linked, only break when gap is clearly big
                if (cur.linkLeftId === prev?.id && (gap > unlinkMs || gap < 0)) {
                  unlinkLeft(cur, prev);
                }
              }
            }
          }
        } else {
          // RIGHT EDGE
          const low  = cur.startMs + minMs;
          // IMPORTANT: use next.end for upper bound so it doesn't collapse while trimming
          const high = next ? (next.endMs - minMs) : Number.MAX_SAFE_INTEGER;

          let newEnd = snapToGrid(targetMs, gridMs);
          newEnd = bounds(newEnd, low, high);

          const wasLinked = !!cur.linkRightId && next && cur.linkRightId === next.id;

          if (wasLinked && next) {
            // ripple only if linked: keep contact and trim next
            const delta = newEnd - cur.endMs;
            cur.endMs = newEnd;
            next.startMs = bounds(next.startMs + delta, cur.endMs, next.endMs - minMs);
            // keep exact contact
            cur.endMs = next.startMs;
          } else {
            // not linked: don't affect next
            cur.endMs = newEnd;

            // magnet: close to next.start => snap + link (only within same track)
            if (next && next.trackId === cur.trackId) {
              const gap = next.startMs - cur.endMs; // >= 0 if separated
              if (gap >= 0 && gap <= snapMs) {
                cur.endMs = next.startMs;
                linkRight(cur, next, triggerSnapAnimation);
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
      const newTrack = { id: nanoid(), name: trackName, type: trackType };
      
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
    
    const scene = { 
      id, 
      startMs: at, 
      endMs: at + dflt, 
      label, 
      assetId, 
      trackId: defaultTrack.id,
      linkLeftId: null, 
      linkRightId: null 
    };
    
    console.log('🎬 FINAL SCENE CREATION:', { 
      sceneId: id, 
      trackId: defaultTrack.id, 
      trackName: defaultTrack.name,
      startMs: at, 
      endMs: at + dflt,
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
      const newTrack = { id: nanoid(), name: trackName, type: trackType };
      
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
    
    const clip = { id, startMs: at, endMs: at + dflt, assetId, kind, originalDurationMs: dflt, trackId: defaultTrack.id };
    set({ audioClips: [...get().audioClips, clip].sort((a,b)=>a.startMs-b.startMs) });
    get().normalizeDuration();
    set(state => ({ history: { ...state.history, future: [] }}));
    
    // Try to get actual audio duration and update the clip
    const asset = useAssetsStore.getState().getById(assetId);
    if (asset && asset.url) {
      const audio = new Audio(asset.url);
      audio.addEventListener('loadedmetadata', () => {
        const actualDurationMs = audio.duration * 1000;
        if (actualDurationMs > 0 && actualDurationMs !== Infinity) {
          console.log('🎵 Loading actual audio duration:', { assetId, actualDurationMs });
          set(state => ({
            audioClips: state.audioClips.map(c => 
              c.id === id ? { ...c, endMs: c.startMs + actualDurationMs, originalDurationMs: actualDurationMs } : c
            )
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
    
    // Calculate precise grid snapping for frame-accurate cuts
    const frameMs = 1000 / fps; // milliseconds per frame
    const snappedMs = snapToGrid(ms, frameMs);
    
    // Try to split selected scene first
    if (selectedSceneId) {
      const scene = scenes.find(s => s.id === selectedSceneId);
      if (scene && snappedMs > scene.startMs && snappedMs < scene.endMs) {
        get().beginTx("Split scene at playhead");
        
        const sceneA = {
          ...scene,
          id: nanoid(),
          endMs: snappedMs,
          linkRightId: null
        };
        
        const sceneB = {
          ...scene,
          id: nanoid(),
          startMs: snappedMs,
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
        
        // Calculate the audio offset for each segment
        const originalAudioOffset = audio.audioOffsetMs || 0;
        const timelineOffset = snappedMs - audio.startMs;
        
        const audioA = {
          ...audio,
          id: nanoid(),
          endMs: snappedMs,
          audioOffsetMs: originalAudioOffset // First segment starts at original offset
        };
        
        const audioB = {
          ...audio,
          id: nanoid(),
          startMs: snappedMs,
          audioOffsetMs: originalAudioOffset + timelineOffset // Second segment continues from cut point
        };
        
        console.log('🎵 AUDIO SPLIT DEBUG:', {
          originalClip: { 
            id: audio.id,
            startMs: audio.startMs, 
            endMs: audio.endMs, 
            durationMs: audio.endMs - audio.startMs,
            audioOffsetMs: audio.audioOffsetMs,
            assetId: audio.assetId
          },
          splitAt: snappedMs,
          timelineOffset,
          audioA: { 
            id: audioA.id,
            startMs: audioA.startMs, 
            endMs: audioA.endMs, 
            durationMs: audioA.endMs - audioA.startMs,
            audioOffsetMs: audioA.audioOffsetMs,
            assetId: audioA.assetId
          },
          audioB: { 
            id: audioB.id,
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
    const { scenes, audioClips } = get();
    
    // Shift scenes
    const newScenes = scenes.map(scene => {
      if (scene.startMs >= ms) {
        return { ...scene, startMs: Math.max(0, scene.startMs + deltaMs), endMs: Math.max(0, scene.endMs + deltaMs) };
      }
      return scene;
    });
    
    // Shift audio clips
    const newAudioClips = audioClips.map(audio => {
      if (audio.startMs >= ms) {
        return { ...audio, startMs: Math.max(0, audio.startMs + deltaMs), endMs: Math.max(0, audio.endMs + deltaMs) };
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
    const { selectedSceneId, selectedAudioId, scenes, audioClips } = get();
    
    if (selectedSceneId) {
      get().beginTx("Duplicate scene");
      
      const scene = scenes.find(s => s.id === selectedSceneId);
      if (!scene) return;
      
      const duration = scene.endMs - scene.startMs;
      const newStartMs = scene.endMs;
      
      const duplicatedScene = {
        ...scene,
        id: nanoid(),
        startMs: newStartMs,
        endMs: newStartMs + duration,
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
      
      const duration = audio.endMs - audio.startMs;
      const newStartMs = audio.endMs;
      
      const duplicatedAudio = {
        ...audio,
        id: nanoid(),
        startMs: newStartMs,
        endMs: newStartMs + duration
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
    const { audioClips, durationMs, triggerSnapAnimation } = get();
    const audioIndex = audioClips.findIndex(a => a.id === id);
    if (audioIndex < 0) return;

    const audio = audioClips[audioIndex];
    const audioDuration = audio.endMs - audio.startMs;
    const newEndMs = newStartMs + audioDuration;
    const adjustedStartMs = Math.max(0, newEndMs - audioDuration);

    // Create updated audio
    const updatedAudio = {
      ...audio,
      startMs: adjustedStartMs,
      endMs: newEndMs
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
    const unlinkMs = pxToMs(UNLINK_PX, pxPerSec);

    // Check left edge magnetic linking
    if (prevAudio) {
      const gap = movedAudio.startMs - prevAudio.endMs;
      if (gap >= 0 && gap <= snapMs) {
        // Snap & link to previous audio
        movedAudio.startMs = prevAudio.endMs;
        movedAudio.endMs = movedAudio.startMs + audioDuration;
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
        // Snap & link to next audio
        movedAudio.endMs = nextAudio.startMs;
        movedAudio.startMs = movedAudio.endMs - audioDuration;
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
      duration: audioDuration,
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
    
    const { audioClips: a, durationMs, triggerSnapAnimation } = get();
    const audioClips = [...a]; // Don't sort here, assume already sorted

    const i = audioClips.findIndex(ac => ac.id === id);
    if (i < 0) {
      console.log('🎵 RESIZE AUDIO TO: Clip not found:', id);
      return;
    }

    const cur = audioClips[i];
    console.log('🎵 RESIZE AUDIO TO: Found clip:', {
      id: cur.id,
      startMs: cur.startMs,
      endMs: cur.endMs,
      audioOffsetMs: cur.audioOffsetMs,
      originalDurationMs: cur.originalDurationMs
    });
    const prev = audioClips[i-1];
    const next = audioClips[i+1];

    // Use the stored original duration to constrain resizing
    const maxDurationMs = cur.originalDurationMs || Infinity;

    const snapMs = pxToMs(SNAP_PX, pxPerSec);
    const unlinkMs = pxToMs(UNLINK_PX, pxPerSec);

    if (edge === "left") {
      const low  = prev ? (prev.startMs + minMs) : 0;
      const high = cur.endMs - minMs;
      // Don't exceed original audio duration - use original duration, not current
      const maxStartMs = cur.endMs - maxDurationMs;

      // snap, then clamp
      let newStart = snapToGrid(targetMs, gridMs);
      newStart = bounds(newStart, Math.max(low, maxStartMs), high);

      // Calculate the change in timeline position
      const timelineOffsetChange = newStart - cur.startMs;
      
      // Update audioOffsetMs to reflect the trim
      const currentAudioOffset = cur.audioOffsetMs || 0;
      const newAudioOffset = currentAudioOffset + timelineOffsetChange;
      
      console.log('🎵 LEFT EDGE TRIM DEBUG:', {
        clipId: cur.id,
        oldStartMs: cur.startMs,
        newStartMs: newStart,
        timelineOffsetChange: timelineOffsetChange,
        oldAudioOffsetMs: currentAudioOffset,
        newAudioOffsetMs: newAudioOffset,
        clipDurationMs: cur.endMs - cur.startMs
      });

      cur.startMs = newStart;
      cur.audioOffsetMs = newAudioOffset;

      // magnet: if close enough to prev.end => snap + link
      if (prev) {
        const gap = cur.startMs - prev.endMs; // >= 0 if separated
        if (gap >= 0 && gap <= snapMs) {
          // snap & link
          cur.startMs = prev.endMs;
          // Recalculate audioOffsetMs after magnetic snap
          const snapOffsetChange = cur.startMs - newStart;
          cur.audioOffsetMs = newAudioOffset + snapOffsetChange;
          
          if (triggerSnapAnimation) {
            triggerSnapAnimation(cur.id);
            triggerSnapAnimation(prev.id);
          }
        }
      }
    } else {
      // RIGHT EDGE
      const low  = cur.startMs + minMs;
      const high = next ? (next.endMs - minMs) : Number.MAX_SAFE_INTEGER;
      // Don't exceed original audio duration - use original duration, not current
      const maxEndMs = cur.startMs + maxDurationMs;

      let newEnd = snapToGrid(targetMs, gridMs);
      newEnd = bounds(newEnd, low, Math.min(high, maxEndMs));

      console.log('🎵 RIGHT EDGE TRIM DEBUG:', {
        clipId: cur.id,
        oldEndMs: cur.endMs,
        newEndMs: newEnd,
        oldAudioOffsetMs: cur.audioOffsetMs || 0,
        clipDurationMs: cur.endMs - cur.startMs,
        newDurationMs: newEnd - cur.startMs,
        note: 'audioOffsetMs stays the same for right edge trim'
      });

      cur.endMs = newEnd;
      // Note: audioOffsetMs stays the same for right edge trimming
      // Only the visible duration changes, not the starting point in the audio file

      // magnet: close to next.start => snap + link
      if (next) {
        const gap = next.startMs - cur.endMs; // >= 0 if separated
        if (gap >= 0 && gap <= snapMs) {
          cur.endMs = next.startMs;
          if (triggerSnapAnimation) {
            triggerSnapAnimation(cur.id);
            triggerSnapAnimation(next.id);
          }
        }
      }
    }

    console.log('🎵 RESIZE AUDIO TO: Final clip state:', {
      id: cur.id,
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