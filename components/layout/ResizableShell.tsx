"use client";
import React from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { AssetsPanel } from "@/components/panels/AssetsPanel";
import { PreviewPanel } from "@/components/panels/PreviewPanel";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { useProjectStore } from "@/stores/projectStore";

/**
 * ResizableShell - Main layout component with persistent panel sizing
 * Features:
 * - Horizontal layout: Assets (15%) | Player (70%) | Inspector (15%)
 * - Vertical layout: Main panels (80%) | Timeline (20%)
 * - Persistent layout via localStorage
 * - Hydration-safe with ClientOnly wrapper
 */
export function ResizableShell() {
  return (
    <ClientOnly fallback={
      <div className="h-[calc(100vh-32px)] w-screen flex">
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
  const [hLayout, setHLayout] = React.useState<number[]>([15, 70, 15]);
  const [vLayout, setVLayout] = React.useState<number[]>([80, 20]);
  
  // Project store for dirty state protection
  const dirty = useProjectStore(s => s.dirty);

  // Dirty state protection - warn on unload
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = ""; // Required for Chrome
        return ""; // Required for Safari
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Load from localStorage after hydration
  React.useEffect(() => {
    const savedHLayout = localStorage.getItem("cs:layout:h");
    const savedVLayout = localStorage.getItem("cs:layout:v");
    
    if (savedHLayout) {
      try {
        setHLayout(JSON.parse(savedHLayout));
      } catch {
        // Invalid layout data, use defaults
      }
    }
    
    if (savedVLayout) {
      try {
        setVLayout(JSON.parse(savedVLayout));
      } catch {
        // Invalid layout data, use defaults
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
    <div className="h-[calc(100vh-32px)] w-screen">
      <PanelGroup
        direction="vertical"
        layout={vLayout}
        onLayout={handleVLayoutChange}
      >
        {/* TOP: Assets | Player | Inspector */}
        <Panel minSize={8}>
          <PanelGroup
            direction="horizontal"
            layout={hLayout}
            onLayout={handleHLayoutChange}
          >
            <Panel minSize={10}><AssetsPanel /></Panel>
            <PanelResizeHandle className="ResizeHandle" />
            <Panel minSize={50}><PreviewPanel /></Panel>
            <PanelResizeHandle className="ResizeHandle" />
            <Panel minSize={10}><InspectorPanel /></Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="ResizeHandle" />

        {/* BOTTOM: Timeline */}
        <Panel minSize={8}>
          <Timeline />
        </Panel>
      </PanelGroup>
    </div>
  );
}