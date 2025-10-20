"use client";
import React from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useAssetsStore } from "@/stores/assetsStore";
import { SceneBlocks } from "./SceneBlocks";
import { AudioBlocks } from "./AudioBlocks";
import clsx from "clsx";

interface TrackProps {
  track: {
    id: string;
    name: string;
    type: "video" | "audio";
  };
  height: number;
}

export function Track({ track, height }: TrackProps) {
  // Get all scenes and filter them outside the selector to avoid infinite re-renders
  const allScenes = useEditorStore(s => s.scenes);
  const scenes = React.useMemo(
    () => allScenes.filter(scene => scene.trackId === track.id),
    [allScenes, track.id]
  );
  
  const allAudioClips = useEditorStore(s => s.audioClips);
  const audioClips = React.useMemo(
    () => track.type === "audio" ? allAudioClips.filter(audio => audio.trackId === track.id) : [],
    [allAudioClips, track.id, track.type]
  );
  const getAssetById = useAssetsStore(s => s.getById);
  const pxToMs = useEditorStore(s => s.pxToMs);
  const beginTx = useEditorStore(s => s.beginTx);
  const commitTx = useEditorStore(s => s.commitTx);
  const addSceneFromAsset = useEditorStore(s => s.addSceneFromAsset);
  const addAudioFromAsset = useEditorStore(s => s.addAudioFromAsset);

  // For audio tracks, show audio clips; for video tracks, show scenes
  const hasContent = track.type === "video" ? scenes.length > 0 : audioClips.length > 0;

  // Drag & Drop handlers
  function getMsFromClientX(clientX: number) {
    const el = document.querySelector('.timeline-scroll-area') as HTMLElement;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return pxToMs(x);
  }

  function handleDropOnVideo(e: React.DragEvent) {
    const data = e.dataTransfer.getData("text/x-clipstorm-asset");
    if (!data) return;
    e.preventDefault();
    const { id, type } = JSON.parse(data);
    // Only accept image and video in video track
    if (type !== "image" && type !== "video") return;

    const atMs = getMsFromClientX(e.clientX);
    beginTx("Drop asset (video)");
    const dur = type === "video" ? 5000 : 3000;
    addSceneFromAsset(id, { atMs, durationMs: dur, trackId: track.id });
    commitTx();
  }

  function handleDropOnAudio(e: React.DragEvent) {
    const data = e.dataTransfer.getData("text/x-clipstorm-asset");
    if (!data) return;
    e.preventDefault();
    const { id, type } = JSON.parse(data);
    if (type !== "audio") return;
    const atMs = getMsFromClientX(e.clientX);
    beginTx("Drop asset (audio)");
    addAudioFromAsset(id, "music", { atMs, durationMs: 30000, trackId: track.id }); // 30s default
    commitTx();
  }

  return (
    <div 
      className={clsx(
        "relative border-b border-[var(--border-primary)]",
        {
          "bg-[var(--surface-primary)]": !hasContent,
          "bg-[var(--surface-secondary)]": hasContent
        }
      )}
      style={{ height }}
      data-track-id={track.id}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
      onDrop={track.type === "video" ? handleDropOnVideo : handleDropOnAudio}
    >
      {track.type === "video" ? (
        <SceneBlocks trackId={track.id} />
      ) : (
        <AudioBlocks trackId={track.id} />
      )}
    </div>
  );
}
