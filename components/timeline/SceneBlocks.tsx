"use client";
import React from "react";
import { useEditorStore, SNAP_PX } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";
import clsx from "clsx";

const MIN_MS = 800;   // shorter min feels snappier
const LIVE_GRID_MS = 1; // effectively "no snap" while moving
const AUTO_SCROLL_THRESHOLD = 200; // pixels from edge to trigger auto-scroll (very easy to trigger)
const AUTO_SCROLL_SPEED = 100; // pixels per frame (ULTRA fast - no hiccups)

// Professional color palette for scene blocks
const SCENE_COLORS = [
  { bg: "#1e3a8a", border: "#3b82f6", hover: "#1e40af" }, // Blue
  { bg: "#7c2d12", border: "#ea580c", hover: "#9a3412" }, // Orange  
  { bg: "#166534", border: "#22c55e", hover: "#15803d" }, // Green
  { bg: "#7c2d12", border: "#f59e0b", hover: "#9a3412" }, // Amber
  { bg: "#7c2d12", border: "#ef4444", hover: "#9a3412" }, // Red
  { bg: "#581c87", border: "#a855f7", hover: "#6b21a8" }, // Purple
  { bg: "#0f766e", border: "#14b8a6", hover: "#0d9488" }, // Teal
  { bg: "#be185d", border: "#ec4899", hover: "#be185d" }, // Pink
];

export function SceneBlocks() {
  const scenes = useEditorStore(s => s.scenes);
  const pxPerSec = useEditorStore(s => s.pxPerSec);
  const durationMs = useEditorStore(s => s.durationMs);
  const selectedSceneId = useEditorStore(s => s.selectedSceneId);
  const resizeSceneTo = useEditorStore(s => s.resizeSceneTo);
  const selectScene = useEditorStore(s => s.selectScene);
  const moveScene = useEditorStore(s => s.moveScene);
  const snapAnimationId = useEditorStore(s => s.snapAnimationId);
  
  // Transaction methods
  const beginTx = useEditorStore(s => s.beginTx);
  const commitTx = useEditorStore(s => s.commitTx);
  const cancelTx = useEditorStore(s => s.cancelTx);

  // Assets store for media thumbnails
  const getAssetById = useAssetsStore(s => s.getById);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const msToPx = (ms: number) => (ms / 1000) * pxPerSec;

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

  // Auto-scroll functionality - NO STOPS using setInterval
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
    
    // Use setInterval for maximum smoothness - no frame conflicts
    autoScrollRef.current.intervalId = setInterval(() => {
      if (!autoScrollRef.current.isScrolling || !autoScrollRef.current.scrollContainer) {
        stopAutoScroll();
        return;
      }
      
      const scrollAmount = autoScrollRef.current.direction === 'left' 
        ? -AUTO_SCROLL_SPEED 
        : AUTO_SCROLL_SPEED;
      
      // Direct scroll - no conditions, no checks
      autoScrollRef.current.scrollContainer.scrollLeft += scrollAmount;
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
    
    const rect = containerRef.current.getBoundingClientRect();
    const distanceFromLeft = clientX - rect.left;
    const distanceFromRight = rect.right - clientX;
    
    // Start scrolling immediately when near edges - no stopping until drag ends
    if (distanceFromLeft < AUTO_SCROLL_THRESHOLD) {
      startAutoScroll('left');
    } else if (distanceFromRight < AUTO_SCROLL_THRESHOLD) {
      startAutoScroll('right');
    }
    // No else clause - keep scrolling until drag ends
  };

  const onPointerDown = (e: React.PointerEvent, id: string, edge: "left" | "right") => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation(); // Prevent scene move when resizing
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    
    // Begin transaction for resize
    beginTx(`Resize ${edge} edge`);
    
    dragRef.current = { id, edge };
    document.body.style.cursor = "ew-resize";
    console.log('🎬 Starting smooth drag:', { id, edge, sceneIndex: scenes.findIndex(s => s.id === id) });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const m = moveDragRef.current;
    
    if (!containerRef.current) return;

    const contentX = getContentX(e);

    // Check for auto-scroll during any drag operation
    if (d || m) {
      checkAutoScroll(e.clientX);
    }

    // Handle resize dragging
    if (d) {
      const targetMs = Math.max(0, (contentX / pxPerSec) * 1000);

      // throttle to one store update per frame
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          resizeSceneTo(d.id, d.edge, targetMs, MIN_MS, LIVE_GRID_MS, pxPerSec); // live: no snap
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
          moveScene(m.id, newStartMs, pxPerSec);
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
      console.log('🎬 Final snap:', { finalTargetMs, gridMs: gridMsFromZoom() });
      resizeSceneTo(d.id, d.edge, finalTargetMs, MIN_MS, gridMsFromZoom(), pxPerSec);
      
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
      
      console.log('🎬 Final move:', { finalStartMs, gridMs: gridMsFromZoom() });
      moveScene(m.id, finalStartMs, pxPerSec);
      
      // Commit transaction
      commitTx();
    }
  };

  const onSceneClick = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    selectScene(sceneId);
  };

  const onScenePointerDown = (e: React.PointerEvent, sceneId: string) => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    // Begin transaction for move
    beginTx(`Move scene`);
    
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moveDragRef.current = {
      id: sceneId,
      startX: getContentX(e),
      startMs: scene.startMs
    };
    
    document.body.style.cursor = "grabbing";
    console.log('🎬 Starting scene move:', { sceneId, startMs: scene.startMs });
  };

  return (
    <div
      ref={containerRef}
      className="relative h-16 px-3"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative h-full" style={{ width: Math.max(1, msToPx(durationMs) + 16) }}>
        {scenes.length === 0 ? (
          // Empty state - clean and minimal
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-xs text-[var(--text-tertiary)] mb-1">No scenes yet</div>
              <div className="text-xs text-[var(--text-tertiary)]">Drag to create your first scene</div>
            </div>
          </div>
        ) : (
          scenes.map((s, index) => {
          const left = msToPx(s.startMs);
          const width = msToPx(s.endMs - s.startMs);
          const isFirstBlock = index === 0;
          const isLastBlock = index === scenes.length - 1;
          const isSelected = selectedSceneId === s.id;
          const colorIndex = index % SCENE_COLORS.length;
          const colors = SCENE_COLORS[colorIndex];

          // Get asset data for media thumbnail
          const asset = s.assetId ? getAssetById(s.assetId) : null;
          const hasMedia = asset && (asset.type === 'image' || asset.type === 'video');

          // Magnetic linking detection
          const prev = index > 0 ? scenes[index - 1] : null;
          const next = index < scenes.length - 1 ? scenes[index + 1] : null;
          
          const gapLeftPx  = prev ? ((s.startMs - prev.endMs) * pxPerSec) / 1000 : Infinity;
          const gapRightPx = next ? ((next.startMs - s.endMs) * pxPerSec) / 1000 : Infinity;

          const magnetLeft  = gapLeftPx  >= 0 && gapLeftPx  <= SNAP_PX;
          const magnetRight = gapRightPx >= 0 && gapRightPx <= SNAP_PX;
          const isSnapping = snapAnimationId === s.id;

          return (
            <div
              key={s.id}
              className={clsx(
                "timeline-scene absolute top-2 bottom-2 rounded-md overflow-hidden cursor-pointer transition-all duration-200",
                {
                  "ring-2 ring-white/60 shadow-lg": isSelected,
                  "hover:shadow-md": !isSelected,
                  "snap-animation": isSnapping
                }
              )}
              style={{ 
                left, 
                width,
                backgroundColor: hasMedia ? 'transparent' : colors.bg,
                borderColor: isSelected ? "#ffffff" : colors.border,
                borderWidth: isSelected ? "2px" : "1px",
                borderStyle: "solid",
                backgroundImage: hasMedia ? `url(${asset.url})` : undefined,
                backgroundSize: 'auto 100%',
                backgroundPosition: 'left center',
                backgroundRepeat: 'repeat-x'
              }}
              title={`${s.label} • ${((s.endMs - s.startMs)/1000).toFixed(2)}s`}
              draggable={false}
              onClick={(e) => onSceneClick(e, s.id)}
              onPointerDown={(e) => onScenePointerDown(e, s.id)}
            >
              {/* Media overlay for better text readability */}
              {hasMedia && (
                <div className="absolute inset-0 bg-black/30" />
              )}

              {/* wider, touch-friendly handles with higher z-index */}
              <div
                className={clsx("absolute left-0 top-0 h-full w-4 cursor-ew-resize bg-white/0 hover:bg-white/10 handle z-20 transition-colors", {
                  "pl-0": isFirstBlock // ensure first block's left handle is fully accessible
                })}
                onPointerDown={(e)=>onPointerDown(e, s.id, "left")}
              />
              <div
                className={clsx("absolute right-0 top-0 h-full w-4 cursor-ew-resize bg-white/0 hover:bg-white/10 handle z-20 transition-colors", {
                  "pr-0": isLastBlock // ensure last block's right handle is fully accessible
                })}
                onPointerDown={(e)=>onPointerDown(e, s.id, "right")}
              />

              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-white/90 font-medium select-none drop-shadow-sm z-10">
                {s.label}
              </div>

              {/* Media type indicator */}
              {hasMedia && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/80 font-medium select-none drop-shadow-sm z-10">
                  {asset.type === 'image' ? '📷' : '🎬'}
                </div>
              )}

              {/* Magnetic linking visual indicators */}
              <span className={clsx("scene-edge left", magnetLeft && "magnet-on", isSnapping && "snap-animation")} />
              <span className={clsx("scene-edge right", magnetRight && "magnet-on", isSnapping && "snap-animation")} />
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}