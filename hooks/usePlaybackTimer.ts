"use client";
import { useEffect, useRef, useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";

export function usePlaybackTimer() {
  const isPlaying = useEditorStore(s => s.isPlaying);
  const playheadMs = useEditorStore(s => s.playheadMs);
  const durationMs = useEditorStore(s => s.durationMs);
  const playbackSpeed = useEditorStore(s => s.playbackSpeed);
  const setPlayhead = useEditorStore(s => s.setPlayhead);
  const pause = useEditorStore(s => s.pause);
  
  const lastTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();
  const isActiveRef = useRef<boolean>(false);

  const updatePlayhead = useCallback((currentTime: number) => {
    if (!isActiveRef.current) return;

    if (lastTimeRef.current === 0) {
      lastTimeRef.current = currentTime;
    }

    const deltaTime = currentTime - lastTimeRef.current;
    const deltaMs = deltaTime * playbackSpeed;
    
    const newPlayheadMs = playheadMs + deltaMs;
    
    if (newPlayheadMs >= durationMs) {
      // Stop at the end instead of looping
      setPlayhead(durationMs);
      pause(); // Auto-pause at end
      isActiveRef.current = false;
      console.log('⏹️ Playhead reached end and paused');
      return;
    }
    
    setPlayhead(newPlayheadMs);
    lastTimeRef.current = currentTime;
    
    if (isActiveRef.current) {
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    }
  }, [playheadMs, durationMs, playbackSpeed, setPlayhead, pause]);

  useEffect(() => {
    if (!isPlaying) {
      isActiveRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }

    // If playhead is at the end, restart from beginning
    if (playheadMs >= durationMs) {
      console.log('🔄 Restarting from beginning');
      setPlayhead(0);
    }

    isActiveRef.current = true;
    lastTimeRef.current = 0;
    animationFrameRef.current = requestAnimationFrame(updatePlayhead);

    return () => {
      isActiveRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, [isPlaying, updatePlayhead, playheadMs, durationMs, setPlayhead]);

  // Reset timer when playhead changes manually (but not during playback)
  // Note: Playback now pauses at end and restarts from beginning on next play
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
    }
  }, [playheadMs, isPlaying]);
}
