"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { X, Download, Settings, Music } from "lucide-react";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { renderTimelineToWav } from "@/lib/audioRender";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [resolution, setResolution] = useState<"1080x1920"|"720x1280"|"4K">("1080x1920");
  const [format, setFormat] = useState<"MP4"|"MOV"|"AVI">("MP4");
  const [quality, setQuality] = useState<"High"|"Medium"|"Low">("High");
  const [fps, setFps] = useState<"24"|"30"|"60">("30");
  const [exportType, setExportType] = useState<"video"|"audio">("video");
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAudioExport = async () => {
    setIsExporting(true);
    try {
      console.log('🎵 Starting audio export...');
      const blob = await renderTimelineToWav();
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'clipstorm-audio.wav';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast('Audio exported successfully!');
      onClose();
    } catch (error) {
      console.error('🎵 Audio export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showToast(`Export failed: ${errorMessage}`);
    } finally {
      setIsExporting(false);
    }
  };

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
            {/* Export Type */}
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] mb-3 block">
                Export Type
              </label>
              <div className="seg">
                <button 
                  aria-pressed={exportType==="video"} 
                  onClick={()=>setExportType("video")}
                  className="text-sm px-3 py-2 flex items-center gap-2"
                >
                  <Download size={14}/>
                  Video
                </button>
                <button 
                  aria-pressed={exportType==="audio"} 
                  onClick={()=>setExportType("audio")}
                  className="text-sm px-3 py-2 flex items-center gap-2"
                >
                  <Music size={14}/>
                  Audio (WAV)
                </button>
              </div>
            </div>

            {exportType === "video" && (
              <>
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
              </>
            )}

            {exportType === "audio" && (
              <div className="bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Music size={16} className="text-[var(--accent-cool)]"/>
                  <span className="text-sm font-medium text-[var(--text-primary)]">Audio Export</span>
                </div>
                <div className="text-xs text-[var(--text-tertiary)] space-y-1">
                  <div>• Stereo 48kHz WAV format</div>
                  <div>• Honors track mute/solo states</div>
                  <div>• Applies clip gain and fades</div>
                  <div>• Frame-accurate timing</div>
                </div>
              </div>
            )}

            {exportType === "video" && (
              <>
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
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-[var(--border-primary)]">
            <div className="text-xs text-[var(--text-quaternary)]">
              {exportType === "video" ? "Estimated size: ~45MB" : "Audio: 48kHz stereo WAV"}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)]"
                onClick={exportType === "audio" ? handleAudioExport : undefined}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"/>
                    Exporting...
                  </>
                ) : (
                  <>
                    {exportType === "audio" ? <Music size={16} /> : <Download size={16} />}
                    Export {exportType === "audio" ? "Audio" : "Video"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-lg shadow-lg px-4 py-3 z-[60]">
          <div className="text-sm text-[var(--text-primary)]">{toastMessage}</div>
        </div>
      )}
    </ClientOnly>
  );
}
