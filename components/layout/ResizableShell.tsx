"use client";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { AssetsPanel } from "@/components/panels/AssetsPanel";
import { PreviewPanel } from "@/components/panels/PreviewPanel";
import { InspectorPanel } from "@/components/panels/InspectorPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ClientOnly } from "@/components/ui/ClientOnly";

export function ResizableShell() {
  // Default layouts: [left, center, right] sum to 100; bottom is % height
  const [hLayout, setHLayout] = useLocalStorage<number[]>("cs:layout:h", [18, 64, 18]);
  const [vLayout, setVLayout] = useLocalStorage<number[]>("cs:layout:v", [75, 25]);

  return (
        <div className="h-[calc(100vh-100px)] w-screen overflow-hidden">
      <ClientOnly fallback={
        <div className="h-full w-full flex">
          <div className="w-1/5"><AssetsPanel /></div>
          <div className="w-3/5"><PreviewPanel /></div>
          <div className="w-1/5"><InspectorPanel /></div>
        </div>
      }>
        <PanelGroup
          direction="vertical"
          onLayout={setVLayout}
          storage={{
            getItem: (name: string) => {
              if (typeof window === "undefined") return null;
              return localStorage.getItem(name);
            },
            setItem: (name: string, value: string) => {
              if (typeof window === "undefined") return;
              localStorage.setItem(name, value);
            },
          }}
        >
          <Panel minSize={60} maxSize={85}>
            <PanelGroup
              direction="horizontal"
              onLayout={setHLayout}
              storage={{
                getItem: (name: string) => {
                  if (typeof window === "undefined") return null;
                  return localStorage.getItem(name);
                },
                setItem: (name: string, value: string) => {
                  if (typeof window === "undefined") return;
                  localStorage.setItem(name, value);
                },
              }}
            >
              <Panel minSize={15} maxSize={25}><AssetsPanel /></Panel>
              <PanelResizeHandle className="ResizeHandle" />
              <Panel minSize={50} maxSize={70}><PreviewPanel /></Panel>
              <PanelResizeHandle className="ResizeHandle" />
              <Panel minSize={15} maxSize={25}><InspectorPanel /></Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="ResizeHandle" />
          <Panel minSize={15} maxSize={40}><Timeline /></Panel>
        </PanelGroup>
      </ClientOnly>
    </div>
  );
}