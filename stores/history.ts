// stores/history.ts
export type HistorySnapshot = {
  scenes: { 
    id: string; 
    startMs: number; 
    endMs: number; 
    label?: string; 
    linkLeftId?: string | null; 
    linkRightId?: string | null; 
  }[];
  audioClips: {
    id: string;
    startMs: number;
    endMs: number;
    assetId: string;
    kind: "vo" | "music";
    gain?: number;
    originalDurationMs: number;
  }[];
  durationMs: number;
  playheadMs: number;
};

export type History = {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  inTx: boolean;
  txBase?: HistorySnapshot;
  max: number;
};

export function cloneSnapshot(s: HistorySnapshot): HistorySnapshot {
  return {
    durationMs: s.durationMs,
    playheadMs: s.playheadMs,
    scenes: s.scenes.map(sc => ({ ...sc })),
    audioClips: s.audioClips.map(ac => ({ ...ac })),
  };
}

export function makeSnapshot(src: {
  scenes: HistorySnapshot["scenes"];
  audioClips: HistorySnapshot["audioClips"];
  durationMs: number;
  playheadMs: number;
}): HistorySnapshot {
  return cloneSnapshot({
    scenes: src.scenes.map(sc => ({ ...sc })),
    audioClips: src.audioClips.map(ac => ({ ...ac })),
    durationMs: src.durationMs,
    playheadMs: src.playheadMs,
  });
}

export function applySnapshot(dest: {
  setScenes: (scenes: HistorySnapshot["scenes"]) => void;
  setAudioClips: (audioClips: HistorySnapshot["audioClips"]) => void;
  setDuration: (ms: number) => void;
  setPlayhead: (ms: number) => void;
}, snap: HistorySnapshot) {
  dest.setScenes(snap.scenes.map(sc => ({ ...sc })));
  dest.setAudioClips(snap.audioClips.map(ac => ({ ...ac })));
  dest.setDuration(snap.durationMs);
  dest.setPlayhead(snap.playheadMs);
}
