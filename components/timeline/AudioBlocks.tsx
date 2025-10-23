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

export function AudioBlocks({ trackId }: { trackId?: string }) {
  const allAudioClips = useEditorStore(s => s.audioClips);
  const audioClips = React.useMemo(
    () => trackId ? allAudioClips.filter(a => a.trackId === trackId) : allAudioClips,
    [allAudioClips, trackId]
  );
  const pxPerSec = useEditorStore(s => s.pxPerSec);
  const durationMs = useEditorStore(s => s.durationMs);
  const selectedAudioId = useEditorStore(s => s.selectedAudioId);
  const resizeAudioTo = useEditorStore(s => s.resizeAudioTo);
  const selectAudio = useEditorStore(s => s.selectAudio);
  const moveAudio = useEditorStore(s => s.moveAudio);
  const snapAnimationId = useEditorStore(s => s.snapAnimationId);
  const moveAudioToTrack = useEditorStore(s => s.moveAudioToTrack);
  const setAudioFadeIn = useEditorStore(s => s.setAudioFadeIn);
  const setAudioFadeOut = useEditorStore(s => s.setAudioFadeOut);
  
  // Core editing actions
  const playheadMs = useEditorStore(s => s.playheadMs);
  const splitAt = useEditorStore(s => s.splitAt);
  const deleteSelection = useEditorStore(s => s.deleteSelection);
  const duplicateSelection = useEditorStore(s => s.duplicateSelection);
  const fps = useEditorStore(s => s.fps);
  
  const [dragPreview, setDragPreview] = useState<{
    trackId: string | null;
    isValid: boolean;
  } | null>(null);
  
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
    startY: number;
    isVerticalDrag: boolean;
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
    
    // Simple and reliable auto-scroll
    if (distanceFromLeft < AUTO_SCROLL_THRESHOLD) {
      startAutoScroll('left');
    } else if (distanceFromRight < AUTO_SCROLL_THRESHOLD) {
      startAutoScroll('right');
    } else {
      // Not near edges while dragging → stop auto-scroll immediately
      stopAutoScroll();
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
  };

  // Initialize fade handles on double-click
  const initializeFades = (audioId: string) => {
    const audioClip = audioClips.find(a => a.id === audioId);
    if (!audioClip) return;
    
    const clipDurationMs = audioClip.endMs - audioClip.startMs;
    const defaultFadeMs = Math.min(500, clipDurationMs * 0.1); // 0.5s or 10% of clip, whichever is smaller
    
    // Set default fade in/out if not already set
    if (!audioClip.fadeInMs) {
      setAudioFadeIn(audioId, defaultFadeMs);
    }
    if (!audioClip.fadeOutMs) {
      setAudioFadeOut(audioId, defaultFadeMs);
    }
  };

  const fadeDragRef = React.useRef<{
    id: string;
    fadeType: "fadeIn" | "fadeOut";
    startX: number;
    startFadeMs: number;
  } | null>(null);

  const onFadeHandlePointerDown = (e: React.PointerEvent, id: string, fadeType: "fadeIn" | "fadeOut") => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    
    // Begin transaction for fade adjustment
    beginTx(`Adjust ${fadeType}`);
    
    // Find the audio clip to get its current fade values
    const audioClip = audioClips.find(a => a.id === id);
    if (!audioClip) return;
    
    // Store fade-specific drag reference (separate from resize)
    fadeDragRef.current = { 
      id, 
      fadeType,
      startX: e.clientX,
      startFadeMs: fadeType === 'fadeIn' ? (audioClip.fadeInMs || 0) : (audioClip.fadeOutMs || 0)
    };
    
    document.body.style.cursor = "ew-resize";
    
    // Add global pointer up listener to handle release outside track
    const handleGlobalPointerUp = () => {
      if (fadeDragRef.current) {
        fadeDragRef.current = null;
        document.body.style.cursor = "";
        commitTx();
        document.removeEventListener('pointerup', handleGlobalPointerUp);
      }
    };
    
    document.addEventListener('pointerup', handleGlobalPointerUp);
    
    console.log('Fade handle drag started:', { id, fadeType, startFadeMs: fadeDragRef.current.startFadeMs });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const m = moveDragRef.current;
    const f = fadeDragRef.current;
    
    if (!containerRef.current) return;

    const contentX = getContentX(e);

    // Check for auto-scroll during any drag operation
    if (d || m || f) {
      checkAutoScroll(e.clientX);
    } else {
      stopAutoScroll();
    }

    // Handle fade dragging (separate from resize)
    if (f) {
      const audioClip = audioClips.find(a => a.id === f.id);
      if (!audioClip) return;
      
      const clipStartPx = msToPx(audioClip.startMs);
      const clipEndPx = msToPx(audioClip.endMs);
      const clipWidthPx = clipEndPx - clipStartPx;
      
      let newFadeMs = 0;
      
      if (f.fadeType === 'fadeIn') {
        // Fade in: distance from left edge of clip
        const fadePx = Math.max(0, Math.min(contentX - clipStartPx, clipWidthPx));
        newFadeMs = (fadePx / pxPerSec) * 1000;
      } else if (f.fadeType === 'fadeOut') {
        // Fade out: distance from right edge of clip
        const fadePx = Math.max(0, Math.min(clipEndPx - contentX, clipWidthPx));
        newFadeMs = (fadePx / pxPerSec) * 1000;
      }
      
      // throttle to one store update per frame
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          if (f.fadeType === 'fadeIn') {
            setAudioFadeIn(f.id, newFadeMs);
          } else if (f.fadeType === 'fadeOut') {
            setAudioFadeOut(f.id, newFadeMs);
          }
          rafRef.current = null;
        });
      }
      return; // Don't process resize logic
    }

    // Handle regular resize (left/right edges)
    if (d) {
      const rawMs = Math.max(0, (contentX / pxPerSec) * 1000);
      const playheadMs = useEditorStore.getState().playheadMs;
      const playheadPx = (playheadMs / 1000) * pxPerSec;
      const edgePx = contentX;
      const snapPx = 8;
      const targetMs = Math.abs(edgePx - playheadPx) <= snapPx ? playheadMs : rawMs;

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
      const deltaY = e.clientY - m.startY;
      
      // Detect if this is a vertical drag (moving between tracks)
      if (!m.isVerticalDrag && Math.abs(deltaY) > 10 && Math.abs(deltaX) < 20) {
        m.isVerticalDrag = true;
      }
      
      if (m.isVerticalDrag) {
        // Handle vertical drag - find target track
        const tracks = useEditorStore.getState().tracks;
        const currentAudio = audioClips.find(a => a.id === m.id);
        if (!currentAudio) return;
        
        const currentTrack = tracks.find(t => t.id === currentAudio.trackId);
        if (!currentTrack) return;
        
        // Find target track based on Y position
        const trackElements = Array.from(document.querySelectorAll('[data-track-id]')) as HTMLElement[];
        let targetTrackId = currentTrack.id;
        
        for (const trackEl of trackElements) {
          const rect = trackEl.getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetTrackId = trackEl.getAttribute('data-track-id') || currentTrack.id;
            break;
          }
        }
        
        // Move to target track if different and compatible
        if (targetTrackId !== currentTrack.id) {
          const targetTrack = tracks.find(t => t.id === targetTrackId);
          if (targetTrack && targetTrack.type === 'audio') {
            moveAudioToTrack(m.id, targetTrackId);
            m.startY = e.clientY; // Reset Y to prevent continuous switching
            setDragPreview({ trackId: targetTrackId, isValid: true });
          } else {
            setDragPreview({ trackId: targetTrackId, isValid: false });
          }
        } else {
          setDragPreview(null);
        }
      } else {
        // Handle horizontal drag
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
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const m = moveDragRef.current;
    const f = fadeDragRef.current;
    
    if (!containerRef.current) return;

    // Stop auto-scroll on pointer up
    stopAutoScroll();

    // Handle fade drag end
    if (f) {
      fadeDragRef.current = null;
      document.body.style.cursor = "";
      commitTx();
      return; // Don't process other drag types
    }

    // Handle resize end
    if (d) {
      dragRef.current = null;
      document.body.style.cursor = "";

      // final snap on release using zoom-aware grid
      const contentX = getContentX(e);
      const playheadMs = useEditorStore.getState().playheadMs;
      const playheadPx = (playheadMs / 1000) * pxPerSec;
      const edgePx = contentX;
      const snapPx = 8;
      const rawFinal = Math.max(0, (contentX / pxPerSec) * 1000);
      const finalTargetMs = Math.abs(edgePx - playheadPx) <= snapPx ? playheadMs : rawFinal;
      resizeAudioTo(d.id, d.edge, finalTargetMs, MIN_MS, gridMsFromZoom(), pxPerSec);
      
      // Commit transaction
      commitTx();
    }
    
    // Handle move end
    if (m) {
      moveDragRef.current = null;
      document.body.style.cursor = "";
      stopAutoScroll();
      setDragPreview(null); // Clear drag preview
      
      const contentX = getContentX(e);
      const deltaX = contentX - m.startX;
      const deltaMs = (deltaX / pxPerSec) * 1000;
      const finalStartMs = Math.max(0, m.startMs + deltaMs);
      
      moveAudio(m.id, finalStartMs, pxPerSec);
      
      // Commit transaction
      commitTx();
    }
  };

  // Stop auto-scroll when pointer leaves the track area or component unmounts
  const onPointerLeave = () => {
    stopAutoScroll();
  };

  React.useEffect(() => {
    const handleDocPointerUp = () => stopAutoScroll();
    const handleVisibility = () => {
      if (document.hidden) stopAutoScroll();
    };
    document.addEventListener('pointerup', handleDocPointerUp);
    document.addEventListener('pointercancel', handleDocPointerUp);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('pointerup', handleDocPointerUp);
      document.removeEventListener('pointercancel', handleDocPointerUp);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopAutoScroll();
    };
  }, []);

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
      startMs: audio.startMs,
      startY: e.clientY,
      isVerticalDrag: false
    };
    
    document.body.style.cursor = "grabbing";
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
        {audioClips.length === 0 ? null : (
          audioClips.map((a, index) => {
          const left = msToPx(a.startMs);
          const width = msToPx(a.endMs - a.startMs);
          const isFirstBlock = index === 0;
          const isLastBlock = index === audioClips.length - 1;
          const isSelected = selectedAudioId === a.id;
          const colorIndex = index % AUDIO_COLORS.length;
          const colors = AUDIO_COLORS[colorIndex];

          console.log('AUDIO BLOCK RENDER:', {
            clipId: a.id,
            left: left,
            width: width,
            colors: colors,
            pxPerSec: pxPerSec,
            durationMs: a.endMs - a.startMs,
            isSelected: isSelected
          });

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
              onDragOver={(e) => {
                // Check if dragging an asset by looking at dataTransfer types
                const hasAssetData = e.dataTransfer.types.includes("text/x-clipstorm-asset");
                if (!hasAssetData) return;
                
                // Check drag effect to determine if it's audio
                if (e.dataTransfer.effectAllowed === "copy") {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).style.boxShadow = 'inset 0 0 0 2px rgba(239,68,68,0.95)';
                }
              }}
              onDragLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
              onDrop={(e) => {
                const data = e.dataTransfer.getData("text/x-clipstorm-asset");
                if (!data) return;
                e.preventDefault();
                e.stopPropagation();
                (e.currentTarget as HTMLElement).style.boxShadow = '';
                const { id: assetId, type } = JSON.parse(data);
                if (type !== 'audio') return;
                beginTx('Replace audio media');
                useEditorStore.getState().replaceAudioAsset(a.id, assetId);
                commitTx();
                selectAudio(a.id);
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                initializeFades(a.id);
              }}
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
              <WaveformCanvas clip={a} pxPerSec={pxPerSec} height={40} bgColor={colors.bg} />

              {/* smaller, precise resize handles */}
              <div
                className={clsx(
                  "absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-transparent handle z-50 transition-colors",
                  {
                    // Only show a subtle dark hover when block is wide enough; avoid whitening tiny clips
                    "hover:bg-black/20": width >= 8,
                    "pl-0": isFirstBlock
                  }
                )}
                onPointerDown={(e)=>onPointerDown(e, a.id, "left")}
              />
              <div
                className={clsx(
                  "absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-transparent handle z-50 transition-colors",
                  {
                    // Only show a subtle dark hover when block is wide enough; avoid whitening tiny clips
                    "hover:bg-black/20": width >= 8,
                    "pr-0": isLastBlock
                  }
                )}
                onPointerDown={(e)=>onPointerDown(e, a.id, "right")}
              />

              {/* Filename - only visible on hover */}
              <div className="absolute left-1 top-1 px-1.5 py-0.5 bg-black/80 rounded text-[9px] text-white font-medium select-none drop-shadow-sm z-10 max-w-[70%] truncate border border-white/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" title={asset?.name || a.kind}>
                {asset?.name ? asset.name.length > 25 ? asset.name.substring(0, 22) + '...' : asset.name : a.kind}
              </div>

              {/* Fade In Handle */}
              {a.fadeInMs && a.fadeInMs > 0 && (
                <div
                  className="absolute left-0 top-0 h-full z-30 pointer-events-none"
                  style={{ width: Math.max(8, msToPx(a.fadeInMs)) }}
                >
                  {/* Fade triangle - softer black fade in curve */}
                  <div 
                    className="absolute right-0 top-0 h-full bg-black/60 pointer-events-none"
                    style={{ 
                      width: Math.max(8, msToPx(a.fadeInMs)),
                      clipPath: 'polygon(0 0, 100% 0, 0 100%)'
                    }}
                  />
                  {/* Bold black arrow handle - closer to edge */}
                  <div 
                    className="absolute top-0 w-3 h-3 cursor-ew-resize z-30 pointer-events-auto flex items-center justify-center"
                    style={{ 
                      left: `${Math.max(8, msToPx(a.fadeInMs)) - 1}px`
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onFadeHandlePointerDown(e, a.id, 'fadeIn');
                    }}
                  >
                    {/* Thick black right arrow */}
                    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" className="text-black">
                      <path d="M1 1L5 3L1 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              )}

              {/* Fade Out Handle */}
              {a.fadeOutMs && a.fadeOutMs > 0 && (
                <div
                  className="absolute right-0 top-0 h-full z-30 pointer-events-none"
                  style={{ width: Math.max(8, msToPx(a.fadeOutMs)) }}
                >
                  {/* Fade triangle - softer black fade out curve */}
                  <div 
                    className="absolute left-0 top-0 h-full bg-black/60 pointer-events-none"
                    style={{ 
                      width: Math.max(8, msToPx(a.fadeOutMs)),
                      clipPath: 'polygon(0 0, 100% 0, 100% 100%)'
                    }}
                  />
                  {/* Bold black arrow handle - closer to edge */}
                  <div 
                    className="absolute top-0 w-3 h-3 cursor-ew-resize z-30 pointer-events-auto flex items-center justify-center"
                    style={{ 
                      right: `${Math.max(8, msToPx(a.fadeOutMs)) - 1}px`
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onFadeHandlePointerDown(e, a.id, 'fadeOut');
                    }}
                  >
                    {/* Thick black left arrow */}
                    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" className="text-black">
                      <path d="M5 1L1 3L5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              )}

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
