"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { Button } from "@/components/ui/Button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useEditorStore, type AspectRatio } from "@/stores/editorStore";
import { usePlaybackTimer } from "@/hooks/usePlaybackTimer";
import { useAssetsStore } from "@/stores/assetsStore";

// Constants
const CENTER_THRESHOLD = 2; // pixels tolerance for center detection
const ZOOM_FACTOR = 0.1; // zoom sensitivity
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

type Props = {
  aspect: AspectRatio;
  showGrid?: boolean;
  showSafeArea?: boolean;
  children?: React.ReactNode;   // overlays, etc.
};

const aspectRatios = {
  "9:16": { w: 9, h: 16 },
  "1:1": { w: 1, h: 1 }, 
  "16:9": { w: 16, h: 9 }
};

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

export function AutoFitFrame({ aspect, showGrid, showSafeArea, children }: Props) {
  const [dimensions, setDimensions] = React.useState({ width: 360, height: 640 });
  const [containerElement, setContainerElement] = React.useState<HTMLDivElement | null>(null);
  const [mediaKey, setMediaKey] = useState<string>("");
  
  // Media transformation state - border-based approach
  const [isTransforming, setIsTransforming] = useState(false);
  const [isMediaSelected, setIsMediaSelected] = useState(false);
  const [transform, setTransform] = useState({
    x: 0,
    y: 0,
    scale: 1
  });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, transform: { x: 0, y: 0, scale: 1 } });
  const [borderDragStart, setBorderDragStart] = useState({ x: 0, y: 0, transform: { x: 0, y: 0, scale: 1 }, edge: '' });
  
  // Center guide state
  const [isDragging, setIsDragging] = useState(false);
  const [showVerticalGuide, setShowVerticalGuide] = useState(false);
  const [showHorizontalGuide, setShowHorizontalGuide] = useState(false);
  
  const setAspect = useEditorStore(s => s.setAspect);
  const isPlaying = useEditorStore(s => s.isPlaying);
  const playheadMs = useEditorStore(s => s.playheadMs);
  const durationMs = useEditorStore(s => s.durationMs);
  const togglePlayback = useEditorStore(s => s.togglePlayback);
  const nudgePlayhead = useEditorStore(s => s.nudgePlayhead);
  const scenes = useEditorStore(s => s.scenes);
  const updateSceneTransform = useEditorStore(s => s.updateSceneTransform);
  
  const getAssetById = useAssetsStore(s => s.getById);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Start the playback timer
  usePlaybackTimer();

  // Memoized current scene and asset calculation
  const current = useMemo(() => {
    if (!scenes.length) return null;
    const scene = scenes.find(sc => playheadMs >= sc.startMs && playheadMs < sc.endMs) ?? null;
    if (!scene || !scene.assetId) return scene ? { scene, asset: null } : null;
    return { scene, asset: getAssetById(scene.assetId) ?? null };
  }, [scenes, playheadMs, getAssetById]);

  // Change media key on scene/asset change to force mount/unmount
  useEffect(() => {
    const key = current?.asset ? `${current.scene.id}:${current.asset.id}` : current?.scene?.id ?? "empty";
    setMediaKey(key);
  }, [current?.scene?.id, current?.asset?.id]);

  // Sync video time with playhead
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !current?.scene || !current?.asset || current.asset.type !== "video") return;
    const localMs = playheadMs - current.scene.startMs;
    const t = Math.max(0, localMs / 1000);
    // avoid thrashing: only seek if drift > 40ms
    if (Math.abs((el.currentTime ?? 0) - t) > 0.04) el.currentTime = t;
    if (isPlaying && el.paused) el.play().catch(() => {});
    if (!isPlaying && !el.paused) el.pause();
  }, [playheadMs, isPlaying, current?.scene, current?.asset]);

  // Load transform from scene or reset to default
  useEffect(() => {
    if (current?.scene) {
      // Load transform from scene data, or use default
      const sceneTransform = current.scene.transform || { x: 0, y: 0, scale: 1 };
      setTransform(sceneTransform);
      // Reset selection state when media changes
      setIsMediaSelected(false);
    }
  }, [current?.scene?.id, current?.scene?.transform]);

  // Media click handler - toggle selection
  const handleMediaClick = useCallback((e: React.MouseEvent) => {
    if (!current?.asset) return;
    e.preventDefault();
    e.stopPropagation();
    setIsMediaSelected(prev => !prev); // Toggle selection
  }, [current?.asset]);

  /**
   * Checks if media is at center position and updates guide visibility
   * @param x - Horizontal offset from center
   * @param y - Vertical offset from center
   */
  const checkCenterPosition = useCallback((x: number, y: number) => {
    const isVerticallyCentered = Math.abs(x) < CENTER_THRESHOLD;
    const isHorizontallyCentered = Math.abs(y) < CENTER_THRESHOLD;
    
    setShowVerticalGuide(isVerticallyCentered);
    setShowHorizontalGuide(isHorizontallyCentered);
  }, []);

  // Center drag handler - move media around
  const handleCenterDragStart = useCallback((e: React.MouseEvent) => {
    if (!current?.asset) return;
    e.preventDefault();
    e.stopPropagation();
    setIsTransforming(true);
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      transform: { ...transform }
    });
  }, [current?.asset, transform]);

  const handleCenterDragMove = useCallback((e: MouseEvent) => {
    if (!isTransforming || !current?.asset || !current?.scene) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    const newTransform = {
      ...dragStart.transform,
      x: dragStart.transform.x + deltaX,
      y: dragStart.transform.y + deltaY
    };
    
    setTransform(newTransform);
    // Check if at center position
    checkCenterPosition(newTransform.x, newTransform.y);
    // Save to scene
    updateSceneTransform(current.scene.id, newTransform);
  }, [isTransforming, dragStart, current?.asset, current?.scene, updateSceneTransform, checkCenterPosition]);

  // Border drag handler - resize/zoom by dragging border edges
  const handleBorderDragStart = useCallback((e: React.MouseEvent, edge: string) => {
    if (!current?.asset) return;
    e.preventDefault();
    e.stopPropagation();
    setIsTransforming(true);
    setBorderDragStart({
      x: e.clientX,
      y: e.clientY,
      transform: { ...transform },
      edge
    });
  }, [current?.asset, transform]);

  const handleBorderDragMove = useCallback((e: MouseEvent) => {
    if (!isTransforming || !current?.asset || !current?.scene) return;
    
    const deltaX = e.clientX - borderDragStart.x;
    const deltaY = e.clientY - borderDragStart.y;
    
    // Calculate scale based on edge being dragged
    let scaleFactor = 0;
    
    // Handle corner resizing (diagonal)
    if (borderDragStart.edge.includes('top-left')) {
      scaleFactor = -(deltaX + deltaY) / 150; // Diagonal scaling
    } else if (borderDragStart.edge.includes('top-right')) {
      scaleFactor = (deltaX - deltaY) / 150;
    } else if (borderDragStart.edge.includes('bottom-left')) {
      scaleFactor = (-deltaX + deltaY) / 150;
    } else if (borderDragStart.edge.includes('bottom-right')) {
      scaleFactor = (deltaX + deltaY) / 150;
    } else {
      // Handle edge resizing
      if (borderDragStart.edge.includes('right')) scaleFactor += deltaX / 100;
      if (borderDragStart.edge.includes('left')) scaleFactor -= deltaX / 100;
      if (borderDragStart.edge.includes('bottom')) scaleFactor += deltaY / 100;
      if (borderDragStart.edge.includes('top')) scaleFactor -= deltaY / 100;
    }
    
    const newScale = Math.max(0.1, Math.min(5, borderDragStart.transform.scale + scaleFactor));
    
    const newTransform = {
      ...borderDragStart.transform,
      scale: newScale
    };
    
    setTransform(newTransform);
    // Save to scene
    updateSceneTransform(current.scene.id, newTransform);
  }, [isTransforming, borderDragStart, current?.asset, current?.scene, updateSceneTransform]);

  const handleDragEnd = useCallback(() => {
    setIsTransforming(false);
    setIsDragging(false);
    setShowVerticalGuide(false);
    setShowHorizontalGuide(false);
    setBorderDragStart({ x: 0, y: 0, transform: { x: 0, y: 0, scale: 1 }, edge: '' });
  }, []);

  // Global mouse event listeners
  useEffect(() => {
    if (isTransforming) {
      const handleMouseMove = (e: MouseEvent) => {
        if (borderDragStart.edge && borderDragStart.edge !== '') {
          handleBorderDragMove(e);
        } else {
          handleCenterDragMove(e);
        }
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isTransforming, handleCenterDragMove, handleBorderDragMove, handleDragEnd, borderDragStart.edge]);

  // Reset transform button
  const resetTransform = useCallback(() => {
    const defaultTransform = { x: 0, y: 0, scale: 1 };
    setTransform(defaultTransform);
    setShowVerticalGuide(false);
    setShowHorizontalGuide(false);
    // Save to scene
    if (current?.scene) {
      updateSceneTransform(current.scene.id, defaultTransform);
    }
    // Deselect media after reset
    setIsMediaSelected(false);
  }, [current?.scene, updateSceneTransform]);

  /**
   * Handles wheel zoom events for media scaling
   * @param e - Wheel event
   */
  const handleWheelZoom = useCallback((e: WheelEvent) => {
    if (!current?.asset || !current?.scene) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const zoomFactor = e.deltaY > 0 ? (1 - ZOOM_FACTOR) : (1 + ZOOM_FACTOR);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale * zoomFactor));
    
    const newTransform = {
      ...transform,
      scale: newScale
    };
    
    setTransform(newTransform);
    updateSceneTransform(current.scene.id, newTransform);
  }, [current?.asset, current?.scene, transform, updateSceneTransform]);

  // Add wheel event listener to the player container
  useEffect(() => {
    if (!current?.asset) return;
    
    const playerContainer = document.querySelector('.player-container');
    if (!playerContainer) return;
    
    playerContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
    
    return () => {
      playerContainer.removeEventListener('wheel', handleWheelZoom);
    };
  }, [current?.asset, handleWheelZoom]);

  // Handle clicking outside media to deselect
  const handleOutsideClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking on the background, not on media
    if (e.target === e.currentTarget) {
      setIsMediaSelected(false);
    }
  }, []);

  // Memoized transform styles for performance
  const transformStyles = useMemo(() => ({
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    transformOrigin: 'center center'
  }), [transform.x, transform.y, transform.scale]);

  const containerRef = React.useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node);
  }, []);

  React.useEffect(() => {
    if (!containerElement) return;

    const updateDimensions = () => {
      const containerWidth = containerElement.clientWidth;
      const containerHeight = containerElement.clientHeight;
      
      const ratio = aspectRatios[aspect];
      const containerAspect = containerWidth / containerHeight;
      const targetAspect = ratio.w / ratio.h;
      
      let width, height;
      
      if (containerAspect > targetAspect) {
        // Container is wider than target aspect - fit to height
        height = containerHeight;
        width = height * targetAspect;
      } else {
        // Container is taller than target aspect - fit to width
        width = containerWidth;
        height = width / targetAspect;
      }
      
      setDimensions({ 
        width: Math.floor(width), 
        height: Math.floor(height) 
      });
    };

    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerElement);
    
    return () => resizeObserver.disconnect();
  }, [aspect, containerElement]);

  return (
    <ClientOnly fallback={
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--surface-secondary)]">
        <div className="text-sm text-[var(--text-tertiary)]">Loading player...</div>
      </div>
    }>
      <div className="relative flex h-full w-full flex-col bg-[var(--surface-secondary)]">
        {/* Video frame area - center */}
        <div 
          ref={containerRef}
          className="relative flex-1 flex items-center justify-center overflow-hidden p-1"
        >
           <div
             className={`player-container ${showGrid ? "preview-surface" : ""}`}
             style={{ 
               width: `${dimensions.width}px`,
               height: `${dimensions.height}px`,
               borderRadius: 10, 
               position: "relative", 
               background: "#0c0d11", 
               border: "2px solid #3b82f6",
               zIndex: 1,
               transition: "all 0.3s ease-out",
               overflow: "hidden"
             }}
             suppressHydrationWarning
           >
            {showSafeArea && <div className="safe-area" />}
            
            {/* Smart Center Guides - Show independently when dragging */}
            {isDragging && (
              <>
                {/* Vertical center line - only when horizontally centered */}
                {showVerticalGuide && (
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-blue-400/80 z-20"
                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                  />
                )}
                {/* Horizontal center line - only when vertically centered */}
                {showHorizontalGuide && (
                  <div 
                    className="absolute left-0 right-0 h-0.5 bg-blue-400/80 z-20"
                    style={{ top: '50%', transform: 'translateY(-50%)' }}
                  />
                )}
              </>
            )}
            
             {/* Live Preview Content - Full Frame */}
             <div 
               className="absolute inset-0"
               onClick={handleOutsideClick}
             >
              {!current || !current.asset ? (
                <div className="flex h-full items-center justify-center text-white/40 text-sm">
                  {scenes.length ? "No media on current scene" : "Add media to the timeline to preview"}
                </div>
              ) : (
                <div className="relative h-full w-full">
                  {/* Professional Media Container - Full Frame */}
                  <div
                    className="relative h-full w-full cursor-pointer"
                    style={transformStyles}
                    onClick={handleMediaClick}
                  >
                    {/* Media Content - Full Frame */}
                    {current.asset.type === "image" ? (
                      <img
                        key={mediaKey}
                        src={current.asset.url}
                        alt={current.asset.name}
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    ) : current.asset.type === "video" ? (
                      <video
                        key={mediaKey}
                        ref={videoRef}
                        src={current.asset.url}
                        className="w-full h-full object-contain"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/40 text-sm">
                        Unsupported asset on video track
                      </div>
                    )}

                    {/* Professional Transform Controls - Overlay (Only when selected) */}
                    {isMediaSelected && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Center area for moving */}
                        <div
                          className="absolute inset-2 cursor-move pointer-events-auto"
                          onMouseDown={handleCenterDragStart}
                          title="Drag to move media"
                        />
                        
                        {/* Professional corner handles */}
                        <div
                          className="absolute top-1 left-1 w-3 h-3 bg-white/80 border border-gray-700 cursor-nw-resize hover:bg-white transition-colors pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'top-left')}
                          title="Drag to resize"
                        />
                        <div
                          className="absolute top-1 right-1 w-3 h-3 bg-white/80 border border-gray-700 cursor-ne-resize hover:bg-white transition-colors pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'top-right')}
                          title="Drag to resize"
                        />
                        <div
                          className="absolute bottom-1 left-1 w-3 h-3 bg-white/80 border border-gray-700 cursor-sw-resize hover:bg-white transition-colors pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'bottom-left')}
                          title="Drag to resize"
                        />
                        <div
                          className="absolute bottom-1 right-1 w-3 h-3 bg-white/80 border border-gray-700 cursor-se-resize hover:bg-white transition-colors pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'bottom-right')}
                          title="Drag to resize"
                        />
                        
                        {/* Professional edge handles */}
                        <div
                          className="absolute top-0 left-4 right-4 h-2 cursor-n-resize hover:bg-white/20 pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'top')}
                          title="Drag to resize"
                        />
                        <div
                          className="absolute bottom-0 left-4 right-4 h-2 cursor-s-resize hover:bg-white/20 pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'bottom')}
                          title="Drag to resize"
                        />
                        <div
                          className="absolute top-4 bottom-4 left-0 w-2 cursor-w-resize hover:bg-white/20 pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'left')}
                          title="Drag to resize"
                        />
                        <div
                          className="absolute top-4 bottom-4 right-0 w-2 cursor-e-resize hover:bg-white/20 pointer-events-auto rounded-sm"
                          onMouseDown={(e) => handleBorderDragStart(e, 'right')}
                          title="Drag to resize"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transport Controls - bottom center */}
        <div className="flex justify-center p-0">
          <div className="flex items-center gap-1 bg-[var(--surface-primary)]/95 border border-[var(--border-primary)]/20 rounded px-2 py-0.5 backdrop-blur-md shadow-sm">
            <Button 
              aria-label="Back 1s" 
              className="btn p-0.5 hover:bg-[var(--surface-secondary)]/50"
              onClick={() => nudgePlayhead(-1000)}
              suppressHydrationWarning
            >
              <SkipBack size={8}/>
            </Button>
            <Button 
              aria-label="Play/Pause" 
              className={`btn p-0.5 ${isPlaying ? 'primary' : ''} hover:bg-[var(--surface-secondary)]/50`}
              onClick={togglePlayback}
              suppressHydrationWarning
            >
              {isPlaying ? <Pause size={8}/> : <Play size={8}/>}
            </Button>
            <Button 
              aria-label="Forward 1s" 
              className="btn p-0.5 hover:bg-[var(--surface-secondary)]/50"
              onClick={() => nudgePlayhead(1000)}
              suppressHydrationWarning
            >
              <SkipForward size={8}/>
            </Button>
          </div>
        </div>

        {/* Time Counter - bottom left, matching controls height */}
        <div className="absolute bottom-2 left-2 bg-[var(--surface-primary)]/90 border border-[var(--border-primary)]/30 rounded-md px-2 py-0.5 backdrop-blur-sm shadow-sm">
          <div className="text-xs text-[var(--text-primary)] font-mono tracking-wide time-display">
            {formatTime(playheadMs)} / {formatTime(durationMs)}
          </div>
        </div>

        {/* Aspect Ratio - separate, positioned independently */}
        <div className="absolute top-2 right-2 z-10">
          <select 
            value={aspect}
            onChange={(e) => setAspect(e.target.value as any)}
            className="text-xs px-2 py-1 bg-[var(--surface-primary)]/95 border border-[var(--border-primary)]/20 rounded backdrop-blur-md shadow-sm text-[var(--text-primary)] cursor-pointer hover:bg-[var(--surface-secondary)]/50 transition-colors"
          >
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
          </select>
        </div>

        {/* Minimal Transform Controls */}
        {current?.asset && (
          <div className="absolute top-2 left-2 z-10">
            <Button
              onClick={resetTransform}
              className="text-xs px-2 py-1 bg-black/50 border border-white/20 rounded backdrop-blur-md shadow-sm text-white hover:bg-white/10 transition-colors"
              title="Reset Transform"
            >
              Reset
            </Button>
          </div>
        )}
      </div>
    </ClientOnly>
  );
}