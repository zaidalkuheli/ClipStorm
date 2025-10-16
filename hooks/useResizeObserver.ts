"use client";
import { useEffect, useState } from "react";

export function useResizeObserver<T extends HTMLElement>() {
  const [rect, setRect] = useState<DOMRectReadOnly | null>(null);
  const [refEl, setRefEl] = useState<T | null>(null);

  useEffect(() => {
    if (!refEl) return;
    const obs = new ResizeObserver(([entry]) => setRect(entry.contentRect));
    obs.observe(refEl);
    return () => obs.disconnect();
  }, [refEl]);

  return { ref: setRefEl, rect };
}
