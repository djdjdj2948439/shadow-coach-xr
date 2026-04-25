export type TripoTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "banned"
  | "expired"
  | "cancelled"
  | "unknown";

export type TripoInputMode = "text" | "image";

export type TripoReferenceImage = {
  name: string;
  type: string;
  size: number;
};

export type TripoCreateTaskResponse = {
  taskId: string;
  status: TripoTaskStatus;
  mock: boolean;
  inputMode: TripoInputMode;
  referenceImage: TripoReferenceImage | null;
  message: string;
  raw: Record<string, unknown>;
};

export type TripoTaskStatusResponse = {
  taskId: string;
  status: TripoTaskStatus;
  mock: boolean;
  modelUrl: string | null;
  raw: Record<string, unknown>;
};

export type TripoPromptPreset = {
  id: string;
  label: string;
  prompt: string;
};

export type TripoCacheEntry = {
  taskId: string;
  status: TripoTaskStatus;
  mock: boolean;
  inputMode?: TripoInputMode;
  prompt?: string;
  referenceImage?: TripoReferenceImage | null;
  modelUrl: string | null;
  raw: Record<string, unknown>;
  cachedAt: number;
  expiresAt: number;
};

export const TRIPO_MAX_PROMPT_LENGTH = 800;
export const TRIPO_REFERENCE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const TRIPO_REFERENCE_IMAGE_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;
export const TRIPO_REFERENCE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export const TRIPO_TERMINAL_STATUSES: TripoTaskStatus[] = [
  "success",
  "failed",
  "banned",
  "expired",
  "cancelled",
  "unknown",
];

export function isFinalTripoStatus(status: TripoTaskStatus) {
  return TRIPO_TERMINAL_STATUSES.includes(status);
}
