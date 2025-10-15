"use client";
import { Panel } from "@/components/ui/Panel";
import { useState } from "react";

export function Timeline() {
  const [playheadPct] = useState(0.12); // UI-only

  return (
    <Panel title="Timeline" className="h-full relative">
      <div className="flex flex-col h-full">
        {/* Tracks */}
        <div className="flex-1 overflow-hidden p-4 relative min-h-0">
          <div className="absolute top-0 bottom-8" style={{ left: `calc(${playheadPct*100}% - 1px)` }}>
            <div className="playhead" />
          </div>
          {/* Scene lane */}
          <div className="mb-4">
            <div className="text-xs mb-2 text-[var(--text-tertiary)] font-medium">Scenes</div>
            <div className="h-16 rounded-lg border border-[var(--border-primary)] bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-tertiary)] p-3 flex gap-3">
              <div className="timeline-block flex-1 rounded-lg" />
              <div className="timeline-block flex-1 rounded-lg" />
              <div className="timeline-block flex-1 rounded-lg" />
              <div className="timeline-block flex-1 rounded-lg" />
            </div>
          </div>
          {/* Captions lane */}
          <div>
            <div className="text-xs mb-2 text-[var(--text-tertiary)] font-medium">Captions</div>
            <div className="h-14 rounded-lg border border-[var(--border-primary)] bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-tertiary)] p-3 flex gap-2">
              <div className="timeline-block w-20 rounded-md" />
              <div className="timeline-block w-28 rounded-md" />
              <div className="timeline-block w-16 rounded-md" />
              <div className="timeline-block w-24 rounded-md" />
              <div className="timeline-block w-32 rounded-md" />
            </div>
          </div>
        </div>
        {/* Enhanced Ruler */}
        <div className="ruler flex-shrink-0">
          <span className="font-semibold">0s</span>
          <span>5s</span>
          <span>10s</span>
          <span>15s</span>
          <span className="font-semibold">20s</span>
        </div>
      </div>
    </Panel>
  );
}