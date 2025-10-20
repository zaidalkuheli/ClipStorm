"use client";
import { create } from "zustand";
import { useProjectStore } from "./projectStore";
import { useEditorStore } from "./editorStore";
import { computeWaveform, type WaveformData } from "@/lib/computePeaks";
import { fileStorage } from "@/lib/fileStorage";

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

interface AssetsState {
  assets: MediaAsset[];
  waveforms: Record<string, WaveformData | undefined>;
  
  // Actions
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (id: string) => void;
  clearAssets: () => void;
  loadAssetsFromProject: (projectAssets: any[]) => void;
  getAssetsForProject: () => Promise<any[]>,
  getById: (id: string) => MediaAsset | undefined;
  setWaveform: (assetId: string, data: WaveformData) => void;
  analyzeAsset: (assetId: string) => Promise<void>;
  analyzeAllAudioAssets: () => Promise<void>;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: [],
  waveforms: {},

  addAsset: async (asset: MediaAsset) => {
    console.log("🔍 AssetsStore - Adding asset:", asset);
    console.log("🔍 AssetsStore - Current assets before add:", get().assets.length);
    
    // Store file in IndexedDB if it exists
    if (asset.file) {
      try {
        console.log("💾 Storing file in IndexedDB:", asset.name);
        await fileStorage.storeFile(asset.id, asset.file);
        console.log("✅ File stored successfully:", asset.name);
      } catch (error) {
        console.error("❌ Failed to store file:", error);
        throw error;
      }
    }
    
    set(state => ({
      assets: [...state.assets, asset]
    }));
    
    console.log("🔍 AssetsStore - Assets after add:", get().assets.length);
    console.log("🔍 AssetsStore - All assets:", get().assets);
    
    // Mark project as dirty when assets are added
    useProjectStore.getState().markDirty();

    // Auto-analyze audio files for waveform data
    if (asset.type === 'audio' && asset.file) {
      get().analyzeAsset(asset.id);
    }
  },

  removeAsset: async (id: string) => {
    // Remove file from IndexedDB
    try {
      await fileStorage.deleteFile(id);
      console.log("🗑️ File removed from IndexedDB:", id);
    } catch (error) {
      console.error("❌ Failed to remove file from IndexedDB:", error);
    }
    
    set(state => ({
      assets: state.assets.filter(asset => asset.id !== id)
    }));
    
    // Remove any scenes that reference this asset
    const editorStore = useEditorStore.getState();
    const scenesToRemove = editorStore.scenes.filter(scene => scene.assetId === id);
    scenesToRemove.forEach(scene => {
      editorStore.removeScene(scene.id);
    });
    
    // Remove any audio clips that reference this asset
    const audioClipsToRemove = editorStore.audioClips.filter(clip => clip.assetId === id);
    audioClipsToRemove.forEach(clip => {
      // Use the proper method to remove audio clips
      editorStore.setAudioClips(editorStore.audioClips.filter(c => c.id !== clip.id));
    });
    
    // Mark project as dirty when assets are removed
    useProjectStore.getState().markDirty();
  },

  clearAssets: async () => {
    console.log("🔍 AssetsStore - Clearing assets (current count:", get().assets.length, ")");
    
    // Clear all files from IndexedDB
    try {
      await fileStorage.clearAllFiles();
      console.log("🗑️ All files cleared from IndexedDB");
    } catch (error) {
      console.error("❌ Failed to clear files from IndexedDB:", error);
    }
    
    set({ assets: [] });
    useProjectStore.getState().markDirty();
  },

  loadAssetsFromProject: async (projectAssets: any[]) => {
    console.log("🔍 AssetsStore - Loading assets from project:", projectAssets.length);
    console.log("🔍 AssetsStore - Project assets data:", projectAssets);
    
    const loadedAssets: MediaAsset[] = [];
    
    for (const projectAsset of projectAssets) {
      console.log(`🔍 Loading asset from project: ${projectAsset.name}`, projectAsset);
      
      // Try to load the file from IndexedDB first
      let file: File | null = null;
      let isFileMissing = false;
      try {
        file = await fileStorage.getFile(projectAsset.id);
        if (file) {
          console.log(`✅ Loaded file from IndexedDB: ${projectAsset.name}`);
        } else {
          console.log(`⚠️ File not found in IndexedDB: ${projectAsset.name}`);
          isFileMissing = true;
        }
      } catch (error) {
        console.error(`❌ Failed to load file from IndexedDB: ${projectAsset.name}`, error);
        isFileMissing = true;
      }
      
      // If no file in IndexedDB, check if we have base64 data to migrate
      if (!file && projectAsset.uri && projectAsset.uri.startsWith('data:')) {
        console.log(`🔄 Migrating base64 data to IndexedDB: ${projectAsset.name}`);
        try {
          // Convert base64 data URL back to File
          const response = await fetch(projectAsset.uri);
          const blob = await response.blob();
          
          // Determine file type from the data URL
          const mimeType = projectAsset.uri.split(';')[0].split(':')[1];
          const extension = mimeType.split('/')[1];
          const fileName = projectAsset.name.includes('.') ? projectAsset.name : `${projectAsset.name}.${extension}`;
          
          file = new File([blob], fileName, { type: mimeType });
          
          // Store the migrated file in IndexedDB
          await fileStorage.storeFile(projectAsset.id, file);
          console.log(`✅ Migrated and stored file in IndexedDB: ${projectAsset.name}`);
        } catch (error) {
          console.error(`❌ Failed to migrate base64 data: ${projectAsset.name}`, error);
        }
      }
      
      // Create object URL for the file
      let url = projectAsset.uri;
      if (file) {
        url = URL.createObjectURL(file);
      } else if (isFileMissing) {
        // Use a placeholder URL for missing files
        url = `missing:${projectAsset.id}`;
      }
      
      const asset: MediaAsset = {
        id: projectAsset.id,
        name: projectAsset.name,
        type: projectAsset.kind === 'image' ? 'image' : 
              projectAsset.kind === 'music' || projectAsset.kind === 'vo' ? 'audio' : 'video',
        url: url,
        thumbnail: projectAsset.kind === 'image' ? url : undefined,
        addedAt: new Date(),
        file: file || undefined,
        isMissing: isFileMissing // Add missing flag
      };
      
      loadedAssets.push(asset);
      console.log(`🔍 Asset loaded: ${asset.name}`, asset);
    }
    
    console.log("🔍 AssetsStore - Loaded assets:", loadedAssets);
    set({ assets: loadedAssets });
    
    // Analyze audio assets for waveforms
    setTimeout(() => {
      get().analyzeAllAudioAssets();
    }, 100); // Small delay to ensure state is updated
  },

  getAssetsForProject: async () => {
    const { assets } = get();
    console.log("🔍 AssetsStore - Converting assets for project:", assets.length);
    console.log("🔍 AssetsStore - Raw assets:", assets);
    
    const projectAssets = assets.map((asset) => {
      console.log(`🔍 Processing asset ${asset.name}:`, {
        hasFile: !!asset.file,
        currentUrl: asset.url,
        type: asset.type
      });
      
      // Only save file references, not the actual file data
      // Ensure we don't save base64 data URLs
      let uri = asset.url;
      if (uri && uri.startsWith('data:')) {
        console.warn(`⚠️ Preventing base64 save for ${asset.name}, using placeholder`);
        uri = `blob:placeholder-${asset.id}`; // Placeholder for migrated files
      }
      
      const result = {
        id: asset.id,
        kind: asset.type === 'image' ? 'image' : 
              asset.type === 'audio' ? 'music' : 'video',
        name: asset.name,
        uri: uri
      };
      
      console.log(`🔍 Asset result for ${asset.name}:`, result);
      return result;
    });
    
    console.log("🔍 AssetsStore - Project assets:", projectAssets);
    return projectAssets;
  },

  getById: (id: string) => {
    const { assets } = get();
    return assets.find(asset => asset.id === id);
  },

  setWaveform: (assetId: string, data: WaveformData) => {
    set(state => ({
      waveforms: {
        ...state.waveforms,
        [assetId]: data
      }
    }));
  },

  analyzeAsset: async (assetId: string) => {
    const { assets, waveforms } = get();
    const asset = assets.find(a => a.id === assetId);
    
    console.log('🎵 analyzeAsset called for:', assetId, {
      asset: asset ? { name: asset.name, type: asset.type, hasFile: !!asset.file, hasUrl: !!asset.url } : null,
      hasWaveform: !!waveforms[assetId]
    });
    
    // Skip if not audio or already analyzed
    if (!asset || asset.type !== 'audio' || waveforms[assetId]) {
      console.log('🎵 Skipping analysis:', { 
        hasAsset: !!asset, 
        isAudio: asset?.type === 'audio', 
        hasWaveform: !!waveforms[assetId] 
      });
      return;
    }

    // Need either file or URL to analyze
    if (!asset.file && !asset.url) {
      console.log('🎵 No file or URL available for analysis');
      return;
    }

    try {
      console.log('🎵 Starting waveform analysis for:', asset.name);
      
      let waveformData;
      if (asset.file) {
        // Use file if available (fresh import)
        waveformData = await computeWaveform(asset.file);
      } else {
        // Use URL if no file (loaded from project)
        console.log('🎵 Fetching audio from URL for analysis');
        const response = await fetch(asset.url);
        const arrayBuffer = await response.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
        const file = new File([blob], asset.name, { type: 'audio/mpeg' });
        waveformData = await computeWaveform(file);
      }
      
      console.log('🎵 Waveform analysis complete:', {
        name: asset.name,
        bins: waveformData.mins.length,
        durationMs: waveformData.durationMs,
        sampleRate: waveformData.sampleRate
      });
      get().setWaveform(assetId, waveformData);
    } catch (error) {
      console.error('❌ Failed to analyze waveform for:', asset.name, error);
    }
  },

  analyzeAllAudioAssets: async () => {
    const { assets } = get();
    const audioAssets = assets.filter(asset => asset.type === 'audio');
    
    console.log('🎵 Analyzing all audio assets:', audioAssets.length);
    
    for (const asset of audioAssets) {
      await get().analyzeAsset(asset.id);
    }
  }
}));
