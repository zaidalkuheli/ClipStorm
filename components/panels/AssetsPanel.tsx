import { Panel } from "@/components/ui/Panel";

export function AssetsPanel() {
  return (
    <Panel title="Assets" className="h-full">
      <div className="space-y-4">
        <div>
          <div className="text-xs mb-1 text-[var(--muted)]">Voiceover</div>
          <div className="panel p-4 text-sm text-[var(--muted)]">Drop .mp3/.wav here (UI only)</div>
        </div>
        <div>
          <div className="text-xs mb-1 text-[var(--muted)]">Background Music</div>
          <div className="panel p-4 text-sm text-[var(--muted)]">Drop .mp3 here (UI only)</div>
        </div>
        <div>
          <div className="text-xs mb-1 text-[var(--muted)]">Script</div>
          <textarea className="textarea h-40" placeholder="Paste your script here (UI only)..." />
        </div>
      </div>
    </Panel>
  );
}