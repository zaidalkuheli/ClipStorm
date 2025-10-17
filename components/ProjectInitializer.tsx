"use client";
import { useEffect } from "react";
import { useProjectStore, useProjectDirtyTracker, initializeProjectStore } from "@/stores/projectStore";

export function ProjectInitializer() {
  // Initialize project store on mount
  useEffect(() => {
    console.log("🔍 ProjectInitializer - Starting initialization");
    initializeProjectStore();
    console.log("🔍 ProjectInitializer - Initialization complete");
  }, []);

  // Track dirty state
  useProjectDirtyTracker();

  return null;
}
