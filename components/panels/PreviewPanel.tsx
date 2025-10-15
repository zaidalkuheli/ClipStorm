"use client";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { ClientOnly } from "@/components/ui/ClientOnly";

export function PreviewPanel() {
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [aspect, setAspect] = useState<"9:16"|"1:1"|"16:9">("9:16");
  const previewRef = useRef<HTMLDivElement>(null);

  // Get aspect ratio dimensions
  const getAspectDimensions = (aspect: string) => {
    const baseWidth = 320;
    switch (aspect) {
      case "9:16":
        return { width: baseWidth, height: Math.round(baseWidth * 16 / 9) }; // 9:16 aspect = 320×569
      case "1:1":
        return { width: baseWidth, height: baseWidth }; // 1:1 aspect = 320×320
      case "16:9":
        return { width: baseWidth, height: Math.round(baseWidth * 9 / 16) }; // 16:9 aspect = 320×180
      default:
        return { width: baseWidth, height: Math.round(baseWidth * 16 / 9) };
    }
  };

  const videoDimensions = getAspectDimensions(aspect);

  // Space toggles play (UI-only)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mouse scroll zoom functionality
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!previewRef.current?.contains(e.target as Node)) return;
      
      e.preventDefault();
      
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.5, Math.min(3, zoom + delta));
      setZoom(newZoom);
    };

    const previewElement = previewRef.current;
    if (previewElement) {
      previewElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => previewElement.removeEventListener('wheel', handleWheel);
    }
  }, [zoom]);

  // Optimized drag functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  // Global mouse events for smooth drag
  useEffect(() => {
    if (!isDragging) return;

    let animationFrame: number;
    
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      
      animationFrame = requestAnimationFrame(() => {
        const newPosition = {
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        };
        setPosition(newPosition);
      });
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };

    document.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isDragging, dragStart]);

  return (
    <Panel
      title="Player"
      className="h-full"
    >
      <div className="flex flex-col h-full">
        {/* CapCut-style clean preview area */}
        <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-[var(--surface-secondary)]">
          {/* Ultra-minimal aspect controls */}
          <div className="absolute top-3 right-3 z-10">
            <div className="flex items-center bg-[var(--surface-primary)]/80 border border-[var(--border-primary)]/40 rounded-md px-2 py-1 backdrop-blur-sm">
              <div className="flex gap-1">
                {["9:16","1:1","16:9"].map(v=>(
                  <button 
                    key={v} 
                    aria-pressed={aspect===v} 
                    onClick={()=>setAspect(v as any)}
                    className="text-xs px-2 py-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]/50 rounded-sm transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div 
            ref={previewRef}
            className="preview-surface p-6 cursor-move select-none"
            style={{ 
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: 'center',
              willChange: 'transform'
            }}
            onMouseDown={handleMouseDown}
          >
            <div 
              className="relative rounded-xl bg-gradient-to-br from-[var(--bg-primary)] to-[var(--bg-secondary)] shadow-xl transition-all duration-300 ease-out"
              style={{ 
                width: `${videoDimensions.width}px`, 
                height: `${videoDimensions.height}px` 
              }}
            >
              <div className="safe-area" />
              {/* Preview content placeholder */}
              <div className="absolute inset-4 rounded-lg bg-gradient-to-br from-[var(--surface-secondary)] to-[var(--surface-tertiary)] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center shadow-lg">
                    <ClientOnly fallback={<div className="w-5 h-5 bg-white rounded-sm ml-0.5" />}>
                      <Play size={20} className="text-white ml-0.5" />
                    </ClientOnly>
                  </div>
                  <div className="text-sm text-[var(--text-tertiary)] font-medium">Preview Area</div>
                  <div className="text-xs text-[var(--text-quaternary)] mt-1">Scroll to zoom • Drag to move</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CapCut-style minimal controls */}
        <div className="flex-shrink-0 border-t border-[var(--border-primary)] bg-[var(--surface-primary)] px-6 py-4">
          {/* Timeline indicator and play button - matches CapCut */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-[var(--text-tertiary)] font-mono">00:00:00:00 / 00:00:00:00</span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                aria-label="Play/Pause" 
                className={`px-4 py-2 ${playing ? 'primary' : ''}`}
              >
                {playing ? <Pause size={18}/> : <Play size={18}/>} 
              </Button>
            </div>
          </div>

          {/* Display options - matches CapCut */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" className="px-3 py-1 text-sm">
                Full
              </Button>
              <Button variant="ghost" className="px-3 py-1 text-sm">
                Ratio
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-quaternary)]">{Math.round(zoom * 100)}%</span>
              <Button 
                variant="ghost" 
                className="px-3 py-1 text-sm"
                onClick={() => {
                  setZoom(1);
                  setPosition({ x: 0, y: 0 });
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}