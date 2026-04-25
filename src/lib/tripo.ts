import {
  TripoCreateTaskResponse,
  TripoTaskStatus,
  TripoTaskStatusResponse,
} from "@/lib/types";
import { TRIPO_PROMPT_PRESETS } from "@/lib/tripoPresets";

const TRIPO_API_BASE_URL = "https://api.tripo3d.ai/v2/openapi";
const TRIPO_TASK_ENDPOINT = `${TRIPO_API_BASE_URL}/task`;

const MODEL_URL_PATHS = [
  ["output", "model"],
  ["output", "pbr_model"],
  ["output", "model_url"],
  ["output", "glb"],
  ["output", "glb_url"],
  ["output", "outputUrl"],
  ["output", "output_url"],
  ["data", "output", "model"],
  ["data", "output", "pbr_model"],
  ["data", "output", "model_url"],
  ["data", "output", "glb"],
  ["data", "output", "glb_url"],
  ["result", "output", "model"],
  ["result", "output", "pbr_model"],
  ["result", "output", "model_url"],
  ["result", "output", "glb"],
  ["result", "output", "glb_url"],
  ["result", "model"],
  ["model"],
  ["modelUrl"],
] as const;

const TASK_ID_PATHS = [
  ["task_id"],
  ["taskId"],
  ["id"],
  ["data", "task_id"],
  ["data", "taskId"],
  ["data", "id"],
  ["result", "task_id"],
  ["result", "taskId"],
  ["result", "id"],
] as const;

const STATUS_PATHS = [
  ["status"],
  ["state"],
  ["data", "status"],
  ["data", "state"],
  ["result", "status"],
  ["result", "state"],
] as const;

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function getStringValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNestedValue(
  input: unknown,
  path: readonly string[],
): unknown | null {
  let current: unknown = input;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current ?? null;
}

function getFirstStringFromPaths(
  input: unknown,
  paths: readonly (readonly string[])[],
) {
  for (const path of paths) {
    const candidate = getStringValue(getNestedValue(input, path));

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function getApiKey() {
  return process.env.TRIPO_API_KEY?.trim() ?? "";
}

function shouldUseMockTripo() {
  return process.env.USE_MOCK_TRIPO?.toLowerCase() === "true" || !getApiKey();
}

function getErrorMessage(payload: unknown) {
  const raw = asObject(payload);
  const candidates = [
    raw.message,
    raw.error,
    raw.detail,
    raw.msg,
    raw.error_msg,
    asObject(raw.data).message,
    asObject(raw.data).error,
    asObject(raw.data).detail,
    asObject(raw.data).error_msg,
    asObject(raw.result).message,
    asObject(raw.result).error,
    asObject(raw.result).detail,
  ];

  for (const candidate of candidates) {
    const message = getStringValue(candidate);

    if (message) {
      return message;
    }
  }

  return null;
}

function getTaskId(raw: unknown) {
  return getFirstStringFromPaths(raw, TASK_ID_PATHS) ?? `mock-${Date.now()}`;
}

function getRawStatus(raw: unknown) {
  return getFirstStringFromPaths(raw, STATUS_PATHS);
}

function normalizeStatusValue(value: string | null): TripoTaskStatus {
  switch (value?.toLowerCase()) {
    case "queued":
    case "pending":
    case "mock_queued":
      return "queued";
    case "running":
    case "processing":
    case "mock_running":
      return "running";
    case "success":
    case "finished":
    case "completed":
    case "mock_succeeded":
      return "success";
    case "failed":
    case "error":
      return "failed";
    case "banned":
      return "banned";
    case "expired":
      return "expired";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

export function normalizeStatus(raw: unknown): TripoTaskStatus {
  if (typeof raw === "string") {
    return normalizeStatusValue(raw);
  }

  return normalizeStatusValue(getRawStatus(raw));
}

function isLikelyModelUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function findStringDeep(
  input: unknown,
  preferredKeys: readonly string[],
  visited = new WeakSet<object>(),
): string | null {
  if (typeof input === "string") {
    return isLikelyModelUrl(input) ? input : null;
  }

  if (!input || typeof input !== "object") {
    return null;
  }

  if (visited.has(input)) {
    return null;
  }

  visited.add(input);

  if (Array.isArray(input)) {
    for (const item of input) {
      const match = findStringDeep(item, preferredKeys, visited);
      if (match) {
        return match;
      }
    }

    return null;
  }

  const record = input as Record<string, unknown>;

  for (const key of preferredKeys) {
    const candidate = record[key];

    if (typeof candidate === "string" && isLikelyModelUrl(candidate)) {
      return candidate;
    }

    const nestedMatch = findStringDeep(candidate, preferredKeys, visited);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
}

function extractApiResponseData(payload: unknown) {
  const raw = asObject(payload);
  const data = asObject(raw.data);
  const result = asObject(raw.result);

  return Object.keys(data).length > 0
    ? data
    : Object.keys(result).length > 0
      ? result
      : raw;
}

function buildMockTaskStatus(taskId: string): TripoTaskStatusResponse {
  const mockTimestamp = Number.parseInt(taskId.replace("mock-", ""), 10);
  const ageMs = Number.isNaN(mockTimestamp)
    ? Number.POSITIVE_INFINITY
    : Date.now() - mockTimestamp;

  let status: TripoTaskStatus = "queued";
  let modelUrl: string | null = null;
  let progress = 0;

  if (ageMs >= 12_000) {
    status = "success";
    progress = 100;
    modelUrl = `https://example.com/mock/tripo/${taskId}.glb`;
  } else if (ageMs >= 4_000) {
    status = "running";
    progress = 62;
  }

  return {
    taskId,
    status,
    mock: true,
    modelUrl,
    raw: {
      code: 0,
      data: {
        task_id: taskId,
        type: "text_to_model",
        status,
        output: modelUrl
          ? {
              model: modelUrl,
              glb_url: modelUrl,
            }
          : {},
        progress,
        mock: true,
      },
    },
  };
}

async function parseResponseBody(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { rawText: text };
  }
}

async function requestTripo(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${getApiKey()}`);

  const response = await fetch(`${TRIPO_API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = await parseResponseBody(response);
  const responseCode = getNumberValue(asObject(payload).code);

  if (!response.ok || (responseCode !== null && responseCode !== 0)) {
    const apiMessage = getErrorMessage(payload);
    const fallbackMessage = response.ok
      ? "Tripo API returned an unexpected error."
      : `Tripo API request failed with status ${response.status}.`;

    throw new Error(apiMessage ?? fallbackMessage);
  }

  return payload;
}

export function extractModelUrl(raw: unknown) {
  for (const path of MODEL_URL_PATHS) {
    const candidate = getStringValue(getNestedValue(raw, path));

    if (candidate && isLikelyModelUrl(candidate)) {
      return candidate;
    }
  }

  const output = getNestedValue(raw, ["output"]) ?? getNestedValue(raw, ["data", "output"]);
  const deepMatch = findStringDeep(output, [
    "model",
    "pbr_model",
    "model_url",
    "glb",
    "glb_url",
    "modelUrl",
    "outputUrl",
  ]);

  return deepMatch ?? null;
}

export async function createTripoTask(
  prompt: string,
): Promise<TripoCreateTaskResponse> {
  if (shouldUseMockTripo()) {
    const taskId = `mock-${Date.now()}`;

    return {
      taskId,
      status: "queued",
      mock: true,
      message:
        "Using mock Tripo task because USE_MOCK_TRIPO is enabled or TRIPO_API_KEY is missing.",
      raw: {
        code: 0,
        data: {
          task_id: taskId,
          status: "queued",
          type: "text_to_model",
          prompt,
          mock: true,
        },
      },
    };
  }

  const payload = await requestTripo("/task", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "text_to_model",
      prompt,
    }),
  });

  const status = normalizeStatus(payload);

  return {
    taskId: getTaskId(payload),
    status: status === "unknown" ? "queued" : status,
    mock: false,
    message: "Tripo task created successfully.",
    raw: asObject(payload),
  };
}

export async function getTripoTask(
  taskId: string,
): Promise<TripoTaskStatusResponse> {
  if (shouldUseMockTripo() || taskId.startsWith("mock-")) {
    return buildMockTaskStatus(taskId);
  }

  const payload = await requestTripo(`/task/${encodeURIComponent(taskId)}`, {
    method: "GET",
  });
  const taskData = extractApiResponseData(payload);

  return {
    taskId: getTaskId(payload) ?? taskId,
    status: normalizeStatus(payload),
    mock: false,
    modelUrl: extractModelUrl(payload),
    raw: taskData,
  };
}

export { TRIPO_PROMPT_PRESETS, TRIPO_TASK_ENDPOINT };
