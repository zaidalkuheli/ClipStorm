import { EditorShell } from "@/components/EditorShell";
import { ProjectInitializer } from "@/components/ProjectInitializer";

export default function Page() {
  return (
    <>
      <ProjectInitializer />
      <EditorShell />
    </>
  );
}
