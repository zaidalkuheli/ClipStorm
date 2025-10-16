"use client";
import { Button } from "@/components/ui/Button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";

export function PlayerOverlayControls() {
  const [playing, setPlaying] = useState(false);
  const aspect = useEditorStore(s => s.aspect);
  const setAspect = useEditorStore(s => s.setAspect);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {/* Ultra-minimal aspect ratio controls - top right, outside video frame */}
      <div className="absolute top-2 right-2 pointer-events-auto">
        <div className="flex items-center bg-[var(--surface-primary)]/95 border border-[var(--border-primary)]/30 rounded-sm px-1.5 py-0.5 backdrop-blur-md shadow-sm">
          <div className="flex gap-0.5">
            {["9:16","1:1","16:9"].map(v=>(
              <button 
                key={v} 
                aria-pressed={aspect===v} 
                onClick={()=>setAspect(v as any)}
                className={`text-xs px-1.5 py-0.5 rounded-sm transition-all duration-150 ${
                  aspect === v 
                    ? 'text-white bg-[var(--brand-primary)] shadow-sm' 
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]/60'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ultra-minimal player controls - bottom center, outside video frame */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-1 bg-[var(--surface-primary)]/95 border border-[var(--border-primary)]/30 rounded-md px-2 py-1 backdrop-blur-md shadow-sm">
          <Button 
            aria-label="Back 1s" 
            className="btn p-0.5 hover:bg-[var(--surface-secondary)]/60"
            suppressHydrationWarning
          >
            <SkipBack size={12}/>
          </Button>
          <Button 
            aria-label="Play/Pause" 
            className={`btn p-0.5 ${playing ? 'primary' : ''} hover:bg-[var(--surface-secondary)]/60`}
            onClick={() => setPlaying(!playing)}
            suppressHydrationWarning
          >
            {playing ? <Pause size={12}/> : <Play size={12}/>}
          </Button>
          <Button 
            aria-label="Forward 1s" 
            className="btn p-0.5 hover:bg-[var(--surface-secondary)]/60"
            suppressHydrationWarning
          >
            <SkipForward size={12}/>
          </Button>
        </div>
      </div>
    </div>
  );
}
