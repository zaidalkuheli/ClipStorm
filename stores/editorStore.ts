"use client";
import { create } from "zustand";
import { nanoid } from "nanoid";
import { History, HistorySnapshot, makeSnapshot, cloneSnapshot, applySnapshot } from "./history";

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

export type Scene = { 
  id: string; 
  label?: string; 
  startMs: number; 
  endMs: number;
  // NEW: explicit neighbor links (only to immediate neighbors)
  linkLeftId?: string | null;
  linkRightId?: string | null;
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

  scenes: Scene[];
  selectedSceneId: string | null;
  snapAnimationId: string | null; // Track which scene just snapped for animation
  
  // history
  history: History;

  // actions
  setAspect: (aspect: AspectRatio) => void;
  setResolution: (resolution: Resolution) => void;
  setFps: (fps: FrameRate) => void;
  toggleSafeArea: () => void;
  toggleGrid: () => void;

  setScenes: (scenes: Scene[]) => void;
  setDuration: (durationMs: number) => void;
  addScene: (scene: Omit<Scene, 'id'>) => void;
  removeScene: (id: string) => void;
  moveScene: (id: string, newStartMs: number, pxPerSec: number) => void;
  resizeScene: (id: string, edge: "left" | "right", deltaMs: number, minMs: number, gridMs: number) => void;
  resizeSceneTo: (id: string, edge: "left" | "right", targetMs: number, minMs: number, gridMs: number, pxPerSec: number) => void;
  selectScene: (id: string | null) => void;
  triggerSnapAnimation: (id: string) => void;

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
    scenes: Scene[];
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

  // playback actions
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
}

const initialScenes = [
  { id: nanoid(), label: "Scene 1", startMs: 0, endMs: 5000 },
  { id: nanoid(), label: "Scene 2", startMs: 5000, endMs: 11000 },
  { id: nanoid(), label: "Scene 3", startMs: 11000, endMs: 17000 },
  { id: nanoid(), label: "Scene 4", startMs: 17000, endMs: 20000 }
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Calculate total duration based on scene blocks
const calculateTotalDuration = (scenes: Scene[]): number => {
  if (scenes.length === 0) return 20000; // default 20s
  
  // Find the maximum end time across all scenes
  const maxEndMs = Math.max(...scenes.map(s => s.endMs));
  
  // Add some padding (2 seconds) for better UX
  return maxEndMs + 2000;
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

  scenes: initialScenes,
  selectedSceneId: null,
  snapAnimationId: null,
  
  // history
  history: { past: [], future: [], inTx: false, max: 100 },

      setAspect: (aspect) => set({ aspect }),
  setResolution: (resolution) => set({ resolution }),
  setFps: (fps) => set({ fps }),
  toggleSafeArea: () => set(state => ({ showSafeArea: !state.showSafeArea })),
  toggleGrid: () => set(state => ({ showGrid: !state.showGrid })),

  setScenes: (scenes) => {
    const newDuration = calculateTotalDuration(scenes);
    console.log('📏 Updating duration based on scenes:', { 
      sceneCount: scenes.length, 
      maxEndMs: Math.max(...scenes.map(s => s.endMs)),
      newDurationMs: newDuration 
    });
    set({ scenes, durationMs: newDuration });
  },

  setDuration: (durationMs) => set({ durationMs }),

  addScene: (sceneData) => {
    const { scenes, durationMs } = get();
    const newScene: Scene = {
      id: nanoid(),
      ...sceneData
    };
    const updatedScenes = [...scenes, newScene].sort((a, b) => a.startMs - b.startMs);
    const newDuration = calculateTotalDuration(updatedScenes);
    console.log('➕ Added new scene:', { newScene, newDurationMs: newDuration });
    set({ scenes: updatedScenes, durationMs: newDuration });
  },

  removeScene: (id) => {
    const { scenes } = get();
    const updatedScenes = scenes.filter(s => s.id !== id);
    const newDuration = calculateTotalDuration(updatedScenes);
    console.log('➖ Removed scene:', { id, newDurationMs: newDuration });
    set({ scenes: updatedScenes, durationMs: newDuration });
  },

  moveScene: (id, newStartMs, pxPerSec) => {
    const { scenes, durationMs, triggerSnapAnimation } = get();
    const sceneIndex = scenes.findIndex(s => s.id === id);
    if (sceneIndex < 0) return;

    const scene = scenes[sceneIndex];
    const sceneDuration = scene.endMs - scene.startMs;
    const newEndMs = Math.min(durationMs, newStartMs + sceneDuration);
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

    // Apply magnetic linking after move
    const sortedScenes = [...updatedScenes].sort((a, b) => a.startMs - b.startMs);
    const movedIndex = sortedScenes.findIndex(s => s.id === id);
    const movedScene = sortedScenes[movedIndex];
    const prevScene = movedIndex > 0 ? sortedScenes[movedIndex - 1] : null;
    const nextScene = movedIndex < sortedScenes.length - 1 ? sortedScenes[movedIndex + 1] : null;

    const snapMs = pxToMs(SNAP_PX, pxPerSec);
    const unlinkMs = pxToMs(UNLINK_PX, pxPerSec);

    // Check left edge magnetic linking
    if (prevScene) {
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

    // Check right edge magnetic linking
    if (nextScene) {
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
    const newDuration = calculateTotalDuration(sortedScenes);
    
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
          const newEnd = Math.min(next ? next.startMs - minMs : get().durationMs, cur.endMs + deltaMs);
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
        const scenes = [...s].sort((a,b)=>a.startMs-b.startMs);

        const i = scenes.findIndex(sc => sc.id === id);
        if (i < 0) return;

        const cur = scenes[i];
        const prev = scenes[i-1];
        const next = scenes[i+1];

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

            // magnet: if close enough to prev.end => snap + link
            if (prev) {
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
          const high = next ? (next.endMs - minMs) : durationMs;

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

            // magnet: close to next.start => snap + link
            if (next) {
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

        set({ scenes });
      },

      selectScene: (id) => set({ selectedSceneId: id }),

      triggerSnapAnimation: (id) => {
        set({ snapAnimationId: id });
        // Clear animation after it completes
        setTimeout(() => set({ snapAnimationId: null }), 400);
      },

      setPlayhead: (ms) => {
    const durationMs = get().durationMs;
    set({ playheadMs: clamp(ms, 0, durationMs) });
  },
  nudgePlayhead: (deltaMs) => {
    const { playheadMs, durationMs } = get();
    set({ playheadMs: clamp(playheadMs + deltaMs, 0, durationMs) });
  },

  setZoom: (pxPerSec) => set({ pxPerSec: clamp(pxPerSec, 20, 500) }),
  zoomIn: () => set(state => ({ pxPerSec: clamp(state.pxPerSec * 1.2, 20, 500) })),
  zoomOut: () => set(state => ({ pxPerSec: clamp(state.pxPerSec / 1.2, 20, 500) })),

  // playback actions
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlayback: () => set(state => ({ isPlaying: !state.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: clamp(speed, 0.1, 4.0) }),

  // history actions
  getSnapshot: (): HistorySnapshot => {
    const { scenes, durationMs, playheadMs } = get();
    // ensure scenes are sorted & normalized
    const sorted = [...scenes].sort((a,b)=>a.startMs-b.startMs).map(s=>({ ...s }));
    return makeSnapshot({ scenes: sorted, durationMs, playheadMs });
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
        setScenes: (scenes)=> set({ scenes }),
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
        setScenes: (scenes)=> set({ scenes }),
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
        setScenes: (scenes)=> set({ scenes }),
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
    const { scenes, durationMs, fps, aspect, resolution } = get();
    return {
      scenes: [...scenes].sort((a, b) => a.startMs - b.startMs),
      durationMs,
      fps,
      aspect,
      resolution,
    };
  },
}));