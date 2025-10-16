"use client";
import { create } from "zustand";

interface EditorState {
  aspect: "9:16" | "1:1" | "16:9";
  showGrid: boolean;
  showSafeArea: boolean;
  setAspect: (aspect: "9:16" | "1:1" | "16:9") => void;
  setShowGrid: (show: boolean) => void;
  setShowSafeArea: (show: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  aspect: "9:16",
  showGrid: false,
  showSafeArea: true,
  setAspect: (aspect) => set({ aspect }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowSafeArea: (showSafeArea) => set({ showSafeArea }),
}));
