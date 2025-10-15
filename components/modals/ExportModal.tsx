"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { X, Download, Settings } from "lucide-react";
import { ClientOnly } from "@/components/ui/ClientOnly";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [resolution, setResolution] = useState<"1080x1920"|"720x1280"|"4K">("1080x1920");
  const [format, setFormat] = useState<"MP4"|"MOV"|"AVI">("MP4");
  const [quality, setQuality] = useState<"High"|"Medium"|"Low">("High");
  const [fps, setFps] = useState<"24"|"30"|"60">("30");

  if (!isOpen) return null;

  return (
    <ClientOnly>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-2xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-[var(--border-primary)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center">
                <Download size={16} className="text-white" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Export Settings</h2>
            </div>
            <Button variant="ghost" onClick={onClose} className="p-2">
              <X size={18} />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Resolution */}
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] mb-3 block">
                Resolution
              </label>
              <div className="seg">
                {["1080x1920","720x1280","4K"].map(v=>(
                  <button 
                    key={v} 
                    aria-pressed={resolution===v} 
                    onClick={()=>setResolution(v as any)}
                    className="text-sm px-3 py-2"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] mb-3 block">
                Format
              </label>
              <div className="seg">
                {["MP4","MOV","AVI"].map(v=>(
                  <button 
                    key={v} 
                    aria-pressed={format===v} 
                    onClick={()=>setFormat(v as any)}
                    className="text-sm px-3 py-2"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] mb-3 block">
                Quality
              </label>
              <div className="seg">
                {["High","Medium","Low"].map(v=>(
                  <button 
                    key={v} 
                    aria-pressed={quality===v} 
                    onClick={()=>setQuality(v as any)}
                    className="text-sm px-3 py-2"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* FPS */}
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] mb-3 block">
                Frame Rate
              </label>
              <div className="seg">
                {["24","30","60"].map(v=>(
                  <button 
                    key={v} 
                    aria-pressed={fps===v} 
                    onClick={()=>setFps(v as any)}
                    className="text-sm px-3 py-2"
                  >
                    {v} fps
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-[var(--border-primary)]">
            <div className="text-xs text-[var(--text-quaternary)]">
              Estimated size: ~45MB
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)]">
                <Download size={16} />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ClientOnly>
  );
}
