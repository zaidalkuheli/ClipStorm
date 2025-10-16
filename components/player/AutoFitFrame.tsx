"use client";
import React from "react";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { Button } from "@/components/ui/Button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useEditorStore, type AspectRatio } from "@/stores/editorStore";
import { usePlaybackTimer } from "@/hooks/usePlaybackTimer";

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
  
  const setAspect = useEditorStore(s => s.setAspect);
  const isPlaying = useEditorStore(s => s.isPlaying);
  const playheadMs = useEditorStore(s => s.playheadMs);
  const durationMs = useEditorStore(s => s.durationMs);
  const togglePlayback = useEditorStore(s => s.togglePlayback);
  const nudgePlayhead = useEditorStore(s => s.nudgePlayhead);

  // Start the playback timer
  usePlaybackTimer();

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
            className={showGrid ? "preview-surface" : ""}
            style={{ 
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
              borderRadius: 10, 
              position: "relative", 
              background: "#0c0d11", 
              border: "2px solid #3b82f6",
              zIndex: 1,
              transition: "all 0.3s ease-out"
            }}
            suppressHydrationWarning
          >
            {showSafeArea && <div className="safe-area" />}
            
            {/* Preview content placeholder */}
            <div className="absolute inset-4 rounded-lg bg-gradient-to-br from-[var(--surface-secondary)] to-[var(--surface-tertiary)] flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center shadow-lg">
                  <div className="w-5 h-5 bg-white rounded-sm ml-0.5" />
                </div>
                <div className="text-sm text-[var(--text-tertiary)] font-medium">Preview Area</div>
                <div className="text-xs text-[var(--text-quaternary)] mt-1">{aspect}</div>
              </div>
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
      </div>
    </ClientOnly>
  );
}
