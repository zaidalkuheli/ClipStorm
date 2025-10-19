"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Scissors } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useEditorStore } from "@/stores/editorStore";
import { Ruler } from "./Ruler";
import { SceneBlocks } from "./SceneBlocks";
import { AudioBlocks } from "./AudioBlocks";
import { Playhead } from "./Playhead";
import { BlockContextMenu } from "./BlockContextMenu";

export function Timeline() {
  const durationMs = useEditorStore(s => s.durationMs);
  const pxPerSec = useEditorStore(s => s.pxPerSec);
  const zoomIn = useEditorStore(s => s.zoomIn);
  const zoomOut = useEditorStore(s => s.zoomOut);
  const zoomToPlayhead = useEditorStore(s => s.zoomToPlayhead);
  const setPlayhead = useEditorStore(s => s.setPlayhead);
  const nudgePlayhead = useEditorStore(s => s.nudgePlayhead);
  const togglePlayback = useEditorStore(s => s.togglePlayback);
  const selectScene = useEditorStore(s => s.selectScene);
  const addScene = useEditorStore(s => s.addScene);
  const selectedSceneId = useEditorStore(s => s.selectedSceneId);
  const removeScene = useEditorStore(s => s.removeScene);
  const scenes = useEditorStore(s => s.scenes); // Add scenes state
  const audioClips = useEditorStore(s => s.audioClips);
  const pxToMs = useEditorStore(s => s.pxToMs);
  const beginTx = useEditorStore(s => s.beginTx);
  const commitTx = useEditorStore(s => s.commitTx);
  const addSceneFromAsset = useEditorStore(s => s.addSceneFromAsset);
  const addAudioFromAsset = useEditorStore(s => s.addAudioFromAsset);

  // Core editing actions
  const playheadMs = useEditorStore(s => s.playheadMs);
  const splitAt = useEditorStore(s => s.splitAt);
  const deleteSelection = useEditorStore(s => s.deleteSelection);
  const duplicateSelection = useEditorStore(s => s.duplicateSelection);
  const selectedAudioId = useEditorStore(s => s.selectedAudioId);
  const fps = useEditorStore(s => s.fps);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentWidth = Math.max(1, (durationMs / 1000) * pxPerSec);

  // Calculate precise cut position with frame snapping
  const getPreciseCutPosition = () => {
    const frameMs = 1000 / fps; // milliseconds per frame
    return Math.round(playheadMs / frameMs) * frameMs;
  };

  // Smart zoom functions that zoom around viewport center (like mouse wheel)
  const handleZoomIn = () => {
    const scrollContainer = contentRef.current;
    if (!scrollContainer) {
      zoomIn();
      return;
    }
    
    const prevPxPerSec = pxPerSec;
    const newPxPerSec = Math.min(1000, Math.max(5, prevPxPerSec * 1.2));
    const scale = newPxPerSec / prevPxPerSec;
    
    // Calculate viewport center
    const containerWidth = scrollContainer.clientWidth;
    const viewportCenter = scrollContainer.scrollLeft + (containerWidth / 2);
    
    // Apply zoom
    zoomIn();
    
    // Adjust scroll to keep viewport center stable
    const newViewportCenter = viewportCenter * scale;
    scrollContainer.scrollLeft = newViewportCenter - (containerWidth / 2);
  };

  const handleZoomOut = () => {
    const scrollContainer = contentRef.current;
    if (!scrollContainer) {
      zoomOut();
      return;
    }
    
    const prevPxPerSec = pxPerSec;
    const newPxPerSec = Math.min(1000, Math.max(5, prevPxPerSec / 1.2));
    const scale = newPxPerSec / prevPxPerSec;
    
    // Calculate viewport center
    const containerWidth = scrollContainer.clientWidth;
    const viewportCenter = scrollContainer.scrollLeft + (containerWidth / 2);
    
    // Apply zoom
    zoomOut();
    
    // Adjust scroll to keep viewport center stable
    const newViewportCenter = viewportCenter * scale;
    scrollContainer.scrollLeft = newViewportCenter - (containerWidth / 2);
  };

  // Handle zoom to playhead with scrolling
  const handleZoomToPlayhead = () => {
    const playheadPx = zoomToPlayhead();
    const scrollContainer = contentRef.current;
    if (scrollContainer) {
      // Center the playhead in the viewport
      const containerWidth = scrollContainer.clientWidth;
      const targetScrollLeft = playheadPx - (containerWidth / 2);
      
      // Smooth scroll to the playhead position
      scrollContainer.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
      });
    }
  };

  // Drag & Drop handlers
  function getMsFromClientX(clientX: number) {
    const el = contentRef.current!;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return pxToMs(x);
  }

  function handleDropOnVideo(e: React.DragEvent) {
    const data = e.dataTransfer.getData("text/x-clipstorm-asset");
    if (!data) return;
    e.preventDefault();
    const { id, type } = JSON.parse(data);
    // Only accept image and video in video track
    if (type !== "image" && type !== "video") return;

    const atMs = getMsFromClientX(e.clientX);
    beginTx("Drop asset (video)");
    const dur = type === "video" ? 5000 : 3000;
    addSceneFromAsset(id, { atMs, durationMs: dur });
    commitTx();
  }

  function handleDropOnAudio(e: React.DragEvent) {
    const data = e.dataTransfer.getData("text/x-clipstorm-asset");
    if (!data) return;
    e.preventDefault();
    const { id, type } = JSON.parse(data);
    if (type !== "audio") return;
    const atMs = getMsFromClientX(e.clientX);
    beginTx("Drop asset (audio)");
    addAudioFromAsset(id, "music", { atMs, durationMs: 30000 }); // 30s default
    commitTx();
  }


  // Listen for keyboard shortcut to center playhead
  useEffect(() => {
    const handleZoomToPlayheadEvent = () => {
      handleZoomToPlayhead();
    };
    
    window.addEventListener('zoomToPlayhead', handleZoomToPlayheadEvent);
    return () => window.removeEventListener('zoomToPlayhead', handleZoomToPlayheadEvent);
  }, [handleZoomToPlayhead]);

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
      const newPxPerSec = Math.min(1000, Math.max(5, prevPxPerSec * zoomFactor));
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

  // Keyboard nudges (Left/Right 100ms), Spacebar play/pause, and Delete to remove selected scene
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't interfere with input fields, textareas, or contenteditable elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return; // Let the input handle the key normally
      }
      
      if (e.key === "ArrowLeft") { e.preventDefault(); nudgePlayhead(-100); }
      if (e.key === "ArrowRight") { e.preventDefault(); nudgePlayhead(100); }
      if (e.key === " " || e.key === "Spacebar") { 
        e.preventDefault(); 
        togglePlayback(); 
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedSceneId) {
          console.log('🗑️ Deleting selected scene:', selectedSceneId);
          removeScene(selectedSceneId);
          selectScene(null); // Clear selection after deletion
        }
      }
      if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) e.preventDefault(); // reserve for future
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudgePlayhead, togglePlayback, selectedSceneId, removeScene, selectScene]);

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
                <button className="badge" onClick={handleZoomOut}>Zoom Out</button>
                <button className="badge" onClick={handleZoomIn}>Zoom In</button>
                <button 
                  className="badge bg-blue-600/20 text-blue-400 border-blue-500/30" 
                  onClick={handleZoomToPlayhead}
                  title="Center playhead in view (F)"
                >
                  🎯 Center
                </button>
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
                <button 
                  className="badge bg-red-600/20 text-red-400 border-red-500/30" 
                  onClick={() => {
                    const preciseCutMs = getPreciseCutPosition();
                    beginTx("Split at playhead");
                    splitAt(preciseCutMs);
                    commitTx();
                  }}
                  title={`Split at playhead (S) - ${Math.round(getPreciseCutPosition())}ms`}
                >
                  <Scissors size={12} />
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
              <div ref={contentRef} className="relative" style={{ width: contentWidth }}>
                {/* Ruler */}
                <Ruler contentWidth={contentWidth} />

                {/* Tracks - only show when there are scenes */}
                {scenes.length > 0 && (
                  <div className="pb-3">
                    {/* Video Track */}
                    <div 
                      className="mb-2 h-16 relative"
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                      onDrop={handleDropOnVideo}
                    >
                      <SceneBlocks />
                    </div>
                    {/* Audio Track */}
                    <div 
                      className="h-12 relative"
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                      onDrop={handleDropOnAudio}
                    >
                      <AudioBlocks />
                    </div>
                  </div>
                )}
                
                {/* Show SceneBlocks even when empty for the empty state */}
                {scenes.length === 0 && (
                  <div className="pb-3">
                    {/* Video Track - Empty */}
                    <div 
                      className="mb-2 h-16 relative"
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                      onDrop={handleDropOnVideo}
                    >
                      <SceneBlocks />
                    </div>
                    {/* Audio Track - Empty */}
                    <div 
                      className="h-12 relative"
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                      onDrop={handleDropOnAudio}
                    >
                      <AudioBlocks />
                    </div>
                  </div>
                )}

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