"use client";
import { Panel } from "@/components/ui/Panel";
import { useState } from "react";

export function Timeline() {
  const [playheadPct] = useState(0.12); // UI-only

  return (
    <Panel title="Timeline" className="h-full relative">
      <div className="flex flex-col h-full">
        {/* Timeline Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-primary)]/30">
          <div className="flex items-center gap-4">
            <div className="text-xs font-medium text-[var(--text-secondary)]">Duration: 00:20</div>
            <div className="text-xs text-[var(--text-tertiary)]">4 Scenes • 5 Captions</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs px-2 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              Zoom Out
            </button>
            <button className="text-xs px-2 py-1 rounded bg-[var(--surface-secondary)] hover:bg-[var(--surface-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              Zoom In
            </button>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-hidden relative">
          {/* Playhead */}
          <div className="absolute top-0 bottom-0 z-20" style={{ left: `calc(${playheadPct*100}% - 1px)` }}>
            <div className="playhead" />
          </div>

          {/* Tracks Container */}
          <div className="h-full p-3 space-y-3">
            {/* Video Track */}
            <div className="track-container">
              <div className="track-label">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Video</span>
              </div>
              <div className="track-content">
                <div className="timeline-clip bg-gradient-to-r from-[var(--brand-primary)]/20 to-[var(--brand-secondary)]/20 border border-[var(--brand-primary)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--brand-primary)]">Scene 1</span>
                  </div>
                </div>
                <div className="timeline-clip bg-gradient-to-r from-[var(--brand-primary)]/20 to-[var(--brand-secondary)]/20 border border-[var(--brand-primary)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--brand-primary)]">Scene 2</span>
                  </div>
                </div>
                <div className="timeline-clip bg-gradient-to-r from-[var(--brand-primary)]/20 to-[var(--brand-secondary)]/20 border border-[var(--brand-primary)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--brand-primary)]">Scene 3</span>
                  </div>
                </div>
                <div className="timeline-clip bg-gradient-to-r from-[var(--brand-primary)]/20 to-[var(--brand-secondary)]/20 border border-[var(--brand-primary)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--brand-primary)]">Scene 4</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Track */}
            <div className="track-container">
              <div className="track-label">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Audio</span>
              </div>
              <div className="track-content">
                <div className="timeline-clip bg-gradient-to-r from-[var(--accent-tertiary)]/20 to-[var(--accent-cool)]/20 border border-[var(--accent-tertiary)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--accent-tertiary)]">Voice</span>
                  </div>
                </div>
                <div className="timeline-clip bg-gradient-to-r from-[var(--accent-warm)]/20 to-[var(--accent-secondary)]/20 border border-[var(--accent-warm)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--accent-warm)]">Music</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Captions Track */}
            <div className="track-container">
              <div className="track-label">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Captions</span>
              </div>
              <div className="track-content">
                <div className="timeline-clip bg-gradient-to-r from-[var(--success)]/20 to-[var(--success-light)]/20 border border-[var(--success)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--success)]">Caption 1</span>
                  </div>
                </div>
                <div className="timeline-clip bg-gradient-to-r from-[var(--success)]/20 to-[var(--success-light)]/20 border border-[var(--success)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--success)]">Caption 2</span>
                  </div>
                </div>
                <div className="timeline-clip bg-gradient-to-r from-[var(--success)]/20 to-[var(--success-light)]/20 border border-[var(--success)]/30">
                  <div className="clip-content">
                    <span className="text-xs font-medium text-[var(--success)]">Caption 3</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Professional Ruler */}
        <div className="ruler">
          <div className="ruler-markers">
            <div className="ruler-marker major">
              <span>0s</span>
            </div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker major">
              <span>5s</span>
            </div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker major">
              <span>10s</span>
            </div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker major">
              <span>15s</span>
            </div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker minor"></div>
            <div className="ruler-marker major">
              <span>20s</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}