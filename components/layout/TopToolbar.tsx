"use client";
import { ClientOnly } from "@/components/ui/ClientOnly";

export function TopToolbar() {
  return (
    <ClientOnly fallback={
      <div className="toolbar">
        {/* Completely minimal - no content */}
      </div>
    }>
      <div className="toolbar">
        {/* Ultra-minimal design - less is more */}
      </div>
    </ClientOnly>
  );
}
