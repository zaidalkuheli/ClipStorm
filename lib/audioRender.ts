"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { framesToMs } from "@/lib/timebase";

/**
 * Renders the timeline's audio offline to a WAV file
 * Honors clip gain/mute, track mute/solo, fades, start offsets, and frame-accurate timing
 */
export async function renderTimelineToWav(opts?: {
  sampleRate?: number;
}): Promise<Blob> {
  const sampleRate = opts?.sampleRate ?? 48000;
  const channels = 2;
  
  // Get timeline state from stores
  const editorState = useEditorStore.getState();
  const assetsState = useAssetsStore.getState();
  
  const { tracks, audioClips, durationMs, fps } = editorState;
  
  // Calculate duration in seconds
  const durationSec = durationMs / 1000;
  
  console.log('🎵 Starting audio render:', {
    sampleRate,
    channels,
    durationSec,
    durationMs,
    fps,
    audioClipsCount: audioClips.length,
    tracksCount: tracks.length
  });
  
  try {
    // Create offline audio context
    const ctx = new OfflineAudioContext({
      length: Math.ceil(durationSec * sampleRate),
      sampleRate,
      numberOfChannels: channels
    });
    
    // Determine track audible states
    const soloActive = tracks.some(t => t.soloed);
    const trackAudibleMap = new Map(
      tracks.map(track => [
        track.id, 
        !track.muted && (!soloActive || track.soloed)
      ])
    );
    
    console.log('🎵 Track audible states:', {
      soloActive,
      trackStates: Object.fromEntries(trackAudibleMap)
    });
    
    // Process each audio clip
    for (const clip of audioClips) {
      try {
        // Check if track is audible
        const trackAudible = trackAudibleMap.get(clip.trackId || '') ?? true;
        if (!trackAudible) {
          console.log('🎵 Skipping clip - track not audible:', clip.id);
          continue;
        }
        
        // Determine clip gain target
        const baseGain = clip.gain ?? 1;
        if (baseGain <= 0) {
          console.log('🎵 Skipping clip - zero gain:', clip.id);
          continue;
        }
        
        // Get audio file from assets store
        const asset = assetsState.getById(clip.assetId);
        if (!asset || !asset.file) {
          console.warn('🎵 Skipping clip - no asset file:', clip.id, asset?.name);
          continue;
        }
        
        // Decode audio data
        const arrayBuffer = await asset.file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        
        console.log('🎵 Processing clip:', {
          clipId: clip.id,
          assetName: asset.name,
          audioBufferDuration: audioBuffer.duration,
          audioBufferSampleRate: audioBuffer.sampleRate,
          audioBufferChannels: audioBuffer.numberOfChannels
        });
        
        // Time calculations (frame-accurate)
        const clipStartSec = (clip.startF ?? 0) / fps;
        const clipDurationSec = (clip.durF ?? 0) / fps;
        const fileOffsetSec = Math.max(0, (clip.audioOffsetMs ?? 0) / 1000);
        const playDurSec = Math.min(
          audioBuffer.duration - fileOffsetSec, 
          clipDurationSec
        );
        
        if (playDurSec <= 0) {
          console.log('🎵 Skipping clip - no play duration:', clip.id);
          continue;
        }
        
        // Create audio nodes
        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        // Apply fades (clamped to play duration)
        const fadeInSec = Math.min(
          (clip.fadeInMs ?? 0) / 1000, 
          Math.max(0, playDurSec - 0.01)
        );
        const fadeOutSec = Math.min(
          (clip.fadeOutMs ?? 0) / 1000, 
          Math.max(0, playDurSec - 0.01)
        );
        
        const startTime = clipStartSec;
        const targetGain = baseGain;
        
        // Set up gain automation
        if (fadeInSec > 0) {
          gainNode.gain.setValueAtTime(0, startTime);
          gainNode.gain.linearRampToValueAtTime(targetGain, startTime + fadeInSec);
        } else {
          gainNode.gain.setValueAtTime(targetGain, startTime);
        }
        
        if (fadeOutSec > 0) {
          const fadeOutStart = startTime + playDurSec - fadeOutSec;
          gainNode.gain.setValueAtTime(targetGain, fadeOutStart);
          gainNode.gain.linearRampToValueAtTime(0, startTime + playDurSec);
        }
        
        // Start playback
        source.start(startTime, fileOffsetSec, playDurSec);
        
        console.log('🎵 Clip scheduled:', {
          clipId: clip.id,
          startTime,
          fileOffsetSec,
          playDurSec,
          fadeInSec,
          fadeOutSec,
          targetGain
        });
        
      } catch (clipError) {
        console.error('🎵 Error processing clip:', clip.id, clipError);
        // Continue with other clips
      }
    }
    
    // Render the audio
    console.log('🎵 Starting offline rendering...');
    const renderedBuffer = await ctx.startRendering();
    
    console.log('🎵 Rendering complete:', {
      duration: renderedBuffer.duration,
      sampleRate: renderedBuffer.sampleRate,
      numberOfChannels: renderedBuffer.numberOfChannels,
      length: renderedBuffer.length
    });
    
    // Convert to WAV
    const wavBlob = audioBufferToWav(renderedBuffer);
    
    console.log('🎵 WAV export complete:', {
      blobSize: wavBlob.size,
      blobType: wavBlob.type
    });
    
    return wavBlob;
    
  } catch (error) {
    console.error('🎵 Audio render failed:', error);
    
    // Check for memory-related errors
    if (error instanceof Error) {
      if (error.message.includes('memory') || 
          error.message.includes('Memory') ||
          error.message.includes('quota') ||
          error.message.includes('Quota')) {
        throw new Error('Project too large for audio export. Try shortening the timeline or exporting a smaller range.');
      }
    }
    
    throw error;
  }
}

/**
 * Renders the timeline's audio offline and returns an AudioBuffer
 * This is used by the video export to mux mixed audio
 */
export async function renderTimelineAudioBuffer(opts?: {
  sampleRate?: number;
}): Promise<AudioBuffer> {
  const sampleRate = opts?.sampleRate ?? 48000;
  const channels = 2;
  const editorState = useEditorStore.getState();
  const assetsState = useAssetsStore.getState();
  const { tracks, audioClips, durationMs, fps, scenes } = editorState;

  const durationSec = durationMs / 1000;

  const ctx = new OfflineAudioContext({
    length: Math.ceil(durationSec * sampleRate),
    sampleRate,
    numberOfChannels: channels
  });

  // Determine track audible states
  const soloActive = tracks.some(t => t.soloed);
  const trackAudibleMap = new Map(
    tracks.map(track => [track.id, !track.muted && (!soloActive || track.soloed)])
  );

  // Add timeline audio clips
  for (const clip of audioClips) {
    try {
      const trackAudible = trackAudibleMap.get(clip.trackId || '') ?? true;
      if (!trackAudible) continue;
      const baseGain = clip.gain ?? 1;
      if (baseGain <= 0) continue;
      const asset = assetsState.getById(clip.assetId);
      if (!asset || !asset.file) continue;
      const arrayBuffer = await asset.file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const clipStartSec = (clip.startF ?? 0) / fps;
      const clipDurationSec = (clip.durF ?? 0) / fps;
      const fileOffsetSec = Math.max(0, (clip.audioOffsetMs ?? 0) / 1000);
      const playDurSec = Math.min(audioBuffer.duration - fileOffsetSec, clipDurationSec);
      if (playDurSec <= 0) continue;
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = audioBuffer;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      const fadeInSec = Math.min((clip.fadeInMs ?? 0) / 1000, Math.max(0, playDurSec - 0.01));
      const fadeOutSec = Math.min((clip.fadeOutMs ?? 0) / 1000, Math.max(0, playDurSec - 0.01));
      const startTime = clipStartSec;
      const targetGain = baseGain;
      if (fadeInSec > 0) {
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(targetGain, startTime + fadeInSec);
      } else {
        gainNode.gain.setValueAtTime(targetGain, startTime);
      }
      if (fadeOutSec > 0) {
        const fadeOutStart = startTime + playDurSec - fadeOutSec;
        gainNode.gain.setValueAtTime(targetGain, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0, startTime + playDurSec);
      }
      source.start(startTime, fileOffsetSec, playDurSec);
    } catch {}
  }

  // TODO: add video-audio mixing in later step (ffmpeg.wasm demux) - separate to-do

  const renderedBuffer = await ctx.startRendering();
  return renderedBuffer;
}

/**
 * Converts an AudioBuffer to a WAV file blob
 * Creates 16-bit PCM LE stereo WAV format
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length;
  
  console.log('🎵 Converting to WAV:', {
    sampleRate,
    numberOfChannels,
    length,
    duration: length / sampleRate
  });
  
  // Interleave left and right channels and convert to 16-bit PCM
  const pcmData = new Int16Array(length * numberOfChannels);
  
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Convert float32 (-1 to 1) to int16 (-32768 to 32767)
      const pcmSample = Math.max(-1, Math.min(1, sample));
      pcmData[i * numberOfChannels + channel] = Math.round(pcmSample * 32767);
    }
  }
  
  // Create WAV header (44 bytes)
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  
  // RIFF header
  view.setUint32(0, 0x46464952, true); // "RIFF"
  view.setUint32(4, 36 + pcmData.length * 2, true); // File size - 8
  view.setUint32(8, 0x45564157, true); // "WAVE"
  
  // fmt chunk
  view.setUint32(12, 0x20746d66, true); // "fmt "
  view.setUint32(16, 16, true); // Chunk size
  view.setUint16(20, 1, true); // Audio format (PCM)
  view.setUint16(22, numberOfChannels, true); // Number of channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * numberOfChannels * 2, true); // Byte rate
  view.setUint16(32, numberOfChannels * 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  
  // data chunk
  view.setUint32(36, 0x61746164, true); // "data"
  view.setUint32(40, pcmData.length * 2, true); // Data size
  
  // Combine header and PCM data
  const wavBlob = new Blob([header, pcmData], { type: 'audio/wav' });
  
  console.log('🎵 WAV conversion complete:', {
    headerSize: header.byteLength,
    pcmSize: pcmData.length * 2,
    totalSize: wavBlob.size
  });
  
  return wavBlob;
}
