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
        <header className="flex items-center justify-between px-8 py-5 border-b border-[var(--border-primary)] bg-gradient-to-r from-[var(--surface-primary)] to-[var(--surface-secondary)] backdrop-blur-xl">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-secondary)] to-[var(--accent-tertiary)] shadow-2xl flex items-center justify-center">
              <div className="text-white font-bold text-xl">C</div>
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                ClipStorm
              </div>
              <div className="text-sm text-[var(--text-tertiary)] font-medium">AI Shortform Editor</div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:inline-flex px-5 py-3 rounded-xl border border-[var(--border-primary)] bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-tertiary)] text-[var(--text-primary)] backdrop-blur-sm">
              New Project
            </div>
            <div className="px-5 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-cool)] to-[var(--brand-secondary)] text-white shadow-lg">
              Generate
            </div>
            <div className="px-5 py-3 rounded-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] text-white shadow-lg">
              Export
            </div>
          </div>
        </header>
      }>
        <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-primary)] bg-gradient-to-r from-[var(--surface-primary)] to-[var(--surface-secondary)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-secondary)] to-[var(--accent-tertiary)] shadow-lg flex items-center justify-center">
              <div className="text-white font-bold text-sm">C</div>
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
                ClipStorm
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button className="hidden md:inline-flex" variant="ghost" className="px-3 py-1.5 text-sm">
              <Plus size={14}/>
              New Project
            </Button>
            <Button className="bg-gradient-to-r from-[var(--accent-cool)] to-[var(--brand-secondary)] hover:from-[var(--info)] hover:to-[var(--brand-primary)] text-white shadow-lg px-3 py-1.5 text-sm">
              <Sparkles size={14}/>
              Generate
            </Button>
            <Button variant="primary" onClick={() => setIsExportOpen(true)} className="px-3 py-1.5 text-sm">
              <Download size={14}/>
              Export
            </Button>
          </div>
        </header>
      </ClientOnly>
      
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </>
  );
}
