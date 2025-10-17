import { z } from "zod";

// Asset types
const AssetKindSchema = z.enum(["vo", "music", "image", "video", "script"]);

// Asset schema
const AssetSchema = z.object({
  id: z.string(),
  kind: AssetKindSchema,
  name: z.string(),
  uri: z.string().optional(),
});

// Scene schema (matches editor store Scene type)
const SceneSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  startMs: z.number(),
  endMs: z.number(),
  linkLeftId: z.string().nullable().optional(),
  linkRightId: z.string().nullable().optional(),
});

// Project metadata
const MetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.literal(1),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// Project settings
const SettingsSchema = z.object({
  fps: z.number(),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  resolution: z.string(),
  durationMs: z.number(),
});

// Timeline data
const TimelineSchema = z.object({
  scenes: z.array(SceneSchema),
});

// Complete project schema
const ProjectV1Schema = z.object({
  meta: MetaSchema,
  settings: SettingsSchema,
  assets: z.array(AssetSchema),
  timeline: TimelineSchema,
});

// Export the main schema
export const ProjectV1 = ProjectV1Schema;
export type ProjectV1 = z.infer<typeof ProjectV1Schema>;

// For now, v1 is the latest
export const Project = ProjectV1;
export type Project = ProjectV1;

// Helper functions
export function makeEmptyProject(name?: string): Project {
  const now = Date.now();
  const projectId = `project_${now}`;
  const projectName = name || `Untitled Project ${new Date().toLocaleDateString()}`;
  
  return {
    meta: {
      id: projectId,
      name: projectName,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    settings: {
      fps: 30,
      aspect: "9:16",
      resolution: "1080x1920",
      durationMs: 20000, // 20 seconds default
    },
    assets: [],
    timeline: {
      scenes: [
        {
          id: `scene_${now}_1`,
          label: "Scene 1",
          startMs: 0,
          endMs: 5000,
        },
      ],
    },
  };
}

export function migrateToLatest(data: unknown): Project {
  // For now, only support v1
  try {
    return ProjectV1.parse(data);
  } catch (error) {
    throw new Error(`Invalid project data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function projectToEditor(project: Project) {
  return {
    scenes: project.timeline.scenes,
    durationMs: project.settings.durationMs,
    fps: project.settings.fps,
    aspect: project.settings.aspect,
    resolution: project.settings.resolution,
  };
}

export function editorToProject(
  editorState: {
    scenes: Array<{
      id: string;
      label?: string;
      startMs: number;
      endMs: number;
      linkLeftId?: string | null;
      linkRightId?: string | null;
    }>;
    durationMs: number;
    fps: number;
    aspect: "9:16" | "1:1" | "16:9";
    resolution: string;
  },
  existingProject?: Project
): Project {
  const now = Date.now();
  
  if (existingProject) {
    return {
      ...existingProject,
      meta: {
        ...existingProject.meta,
        updatedAt: now,
      },
      settings: {
        fps: editorState.fps,
        aspect: editorState.aspect,
        resolution: editorState.resolution,
        durationMs: editorState.durationMs,
      },
      timeline: {
        scenes: editorState.scenes,
      },
    };
  }
  
  // Create new project
  return {
    meta: {
      id: `project_${now}`,
      name: `Untitled Project ${new Date().toLocaleDateString()}`,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    settings: {
      fps: editorState.fps,
      aspect: editorState.aspect,
      resolution: editorState.resolution,
      durationMs: editorState.durationMs,
    },
    assets: [],
    timeline: {
      scenes: editorState.scenes,
    },
  };
}
