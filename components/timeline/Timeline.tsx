"use client";
import { Panel } from "@/components/ui/Panel";
import { useEditorStore } from "@/stores/editorStore";
import { Ruler } from "./Ruler";
import { SceneBlocks } from "./SceneBlocks";
import { Playhead } from "./Playhead";
import { useEffect, useRef } from "react";

export function Timeline() {
  const durationMs = useEditorStore(s => s.durationMs);
  const pxPerSec = useEditorStore(s => s.pxPerSec);
  const zoomIn = useEditorStore(s => s.zoomIn);
  const zoomOut = useEditorStore(s => s.zoomOut);
  const setPlayhead = useEditorStore(s => s.setPlayhead);
  const nudgePlayhead = useEditorStore(s => s.nudgePlayhead);
  const togglePlayback = useEditorStore(s => s.togglePlayback);
  const selectScene = useEditorStore(s => s.selectScene);
  const addScene = useEditorStore(s => s.addScene);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentWidth = Math.max(1, (durationMs / 1000) * pxPerSec);

  // Mouse wheel to zoom at mouse position (Ctrl/⌘ for fine control)
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      // Check if we're hovering over the timeline content area
      const rect = sc.getBoundingClientRect();
      const isOverTimeline = e.clientX >= rect.left && e.clientX <= rect.right && 
                            e.clientY >= rect.top && e.clientY <= rect.bottom;
      
      if (!isOverTimeline) return;
      
      // Allow zoom with regular scroll, or Ctrl/⌘ for fine control
      const isZoomIntent = e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 50;
      
      if (!isZoomIntent) return;
      
      e.preventDefault();
      const prevPxPerSec = pxPerSec;
      const mouseX = e.clientX - rect.left + sc.scrollLeft; // content coord
      
      // Different zoom factors for regular vs Ctrl/⌘ scroll
      const baseZoomFactor = e.ctrlKey || e.metaKey ? 1.1 : 1.3;
      const zoomFactor = e.deltaY < 0 ? baseZoomFactor : 1 / baseZoomFactor;

      // compute new zoom & keep the mouse focus point stable
      const newPxPerSec = Math.min(500, Math.max(20, prevPxPerSec * zoomFactor));
      const scale = newPxPerSec / prevPxPerSec;
      sc.scrollLeft = mouseX * scale - (e.clientX - rect.left);

      // update store after scrollLeft adjust
      if (zoomFactor > 1) zoomIn(); else zoomOut();
      
      console.log('🔍 Timeline zoom:', { 
        from: prevPxPerSec, 
        to: newPxPerSec, 
        factor: zoomFactor,
        mouseX: Math.round(mouseX),
        scrollLeft: Math.round(sc.scrollLeft)
      });
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => sc.removeEventListener("wheel", onWheel);
  }, [pxPerSec, zoomIn, zoomOut]);

      // Click to set playhead (anywhere in content, but not on scene blocks)
      const onPointerDown = (e: React.PointerEvent) => {
        // Don't interfere with scene block dragging
        const target = e.target as HTMLElement;
        if (target.closest('.timeline-scene')) {
          console.log('🎬 Ignoring timeline click - scene block interaction');
          return;
        }
        
        // Deselect any selected scene when clicking on empty timeline area
        selectScene(null);
        
        const sc = scrollRef.current;
        if (!sc) return;
        const rect = sc.getBoundingClientRect();
        const x = e.clientX - rect.left + sc.scrollLeft;
        const ms = Math.max(0, (x / pxPerSec) * 1000); // Ensure never goes below 0
        console.log('🎬 Setting playhead to:', ms);
        setPlayhead(ms);
      };

  // Keyboard nudges (Left/Right 100ms) and Spacebar play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); nudgePlayhead(-100); }
      if (e.key === "ArrowRight") { e.preventDefault(); nudgePlayhead(100); }
      if (e.key === " " || e.key === "Spacebar") { 
        e.preventDefault(); 
        togglePlayback(); 
      }
      if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) e.preventDefault(); // reserve for future
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudgePlayhead, togglePlayback]);

  return (
    <Panel className="h-full relative timeline-container">
      <div className="flex h-full min-h-0 flex-col">
            {/* Controls row */}
            <div className="flex items-center justify-between px-3 py-1 text-xs text-[var(--muted)]">
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                <span>Duration: {(durationMs / 1000).toFixed(1)}s</span>
                <span>Zoom: {Math.round(pxPerSec)}px/s</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="badge" onClick={zoomOut}>Zoom Out</button>
                <button className="badge" onClick={zoomIn}>Zoom In</button>
                <button 
                  className="badge bg-green-600/20 text-green-400 border-green-500/30" 
                  onClick={() => addScene({ 
                    label: `Scene ${Math.floor(Math.random() * 100)}`, 
                    startMs: durationMs, 
                    endMs: durationMs + 3000 
                  })}
                >
                  + Add Scene
                </button>
              </div>
            </div>

        {/* Scroll area: ruler + tracks share the same scroll container for perfect alignment */}
        <div className="relative flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* Left labels column - fixed position, NOT scrollable */}
            <div className="flex-shrink-0 w-16 px-2 bg-[var(--surface-primary)] border-r border-[var(--border-primary)] select-none">
              {/* Timeline label aligned with ruler */}
              <div className="h-8 flex items-center text-[10px] text-[var(--text-secondary)] font-medium select-none">Timeline</div>
              {/* Video label aligned with scenes */}
              <div className="h-16 flex items-center text-xs text-[var(--muted)] select-none">Video</div>
              {/* Audio label aligned with audio track */}
              <div className="h-12 flex items-center text-xs text-[var(--muted)] select-none">Audio</div>
            </div>
            
                {/* Timeline content - scrollable, starts from 0 */}
                <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden timeline-scroll-area" onPointerDown={onPointerDown}>
              <div className="relative" style={{ width: contentWidth }}>
                {/* Ruler */}
                <Ruler contentWidth={contentWidth} />

                {/* Tracks */}
                <div className="pb-3">
                  <div className="mb-2">
                    <SceneBlocks />
                  </div>
                  <div>
                    <div className="h-12 rounded-md border border-[var(--border)] bg-[#0f1116]/60 p-2 flex gap-2">
                      <div className="w-36 rounded-sm bg-[#1a1c24]" />
                      <div className="w-40 rounded-sm bg-[#1a1c24]" />
                    </div>
                  </div>
                </div>

                {/* Playhead (on top of everything inside scroll content) */}
                <Playhead scrollRef={scrollRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}