"use client";
import { create } from "zustand";
import { useProjectStore } from "./projectStore";
import { useEditorStore } from "./editorStore";
import { computeWaveform, type WaveformData } from "@/lib/computePeaks";
import { fileStorage } from "@/lib/fileStorage";

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

interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'video';
  url: string;
  thumbnail?: string;
  durationMs?: number; // For videos (and potentially audio if desired later)
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
  generateMissingThumbnails: () => Promise<void>;
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

    // For videos: attempt to read duration metadata (non-blocking)
    if (asset.type === 'video' && asset.file) {
      (async () => {
        try {
          const durationMs = await getVideoDurationFromFile(asset.file!);
          if (isFinite(durationMs) && durationMs > 0) {
            set(state => ({
              assets: state.assets.map(a => a.id === asset.id ? { ...a, durationMs } : a)
            }));
            console.log('🎬 Stored video duration metadata:', { name: asset.name, durationMs });
          }
        } catch (e) {
          console.warn('🎬 Failed to read video duration on addAsset:', asset.name, e);
        }
      })();
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
      let url = '';
      if (file) {
        url = URL.createObjectURL(file);
        console.log(`✅ Created new ObjectURL for ${projectAsset.name}: ${url}`);
      } else if (isFileMissing) {
        // Use a placeholder URL for missing files
        url = `missing:${projectAsset.id}`;
        console.warn(`⚠️ File missing for ${projectAsset.name}, using placeholder`);
      } else if (projectAsset.uri) {
        // Fallback to old URI if file is not available
        url = projectAsset.uri;
        console.log(`🔄 Using fallback URI for ${projectAsset.name}: ${url}`);
      }
      
      const asset: MediaAsset = {
        id: projectAsset.id,
        name: projectAsset.name,
        type: projectAsset.kind === 'image' ? 'image' : 
              projectAsset.kind === 'music' || projectAsset.kind === 'vo' ? 'audio' : 'video',
        url: url,
        thumbnail: projectAsset.kind === 'image' ? url : 
                  projectAsset.kind === 'video' ? url : undefined,
        addedAt: new Date(),
        file: file || undefined,
        isMissing: isFileMissing // Add missing flag
      };
      
      loadedAssets.push(asset);
      console.log(`🔍 Asset loaded: ${asset.name}`, {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        url: asset.url,
        hasFile: !!asset.file,
        isMissing: asset.isMissing
      });
    }
    
    console.log("🔍 AssetsStore - Loaded assets:", loadedAssets);
    set({ assets: loadedAssets });
    
    // Analyze audio assets for waveforms
    setTimeout(() => {
      get().analyzeAllAudioAssets();
    }, 100); // Small delay to ensure state is updated

    // Generate thumbnails for video assets
    setTimeout(() => {
      get().generateMissingThumbnails();
    }, 200); // Small delay after audio analysis

    // Populate video durations for any assets with files but missing duration
    setTimeout(async () => {
      const { assets } = get();
      for (const a of assets) {
        if (a.type === 'video' && a.file && (a.durationMs === undefined || a.durationMs <= 0)) {
          try {
            const durationMs = await getVideoDurationFromFile(a.file);
            if (isFinite(durationMs) && durationMs > 0) {
              set(state => ({
                assets: state.assets.map(x => x.id === a.id ? { ...x, durationMs } : x)
              }));
              console.log('🎬 Populated video duration from file:', { name: a.name, durationMs });
            }
          } catch (e) {
            console.warn('🎬 Failed to populate video duration:', a.name, e);
          }
        }
      }
    }, 300);
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
        if (asset.url.startsWith('missing:')) {
          console.warn('⚠️ Skipping waveform analysis for missing file:', asset.name);
          return;
        }
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
  },

  generateMissingThumbnails: async () => {
    const { assets } = get();
    const videoAssets = assets.filter(asset => 
      asset.type === 'video' && 
      !asset.thumbnail && 
      asset.file
    );
    
    console.log('🎬 Found video assets without thumbnails:', videoAssets.length);
    
    for (const asset of videoAssets) {
      try {
        console.log('🎬 Generating thumbnail for existing video:', asset.name);
        const thumbnail = await generateVideoThumbnail(asset.file!);
        
        set(state => ({
          assets: state.assets.map(a => 
            a.id === asset.id ? { ...a, thumbnail } : a
          )
        }));
        
        console.log('✅ Thumbnail generated for:', asset.name);
      } catch (error) {
        console.warn('❌ Failed to generate thumbnail for:', asset.name, error);
      }
    }
  }
}));

// Helper: get video duration from a File via metadata
async function getVideoDurationFromFile(file: File): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      const cleanup = () => URL.revokeObjectURL(url);
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        try { resolve(Math.round(v.duration * 1000)); } finally { cleanup(); }
      };
      v.onerror = (e) => { cleanup(); reject(e); };
      v.src = url;
      v.load();
    } catch (e) {
      reject(e);
    }
  });
}
