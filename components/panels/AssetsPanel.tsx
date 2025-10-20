"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Grid, List, Search, X, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useProjectStore } from "@/stores/projectStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { useEditorStore } from "@/stores/editorStore";

// Generate video thumbnail from video file
async function generateVideoThumbnail(file: File): Promise<string> {
  console.log('🎬 Starting video thumbnail generation for:', file.name);
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('❌ Could not get canvas context');
      reject(new Error('Could not get canvas context'));
      return;
    }
    
    video.addEventListener('loadedmetadata', () => {
      console.log('🎬 Video metadata loaded:', {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      });
      
      // Set canvas size to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Seek to 1 second or 10% of duration, whichever is smaller
      const seekTime = Math.min(1, video.duration * 0.1);
      console.log('🎬 Seeking to:', seekTime);
      video.currentTime = seekTime;
    });
    
    video.addEventListener('seeked', () => {
      console.log('🎬 Video seeked, drawing frame');
      // Draw the video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to data URL
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      console.log('✅ Video thumbnail generated, size:', thumbnail.length);
      resolve(thumbnail);
    });
    
    video.addEventListener('error', (e) => {
      console.error('❌ Video loading failed:', e);
      reject(new Error('Video loading failed'));
    });
    
    // Load the video
    video.src = URL.createObjectURL(file);
    video.load();
  });
}

// Constants
const ACCEPTED_FILE_TYPES = "image/*,video/*,audio/*";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'video';
  url: string;
  thumbnail?: string;
  addedAt: Date;
  file?: File; // Store the actual file for saving
  isMissing?: boolean; // Flag for missing files
}

export function AssetsPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Get assets store functions
  const assets = useAssetsStore(s => s.assets);
  const addAsset = useAssetsStore(s => s.addAsset);
  const removeAsset = useAssetsStore(s => s.removeAsset);
  
  // Get project store functions
  const project = useProjectStore(s => s.project);

  // Get editor store functions
  const beginTx = useEditorStore(s => s.beginTx);
  const commitTx = useEditorStore(s => s.commitTx);
  const addSceneFromAsset = useEditorStore(s => s.addSceneFromAsset);
  const addAudioFromAsset = useEditorStore(s => s.addAudioFromAsset);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    console.log("🔍 AssetsPanel - Files selected:", files.length);
    
    for (const file of files) {
      const asset: MediaAsset = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : 
              file.type.startsWith('audio/') ? 'audio' : 'video',
        url: URL.createObjectURL(file),
        addedAt: new Date(),
        file: file, // Store the file for saving
      };

      // Create thumbnail for images and videos
      if (asset.type === 'image') {
        asset.thumbnail = asset.url;
      } else if (asset.type === 'video') {
        // Generate video thumbnail
        console.log('🎬 Generating thumbnail for video:', file.name);
        try {
          const thumbnail = await generateVideoThumbnail(file);
          asset.thumbnail = thumbnail;
          console.log('✅ Video thumbnail generated successfully:', file.name);
        } catch (error) {
          console.warn('❌ Failed to generate video thumbnail:', error);
          // Fallback to a generic video icon or the video URL
          asset.thumbnail = asset.url;
        }
      }

      console.log("🔍 AssetsPanel - Adding asset:", asset);
      try {
        await addAsset(asset);
        console.log("✅ Asset added successfully:", asset.name);
      } catch (error) {
        console.error("❌ Failed to add asset:", error);
        alert(`Failed to add ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Reset input
    e.target.value = "";
  };

  const filteredAssets = assets.filter(asset => {
    const searchLower = searchQuery.toLowerCase().trim();
    if (!searchLower) return true; // Show all if no search query
    
    const nameMatch = asset.name.toLowerCase().includes(searchLower);
    const typeMatch = asset.type.toLowerCase().includes(searchLower);
    
    return nameMatch || typeMatch;
  });

  const hasAssets = filteredAssets.length > 0;

  // Check if asset file exists (for red box display)
  const isAssetMissing = (asset: MediaAsset) => {
    return asset.isMissing || (!asset.file && !asset.url); // Use isMissing flag or fallback to old logic
  };

  // Add asset to timeline
  const addToTimeline = (asset: MediaAsset) => {
    if (isAssetMissing(asset)) {
      alert(`Cannot add missing file "${asset.name}" to timeline. Please re-import this file.`);
      return;
    }
    
    beginTx("Add asset to timeline");
    if (asset.type === "image" || asset.type === "video") {
      const dur = asset.type === "video" ? 5000 : 3000;
      addSceneFromAsset(asset.id, { durationMs: dur, label: asset.name });
    } else if (asset.type === "audio") {
      // Add audio to audio track with longer default duration
      addAudioFromAsset(asset.id, "music", { durationMs: 30000 }); // 30s default
    }
    commitTx();
  };

  // Debug: Log current assets
  useEffect(() => {
    console.log("🔍 AssetsPanel - Current assets in store:", assets.length);
    console.log("🔍 AssetsPanel - Assets details:", assets);
    console.log("🔍 AssetsPanel - Filtered assets:", filteredAssets.length);
  }, [assets, filteredAssets]);

  return (
    <Panel
      title={
        <div className="flex items-center gap-2">
          <span>Assets</span>
          <button
            onClick={handleImportClick}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-primary)] text-[var(--text-primary)] hover:bg-[var(--surface-tertiary)] transition-all duration-150 text-xs font-medium hover:scale-105 shadow-sm hover:shadow-md"
            aria-label="Import media"
            title="Import media"
          >
            <Plus size={14} />
            <span>Import Media</span>
          </button>
        </div>
      }
      className="h-full"
    >
      <div className={`flex flex-col h-full ${hasAssets ? 'space-y-2' : 'space-y-1'}`}>
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery(''); }}
            aria-label="Search assets"
            className="w-full pl-7 pr-6 py-1.5 bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-md text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-cool)] focus:ring-1 focus:ring-[var(--accent-cool)]/20 transition-all duration-150"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              aria-label="Clear search"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Only show media section if there are assets */}
        {filteredAssets.length > 0 && (
          <>
            {/* View Mode Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-tertiary)]">{filteredAssets.length} items</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded ${viewMode === 'grid' ? 'bg-[var(--accent-cool)] text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                >
                  <Grid size={12} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1 rounded ${viewMode === 'list' ? 'bg-[var(--accent-cool)] text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                >
                  <List size={12} />
                </button>
              </div>
            </div>

            {/* Assets Grid */}
            <div className="flex-1 overflow-y-auto">
            <div className={`grid gap-2 ${viewMode === 'grid' 
              ? 'grid-cols-[repeat(auto-fill,minmax(110px,110px))] justify-start'
              : 'grid-cols-[repeat(auto-fill,minmax(180px,180px))] justify-start'}`}>
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable={!isAssetMissing(asset)}
                    onDragStart={(e) => {
                      if (isAssetMissing(asset)) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData("text/x-clipstorm-asset", JSON.stringify({ id: asset.id, type: asset.type }));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDoubleClick={() => addToTimeline(asset)}
                    className={`relative rounded-lg overflow-hidden hover:bg-[var(--surface-tertiary)] transition-colors group ${viewMode === 'grid' ? 'w-[110px]' : 'w-[180px]'} ${
                      isAssetMissing(asset) 
                        ? 'bg-red-500/20 border-2 border-red-500 cursor-not-allowed' 
                        : 'bg-[var(--surface-secondary)] cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    {/* Asset Preview */}
                    <div className={`relative aspect-square`}>
                      {(asset.type === 'image' || asset.type === 'video') && (asset.thumbnail || asset.url) ? (
                        <img
                          src={asset.thumbnail || asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.log("🔍 Media failed to load:", asset.name);
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--surface-primary)] flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-lg mb-0.5">
                              {asset.type === 'audio' ? '🎵' : asset.type === 'video' ? '🎬' : '📁'}
                            </div>
                            <div className="text-xs text-[var(--text-tertiary)]">{asset.type}</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Missing File Indicator */}
                      {isAssetMissing(asset) && (
                        <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center">
                          <div className="text-white text-xs font-bold">FILE MISSING</div>
                        </div>
                      )}
                      
                      {/* Delete Button - Top Left */}
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await removeAsset(asset.id);
                            console.log("✅ Asset removed successfully:", asset.name);
                          } catch (error) {
                            console.error("❌ Failed to remove asset:", error);
                            alert(`Failed to remove ${asset.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                          }
                        }}
                        className="absolute top-1 left-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        title="Delete asset"
                      >
                        <Trash2 size={12} />
                      </button>
                      
                      {/* Add Button - Bottom Right */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          addToTimeline(asset);
                        }}
                        className="absolute bottom-1 right-1 bg-[var(--accent-cool)] text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--brand-primary)]"
                        title="Add to timeline"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Asset Info */}
                    <div className="p-1.5">
                      <div className={`text-xs truncate ${isAssetMissing(asset) ? 'text-red-400' : 'text-[var(--text-primary)]'}`} title={asset.name}>
                        {asset.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}