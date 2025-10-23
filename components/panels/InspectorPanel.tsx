import { Panel } from "@/components/ui/Panel";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

export function InspectorPanel() {
  const selectedSceneId = useEditorStore(s => s.selectedSceneId);
  const scenes = useEditorStore(s => s.scenes);
  const audioClips = useEditorStore(s => s.audioClips);
  const selectedAudioId = useEditorStore(s => s.selectedAudioId);
  const getAssetById = useAssetsStore(s => s.getById);
  const selectedAssetId = useAssetsStore(s => s.selectedAssetId);

  const selectedScene = selectedSceneId ? scenes.find(s => s.id === selectedSceneId) : undefined;
  const selectedAudio = selectedAudioId ? audioClips.find(a => a.id === selectedAudioId) : undefined;
  const selectedAsset = selectedAssetId ? getAssetById(selectedAssetId) : undefined;

  // Derive a concise selection summary
  const selection = (() => {
    if (selectedAsset) {
      return {
        kind: "asset" as const,
        name: selectedAsset.name,
        meta: selectedAsset.type,
        duration: selectedAsset.type === 'video' && selectedAsset.durationMs ? selectedAsset.durationMs : 0
      };
    }
    if (selectedScene) {
      const asset = selectedScene.assetId ? getAssetById(selectedScene.assetId) : null;
      const durationMs = selectedScene.endMs - selectedScene.startMs;
      return { 
        kind: "scene" as const, 
        name: asset?.name || selectedScene.label || "Scene", 
        meta: asset?.type || "",
        duration: durationMs
      };
    }
    if (selectedAudio) {
      const asset = selectedAudio.assetId ? getAssetById(selectedAudio.assetId) : null;
      const durationMs = selectedAudio.endMs - selectedAudio.startMs;
      return { 
        kind: "audio" as const, 
        name: asset?.name || "Audio Clip", 
        meta: selectedAudio.kind,
        duration: durationMs
      };
    }
    return null;
  })();

  return (
    <Panel title="Inspector" className="h-full">
      {/* Sticky summary header */}
      <div className="sticky top-0 z-10 -mx-2 -mt-2 px-2 pt-2 pb-1 bg-[var(--surface-primary)]/60 backdrop-blur-sm border-b border-[var(--border-primary)] select-none">
        {selection ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[var(--text-tertiary)] capitalize">{selection.kind}</div>
              <div className="text-sm text-[var(--text-primary)] truncate max-w-[220px]" title={selection.name}>{selection.name}</div>
              <div className="text-xs text-[var(--text-primary)] font-mono font-semibold">{formatDuration(selection.duration)}</div>
            </div>
            {selection.meta && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-primary)] text-[var(--text-tertiary)]">{selection.meta}</span>
            )}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-tertiary)]">No selection</div>
        )}
      </div>

      {/* Minimal content: show controls when audio or video scene selected; otherwise tiny hint */}
      {selectedAsset ? (
        <div className="flex-1 min-h-0 overflow-auto pt-2">
          <div className="space-y-2 text-[11px] text-[var(--text-primary)]">
            <Row label="Name" value={selectedAsset.name} />
            <Row label="Type" value={selectedAsset.type} />
            {(selectedAsset.type === 'video' || selectedAsset.type === 'audio') && (
              <Row label="Duration" value={selectedAsset.durationMs ? formatDuration(selectedAsset.durationMs) : '—'} />
            )}
            {selectedAsset.file ? (
              <Row label="Format" value={selectedAsset.file.type || '—'} />
            ) : selectedAsset.url ? (
              <Row label="URL" value={selectedAsset.url.startsWith('missing:') ? 'Missing file' : selectedAsset.url.split('?')[0]} />
            ) : null}
          </div>
        </div>
      ) : selectedAudio ? (
        <div className="flex-1 min-h-0 overflow-auto pt-2">
          <div className="space-y-3">
            {/* Duration Adjuster */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-secondary)] font-medium">Duration</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0.1}
                    max={selectedAudio.assetId ? (getAssetById(selectedAudio.assetId)?.originalDurationMs || 3600000) / 1000 : 3600}
                    step={0.1}
                    value={Math.round(((selectedAudio.endMs - selectedAudio.startMs) / 1000) * 10) / 10}
                    onChange={(e) => {
                      let inputValue = e.target.value;
                      // Replace comma with period for consistent parsing
                      inputValue = inputValue.replace(',', '.');
                      const value = Number(inputValue);
                      if (value <= 0) return; // Prevent 0 or negative values
                      
                      // Get the asset to check original duration
                      const asset = selectedAudio.assetId ? getAssetById(selectedAudio.assetId) : null;
                      const maxDurationSeconds = asset?.originalDurationMs ? asset.originalDurationMs / 1000 : Infinity;
                      
                      // Clamp to maximum audio length
                      const seconds = Math.min(Math.round(value * 10) / 10, maxDurationSeconds);
                      const newDurationMs = seconds * 1000;
                      const currentStartMs = selectedAudio.startMs;
                      const newEndMs = currentStartMs + newDurationMs;
                      useEditorStore.getState().resizeAudioTo(selectedAudio.id, "right", newEndMs, 100, 100, 100);
                    }}
                    className="w-16 h-5 text-[10px] text-center bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded px-1 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[10px] text-[var(--text-tertiary)]">s</span>
                </div>
              </div>
            </div>

            {/* Volume */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-secondary)] font-medium">Volume</span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{Math.round(((selectedAudio.gain ?? 1) * 100))}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((selectedAudio.gain ?? 1) * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  useEditorStore.getState().setAudioGain(selectedAudio.id, v / 100);
                }}
                className="w-full h-2 bg-[var(--surface-primary)] rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, var(--accent-cool) 0%, var(--accent-cool) ${Math.round((selectedAudio.gain ?? 1) * 100)}%, var(--surface-primary) ${Math.round((selectedAudio.gain ?? 1) * 100)}%, var(--surface-primary) 100%)`
                }}
              />
            </div>
            {/* Mute */}
            <label className="flex items-center justify-between p-2.5 border border-[var(--border-primary)] rounded-md bg-[var(--surface-secondary)]/60 cursor-pointer select-none hover:bg-[var(--surface-secondary)]/80 transition-colors">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Mute</span>
              <input
                type="checkbox"
                checked={(selectedAudio.gain ?? 1) === 0}
                onChange={() => useEditorStore.getState().toggleAudioMute(selectedAudio.id)}
                className="h-4 w-4 rounded border-[var(--border-primary)] bg-[var(--surface-primary)] text-[var(--accent-cool)] focus:ring-[var(--accent-cool)] focus:ring-2"
              />
            </label>

            {/* Fade In */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-secondary)] font-medium">Fade In</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={((selectedAudio.fadeInMs ?? 0) / 1000).toFixed(1)}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      const ms = Math.round(seconds * 1000);
                      useEditorStore.getState().setAudioFadeIn(selectedAudio.id, ms);
                    }}
                    className="w-12 h-5 text-[10px] text-center bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded px-1"
                  />
                  <span className="text-[10px] text-[var(--text-tertiary)]">s</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={selectedAudio.fadeInMs ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  useEditorStore.getState().setAudioFadeIn(selectedAudio.id, v);
                }}
                className="w-full h-2 bg-[var(--surface-primary)] rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, var(--accent-cool) 0%, var(--accent-cool) ${Math.round(((selectedAudio.fadeInMs ?? 0) / 5000) * 100)}%, var(--surface-primary) ${Math.round(((selectedAudio.fadeInMs ?? 0) / 5000) * 100)}%, var(--surface-primary) 100%)`
                }}
              />
            </div>

            {/* Fade Out */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-secondary)] font-medium">Fade Out</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={((selectedAudio.fadeOutMs ?? 0) / 1000).toFixed(1)}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      const ms = Math.round(seconds * 1000);
                      useEditorStore.getState().setAudioFadeOut(selectedAudio.id, ms);
                    }}
                    className="w-12 h-5 text-[10px] text-center bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded px-1"
                  />
                  <span className="text-[10px] text-[var(--text-tertiary)]">s</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={selectedAudio.fadeOutMs ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  useEditorStore.getState().setAudioFadeOut(selectedAudio.id, v);
                }}
                className="w-full h-2 bg-[var(--surface-primary)] rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, var(--accent-cool) 0%, var(--accent-cool) ${Math.round(((selectedAudio.fadeOutMs ?? 0) / 5000) * 100)}%, var(--surface-primary) ${Math.round(((selectedAudio.fadeOutMs ?? 0) / 5000) * 100)}%, var(--surface-primary) 100%)`
                }}
              />
            </div>
          </div>
        </div>
      ) : selectedScene ? (
        <div className="flex-1 min-h-0 overflow-auto pt-2">
          <div className="space-y-3">
            {/* Duration Adjuster */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[var(--text-secondary)] font-medium">Duration</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0.1}
                    max={3600}
                    step={0.1}
                    value={Math.round(((selectedScene.endMs - selectedScene.startMs) / 1000) * 10) / 10}
                    onChange={(e) => {
                      let inputValue = e.target.value;
                      // Replace comma with period for consistent parsing
                      inputValue = inputValue.replace(',', '.');
                      const value = Number(inputValue);
                      if (value <= 0) return; // Prevent 0 or negative values
                      const seconds = Math.round(value * 10) / 10; // Round to 1 decimal place
                      const newDurationMs = seconds * 1000;
                      const currentStartMs = selectedScene.startMs;
                      const newEndMs = currentStartMs + newDurationMs;
                      useEditorStore.getState().resizeSceneTo(selectedScene.id, "right", newEndMs, 100, 100, 100);
                    }}
                    className="w-16 h-5 text-[10px] text-center bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded px-1 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[10px] text-[var(--text-tertiary)]">s</span>
                </div>
              </div>
            </div>

            {/* Show video audio controls only if the scene has a video asset */}
            {(() => {
              const asset = selectedScene.assetId ? getAssetById(selectedScene.assetId) : null;
              const isVideo = asset?.type === 'video';
              
              if (!isVideo) {
                return null;
              }
              
              return (
                <>
                  {/* Volume */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[var(--text-secondary)] font-medium">Volume</span>
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{Math.round(((selectedScene.gain ?? 1) * 100))}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((selectedScene.gain ?? 1) * 100)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        useEditorStore.getState().setSceneGain(selectedScene.id, v / 100);
                      }}
                      className="w-full h-2 bg-[var(--surface-primary)] rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, var(--accent-cool) 0%, var(--accent-cool) ${Math.round((selectedScene.gain ?? 1) * 100)}%, var(--surface-primary) ${Math.round((selectedScene.gain ?? 1) * 100)}%, var(--surface-primary) 100%)`
                      }}
                    />
                  </div>
                  {/* Mute */}
                  <label className="flex items-center justify-between p-2.5 border border-[var(--border-primary)] rounded-md bg-[var(--surface-secondary)]/60 cursor-pointer select-none hover:bg-[var(--surface-secondary)]/80 transition-colors">
                    <span className="text-xs text-[var(--text-secondary)] font-medium">Mute</span>
                    <input
                      type="checkbox"
                      checked={selectedScene.muted ?? false}
                      onChange={() => useEditorStore.getState().toggleSceneMute(selectedScene.id)}
                      className="h-4 w-4 rounded border-[var(--border-primary)] bg-[var(--surface-primary)] text-[var(--accent-cool)] focus:ring-[var(--accent-cool)] focus:ring-2"
                    />
                  </label>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="flex-1 h-full flex items-center justify-center text-[10px] text-[var(--text-tertiary)]">
          Select an item to inspect.
        </div>
      )}
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 px-2 bg-[var(--surface-secondary)]/60 border border-[var(--border-primary)] rounded">
      <span className="text-[10px] text-[var(--text-secondary)]">{label}</span>
      <span className="text-[10px] text-[var(--text-primary)] truncate max-w-[160px] ml-2" title={value}>{value}</span>
    </div>
  );
}