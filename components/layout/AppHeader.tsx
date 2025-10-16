"use client";
import { Button } from "@/components/ui/Button";
import { Sparkles, Download, Plus } from "lucide-react";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { ExportModal } from "@/components/modals/ExportModal";
import { useState } from "react";

export function AppHeader() {
  const [isExportOpen, setIsExportOpen] = useState(false);

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
            <Button className="hidden md:inline-flex" variant="ghost" className="px-2 py-1 text-xs">
              <Plus size={12}/>
              New Project
            </Button>
            <Button className="bg-gradient-to-r from-[var(--accent-cool)] to-[var(--brand-secondary)] hover:from-[var(--info)] hover:to-[var(--brand-primary)] text-white shadow-lg px-2 py-1 text-xs">
              <Sparkles size={12}/>
              Generate
            </Button>
            <Button variant="primary" onClick={() => setIsExportOpen(true)} className="px-2 py-1 text-xs">
              <Download size={12}/>
              Export
            </Button>
          </div>
        </header>
      </ClientOnly>
      
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </>
  );
}
