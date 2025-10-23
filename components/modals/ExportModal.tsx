"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { X, Download, Music, Film, CheckCircle } from "lucide-react";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { renderTimelineToWav } from "@/lib/audioRender";
import { renderTimelineToWebM, isWebCodecsSupported, CancellationToken } from "@/lib/videoRender";
import { useEditorStore } from "@/stores/editorStore";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [exportType, setExportType] = useState<"video"|"audio">("video");
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStage, setExportStage] = useState<string>("");
  const cancellationTokenRef = useRef<CancellationToken | null>(null);

  // Get current editor settings
  const { resolution, fps, setResolution, setFps } = useEditorStore();

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleVideoExport = async () => {
    // Check WebCodecs support
    if (!isWebCodecsSupported()) {
      showToast('WebCodecs API is not supported in this browser. Please use Chrome/Edge 94+.');
      return;
    }
    
    setIsExporting(true);
    setExportProgress(0);
    
    // Create cancellation token
    cancellationTokenRef.current = new CancellationToken();
    
    try {
      console.log('🎬 Starting video export...');
      const blob = await renderTimelineToWebM({
        onProgress: (progress) => {
          setExportProgress(progress.percent);
          setExportStage(progress.stage);
          console.log('🎬 Progress:', progress.percent.toFixed(1) + '%', progress.stage);
        },
        cancellationToken: cancellationTokenRef.current
      });
      
      // Create download link with appropriate extension
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const isMp4 = blob.type.includes('mp4');
      link.download = isMp4 ? 'clipstorm-video.mp4' : 'clipstorm-video.webm';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showToast('Video exported successfully!');
      onClose();
    } catch (error) {
      console.error('🎬 Video export failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it was a cancellation
      if (errorMessage.includes('cancelled')) {
        showToast('Export cancelled');
      } else {
        showToast(`Export failed: ${errorMessage}`);
      }
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStage("");
      cancellationTokenRef.current = null;
    }
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

  const handleCancelExport = () => {
    if (cancellationTokenRef.current) {
      cancellationTokenRef.current.cancel();
    }
  };

  if (!isOpen) return null;

  return (
    <ClientOnly>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-2xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-[var(--border-primary)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center">
                <Download size={16} className="text-white" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Export</h2>
            </div>
            <Button variant="ghost" onClick={onClose} className="p-2" disabled={isExporting}>
              <X size={18} />
            </Button>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Export Type Selection */}
            <div className="mb-4">
              <div className="seg w-full">
                <button 
                  aria-pressed={exportType==="video"} 
                  onClick={()=>setExportType("video")}
                  className="flex-1 text-sm px-4 py-2.5 flex items-center justify-center gap-2"
                  disabled={isExporting}
                >
                  <Film size={14}/>
                  Video
                </button>
                <button 
                  aria-pressed={exportType==="audio"} 
                  onClick={()=>setExportType("audio")}
                  className="flex-1 text-sm px-4 py-2.5 flex items-center justify-center gap-2"
                  disabled={isExporting}
                >
                  <Music size={14}/>
                  Audio
                </button>
              </div>
            </div>

            {/* Export Info Card */}
            <div className="bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                {exportType === "video" ? (
                  <Film size={16} className="text-[var(--accent-cool)]"/>
                ) : (
                  <Music size={16} className="text-[var(--accent-cool)]"/>
                )}
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {exportType === "video" ? "Video Export" : "Audio Export"}
                </span>
              </div>
              <div className="text-xs text-[var(--text-tertiary)] space-y-1">
                {exportType === "video" ? (
                  <>
                    <div>• Auto MP4 (H.264) or WebM (VP9)</div>
                    <div>• Image clips with x, y, scale transforms</div>
                    <div>• Frame-accurate timing</div>
                    <div>• Requires Chrome/Edge 94+</div>
                  </>
                ) : (
                  <>
                    <div>• Stereo 48kHz WAV format</div>
                    <div>• Honors track mute/solo states</div>
                    <div>• Applies clip gain and fades</div>
                    <div>• Frame-accurate timing</div>
                  </>
                )}
              </div>
            </div>

            {/* Video Settings - Only Functional Controls */}
            {exportType === "video" && !isExporting && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {/* Resolution */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">Resolution</label>
                  <div className="seg">
                    {["1080x1920","720x1280"].map(v=>(
                      <button 
                        key={v} 
                        aria-pressed={resolution===v} 
                        onClick={()=>setResolution(v as any)}
                        className="text-xs px-2 py-1.5"
                      >
                        {v === "1080x1920" ? "1080p" : "720p"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FPS */}
                <div>
                  <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">Frame Rate</label>
                  <div className="seg">
                    {[24,30,60].map(v=>(
                      <button 
                        key={v} 
                        aria-pressed={fps===v} 
                        onClick={()=>setFps(v as any)}
                        className="text-xs px-2 py-1.5"
                      >
                        {v} fps
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Progress Bar - Integrated */}
            {isExporting && (
              <div className="bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[var(--brand-primary)] rounded-full animate-pulse"/>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {exportStage || "Exporting..."}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-[var(--text-tertiary)]">
                    {exportProgress.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-[var(--surface-primary)] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] transition-all duration-300 ease-out"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-[var(--border-primary)]">
            <div className="text-xs text-[var(--text-quaternary)]">
              {exportType === "video" ? "Auto MP4/WebM - Image clips only" : "Audio: 48kHz stereo WAV"}
            </div>
            <div className="flex items-center gap-3">
              {isExporting ? (
                <Button 
                  variant="ghost" 
                  onClick={handleCancelExport} 
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                >
                  Cancel
                </Button>
              ) : (
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              )}
              <Button 
                variant="primary" 
                className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] min-w-[120px]"
                onClick={exportType === "audio" ? handleAudioExport : handleVideoExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                    <span>{exportProgress > 0 ? `${exportProgress.toFixed(0)}%` : 'Exporting...'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {exportType === "audio" ? <Music size={16} /> : <Film size={16} />}
                    <span>Export {exportType === "audio" ? "Audio" : "Video"}</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-lg shadow-lg px-4 py-3 z-[60] flex items-center gap-2">
          <CheckCircle size={16} className="text-green-400"/>
          <div className="text-sm text-[var(--text-primary)]">{toastMessage}</div>
        </div>
      )}
    </ClientOnly>
  );
}
