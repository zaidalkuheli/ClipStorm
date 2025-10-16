"use client";
import { Panel } from "@/components/ui/Panel";
import { AutoFitFrame } from "@/components/player/AutoFitFrame";
import { useEditorStore } from "@/stores/editorStore";

export function PreviewPanel() {
  const aspect = useEditorStore(s => s.aspect);
  const showGrid = useEditorStore(s => s.showGrid);
  const showSafeArea = useEditorStore(s => s.showSafeArea);

  return (
    <Panel
      title="Player"
      className="h-full"
    >
      {/* Because .panel-body is now flex-1 column, this fills perfectly */}
      <div className="relative flex-1 min-h-[160px]">
        <AutoFitFrame aspect={aspect} showGrid={showGrid} showSafeArea={showSafeArea} />
      </div>
    </Panel>
  );
}