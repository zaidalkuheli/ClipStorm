"use client";
import React from "react";
import { useEditorStore, SNAP_PX } from "@/stores/editorStore";
import clsx from "clsx";

const MIN_MS = 800;   // shorter min feels snappier
const LIVE_GRID_MS = 1; // effectively "no snap" while moving

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

  const containerRef = React.useRef<HTMLDivElement>(null);

  const msToPx = (ms: number) => (ms / 1000) * pxPerSec;

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

  const onPointerDown = (e: React.PointerEvent, id: string, edge: "left" | "right") => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation(); // Prevent scene move when resizing
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id, edge };
    document.body.style.cursor = "ew-resize";
    console.log('🎬 Starting smooth drag:', { id, edge, sceneIndex: scenes.findIndex(s => s.id === id) });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const m = moveDragRef.current;
    
    if (!containerRef.current) return;

    const contentX = getContentX(e);

    // Handle resize dragging
    if (d) {
      const targetMs = Math.max(0, Math.min(durationMs, (contentX / pxPerSec) * 1000));

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
      const newStartMs = Math.max(0, Math.min(durationMs, m.startMs + deltaMs));

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

    // Handle resize end
    if (d) {
      dragRef.current = null;
      document.body.style.cursor = "";

      // final snap on release using zoom-aware grid
      const contentX = getContentX(e);
      const finalTargetMs = Math.max(0, Math.min(durationMs, (contentX / pxPerSec) * 1000));
      console.log('🎬 Final snap:', { finalTargetMs, gridMs: gridMsFromZoom() });
      resizeSceneTo(d.id, d.edge, finalTargetMs, MIN_MS, gridMsFromZoom(), pxPerSec);
    }
    
    // Handle move end
    if (m) {
      moveDragRef.current = null;
      document.body.style.cursor = "";
      
      const contentX = getContentX(e);
      const deltaX = contentX - m.startX;
      const deltaMs = (deltaX / pxPerSec) * 1000;
      const finalStartMs = Math.max(0, Math.min(durationMs, m.startMs + deltaMs));
      
      console.log('🎬 Final move:', { finalStartMs, gridMs: gridMsFromZoom() });
      moveScene(m.id, finalStartMs, pxPerSec);
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
        {scenes.map((s, index) => {
          const left = msToPx(s.startMs);
          const width = msToPx(s.endMs - s.startMs);
          const isFirstBlock = index === 0;
          const isLastBlock = index === scenes.length - 1;
          const isSelected = selectedSceneId === s.id;
          const colorIndex = index % SCENE_COLORS.length;
          const colors = SCENE_COLORS[colorIndex];

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
                backgroundColor: colors.bg,
                borderColor: isSelected ? "#ffffff" : colors.border,
                borderWidth: isSelected ? "2px" : "1px",
                borderStyle: "solid"
              }}
              title={`${s.label} • ${((s.endMs - s.startMs)/1000).toFixed(2)}s`}
              draggable={false}
              onClick={(e) => onSceneClick(e, s.id)}
              onPointerDown={(e) => onScenePointerDown(e, s.id)}
            >
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

              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-white/90 font-medium select-none drop-shadow-sm">
                {s.label}
              </div>

              {/* Magnetic linking visual indicators */}
              <span className={clsx("scene-edge left", magnetLeft && "magnet-on", isSnapping && "snap-animation")} />
              <span className={clsx("scene-edge right", magnetRight && "magnet-on", isSnapping && "snap-animation")} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
