export type TripoCreateTaskResponse = {
  taskId: string;
  status: string;
  mock: boolean;
  message: string;
  raw: Record<string, unknown>;
};

export type TripoTaskStatusResponse = {
  taskId: string;
  status: string;
  mock: boolean;
  modelUrl: string | null;
  raw: Record<string, unknown>;
};

export type TripoPromptPreset = {
  id: string;
  prompt: string;
};

export type TripoCacheEntry = {
  taskId: string;
  status: string;
  mock: boolean;
  modelUrl: string | null;
  raw: Record<string, unknown>;
  cachedAt: number;
  expiresAt: number;
};
