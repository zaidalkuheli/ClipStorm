"use client";
import { create } from "zustand";
import { set as setToIndexedDB, get as getFromIndexedDB, del, keys } from "idb-keyval";
import { debounce } from "lodash";
import { useEffect } from "react";
import { Project, makeEmptyProject, migrateToLatest, editorToProject } from "@/lib/projectSchema";
import { useEditorStore, type FrameRate, type Resolution } from "@/stores/editorStore";

interface ProjectState {
  project: Project | null;
  dirty: boolean;
  currentFilePath: string | null; // Path to the currently loaded file
  recentFiles: string[]; // Recently opened/saved files
  
  // Actions
  newProject: (name?: string) => void;
  loadProject: (project: Project) => void;
  markDirty: () => void;
  save: () => Promise<void>;
  saveAs: () => void;
  open: (file: File) => Promise<void>;
  exportJSON: () => void;
  clearDirty: () => void;
  loadRecentFile: (filePath: string) => Promise<void>;
}

const DEFAULT_AUTOSAVE_KEY = "clipstorm/autosave";

// Debounced autosave function
const debouncedAutosave = debounce(async (project: Project, key: string) => {
  try {
    await setToIndexedDB(key, project);
    console.log("💾 Autosaved project:", project.meta.name);
  } catch (error) {
    console.error("❌ Autosave failed:", error);
  }
}, 500);

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  dirty: false,
  currentFilePath: null,
  recentFiles: [],

  newProject: (name?: string) => {
    const project = makeEmptyProject(name);
    const editorStore = useEditorStore.getState();
    
    // Update editor state with new project data
    editorStore.setScenes(project.timeline.scenes);
    editorStore.setDuration(project.settings.durationMs);
    editorStore.setFps(project.settings.fps as FrameRate);
    editorStore.setAspect(project.settings.aspect);
    editorStore.setResolution(project.settings.resolution as Resolution);
    editorStore.setPlayhead(0);
    
    set({ 
      project, 
      dirty: false,
      autosaveKey: DEFAULT_AUTOSAVE_KEY 
    });
    
    console.log("📁 Created new project:", project.meta.name);
  },

  loadProject: (project: Project) => {
    const editorStore = useEditorStore.getState();
    
    // Update editor state with project data
    editorStore.setScenes(project.timeline.scenes);
    editorStore.setDuration(project.settings.durationMs);
    editorStore.setFps(project.settings.fps as FrameRate);
    editorStore.setAspect(project.settings.aspect);
    editorStore.setResolution(project.settings.resolution as Resolution);
    editorStore.setPlayhead(0);
    
    set({ 
      project, 
      dirty: false 
    });
    
    console.log("📂 Loaded project:", project.meta.name);
  },

  markDirty: () => {
    const state = get();
    if (!state.dirty) {
      set({ dirty: true });
      
      // Trigger debounced autosave if we have a project
      if (state.project) {
        const editorStore = useEditorStore.getState();
        const editorState = editorStore.getSerializableState();
        const updatedProject = editorToProject(editorState, state.project);
        
        debouncedAutosave(updatedProject, DEFAULT_AUTOSAVE_KEY);
      }
    }
  },

  save: async () => {
    const state = get();
    if (!state.project) return;
    
    try {
      const editorStore = useEditorStore.getState();
      const editorState = editorStore.getSerializableState();
      const updatedProject = editorToProject(editorState, state.project);
      
        await setToIndexedDB(state.autosaveKey, updatedProject);
      set({ 
        project: updatedProject, 
        dirty: false 
      });
      
      console.log("💾 Saved project:", updatedProject.meta.name);
    } catch (error) {
      console.error("❌ Save failed:", error);
      throw error;
    }
  },

  saveAs: async (key: string) => {
    const state = get();
    if (!state.project) return;
    
    try {
      console.log("🔍 saveAs called with key:", key);
      const editorStore = useEditorStore.getState();
      const editorState = editorStore.getSerializableState();
      const updatedProject = editorToProject(editorState, state.project);
      
      console.log("🔍 Saving project to IndexedDB with key:", key);
      await setToIndexedDB(key, updatedProject);
      
      // Add to recent projects
      const recentProjects = [...state.recentProjects];
      if (!recentProjects.includes(key)) {
        recentProjects.unshift(key);
        // Keep only last 10 projects
        if (recentProjects.length > 10) {
          recentProjects.pop();
        }
      }
      
      set({ 
        project: updatedProject, 
        dirty: false,
        autosaveKey: key,
        recentProjects
      });
      
      console.log("💾 Saved project as:", key);
    } catch (error) {
      console.error("❌ Save As failed:", error);
      throw error;
    }
  },

  open: async (key: string) => {
    try {
      console.log("🔍 Opening project with key:", key);
      const projectData = await getFromIndexedDB(key);
      if (!projectData) {
        throw new Error("Project not found");
      }
      
      const project = migrateToLatest(projectData);
      get().loadProject(project);
      
      console.log("📂 Opened project:", project.meta.name);
    } catch (error) {
      console.error("❌ Open failed:", error);
      throw error;
    }
  },

  // List all saved projects
  listProjects: async () => {
    try {
      const allKeys = await keys();
      const projectKeys = allKeys.filter(key => typeof key === 'string' && key.startsWith('clipstorm/'));
      console.log("📋 Available projects:", projectKeys);
      return projectKeys;
    } catch (error) {
      console.error("❌ Failed to list projects:", error);
      return [];
    }
  },

  loadRecentProject: async (key: string) => {
    try {
      console.log("🔍 Loading recent project:", key);
      await get().open(key);
      
      // Move to top of recent projects
      const state = get();
      const recentProjects = [...state.recentProjects];
      const index = recentProjects.indexOf(key);
      if (index > 0) {
        recentProjects.splice(index, 1);
        recentProjects.unshift(key);
        set({ recentProjects });
      }
      
      console.log("📂 Loaded recent project:", key);
    } catch (error) {
      console.error("❌ Failed to load recent project:", error);
      throw error;
    }
  },

  exportJSON: () => {
    const state = get();
    if (!state.project) return;
    
    try {
      const dataStr = JSON.stringify(state.project, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `${state.project.meta.name}.clipstorm.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log("📤 Exported project:", state.project.meta.name);
    } catch (error) {
      console.error("❌ Export failed:", error);
      throw error;
    }
  },

  importJSON: async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const project = migrateToLatest(data);
      
      get().loadProject(project);
      
      console.log("📥 Imported project:", project.meta.name);
    } catch (error) {
      console.error("❌ Import failed:", error);
      throw error;
    }
  },

  clearDirty: () => {
    set({ dirty: false });
  },
}));

// Hook to automatically mark project as dirty when editor state changes
export function useProjectDirtyTracker() {
  const markDirty = useProjectStore(s => s.markDirty);
  
  // Subscribe to editor store changes
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prevState) => {
      // Check if any relevant state has changed
      const hasChanged = 
        JSON.stringify(state.scenes) !== JSON.stringify(prevState.scenes) ||
        state.durationMs !== prevState.durationMs ||
        state.fps !== prevState.fps ||
        state.aspect !== prevState.aspect ||
        state.resolution !== prevState.resolution;
      
      if (hasChanged) {
        markDirty();
      }
    });
    
    return unsubscribe;
  }, [markDirty]);
}

// Initialize with autosave on app start
export async function initializeProjectStore() {
  try {
    const autosaveData = await getFromIndexedDB(DEFAULT_AUTOSAVE_KEY);
    if (autosaveData) {
      const project = migrateToLatest(autosaveData);
      useProjectStore.getState().loadProject(project);
      console.log("🔄 Loaded autosave on startup:", project.meta.name);
    } else {
      // Create a default project if no autosave exists
      const defaultProject = makeEmptyProject("Untitled Project");
      useProjectStore.getState().loadProject(defaultProject);
      console.log("📁 Created default project:", defaultProject.meta.name);
    }
  } catch (error) {
    console.error("❌ Failed to load autosave:", error);
    // Create a default project on error
    const defaultProject = makeEmptyProject("Untitled Project");
    useProjectStore.getState().loadProject(defaultProject);
  }
}
