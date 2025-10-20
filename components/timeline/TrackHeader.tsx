"use client";
import React, { useState, useRef, useEffect } from "react";
import { Edit2, Check, X, Trash2, GripVertical } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";

interface TrackHeaderProps {
  track: {
    id: string;
    name: string;
    type: "video" | "audio";
  };
  height: number;
  onAddTrack: (type: "video" | "audio") => void;
  onRemoveTrack: (trackId: string) => void;
  // Reorder hooks
  onDragStartTrack?: (trackId: string) => void;
  onDragOverTrack?: (trackId: string, e: React.DragEvent) => void;
  onDropTrack?: (trackId: string, e: React.DragEvent) => void;
}

export function TrackHeader({ track, height, onAddTrack, onRemoveTrack, onDragStartTrack, onDragOverTrack, onDropTrack }: TrackHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(track.name);
  const renameTrack = useEditorStore(s => s.renameTrack);
  const scenes = useEditorStore(s => s.scenes);
  const audioClips = useEditorStore(s => s.audioClips);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if track has content (by trackId for both types)
  const hasContent = track.type === "video" 
    ? scenes.some(scene => scene.trackId === track.id)
    : audioClips.some(a => a.trackId === track.id);

  const handleRename = () => {
    if (editName.trim() && editName !== track.name) {
      renameTrack(track.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(track.name);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (hasContent) {
      const confirmMessage = track.type === "video" 
        ? "Delete track with scenes?"
        : "Delete track with audio?";
      
      if (window.confirm(confirmMessage)) {
        onRemoveTrack(track.id);
      }
    } else {
      // Empty track - delete immediately without warning
      onRemoveTrack(track.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  // Handle clicking away to save
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isEditing && inputRef.current && !inputRef.current.contains(event.target as Node)) {
        handleRename();
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, editName, track.name]);

  return (
    <div 
      className="flex items-center justify-between px-2 py-1 bg-[var(--surface-secondary)] border-b border-[var(--border-primary)] group"
      style={{ height }}
      onDragOver={(e) => onDragOverTrack?.(track.id, e)}
      onDrop={(e) => onDropTrack?.(track.id, e)}
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Drag handle */}
        <button
          draggable
          onDragStart={() => onDragStartTrack?.(track.id)}
          className="px-1.5 py-1 h-6 w-6 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-primary)]/60 rounded-md cursor-grab active:cursor-grabbing transition-all duration-150 hover:scale-105"
          title="Drag to reorder track"
          aria-label="Reorder track"
        >
          <GripVertical size={14} />
        </button>
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-1 py-0.5 text-xs bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded min-w-0"
              autoFocus
            />
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={handleRename}
                className="p-0.5 text-green-400 hover:bg-green-400/20 rounded"
                title="Save"
              >
                <Check size={12} />
              </button>
              <button
                onClick={handleCancel}
                className="p-0.5 text-red-400 hover:bg-red-400/20 rounded"
                title="Cancel"
              >
                <X size={12} />
              </button>
              <button
                onClick={handleDelete}
                className="p-0.5 text-red-500 hover:bg-red-500/20 rounded"
                title="Delete track"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={handleDelete}
              className="p-0.5 text-red-500 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
              title={hasContent ? "Delete track (with content)" : "Delete track"}
            >
              <Trash2 size={10} />
            </button>
            <span className="text-xs text-[var(--text-secondary)] font-medium truncate">
              {track.name}
            </span>
            <button
              onClick={() => setIsEditing(true)}
              className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-primary)] rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rename track"
            >
              <Edit2 size={10} />
            </button>
          </>
        )}
      </div>
      
      <div className="flex items-center gap-1">
        <div className="text-xs text-[var(--text-tertiary)]">
          {track.type === "video" ? "🎬" : "🎵"}
        </div>
      </div>
    </div>
  );
}
