import { Panel } from "@/components/ui/Panel";

export function InspectorPanel() {
  return (
    <Panel title="Inspector" className="h-full">
      <div className="space-y-5">
        <div>
          <div className="text-xs mb-1 text-[var(--muted)]">Scene Prompt</div>
          <textarea className="textarea h-24" placeholder="Describe the scene (UI only)..." />
        </div>
        <div>
          <div className="text-xs mb-1 text-[var(--muted)]">Caption Style</div>
          <select className="select">
            <option>Minimal</option>
            <option>Bold</option>
            <option>Meme</option>
          </select>
        </div>
        <div>
          <div className="text-xs mb-1 text-[var(--muted)]">Transition</div>
          <select className="select">
            <option>Dissolve (300ms)</option>
            <option>Cut</option>
            <option>Slide</option>
          </select>
        </div>
      </div>
    </Panel>
  );
}