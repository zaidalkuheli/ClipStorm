"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Download, Plus, RotateCcw, RotateCw, FolderOpen, Save, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { ExportModal } from "@/components/modals/ExportModal";
import { useEditorStore } from "@/stores/editorStore";
import { useProjectStore } from "@/stores/projectStore";

export function AppHeader() {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectButtonRef = useRef<HTMLButtonElement>(null);
  
  // History actions
  const undo = useEditorStore(s => s.undo);
  const redo = useEditorStore(s => s.redo);
  const canUndo = useEditorStore(s => s.canUndo());
  const canRedo = useEditorStore(s => s.canRedo());

  // Project actions
  const project = useProjectStore(s => s.project);
  const dirty = useProjectStore(s => s.dirty);
  const newProject = useProjectStore(s => s.newProject);
  const save = useProjectStore(s => s.save);
  const exportJSON = useProjectStore(s => s.exportJSON);
  const importJSON = useProjectStore(s => s.importJSON);

  // Project menu handlers
  const handleNewProject = () => {
    console.log("🔍 handleNewProject clicked");
    const name = prompt("Project name:");
    newProject(name || undefined);
    setFileHandle(null); // Clear file handle for new project
    setIsProjectMenuOpen(false);
  };

  const handleSave = async () => {
    console.log("🔍 handleSave clicked");
    try {
      if (!project) return;
      
      // If no file handle exists, this is the first save - show save dialog
      if (!fileHandle) {
        await handleSaveAs();
        return;
      }
      
      // Update existing file
      const editorState = useEditorStore.getState().getSerializableState();
      const { editorToProject } = await import("@/lib/projectSchema");
      const updatedProject = editorToProject(editorState, project);
      
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(updatedProject, null, 2));
      await writable.close();
      
      useProjectStore.getState().clearDirty();
      setIsProjectMenuOpen(false);
      console.log("💾 Saved project to:", fileHandle.name);
    } catch (error) {
      console.error("❌ Save failed:", error);
      alert("Save failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleSaveAs = async () => {
    console.log("🔍 handleSaveAs clicked");
    try {
      if (!project) return;
      
      // Check if File System Access API is supported
      if (!('showSaveFilePicker' in window)) {
        // Fallback to download
        await exportJSON();
        setIsProjectMenuOpen(false);
        return;
      }
      
      // Show save file picker
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `${project.meta.name}.clipstorm.json`,
        types: [{
          description: 'ClipStorm Project',
          accept: { 'application/json': ['.json', '.clipstorm.json'] },
        }],
      });
      
      // Get current project state
      const editorState = useEditorStore.getState().getSerializableState();
      const { editorToProject } = await import("@/lib/projectSchema");
      const { useAssetsStore } = await import("@/stores/assetsStore");
      const assets = await useAssetsStore.getState().getAssetsForProject();
      console.log("🔍 AppHeader - Assets for SaveAs:", assets);
      const updatedProject = editorToProject(editorState, project, assets);
      
      // Write to file
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(updatedProject, null, 2));
      await writable.close();
      
      // Store file handle for future saves
      setFileHandle(handle);
      useProjectStore.getState().clearDirty();
      setIsProjectMenuOpen(false);
      console.log("💾 Saved project as:", handle.name);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log("User cancelled save");
        return;
      }
      console.error("❌ Save As failed:", error);
      alert("Save As failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleOpen = async () => {
    console.log("🔍 handleOpen clicked");
    try {
      // Check if File System Access API is supported
      if (!('showOpenFilePicker' in window)) {
        // Fallback to file input
        fileInputRef.current?.click();
        return;
      }
      
      // Show open file picker
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{
          description: 'ClipStorm Project',
          accept: { 'application/json': ['.json', '.clipstorm.json'] },
        }],
        multiple: false,
      });
      
      // Read file
      const file = await handle.getFile();
      const content = await file.text();
      const parsedData = JSON.parse(content);
      
      // Load project
      const { migrateToLatest } = await import("@/lib/projectSchema");
      const project = migrateToLatest(parsedData);
      useProjectStore.getState().loadProject(project);
      
      // Store file handle for future saves
      setFileHandle(handle);
      setIsProjectMenuOpen(false);
      console.log("📂 Opened project:", project.meta.name);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log("User cancelled open");
        return;
      }
      console.error("❌ Open failed:", error);
      alert("Open failed: " + (error instanceof Error ? error.message : "Unknown error"));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("🔍 handleFileInput triggered");
    const file = e.target.files?.[0];
    if (file) {
      try {
        await importJSON(file);
        setFileHandle(null); // No file handle for fallback method
        setIsProjectMenuOpen(false);
      } catch (error) {
        alert("Import failed: " + (error instanceof Error ? error.message : "Unknown error"));
      }
    }
    // Reset input
    e.target.value = "";
  };

  // Keyboard shortcuts for undo/redo and save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = e.key.toLowerCase() === "z";
      const s = e.key.toLowerCase() === "s";
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const meta = isMac ? e.metaKey : e.ctrlKey;

      if (meta && z && !e.shiftKey) { 
        e.preventDefault(); 
        undo(); 
      }
      if (meta && z && e.shiftKey) { 
        e.preventDefault(); 
        redo(); 
      }
      if (meta && s && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, handleSave]);

  // Close project menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isProjectMenuOpen) {
        const target = event.target as Element;
        // Don't close if clicking on the dropdown menu itself
        if (target.closest('.project-menu-container') || target.closest('[data-portal-dropdown]')) {
          return;
        }
        setIsProjectMenuOpen(false);
        setButtonRect(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProjectMenuOpen]);

  return (
    <>
      <ClientOnly fallback={
        <header className="flex items-center justify-between px-4 py-1.5  bg-gradient-to-r from-[var(--surface-primary)] to-[var(--surface-secondary)] backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-secondary)] to-[var(--accent-tertiary)] shadow-md flex items-center justify-center">
              <div className="text-white font-bold text-xs">C</div>
            </div>
            <div className="text-sm font-bold tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              ClipStorm
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden md:inline-flex px-2 py-1 rounded-lg border border-[var(--border-primary)] bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-tertiary)] text-[var(--text-primary)] backdrop-blur-sm text-xs">New Project</div>
            <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-[var(--accent-cool)] to-[var(--brand-secondary)] text-white shadow-lg text-xs">Generate</div>
            <div className="px-2 py-1 rounded-lg bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] text-white shadow-lg text-xs">Export</div>
          </div>
        </header>
      }>
        <header className="flex items-center justify-between px-3 py-1 bg-gradient-to-r from-[var(--surface-primary)] to-[var(--surface-secondary)] backdrop-blur-xl">
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-md bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-secondary)] to-[var(--accent-tertiary)] shadow-md flex items-center justify-center">
              <div className="text-white font-bold text-xs">C</div>
            </div>
            <div className="text-xs font-bold tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              ClipStorm
            </div>
            
            {/* Project Menu - moved next to title */}
            <div className="relative project-menu-container">
              <Button 
                ref={projectButtonRef}
                variant="ghost" 
                onClick={() => {
                  if (projectButtonRef.current) {
                    const rect = projectButtonRef.current.getBoundingClientRect();
                    setButtonRect(rect);
                  }
                  setIsProjectMenuOpen(!isProjectMenuOpen);
                }}
                className="px-1.5 py-0.5 text-xs ml-2"
              >
                <FileText size={10}/>
                Project
              </Button>
            </div>
            
            {project && (
              <div className="text-xs text-[var(--text-tertiary)] ml-2">
                {project.meta.name}
                {dirty && <span className="text-[var(--accent-warm)] ml-1">•</span>}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.clipstorm.json"
              onChange={handleFileInput}
              className="hidden"
            />
            
            {/* Portal-based dropdown */}
            {isProjectMenuOpen && buttonRect && createPortal(
              <div 
                data-portal-dropdown
                className="fixed bg-[var(--surface-primary)] border border-[var(--border-primary)] rounded-lg shadow-lg"
                style={{ 
                  backgroundColor: '#111113', 
                  border: '1px solid #1e293b',
                  position: 'fixed',
                  top: buttonRect.bottom + 4,
                  left: buttonRect.left,
                  width: '192px',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px rgba(0, 0, 0, 0.1)',
                  zIndex: 9999
                }}
              >
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      console.log("🔍 New Project button clicked");
                      e.preventDefault();
                      e.stopPropagation();
                      handleNewProject();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface-secondary)] flex items-center gap-2"
                    style={{ color: '#f8fafc', backgroundColor: 'transparent' }}
                  >
                    <Plus size={10}/>
                    New Project
                  </button>
                  <button
                    onClick={(e) => {
                      console.log("🔍 Open button clicked");
                      e.preventDefault();
                      e.stopPropagation();
                      handleOpen();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface-secondary)] flex items-center gap-2"
                    style={{ color: '#f8fafc', backgroundColor: 'transparent' }}
                  >
                    <FolderOpen size={10}/>
                    Open...
                  </button>
                  <button
                    onClick={(e) => {
                      console.log("🔍 Save button clicked");
                      e.preventDefault();
                      e.stopPropagation();
                      handleSave();
                    }}
                    disabled={!dirty}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface-secondary)] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ color: '#f8fafc', backgroundColor: 'transparent' }}
                  >
                    <Save size={10}/>
                    Save
                  </button>
                  <button
                    onClick={(e) => {
                      console.log("🔍 Save As button clicked");
                      e.preventDefault();
                      e.stopPropagation();
                      handleSaveAs();
                    }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--surface-secondary)] flex items-center gap-2"
                    style={{ color: '#f8fafc', backgroundColor: 'transparent' }}
                  >
                    <Download size={10}/>
                    Save As...
                  </button>
                </div>
              </div>,
              document.body
            )}
            
            <Button className="bg-gradient-to-r from-[var(--accent-cool)] to-[var(--brand-secondary)] hover:from-[var(--info)] hover:to-[var(--brand-primary)] text-white shadow-lg px-1.5 py-0.5 text-xs">
              <Sparkles size={10}/>
              Generate
            </Button>
            
            {/* Undo/Redo buttons */}
            <Button
              variant="ghost"
              onClick={undo}
              disabled={!canUndo}
              className="px-1.5 py-0.5 text-xs disabled:opacity-40"
              aria-label="Undo"
            >
              <RotateCcw size={10}/>
            </Button>
            <Button
              variant="ghost"
              onClick={redo}
              disabled={!canRedo}
              className="px-1.5 py-0.5 text-xs disabled:opacity-40"
              aria-label="Redo"
            >
              <RotateCw size={10}/>
            </Button>
            
            <Button variant="primary" onClick={() => setIsExportOpen(true)} className="px-1.5 py-0.5 text-xs">
              <Download size={10}/>
              Export
            </Button>
          </div>
        </header>
      </ClientOnly>
      
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </>
  );
}