"use client";

import { useEffect } from "react";

interface BlockContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onSplit: () => void;
  onDelete: () => void;
  onRippleDelete: () => void;
  onDuplicate: () => void;
}

export function BlockContextMenu({
  x,
  y,
  onClose,
  onSplit,
  onDelete,
  onRippleDelete,
  onDuplicate,
}: BlockContextMenuProps) {
  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      onClose();
    };

    // Small delay to prevent immediate closing when right-clicking
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [onClose]);

  const menuItems = [
    { label: "Split at Playhead", action: onSplit },
    { label: "Delete", action: onDelete },
    { label: "Ripple Delete", action: onRippleDelete },
    { label: "Duplicate", action: onDuplicate },
  ];

  return (
    <div
      className="fixed z-50 rounded-md border border-white/10 bg-[rgb(26,29,35)]/98 shadow-xl backdrop-blur px-1 py-1"
      style={{ left: x, top: y, minWidth: 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.action();
            onClose();
          }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-white/8 rounded transition-colors"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
