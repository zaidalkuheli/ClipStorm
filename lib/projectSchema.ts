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

// Transform schema
const TransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  scale: z.number(),
});

// Track schema
const TrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["video", "audio"]),
});

// Audio clip schema
const AudioClipSchema = z.object({
  id: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  assetId: z.string(),
  kind: z.enum(["vo", "music"]),
  gain: z.number().optional(),
  originalDurationMs: z.number(),
  audioOffsetMs: z.number().optional(),
  trackId: z.string().optional(),
});

// Scene schema (matches editor store Scene type)
const SceneSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  startMs: z.number(),
  endMs: z.number(),
  linkLeftId: z.string().nullable().optional(),
  linkRightId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(), // NEW optional
  transform: TransformSchema.nullable().optional(), // NEW transform data
  trackId: z.string().optional(), // NEW track assignment
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
  tracks: z.array(TrackSchema),
  scenes: z.array(SceneSchema),
  audioClips: z.array(AudioClipSchema),
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
      tracks: [
        { id: "video-track-1", name: "Media 1", type: "video" },
        { id: "audio-track-1", name: "Audio 1", type: "audio" }
      ],
      scenes: [], // Start with empty timeline for clean UI
      audioClips: [], // Start with empty audio clips
    },
  };
}

export function migrateToLatest(data: unknown): Project {
  // For now, only support v1
  try {
    return ProjectV1.parse(data);
  } catch (error) {
    if (error instanceof Error) {
      const dataObj = data as any;
      if (dataObj && typeof dataObj === 'object') {
        
        // Handle missing audioClips field
        if (error.message.includes('audioClips') && error.message.includes('expected array, received undefined')) {
          console.warn("🔧 Adding missing audioClips field to timeline");
          if (dataObj.timeline && typeof dataObj.timeline === 'object') {
            dataObj.timeline.audioClips = [];
            try {
              return ProjectV1.parse(dataObj);
            } catch (retryError) {
              throw new Error(`Invalid project data: added missing audioClips field but still invalid. ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          }
        }
        
        // Handle missing assets field
        if (error.message.includes('assets')) {
          if (dataObj.assets !== undefined) {
            if (Array.isArray(dataObj.assets)) {
              throw new Error(`Invalid project data: assets array has invalid items. ${error.message}`);
            } else {
              // Try to fix common issues with assets field
              console.warn("🔧 Attempting to fix malformed assets field:", typeof dataObj.assets);
              
              // If assets is an object, try to convert it to an array
              if (typeof dataObj.assets === 'object' && dataObj.assets !== null) {
                const assetsArray = Object.values(dataObj.assets);
                if (Array.isArray(assetsArray)) {
                  dataObj.assets = assetsArray;
                  console.log("🔧 Fixed assets field: converted object to array");
                  // Try parsing again with fixed data
                  try {
                    return ProjectV1.parse(dataObj);
                  } catch (retryError) {
                    throw new Error(`Invalid project data: assets field was an object, tried to convert to array but still invalid. ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
                  }
                }
              }
              
              throw new Error(`Invalid project data: assets field is not an array (received ${typeof dataObj.assets}). Expected an array of asset objects.`);
            }
          } else {
            // If assets field is missing, add an empty array
            console.warn("🔧 Adding missing assets field");
            dataObj.assets = [];
            try {
              return ProjectV1.parse(dataObj);
            } catch (retryError) {
              throw new Error(`Invalid project data: missing assets field, tried to add empty array but still invalid. ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
            }
          }
        }
      }
    }
    throw new Error(`Invalid project data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function projectToEditor(project: Project) {
  return {
    tracks: project.timeline.tracks,
    scenes: project.timeline.scenes,
    audioClips: project.timeline.audioClips || [], // Handle missing audioClips in old projects
    durationMs: project.settings.durationMs,
    fps: project.settings.fps,
    aspect: project.settings.aspect,
    resolution: project.settings.resolution,
  };
}

export function editorToProject(
  editorState: {
    tracks: Array<{
      id: string;
      name: string;
      type: "video" | "audio";
    }>;
    scenes: Array<{
      id: string;
      label?: string;
      startMs: number;
      endMs: number;
      linkLeftId?: string | null;
      linkRightId?: string | null;
      trackId?: string;
    }>;
    audioClips: Array<{
      id: string;
      startMs: number;
      endMs: number;
      assetId: string;
      kind: "vo" | "music";
      gain?: number;
      originalDurationMs: number;
      audioOffsetMs?: number;
      trackId?: string;
    }>;
    durationMs: number;
    fps: number;
    aspect: "9:16" | "1:1" | "16:9";
    resolution: string;
  },
  existingProject?: Project,
  assets?: any[] // Add assets parameter
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
      assets: assets || existingProject.assets, // Include assets
      timeline: {
        tracks: editorState.tracks,
        scenes: editorState.scenes,
        audioClips: editorState.audioClips,
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
    assets: assets || [], // Include assets
    timeline: {
      tracks: editorState.tracks,
      scenes: editorState.scenes,
      audioClips: editorState.audioClips,
    },
  };
}
