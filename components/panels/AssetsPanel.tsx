"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Grid, List, Search, X, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { useProjectStore } from "@/stores/projectStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { useEditorStore } from "@/stores/editorStore";

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

      // Create thumbnail for images (use the same URL)
      if (asset.type === 'image') {
        asset.thumbnail = asset.url;
      }

      console.log("🔍 AssetsPanel - Adding asset:", asset);
      addAsset(asset);
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

  // Check if asset file exists (for red box display)
  const isAssetMissing = (asset: MediaAsset) => {
    return !asset.file && !asset.url; // No file and no URL means missing
  };

  // Add asset to timeline
  const addToTimeline = (asset: MediaAsset) => {
    beginTx("Add asset to timeline");
    if (asset.type === "image" || asset.type === "video") {
      const dur = asset.type === "video" ? 5000 : 3000;
      addSceneFromAsset(asset.id, { durationMs: dur, label: asset.name });
    } else if (asset.type === "audio") {
      addAudioFromAsset(asset.id, "music", { durationMs: 8000 });
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
    <Panel title="Assets" className="h-full">
      <div className="flex flex-col h-full space-y-3">
        {/* Import Button */}
        <button
          onClick={handleImportClick}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--surface-secondary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--surface-tertiary)] transition-colors"
        >
          <Plus size={14} />
          <span className="text-sm">Import Media</span>
        </button>

        {/* Search Bar - only show when there are assets */}
        {filteredAssets.length > 0 && (
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-cool)]"
            />
          </div>
        )}

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
              <span className="text-xs text-[var(--text-tertiary)]">
                {filteredAssets.length} file{filteredAssets.length !== 1 ? 's' : ''}
              </span>
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
              <div className={`grid gap-2 ${viewMode === 'grid' ? 'grid-cols-4' : 'grid-cols-1'}`}>
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-clipstorm-asset", JSON.stringify({ id: asset.id, type: asset.type }));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDoubleClick={() => addToTimeline(asset)}
                    className={`relative rounded-lg overflow-hidden hover:bg-[var(--surface-tertiary)] transition-colors group cursor-grab active:cursor-grabbing ${
                      isAssetMissing(asset) 
                        ? 'bg-red-500/20 border-2 border-red-500' 
                        : 'bg-[var(--surface-secondary)]'
                    }`}
                  >
                    {/* Asset Preview */}
                    <div className={`relative ${viewMode === 'grid' ? 'aspect-square' : 'h-16'}`}>
                      {asset.type === 'image' && asset.url ? (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.log("🔍 Image failed to load:", asset.name);
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
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAsset(asset.id);
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