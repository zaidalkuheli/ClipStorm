"use client";
import { useEffect } from "react";
import { useProjectStore, useProjectDirtyTracker, initializeProjectStore } from "@/stores/projectStore";

export function ProjectInitializer() {
  // Initialize project store on mount
  useEffect(() => {
    initializeProjectStore();
  }, []);

  // Track dirty state
  useProjectDirtyTracker();

  return null;
}
