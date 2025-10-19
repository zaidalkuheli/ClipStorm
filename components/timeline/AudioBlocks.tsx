"use client";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useEditorStore, SNAP_PX } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { BlockContextMenu } from "./BlockContextMenu";
import { WaveformCanvas } from "./WaveformCanvas";
import clsx from "clsx";

const MIN_MS = 800;   // shorter min feels snappier
const LIVE_GRID_MS = 1; // effectively "no snap" while moving
const AUTO_SCROLL_THRESHOLD = 100; // pixels from edge to trigger auto-scroll
const AUTO_SCROLL_SPEED = 120; // pixels per frame - simple and reliable

// Professional color palette for audio blocks
const AUDIO_COLORS = [
  { bg: "#1e40af", border: "#3b82f6", hover: "#1e3a8a" }, // Blue
  { bg: "#7c2d12", border: "#ea580c", hover: "#9a3412" }, // Orange  
  { bg: "#166534", border: "#22c55e", hover: "#15803d" }, // Green
  { bg: "#7c2d12", border: "#f59e0b", hover: "#9a3412" }, // Amber
  { bg: "#7c2d12", border: "#ef4444", hover: "#9a3412" }, // Red
  { bg: "#581c87", border: "#a855f7", hover: "#6b21a8" }, // Purple
  { bg: "#0f766e", border: "#14b8a6", hover: "#0d9488" }, // Teal
  { bg: "#be185d", border: "#ec4899", hover: "#be185d" }, // Pink
];

export function AudioBlocks() {
  const audioClips = useEditorStore(s => s.audioClips);
  const pxPerSec = useEditorStore(s => s.pxPerSec);
  const durationMs = useEditorStore(s => s.durationMs);
  const selectedAudioId = useEditorStore(s => s.selectedAudioId);
  const resizeAudioTo = useEditorStore(s => s.resizeAudioTo);
  const selectAudio = useEditorStore(s => s.selectAudio);
  const moveAudio = useEditorStore(s => s.moveAudio);
  const snapAnimationId = useEditorStore(s => s.snapAnimationId);
  
  // Core editing actions
  const playheadMs = useEditorStore(s => s.playheadMs);
  const splitAt = useEditorStore(s => s.splitAt);
  const deleteSelection = useEditorStore(s => s.deleteSelection);
  const duplicateSelection = useEditorStore(s => s.duplicateSelection);
  const fps = useEditorStore(s => s.fps);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    audioId: string;
  } | null>(null);
  
  // Transaction methods
  const beginTx = useEditorStore(s => s.beginTx);
  const commitTx = useEditorStore(s => s.commitTx);
  const cancelTx = useEditorStore(s => s.cancelTx);

  // Assets store for media thumbnails
  const getAssetById = useAssetsStore(s => s.getById);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const msToPx = (ms: number) => (ms / 1000) * pxPerSec;

  // Calculate precise cut position with frame snapping
  const getPreciseCutPosition = () => {
    const frameMs = 1000 / fps; // milliseconds per frame
    return Math.round(playheadMs / frameMs) * frameMs;
  };

  // Escape key handling for canceling transactions
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelTx();
        // Reset any ongoing drag states
        dragRef.current = null;
        moveDragRef.current = null;
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelTx]);

  // dynamic grid based on zoom: target ~8px between snap points
  const gridMsFromZoom = React.useCallback(() => {
    const snapPx = 8; // feels right at most DPIs
    const ms = (snapPx / pxPerSec) * 1000;
    // clamp so it never gets absurdly tiny/huge
    return Math.max(40, Math.min(250, Math.round(ms)));
  }, [pxPerSec]);

  // translate a pointer event into content X (accounting for horizontal scroll)
  const getContentX = (e: PointerEvent | React.PointerEvent) => {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    return (e.clientX - rect.left) + el.scrollLeft;
  };

  const rafRef = React.useRef<number | null>(null);
  const dragRef = React.useRef<{
    id: string;
    edge: "left" | "right";
  } | null>(null);

  const moveDragRef = React.useRef<{
    id: string;
    startX: number;
    startMs: number;
  } | null>(null);

  // Simple and reliable auto-scroll
  const autoScrollRef = React.useRef<{
    direction: 'left' | 'right' | null;
    intervalId: NodeJS.Timeout | null;
    isScrolling: boolean;
    scrollContainer: HTMLElement | null;
  }>({ direction: null, intervalId: null, isScrolling: false, scrollContainer: null });

  const startAutoScroll = (direction: 'left' | 'right') => {
    if (autoScrollRef.current.direction === direction && autoScrollRef.current.isScrolling) return;
    
    stopAutoScroll();
    autoScrollRef.current.direction = direction;
    autoScrollRef.current.isScrolling = true;
    
    // Cache the scroll container to avoid repeated DOM queries
    autoScrollRef.current.scrollContainer = containerRef.current?.closest('.timeline-scroll-area') as HTMLElement;
    
    if (!autoScrollRef.current.scrollContainer) {
      autoScrollRef.current.isScrolling = false;
      return;
    }
    
    // Simple and reliable auto-scroll using setInterval
    autoScrollRef.current.intervalId = setInterval(() => {
      if (!autoScrollRef.current.isScrolling || !autoScrollRef.current.scrollContainer) {
        stopAutoScroll();
        return;
      }
      
      const scrollContainer = autoScrollRef.current.scrollContainer;
      const scrollAmount = autoScrollRef.current.direction === 'left' 
        ? -AUTO_SCROLL_SPEED 
        : AUTO_SCROLL_SPEED;
      
      const newScrollLeft = scrollContainer.scrollLeft + scrollAmount;
      const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth;
      
      // Check bounds before scrolling
      if (newScrollLeft >= 0 && newScrollLeft <= maxScrollLeft) {
        scrollContainer.scrollLeft = newScrollLeft;
      } else {
        // Stop scrolling if we've reached the boundary
        stopAutoScroll();
      }
    }, 16); // ~60fps
  };

  const stopAutoScroll = () => {
    if (autoScrollRef.current.intervalId) {
      clearInterval(autoScrollRef.current.intervalId);
      autoScrollRef.current.intervalId = null;
    }
    autoScrollRef.current.direction = null;
    autoScrollRef.current.isScrolling = false;
    autoScrollRef.current.scrollContainer = null;
  };

  const checkAutoScroll = (clientX: number) => {
    if (!containerRef.current) return;
    
    // Get the timeline scroll area, not just the container
    const scrollContainer = containerRef.current?.closest('.timeline-scroll-area') as HTMLElement;
    if (!scrollContainer) return;
    
    const rect = scrollContainer.getBoundingClientRect();
    const distanceFromLeft = clientX - rect.left;
    const distanceFromRight = rect.right - clientX;
    
    console.log('🎵 AUTO-SCROLL CHECK:', {
      clientX,
      scrollLeft: scrollContainer.scrollLeft,
      scrollWidth: scrollContainer.scrollWidth,
      clientWidth: scrollContainer.clientWidth,
      distanceFromLeft,
      distanceFromRight,
      threshold: AUTO_SCROLL_THRESHOLD
    });
    
    // Simple and reliable auto-scroll
    if (distanceFromLeft < AUTO_SCROLL_THRESHOLD) {
      console.log('🎵 Starting LEFT auto-scroll');
      startAutoScroll('left');
    } else if (distanceFromRight < AUTO_SCROLL_THRESHOLD) {
      console.log('🎵 Starting RIGHT auto-scroll');
      startAutoScroll('right');
    }
    // Keep scrolling until drag ends
  };

  const onPointerDown = (e: React.PointerEvent, id: string, edge: "left" | "right") => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation(); // Prevent audio move when resizing
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    
    // Begin transaction for resize
    beginTx(`Resize ${edge} edge`);
    
    dragRef.current = { id, edge };
    document.body.style.cursor = "ew-resize";
    console.log('🎵 Starting smooth audio drag:', { id, edge, audioIndex: audioClips.findIndex(a => a.id === id) });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const m = moveDragRef.current;
    
    if (!containerRef.current) return;

    const contentX = getContentX(e);

    // Check for auto-scroll during any drag operation - professional smooth audio trimming
    if (d || m) {
      checkAutoScroll(e.clientX);
    }

    // Handle resize dragging
    if (d) {
      const targetMs = Math.max(0, (contentX / pxPerSec) * 1000);

      // throttle to one store update per frame
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          resizeAudioTo(d.id, d.edge, targetMs, MIN_MS, LIVE_GRID_MS, pxPerSec); // live: no snap
          rafRef.current = null;
        });
      }
    }
    
    // Handle move dragging
    if (m) {
      const deltaX = contentX - m.startX;
      const deltaMs = (deltaX / pxPerSec) * 1000;
      const newStartMs = Math.max(0, m.startMs + deltaMs);

      // throttle to one store update per frame
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          moveAudio(m.id, newStartMs, pxPerSec);
          rafRef.current = null;
        });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const m = moveDragRef.current;
    
    if (!containerRef.current) return;

    // Stop auto-scroll on pointer up
    stopAutoScroll();

    // Handle resize end
    if (d) {
      dragRef.current = null;
      document.body.style.cursor = "";

      // final snap on release using zoom-aware grid
      const contentX = getContentX(e);
      const finalTargetMs = Math.max(0, (contentX / pxPerSec) * 1000);
      console.log('🎵 Final snap:', { finalTargetMs, gridMs: gridMsFromZoom() });
      resizeAudioTo(d.id, d.edge, finalTargetMs, MIN_MS, gridMsFromZoom(), pxPerSec);
      
      // Commit transaction
      commitTx();
    }
    
    // Handle move end
    if (m) {
      moveDragRef.current = null;
      document.body.style.cursor = "";
      stopAutoScroll();
      
      const contentX = getContentX(e);
      const deltaX = contentX - m.startX;
      const deltaMs = (deltaX / pxPerSec) * 1000;
      const finalStartMs = Math.max(0, m.startMs + deltaMs);
      
      console.log('🎵 Final move:', { finalStartMs, gridMs: gridMsFromZoom() });
      moveAudio(m.id, finalStartMs, pxPerSec);
      
      // Commit transaction
      commitTx();
    }
  };

  const onAudioClick = (e: React.MouseEvent, audioId: string) => {
    e.stopPropagation();
    selectAudio(audioId);
  };

  const onAudioPointerDown = (e: React.PointerEvent, audioId: string) => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    
    const audio = audioClips.find(a => a.id === audioId);
    if (!audio) return;
    
    // Begin transaction for move
    beginTx(`Move audio`);
    
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moveDragRef.current = {
      id: audioId,
      startX: getContentX(e),
      startMs: audio.startMs
    };
    
    document.body.style.cursor = "grabbing";
    console.log('🎵 Starting audio move:', { audioId, startMs: audio.startMs });
  };

  return (
    <div
      ref={containerRef}
      className="relative h-12 pr-3"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative h-full" style={{ width: Math.max(1, msToPx(durationMs)) }}>
        {audioClips.length === 0 ? (
          // Empty state - clean and minimal
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-xs text-[var(--text-tertiary)] mb-1">No audio yet</div>
              <div className="text-xs text-[var(--text-tertiary)]">Drag audio files here</div>
            </div>
          </div>
        ) : (
          audioClips.map((a, index) => {
          const left = msToPx(a.startMs);
          const width = msToPx(a.endMs - a.startMs);
          const isFirstBlock = index === 0;
          const isLastBlock = index === audioClips.length - 1;
          const isSelected = selectedAudioId === a.id;
          const colorIndex = index % AUDIO_COLORS.length;
          const colors = AUDIO_COLORS[colorIndex];

          // Get asset data for audio info
          const asset = a.assetId ? getAssetById(a.assetId) : null;

          // Magnetic linking detection
          const prev = index > 0 ? audioClips[index - 1] : null;
          const next = index < audioClips.length - 1 ? audioClips[index + 1] : null;
          
          const gapLeftPx  = prev ? ((a.startMs - prev.endMs) * pxPerSec) / 1000 : Infinity;
          const gapRightPx = next ? ((next.startMs - a.endMs) * pxPerSec) / 1000 : Infinity;

          const magnetLeft  = gapLeftPx  >= 0 && gapLeftPx  <= SNAP_PX;
          const magnetRight = gapRightPx >= 0 && gapRightPx <= SNAP_PX;
          const isSnapping = snapAnimationId === a.id;

          return (
            <div
              key={a.id}
              className={clsx(
                "timeline-audio absolute top-1 bottom-1 rounded-md overflow-hidden cursor-pointer transition-all duration-200 group",
                {
                  "ring-2 ring-white/60 shadow-lg": isSelected,
                  "hover:shadow-md": !isSelected,
                  "snap-animation": isSnapping
                }
              )}
              style={{ 
                left, 
                width,
                backgroundColor: colors.bg,
                borderColor: isSelected ? "#ffffff" : colors.border,
                borderWidth: isSelected ? "2px" : "1px",
                borderStyle: "solid",
              }}
              title={`${asset?.name || a.kind} • ${((a.endMs - a.startMs)/1000).toFixed(2)}s`}
              draggable={false}
              onClick={(e) => onAudioClick(e, a.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  audioId: a.id
                });
              }}
              onPointerDown={(e) => onAudioPointerDown(e, a.id)}
            >
              {/* Audio overlay for better text readability */}
              <div className="absolute inset-0 bg-black/20" />

              {/* Waveform Canvas */}
              <WaveformCanvas clip={a} pxPerSec={pxPerSec} height={40} />

              {/* wider, touch-friendly handles with higher z-index */}
              <div
                className={clsx("absolute left-0 top-0 h-full w-4 cursor-ew-resize bg-white/0 hover:bg-white/10 handle z-20 transition-colors", {
                  "pl-0": isFirstBlock // ensure first block's left handle is fully accessible
                })}
                onPointerDown={(e)=>onPointerDown(e, a.id, "left")}
              />
              <div
                className={clsx("absolute right-0 top-0 h-full w-4 cursor-ew-resize bg-white/0 hover:bg-white/10 handle z-20 transition-colors", {
                  "pr-0": isLastBlock // ensure last block's right handle is fully accessible
                })}
                onPointerDown={(e)=>onPointerDown(e, a.id, "right")}
              />

              {/* Filename - only visible on hover */}
              <div className="absolute left-1 top-1 px-1.5 py-0.5 bg-black/80 rounded text-[9px] text-white font-medium select-none drop-shadow-sm z-10 max-w-[70%] truncate border border-white/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" title={asset?.name || a.kind}>
                {asset?.name ? asset.name.length > 25 ? asset.name.substring(0, 22) + '...' : asset.name : a.kind}
              </div>


              {/* Magnetic linking visual indicators */}
              <span className={clsx("audio-edge left", magnetLeft && "magnet-on", isSnapping && "snap-animation")} />
              <span className={clsx("audio-edge right", magnetRight && "magnet-on", isSnapping && "snap-animation")} />
            </div>
          );
        })
        )}
      </div>
      
      {/* Context Menu Portal */}
      {contextMenu && createPortal(
        <BlockContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onSplit={() => {
            selectAudio(contextMenu.audioId);
            const preciseCutMs = getPreciseCutPosition();
            beginTx("Split at playhead");
            splitAt(preciseCutMs);
            commitTx();
          }}
          onDelete={() => {
            selectAudio(contextMenu.audioId);
            deleteSelection({ ripple: false });
          }}
          onRippleDelete={() => {
            selectAudio(contextMenu.audioId);
            deleteSelection({ ripple: true });
          }}
          onDuplicate={() => {
            selectAudio(contextMenu.audioId);
            duplicateSelection();
          }}
        />,
        document.body
      )}
    </div>
  );
}
