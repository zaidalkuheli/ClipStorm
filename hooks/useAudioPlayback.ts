"use client";
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";

export function useAudioPlayback() {
  const isPlaying = useEditorStore(s => s.isPlaying);
  const playheadMs = useEditorStore(s => s.playheadMs);
  const audioClips = useEditorStore(s => s.audioClips);
  const tracks = useEditorStore(s => s.tracks);
  const getAssetById = useAssetsStore(s => s.getById);
  
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Get current audio clips that should be playing
  const getCurrentAudioClips = () => {
    const clipsAtPlayhead = audioClips.filter(clip => 
      playheadMs >= clip.startMs && playheadMs < clip.endMs
    );

    // Check if any track is soloed
    const soloedTracks = tracks.filter(track => track.soloed);
    const hasSoloedTrack = soloedTracks.length > 0;

    if (hasSoloedTrack) {
      // Only play clips from soloed tracks
      const soloedTrackIds = soloedTracks.map(track => track.id);
      const filteredClips = clipsAtPlayhead.filter(clip => 
        clip.trackId && soloedTrackIds.includes(clip.trackId)
      );
      console.log('🎵 Solo mode active:', { soloedTracks: soloedTracks.map(t => t.name), playingClips: filteredClips.length });
      return filteredClips;
    }

    // Filter out clips from muted tracks
    const filteredClips = clipsAtPlayhead.filter(clip => {
      if (!clip.trackId) return true; // Clips without trackId should play
      const track = tracks.find(t => t.id === clip.trackId);
      return !track?.muted; // Don't play if track is muted
    });
    
    const mutedTracks = tracks.filter(track => track.muted);
    if (mutedTracks.length > 0) {
      console.log('🔇 Muted tracks:', mutedTracks.map(t => t.name), 'Playing clips:', filteredClips.length);
    }
    
    return filteredClips;
  };

  // Create or get audio element for a clip
  const getAudioElement = (clip: typeof audioClips[0]) => {
    const existing = audioElementsRef.current.get(clip.id);
    if (existing) return existing;

    const asset = getAssetById(clip.assetId);
    if (!asset || asset.type !== 'audio') return null;

    const audio = new Audio(asset.url);
    audio.preload = 'metadata';
    audio.loop = false;
    // Initialize volume from clip gain (0..1)
    audio.volume = Math.max(0, Math.min(1, clip.gain ?? 1));
    audioElementsRef.current.set(clip.id, audio);
    return audio;
  };

  // Update audio playback based on playhead position
  useEffect(() => {
    const currentClips = getCurrentAudioClips();
    
    // Stop all audio elements first
    audioElementsRef.current.forEach((audio, clipId) => {
      if (!currentClips.find(clip => clip.id === clipId)) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    // Play current clips
    currentClips.forEach(clip => {
      const audio = getAudioElement(clip);
      if (!audio) return;

      // Calculate local time within the clip, accounting for audio offset
      const localTimeMs = playheadMs - clip.startMs;
      const audioOffsetMs = clip.audioOffsetMs || 0;
      const audioTimeMs = audioOffsetMs + localTimeMs;
      const audioTimeSeconds = audioTimeMs / 1000;

      console.log('🎵 AUDIO PLAYBACK DEBUG:', {
        clipId: clip.id,
        playheadMs,
        clipStartMs: clip.startMs,
        clipEndMs: clip.endMs,
        clipDurationMs: clip.endMs - clip.startMs,
        localTimeMs,
        audioOffsetMs,
        audioTimeMs,
        audioTimeSeconds,
        currentTime: audio.currentTime,
        assetId: clip.assetId,
        isPlaying: isPlaying
      });

      // Apply volume/mute from clip gain (0..1)
      const volume = Math.max(0, Math.min(1, clip.gain ?? 1));
      if (audio.volume !== volume) {
        audio.volume = volume;
      }

      // Set audio time and play if timeline is playing
      if (Math.abs(audio.currentTime - audioTimeSeconds) > 0.1) {
        audio.currentTime = audioTimeSeconds;
      }

      if (isPlaying && audio.paused) {
        audio.play().catch(error => {
          console.warn('Failed to play audio:', error);
        });
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
      }
    });
  }, [isPlaying, playheadMs, audioClips, tracks]);

  // Cleanup audio elements when clips are removed
  useEffect(() => {
    const currentClipIds = new Set(audioClips.map(clip => clip.id));
    
    audioElementsRef.current.forEach((audio, clipId) => {
      if (!currentClipIds.has(clipId)) {
        audio.pause();
        audio.src = '';
        audioElementsRef.current.delete(clipId);
      }
    });
  }, [audioClips]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioElementsRef.current.clear();
    };
  }, []);
}
