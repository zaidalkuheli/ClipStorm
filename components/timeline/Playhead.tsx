"use client";
import React from "react";
import { useEditorStore } from "@/stores/editorStore";

export function Playhead({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const playheadMs = useEditorStore(s => s.playheadMs);
  const pxPerSec = useEditorStore(s => s.pxPerSec);
  const setPlayhead = useEditorStore(s => s.setPlayhead);

  const x = (playheadMs / 1000) * pxPerSec;

  const startDrag = (clientX: number) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const bounds = sc.getBoundingClientRect();
    const toMs = (px: number) => {
      const ms = ((px + sc.scrollLeft) / pxPerSec) * 1000;
      return Math.max(0, ms); // Ensure never goes below 0
    };
    setPlayhead(toMs(clientX - bounds.left));

    const onMove = (e: MouseEvent) => setPlayhead(toMs(e.clientX - bounds.left));
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
