import { AppHeader } from "@/components/layout/AppHeader";
import { ResizableShell } from "@/components/layout/ResizableShell";

export function EditorShell() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <AppHeader />
      <ResizableShell />
    </div>
  );
}