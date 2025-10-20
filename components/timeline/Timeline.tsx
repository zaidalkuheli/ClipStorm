"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Scissors, Plus, ChevronDown, ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon, Crosshair } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useEditorStore } from "@/stores/editorStore";
import { Ruler } from "./Ruler";
import { SceneBlocks } from "./SceneBlocks";
import { AudioBlocks } from "./AudioBlocks";
import { Playhead } from "./Playhead";
import { TrackHeader } from "./TrackHeader";
import { Track } from "./Track";

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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
  
  // Track management
  const tracks = useEditorStore(s => s.tracks);
  const addTrack = useEditorStore(s => s.addTrack);
  const removeTrack = useEditorStore(s => s.removeTrack);
  const setTracks = useEditorStore(s => s.setTracks);

  // Core editing actions
  const playheadMs = useEditorStore(s => s.playheadMs);
  const splitAt = useEditorStore(s => s.splitAt);
  const deleteSelection = useEditorStore(s => s.deleteSelection);
  const duplicateSelection = useEditorStore(s => s.duplicateSelection);
  const selectedAudioId = useEditorStore(s => s.selectedAudioId);
  const fps = useEditorStore(s => s.fps);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Dropdown state for add track
  const [showAddTrackDropdown, setShowAddTrackDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Extend scrollable area by 50% to give users more space for dragging
  const baseContentWidth = Math.max(1, (durationMs / 1000) * pxPerSec);
  const contentWidth = baseContentWidth + (baseContentWidth * 0.5); // 50% extra space

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
    const sc = scrollRef.current; // use the scroll container, not the content div
    if (sc) {
      const containerWidth = sc.clientWidth;
      const targetScrollLeft = playheadPx - (containerWidth / 2);
      sc.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' });
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

  const handleAddTrack = (type: "video" | "audio") => {
    const trackCount = tracks.filter(t => t.type === type).length;
    const trackName = `${type === "video" ? "Media" : "Audio"} ${trackCount + 1}`;
    addTrack({ name: trackName, type });
    setShowAddTrackDropdown(false);
  };

  const handleRemoveTrack = (trackId: string) => {
    removeTrack(trackId);
  };

  // Reorder tracks by drag/drop on headers
  const dragTrackIdRef = useRef<string | null>(null);
  const onDragStartTrack = (trackId: string) => {
    dragTrackIdRef.current = trackId;
  };
  const onDragOverTrack = (overTrackId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDropTrack = (targetTrackId: string, e: React.DragEvent) => {
    e.preventDefault();
    const dragId = dragTrackIdRef.current;
    if (!dragId || dragId === targetTrackId) return;
    const list = [...tracks];
    const from = list.findIndex(t => t.id === dragId);
    const to = list.findIndex(t => t.id === targetTrackId);
    if (from === -1 || to === -1) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setTracks(list);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAddTrackDropdown(false);
      }
    };

    if (showAddTrackDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddTrackDropdown]);


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
            <div className="flex items-center justify-end px-3 py-1 text-xs text-[var(--muted)]">
              <div className="flex items-center gap-1.5">
                <button 
                  className="badge" 
                  onClick={handleZoomOut}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <ZoomOutIcon size={12} />
                </button>
                <button 
                  className="badge" 
                  onClick={handleZoomIn}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <ZoomInIcon size={12} />
                </button>
                <button 
                  className="badge bg-blue-600/20 text-blue-400 border-blue-500/30" 
                  onClick={handleZoomToPlayhead}
                  title="Center playhead in view (F)"
                  aria-label="Center playhead"
                >
                  <Crosshair size={12} />
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
            <div className="flex-shrink-0 w-40 bg-[var(--surface-primary)] border-r border-[var(--border-primary)] select-none">
              {/* Timeline label with add track button */}
              <div className="h-8 flex items-center justify-between px-2 text-[11px] text-[var(--text-secondary)] font-medium select-none">
                <span className="text-[12px] font-semibold">Timeline</span>
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowAddTrackDropdown(!showAddTrackDropdown)}
                    className="px-3 py-2 text-white hover:text-white hover:bg-[var(--surface-secondary)] rounded-md transition-all duration-200 flex items-center gap-2 font-semibold shadow-sm hover:shadow-md"
                    title="Add track"
                  >
                    <Plus size={16} />
                    <ChevronDown size={14} />
                  </button>
                  
                  {showAddTrackDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-36 bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-md shadow-lg z-50">
                      <button
                        onClick={() => handleAddTrack("video")}
                        className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] flex items-center gap-2"
                      >
                        🎬 Media
                      </button>
                      <button
                        onClick={() => handleAddTrack("audio")}
                        className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] flex items-center gap-2"
                      >
                        🎵 Audio
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {/* Track headers */}
              {tracks.map((track) => (
                <TrackHeader 
                  key={track.id} 
                  track={track} 
                  height={track.type === "video" ? 64 : 48}
                  onAddTrack={handleAddTrack}
                  onRemoveTrack={handleRemoveTrack}
                  onDragStartTrack={onDragStartTrack}
                  onDragOverTrack={onDragOverTrack}
                  onDropTrack={onDropTrack}
                />
              ))}
            </div>
            
                {/* Timeline content - scrollable, starts from 0 */}
                <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden timeline-scroll-area" onPointerDown={onPointerDown}>
              <div ref={contentRef} className="relative" style={{ width: contentWidth }}>
                {/* Ruler - only show actual timeline content, not extended area */}
                <Ruler contentWidth={baseContentWidth} />

                {/* Tracks - render each track */}
                <div className="pb-3">
                  {tracks.map((track) => (
                    <Track 
                      key={track.id} 
                      track={track} 
                      height={track.type === "video" ? 64 : 48}
                    />
                  ))}
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