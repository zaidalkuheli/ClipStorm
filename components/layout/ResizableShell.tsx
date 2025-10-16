"use client";
import React from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { AssetsPanel } from "@/components/panels/AssetsPanel";
import { PreviewPanel } from "@/components/panels/PreviewPanel";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { ClientOnly } from "@/components/ui/ClientOnly";

/**
 * Notes:
 * - Top minSize 12% → can shrink A LOT (so timeline can grow).
 * - Bottom minSize 10% → can also shrink enough.
 * - No rounding/snap here to avoid fighting the user. (You can add gentle
 *   snap later with step=2 if you want.)
 */
export function ResizableShell() {
  return (
    <ClientOnly fallback={
      <div className="h-[calc(100vh-48px)] w-screen flex">
        <div className="flex-1 bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-lg m-2">
          <div className="p-4 text-sm text-[var(--text-tertiary)]">Loading editor...</div>
        </div>
      </div>
    }>
      <ResizableShellContent />
    </ClientOnly>
  );
}

function ResizableShellContent() {
  // Use consistent initial values to prevent hydration mismatch
  const [hLayout, setHLayout] = React.useState<number[]>([20, 60, 20]);
  const [vLayout, setVLayout] = React.useState<number[]>([70, 30]);

  // Load from localStorage after hydration
  React.useEffect(() => {
    const savedHLayout = localStorage.getItem("cs:layout:h");
    const savedVLayout = localStorage.getItem("cs:layout:v");
    
    if (savedHLayout) {
      try {
        setHLayout(JSON.parse(savedHLayout));
      } catch (e) {
        console.warn("Failed to parse hLayout from localStorage");
      }
    }
    
    if (savedVLayout) {
      try {
        setVLayout(JSON.parse(savedVLayout));
      } catch (e) {
        console.warn("Failed to parse vLayout from localStorage");
      }
    }
  }, []);

  // Save to localStorage when layout changes
  const handleHLayoutChange = React.useCallback((layout: number[]) => {
    setHLayout(layout);
    localStorage.setItem("cs:layout:h", JSON.stringify(layout));
  }, []);

  const handleVLayoutChange = React.useCallback((layout: number[]) => {
    setVLayout(layout);
    localStorage.setItem("cs:layout:v", JSON.stringify(layout));
  }, []);

  return (
    <div className="h-[calc(100vh-48px)] w-screen">
      <PanelGroup
        direction="vertical"
        layout={vLayout}
        onLayout={handleVLayoutChange}
      >
        {/* TOP: Assets | Player | Inspector */}
        <Panel minSize={12}>
          <PanelGroup
            direction="horizontal"
            layout={hLayout}
            onLayout={handleHLayoutChange}
          >
            <Panel minSize={14}><AssetsPanel /></Panel>
            <PanelResizeHandle className="ResizeHandle" />
            <Panel minSize={36}><PreviewPanel /></Panel>
            <PanelResizeHandle className="ResizeHandle" />
            <Panel minSize={14}><InspectorPanel /></Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="ResizeHandle" />

        {/* BOTTOM: Timeline */}
        <Panel minSize={10}>
          <Timeline />
        </Panel>
      </PanelGroup>
    </div>
  );
}