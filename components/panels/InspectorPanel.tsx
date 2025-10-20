import { Panel } from "@/components/ui/Panel";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";

export function InspectorPanel() {
  const selectedSceneId = useEditorStore(s => s.selectedSceneId);
  const scenes = useEditorStore(s => s.scenes);
  const audioClips = useEditorStore(s => s.audioClips);
  const selectedAudioId = useEditorStore(s => s.selectedAudioId);
  const getAssetById = useAssetsStore(s => s.getById);

  const selectedScene = selectedSceneId ? scenes.find(s => s.id === selectedSceneId) : undefined;
  const selectedAudio = selectedAudioId ? audioClips.find(a => a.id === selectedAudioId) : undefined;

  // Derive a concise selection summary
  const selection = (() => {
    if (selectedScene) {
      const asset = selectedScene.assetId ? getAssetById(selectedScene.assetId) : null;
      return { kind: "scene" as const, name: asset?.name || selectedScene.label || "Scene", meta: asset?.type || "" };
    }
    if (selectedAudio) {
      const asset = selectedAudio.assetId ? getAssetById(selectedAudio.assetId) : null;
      return { kind: "audio" as const, name: asset?.name || "Audio Clip", meta: selectedAudio.kind };
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
            </div>
            {selection.meta && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-primary)] text-[var(--text-tertiary)]">{selection.meta}</span>
            )}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-tertiary)]">No selection</div>
        )}
      </div>

      {/* Minimal content: show audio controls when audio selected; otherwise tiny hint */}
      {selectedAudio ? (
        <div className="flex-1 min-h-0 overflow-auto pt-2">
          <div className="space-y-3">
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