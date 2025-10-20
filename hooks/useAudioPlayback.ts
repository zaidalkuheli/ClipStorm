"use client";
import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";

export function useAudioPlayback() {
  const isPlaying = useEditorStore(s => s.isPlaying);
  const playheadMs = useEditorStore(s => s.playheadMs);
  const audioClips = useEditorStore(s => s.audioClips);
  const scenes = useEditorStore(s => s.scenes);
  const tracks = useEditorStore(s => s.tracks);
  const getAssetById = useAssetsStore(s => s.getById);
  
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Get current audio clips that should be playing
  const getCurrentAudioClips = () => {
    const clipsAtPlayhead = audioClips.filter(clip => 
      playheadMs >= clip.startMs && playheadMs < clip.endMs
    );

    // Also get scenes at playhead that might have audio
    const scenesAtPlayhead = scenes.filter(scene => 
      playheadMs >= scene.startMs && playheadMs < scene.endMs && scene.assetId
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
      
      // Also include scenes from soloed video tracks
      const filteredScenes = scenesAtPlayhead.filter(scene => 
        scene.trackId && soloedTrackIds.includes(scene.trackId)
      );
      
      console.log('🎵 Solo mode active:', { 
        soloedTracks: soloedTracks.map(t => t.name), 
        playingClips: filteredClips.length,
        playingScenes: filteredScenes.length 
      });
      
      return { clips: filteredClips, scenes: filteredScenes };
    }

    // Filter out clips from muted tracks
    const filteredClips = clipsAtPlayhead.filter(clip => {
      if (!clip.trackId) return true; // Clips without trackId should play
      const track = tracks.find(t => t.id === clip.trackId);
      return !track?.muted; // Don't play if track is muted
    });
    
    // Filter out scenes from muted video tracks
    const filteredScenes = scenesAtPlayhead.filter(scene => {
      if (!scene.trackId) return true; // Scenes without trackId should play
      const track = tracks.find(t => t.id === scene.trackId);
      return !track?.muted; // Don't play if track is muted
    });
    
    const mutedTracks = tracks.filter(track => track.muted);
    if (mutedTracks.length > 0) {
      console.log('🔇 Muted tracks:', mutedTracks.map(t => t.name), 'Playing clips:', filteredClips.length, 'Playing scenes:', filteredScenes.length);
    }
    
    return { clips: filteredClips, scenes: filteredScenes };
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

  // Create or get audio element for a scene (video with audio)
  const getSceneAudioElement = (scene: typeof scenes[0]) => {
    const existing = audioElementsRef.current.get(scene.id);
    if (existing) return existing;

    const asset = getAssetById(scene.assetId);
    if (!asset || (asset.type !== 'video' && asset.type !== 'audio')) return null;

    const audio = new Audio(asset.url);
    audio.preload = 'metadata';
    audio.loop = false;
    // Use scene gain for volume control
    audio.volume = Math.max(0, Math.min(1, scene.gain ?? 1));
    audioElementsRef.current.set(scene.id, audio);
    return audio;
  };

  // Update audio playback based on playhead position
  useEffect(() => {
    const { clips: currentClips, scenes: currentScenes } = getCurrentAudioClips();
    
    // Stop all audio elements first
    audioElementsRef.current.forEach((audio, elementId) => {
      const isCurrentClip = currentClips.find(clip => clip.id === elementId);
      const isCurrentScene = currentScenes.find(scene => scene.id === elementId);
      
      if (!isCurrentClip && !isCurrentScene) {
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

    // Play current scenes (video with audio)
    currentScenes.forEach(scene => {
      const audio = getSceneAudioElement(scene);
      if (!audio) return;

      // Apply volume/mute from scene gain and muted state
      const volume = scene.muted ? 0 : Math.max(0, Math.min(1, scene.gain ?? 1));
      if (audio.volume !== volume) {
        audio.volume = volume;
      }

      // Calculate audio time for scene
      const audioTimeSeconds = (playheadMs - scene.startMs) / 1000;
      
      // Only play if audio time is within the scene duration
      if (audioTimeSeconds >= 0 && audioTimeSeconds < (scene.endMs - scene.startMs) / 1000) {
        audio.currentTime = audioTimeSeconds;
        
        if (isPlaying && !audio.paused) {
          // Already playing at correct time
        } else if (isPlaying && audio.paused) {
          audio.play().catch(console.error);
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      } else if (!isPlaying && !audio.paused) {
        audio.pause();
      }
    });
  }, [isPlaying, playheadMs, audioClips, scenes, tracks]);

  // Cleanup audio elements when clips or scenes are removed
  useEffect(() => {
    const currentClipIds = new Set(audioClips.map(clip => clip.id));
    const currentSceneIds = new Set(scenes.map(scene => scene.id));
    
    audioElementsRef.current.forEach((audio, elementId) => {
      if (!currentClipIds.has(elementId) && !currentSceneIds.has(elementId)) {
        audio.pause();
        audio.src = '';
        audioElementsRef.current.delete(elementId);
      }
    });
  }, [audioClips, scenes]);

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
