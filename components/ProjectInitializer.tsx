"use client";
import { useEffect } from "react";
import { useProjectStore, useProjectDirtyTracker, initializeProjectStore } from "@/stores/projectStore";
import { useAssetsStore } from "@/stores/assetsStore";

export function ProjectInitializer() {
  // Initialize project store on mount
  useEffect(() => {
    console.log("🔍 ProjectInitializer - Starting initialization");
    initializeProjectStore();
    console.log("🔍 ProjectInitializer - Initialization complete");
    
    // Analyze existing audio assets for waveforms
    setTimeout(() => {
      useAssetsStore.getState().analyzeAllAudioAssets();
    }, 500); // Delay to ensure project is loaded
  }, []);

  // Track dirty state
  useProjectDirtyTracker();

  return null;
}
