"use client";
import { create } from "zustand";
import { useProjectStore } from "./projectStore";
import { useEditorStore } from "./editorStore";

interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'video';
  url: string;
  thumbnail?: string;
  addedAt: Date;
  file?: File; // Store the actual file for saving
}

interface AssetsState {
  assets: MediaAsset[];
  
  // Actions
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (id: string) => void;
  clearAssets: () => void;
  loadAssetsFromProject: (projectAssets: any[]) => void;
  getAssetsForProject: () => any[];
  getById: (id: string) => MediaAsset | undefined;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: [],

  addAsset: (asset: MediaAsset) => {
    console.log("🔍 AssetsStore - Adding asset:", asset);
    console.log("🔍 AssetsStore - Current assets before add:", get().assets.length);
    set(state => ({
      assets: [...state.assets, asset]
    }));
    
    console.log("🔍 AssetsStore - Assets after add:", get().assets.length);
    console.log("🔍 AssetsStore - All assets:", get().assets);
    
    // Mark project as dirty when assets are added
    useProjectStore.getState().markDirty();
  },

  removeAsset: (id: string) => {
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
      editorStore.set(state => ({
        audioClips: state.audioClips.filter(c => c.id !== clip.id)
      }));
    });
    
    // Mark project as dirty when assets are removed
    useProjectStore.getState().markDirty();
  },

  clearAssets: () => {
    console.log("🔍 AssetsStore - Clearing assets (current count:", get().assets.length, ")");
    set({ assets: [] });
    useProjectStore.getState().markDirty();
  },

  loadAssetsFromProject: (projectAssets: any[]) => {
    console.log("🔍 AssetsStore - Loading assets from project:", projectAssets.length);
    console.log("🔍 AssetsStore - Project assets data:", projectAssets);
    
    const loadedAssets: MediaAsset[] = projectAssets.map(asset => {
      console.log(`🔍 Loading asset from project:`, {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        uri: asset.uri ? asset.uri.substring(0, 50) + '...' : 'NO URI'
      });
      
      return {
        id: asset.id,
        name: asset.name,
        type: asset.kind === 'image' ? 'image' : 
              asset.kind === 'music' || asset.kind === 'vo' ? 'audio' : 'video',
        url: asset.uri || '', // Use the URI from the project (should be base64 data URL)
        thumbnail: asset.kind === 'image' ? asset.uri : undefined,
        addedAt: new Date(),
        file: undefined // Files are not stored in project JSON
      };
    });
    
    console.log("🔍 AssetsStore - Loaded assets:", loadedAssets);
    set({ assets: loadedAssets });
  },

  getAssetsForProject: async () => {
    const { assets } = get();
    console.log("🔍 AssetsStore - Converting assets for project:", assets.length);
    console.log("🔍 AssetsStore - Raw assets:", assets);
    
    const projectAssets = await Promise.all(assets.map(async (asset) => {
      let dataUrl = asset.url;
      
      console.log(`🔍 Processing asset ${asset.name}:`, {
        hasFile: !!asset.file,
        currentUrl: asset.url,
        type: asset.type
      });
      
      // If we have a file, convert it to base64 data URL for persistence
      if (asset.file) {
        try {
          console.log(`🔍 Converting file to base64 for ${asset.name}`);
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              console.log(`✅ Successfully converted ${asset.name} to base64`);
              resolve(reader.result as string);
            };
            reader.onerror = (error) => {
              console.error(`❌ Failed to convert ${asset.name} to base64:`, error);
              reject(error);
            };
            reader.readAsDataURL(asset.file!);
          });
        } catch (error) {
          console.error("Failed to convert file to data URL:", error);
          // Fall back to existing URL
        }
      } else {
        console.log(`⚠️ No file object for ${asset.name}, using existing URL`);
      }
      
      const result = {
        id: asset.id,
        kind: asset.type === 'image' ? 'image' : 
              asset.type === 'audio' ? 'music' : 'video',
        name: asset.name,
        uri: dataUrl
      };
      
      console.log(`🔍 Asset result for ${asset.name}:`, result);
      return result;
    }));
    
    console.log("🔍 AssetsStore - Project assets:", projectAssets);
    return projectAssets;
  },

  getById: (id: string) => {
    const { assets } = get();
    return assets.find(asset => asset.id === id);
  }
}));
