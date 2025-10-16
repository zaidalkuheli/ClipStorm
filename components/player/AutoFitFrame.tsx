"use client";
import React from "react";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { Button } from "@/components/ui/Button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";

type Props = {
  aspect: "9:16" | "1:1" | "16:9";
  showGrid?: boolean;
  showSafeArea?: boolean;
  children?: React.ReactNode;   // overlays, etc.
};

const aspectRatios = {
  "9:16": { w: 9, h: 16 },
  "1:1": { w: 1, h: 1 }, 
  "16:9": { w: 16, h: 9 }
};

export function AutoFitFrame({ aspect, showGrid, showSafeArea, children }: Props) {
  const [dimensions, setDimensions] = React.useState({ width: 360, height: 640 });
  const [containerElement, setContainerElement] = React.useState<HTMLDivElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const setAspect = useEditorStore(s => s.setAspect);

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
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[var(--surface-secondary)] border border-blue-500/20">
        <div className="text-sm text-[var(--text-tertiary)]">Loading player...</div>
      </div>
    }>
      <div className="relative flex h-full w-full flex-col bg-[var(--surface-secondary)] border border-blue-500/20">
        {/* Controls area - top */}
        <div className="flex justify-end p-1">
          <div className="flex items-center bg-[var(--surface-primary)]/95 border border-[var(--border-primary)]/20 rounded px-1 py-0.5 backdrop-blur-md shadow-sm">
            <select 
              value={aspect}
              onChange={(e) => setAspect(e.target.value as any)}
              className="text-xs px-1 py-0.5 bg-[var(--surface-primary)] border-none outline-none text-[var(--text-primary)] cursor-pointer rounded"
            >
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="16:9">16:9</option>
            </select>
          </div>
        </div>

        {/* Video frame area - center */}
        <div 
          ref={containerRef}
          className="relative flex-1 flex items-center justify-center overflow-hidden p-4"
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
                <div className="text-xs text-[var(--text-quaternary)] mt-1">{aspect} - Auto-fit frame</div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls area - bottom */}
        <div className="flex justify-center p-1">
          <div className="flex items-center gap-0.5 bg-[var(--surface-primary)]/95 border border-[var(--border-primary)]/20 rounded px-1 py-0.5 backdrop-blur-md shadow-sm">
            <Button 
              aria-label="Back 1s" 
              className="btn p-0.5 hover:bg-[var(--surface-secondary)]/50"
              suppressHydrationWarning
            >
              <SkipBack size={8}/>
            </Button>
            <Button 
              aria-label="Play/Pause" 
              className={`btn p-0.5 ${playing ? 'primary' : ''} hover:bg-[var(--surface-secondary)]/50`}
              onClick={() => setPlaying(!playing)}
              suppressHydrationWarning
            >
              {playing ? <Pause size={8}/> : <Play size={8}/>}
            </Button>
            <Button 
              aria-label="Forward 1s" 
              className="btn p-0.5 hover:bg-[var(--surface-secondary)]/50"
              suppressHydrationWarning
            >
              <SkipForward size={8}/>
            </Button>
          </div>
        </div>
      </div>
    </ClientOnly>
  );
}
