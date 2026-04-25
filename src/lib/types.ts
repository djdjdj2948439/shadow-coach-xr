export type TripoTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "banned"
  | "expired"
  | "cancelled"
  | "unknown";

export type TripoCreateTaskResponse = {
  taskId: string;
  status: TripoTaskStatus;
  mock: boolean;
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
  modelUrl: string | null;
  raw: Record<string, unknown>;
  cachedAt: number;
  expiresAt: number;
};

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
