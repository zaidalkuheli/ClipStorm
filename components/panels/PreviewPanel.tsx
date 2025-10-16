"use client";
import { Panel } from "@/components/ui/Panel";
import { AutoFitFrame } from "@/components/player/AutoFitFrame";
import { useEditorStore } from "@/stores/editorStore";

export function PreviewPanel() {
  const aspect = useEditorStore(s => s.aspect);
  const showGrid = useEditorStore(s => s.showGrid);
  const showSafeArea = useEditorStore(s => s.showSafeArea);

  return (
    <div className="h-full w-full">
      <AutoFitFrame aspect={aspect} showGrid={showGrid} showSafeArea={showSafeArea} />
    </div>
  );
}