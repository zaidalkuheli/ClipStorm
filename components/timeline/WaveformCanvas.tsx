"use client";
import React, { useRef, useEffect } from "react";
import { useAssetsStore } from "@/stores/assetsStore";
import type { AudioClip } from "@/stores/editorStore";

interface WaveformCanvasProps {
  clip: AudioClip;
  pxPerSec: number;
  height?: number;
  bgColor?: string; // background color to match parent block
}

export function WaveformCanvas({ clip, pxPerSec, height = 40, bgColor }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getAssetById = useAssetsStore(s => s.getById);
  const waveforms = useAssetsStore(s => s.waveforms);

  const asset = getAssetById(clip.assetId);
  const waveform = asset ? waveforms[asset.id] : undefined;

  console.log('🎵 WAVEFORM CANVAS RENDER:', {
    clipId: clip.id,
    assetId: clip.assetId,
    hasAsset: !!asset,
    assetName: asset?.name,
    hasWaveform: !!waveform,
    waveformBins: waveform?.mins?.length,
    audioOffsetMs: clip.audioOffsetMs || 0,
    clipStartMs: clip.startMs,
    clipEndMs: clip.endMs,
    clipDurationMs: clip.endMs - clip.startMs,
    pxPerSec: pxPerSec,
    bgColor: bgColor,
    clipObject: clip
  });

  useEffect(() => {
    console.log('🎵 WAVEFORM CANVAS useEffect TRIGGERED:', {
      clipId: clip.id,
      audioOffsetMs: clip.audioOffsetMs || 0,
      clipStartMs: clip.startMs,
      clipEndMs: clip.endMs,
      hasCanvas: !!canvasRef.current,
      hasWaveform: !!waveform,
      waveformBins: waveform?.mins?.length
    });
    
    const canvas = canvasRef.current;
    if (!canvas || !waveform) {
      console.log('🎵 Canvas effect skipped:', { hasCanvas: !!canvas, hasWaveform: !!waveform });
      return;
    }

    // Set canvas size with limits to prevent browser rendering issues
    const rect = canvas.getBoundingClientRect();
    
    // Limit canvas dimensions to prevent browser rendering limits (max ~32k pixels)
    const MAX_CANVAS_WIDTH = 32000;
    const MAX_CANVAS_HEIGHT = 32000;
    const limitedWidth = Math.min(rect.width, MAX_CANVAS_WIDTH);
    const limitedHeight = Math.min(rect.height, MAX_CANVAS_HEIGHT);
    
    console.log('🎵 Starting waveform render:', {
      clipId: clip.id,
      canvasSize: { width: canvas.clientWidth, height: canvas.clientHeight },
      canvasRect: { width: rect.width, height: rect.height },
      limitedSize: { width: limitedWidth, height: limitedHeight },
      devicePixelRatio: window.devicePixelRatio,
      waveformBins: waveform.mins.length,
      waveformDuration: waveform.durationMs,
      bgColor: bgColor,
      pxPerSec: pxPerSec
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('🎵 No canvas context');
      return;
    }
    canvas.width = limitedWidth * window.devicePixelRatio;
    canvas.height = limitedHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear + paint background to match the parent block color
    ctx.clearRect(0, 0, limitedWidth, limitedHeight);
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, limitedWidth, limitedHeight);
      console.log('🎵 BACKGROUND PAINTED:', { clipId: clip.id, bgColor, width: limitedWidth, height: limitedHeight });
    } else {
      console.log('🎵 NO BACKGROUND COLOR PROVIDED:', { clipId: clip.id });
    }

    // Calculate which portion of the waveform to show based on audio offset
    const audioOffsetMs = clip.audioOffsetMs || 0;
    const clipDurationMs = clip.endMs - clip.startMs;
    
    // Calculate which bins correspond to this clip's audio segment
    const binMs = waveform.binMs;
    const startBin = Math.floor(audioOffsetMs / binMs);
    const endBin = Math.ceil((audioOffsetMs + clipDurationMs) / binMs);
    
    // Ensure we don't go beyond available bins
    const actualStartBin = Math.max(0, startBin);
    const actualEndBin = Math.min(waveform.mins.length, endBin);
    const visibleBins = actualEndBin - actualStartBin;
    
    console.log('🎵 WAVEFORM OFFSET CALCULATION:', {
      clipId: clip.id,
      audioOffsetMs: audioOffsetMs,
      clipDurationMs: clipDurationMs,
      binMs: binMs,
      startBin: startBin,
      endBin: endBin,
      actualStartBin: actualStartBin,
      actualEndBin: actualEndBin,
      visibleBins: visibleBins,
      totalBins: waveform.mins.length,
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      assetName: asset?.name || 'unknown'
    });
    
    // Safety check: if no visible bins or invalid range, show full waveform as fallback
    if (visibleBins <= 0 || actualStartBin >= waveform.mins.length || actualEndBin <= actualStartBin) {
      console.log('🎵 SAFETY FALLBACK - Invalid bin range, showing full waveform');
      const fallbackVisibleBins = waveform.mins.length;
      
      // Draw the entire waveform as fallback
      // Background is already painted above; just stroke lines
      for (let i = 0; i < fallbackVisibleBins; i++) {
        const min = waveform.mins[i];
        const max = waveform.maxs[i];
        
        const x = (i / fallbackVisibleBins) * limitedWidth;
        const topY = centerY - (max * maxHeight / 2);
        const bottomY = centerY - (min * maxHeight / 2);
        
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.stroke();
      }
      console.log('🎵 Fallback waveform drawing complete');
      return;
    }

    // Draw waveform with minimal padding (filename only shows on hover)
    const centerY = limitedHeight / 2;
    const maxHeight = limitedHeight * 0.8; // Use more of the available space

    ctx.fillStyle = '#3b82f6'; // Blue color for waveform
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;

    // Draw only the bins that correspond to this clip's audio segment
    for (let i = 0; i < visibleBins; i++) {
      const binIndex = actualStartBin + i;
      
      // Safety check for bin index
      if (binIndex >= waveform.mins.length) {
        console.log('🎵 Bin index out of range:', { binIndex, totalBins: waveform.mins.length });
        break;
      }
      
      const min = waveform.mins[binIndex];
      const max = waveform.maxs[binIndex];
      
      // Convert to pixel coordinates (relative to the visible portion)
      const x = (i / visibleBins) * limitedWidth;
      const topY = centerY - (max * maxHeight / 2);
      const bottomY = centerY - (min * maxHeight / 2);
      
      // Draw vertical line for this bin
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.stroke();
    }
    
    console.log('🎵 Waveform segment drawing complete:', { 
      clipId: clip.id, 
      visibleBins, 
      canvasWidth: limitedWidth, 
      canvasHeight: limitedHeight,
      bgColor: bgColor 
    });

  }, [clip.id, clip.startMs, clip.endMs, clip.audioOffsetMs, pxPerSec, height, waveform]);

  // Debug dependency changes
  useEffect(() => {
    console.log('🎵 DEPENDENCY CHANGE DETECTED:', {
      clipId: clip.id,
      audioOffsetMs: clip.audioOffsetMs || 0,
      clipStartMs: clip.startMs,
      clipEndMs: clip.endMs,
      pxPerSec,
      height,
      hasWaveform: !!waveform,
      waveformBins: waveform?.mins?.length
    });
  }, [clip.id, clip.startMs, clip.endMs, clip.audioOffsetMs, pxPerSec, height, waveform]);

  if (!waveform) {
    // Show loading or placeholder that matches parent color
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <div className="text-xs text-white/60">Loading waveform...</div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ width: '100%', height: '100%', backgroundColor: bgColor || 'transparent' }}
    />
  );
}
