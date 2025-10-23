"use client";
import React from "react";
import { useEditorStore } from "@/stores/editorStore";

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

export function Ruler({ contentWidth }: { contentWidth: number }) {
  const durationMs = useEditorStore(s => s.durationMs);
  const pxPerSec = useEditorStore(s => s.pxPerSec);

  // choose major tick every 5s/2s/1s based on zoom
  const majorEverySec = pxPerSec >= 250 ? 1 : pxPerSec >= 120 ? 2 : 5;
  const minorEverySec = majorEverySec / 5;

  const totalSec = Math.ceil(durationMs / 1000);
  const majors: number[] = [];
  for (let s = 0; s <= totalSec; s += majorEverySec) majors.push(s);

  const minors: number[] = [];
  for (let s = 0; s <= totalSec; s += minorEverySec) minors.push(s);

  // Debug: ensure 0 is always included
  if (!majors.includes(0)) {
    majors.unshift(0);
  }

  return (
    <div className="relative h-8 w-full select-none">
      {/* minor ticks */}
      {minors.map((s) => {
        const x = s * pxPerSec;
        return (
          <div
            key={`m-${s}`}
            className="absolute bottom-0 w-px bg-white/8"
            style={{ left: x, height: 10 }}
          />
        );
      })}
      {/* major ticks + labels */}
      {majors.map((s) => {
        const x = s * pxPerSec;
        return (
          <div key={`M-${s}`} className="absolute bottom-0" style={{ left: x }}>
            <div className="w-px bg-white/20" style={{ height: 16 }} />
            <div 
              className="absolute -translate-x-1/2 -top-1 text-[9px] text-[var(--muted)] select-none whitespace-nowrap font-mono"
              style={{ 
                left: s === 0 ? '4px' : '50%', // Special positioning for 0s to avoid cutoff
                transform: s === 0 ? 'none' : 'translateX(-50%)'
              }}
            >
              {formatTime(s)}
            </div>
          </div>
        );
      })}
      {/* bottom border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-[var(--border)]" />
    </div>
  );
}
