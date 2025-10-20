"use client";
import React from "react";
import { useEditorStore, SNAP_PX } from "@/stores/editorStore";

export function Playhead({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const playheadMs = useEditorStore(s => s.playheadMs);
  const pxPerSec = useEditorStore(s => s.pxPerSec);
  const setPlayhead = useEditorStore(s => s.setPlayhead);
  const scenes = useEditorStore(s => s.scenes);
  const audioClips = useEditorStore(s => s.audioClips);

  const x = (playheadMs / 1000) * pxPerSec;

  const startDrag = (clientX: number) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const bounds = sc.getBoundingClientRect();
    const pxToMs = (contentPx: number) => Math.max(0, ((contentPx + sc.scrollLeft) / pxPerSec) * 1000);

    const snapIfClose = (contentPx: number) => {
      // Candidate edges from both scenes and audio
      let closestPxDiff = Infinity;
      let snappedMs: number | null = null;

      const considerEdge = (edgeMs: number) => {
        const edgePx = (edgeMs / 1000) * pxPerSec - sc.scrollLeft; // content px relative to viewport left
        const diff = Math.abs(edgePx - contentPx);
        if (diff < closestPxDiff) {
          closestPxDiff = diff;
          snappedMs = edgeMs;
        }
      };

      for (const s of scenes) {
        considerEdge(s.startMs);
        considerEdge(s.endMs);
      }
      for (const a of audioClips) {
        considerEdge(a.startMs);
        considerEdge(a.endMs);
      }

      // If within SNAP_PX, snap to that edge; otherwise free position
      if (snappedMs != null && closestPxDiff <= SNAP_PX) {
        return snappedMs;
      }
      return pxToMs(contentPx);
    };

    // Initial position
    setPlayhead(snapIfClose(clientX - bounds.left));

    const onMove = (e: MouseEvent) => setPlayhead(snapIfClose(e.clientX - bounds.left));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <>
      {/* full-height line */}
      <div
        className="absolute top-0 bottom-0 w-[2px] bg-[#7c8cff] shadow-[0_0_0_1px_#5c6bff] playhead-line"
        style={{ left: x }}
      />
      {/* grab handle on ruler area */}
      <div
        className="absolute top-0 h-8 w-4 -translate-x-1/2 cursor-col-resize"
        style={{ left: x }}
        onMouseDown={(e) => startDrag(e.clientX)}
        title="Drag to scrub"
      />
    </>
  );
}
