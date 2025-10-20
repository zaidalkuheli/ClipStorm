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
      <div className="sticky top-0 z-10 -mx-2 -mt-2 px-2 pt-2 pb-1 bg-[var(--surface-primary)]/60 backdrop-blur-sm border-b border-[var(--border-primary)]">
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

      {/* Minimal placeholder content only; avoids taking space until real controls land */}
      <div className="flex-1 h-full flex items-center justify-center text-[10px] text-[var(--text-tertiary)]">
        {selection ? 'Controls will appear here.' : 'Select an item to inspect.'}
      </div>
    </Panel>
  );
}