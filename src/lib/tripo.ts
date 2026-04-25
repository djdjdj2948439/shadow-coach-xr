import {
  TripoCreateTaskResponse,
  TripoPromptPreset,
  TripoTaskStatusResponse,
} from "@/lib/types";

const TRIPO_API_BASE_URL = "https://api.tripo3d.ai/v2/openapi";
const MOCK_TASK_STATUS = "mock_succeeded";

export const TRIPO_PROMPT_PRESETS: Record<string, TripoPromptPreset> = {
  ISS_MODULE: {
    id: "ISS_MODULE",
    prompt:
      "A realistic International Space Station module interior with white curved walls, handrails, control panels, cable details, storage bags, soft lighting, optimized as a low-poly GLB asset for WebXR.",
  },
  ISS_TOOL_KIT: {
    id: "ISS_TOOL_KIT",
    prompt:
      "A compact astronaut tool kit floating in zero gravity, including wrench, screwdriver, tether hooks and small labeled equipment, clean sci-fi style, low-poly game-ready 3D model.",
  },
  ISS_CONTROL_PANEL: {
    id: "ISS_CONTROL_PANEL",
    prompt:
      "A futuristic ISS control panel with screens, switches, warning labels, cables and modular surface details, low-poly 3D asset for a browser-based WebXR scene.",
  },
  ISS_STORAGE_BAG: {
    id: "ISS_STORAGE_BAG",
    prompt:
      "A soft white fabric storage bag used inside a space station, with straps, zippers, label patches and velcro texture, low-poly 3D model.",
  },
  ASSISTANT_ROBOT: {
    id: "ASSISTANT_ROBOT",
    prompt:
      "A small friendly assistant robot designed for an ISS training module, white shell, blue sensor eye, compact body, floating in microgravity, low-poly game-ready 3D model.",
  },
};

function asObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return { items: value };
  }

  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return { value: value ?? null };
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
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
    asObject(raw.data).message,
    asObject(raw.data).error,
  ];

  for (const candidate of candidates) {
    const message = getStringValue(candidate);

    if (message) {
      return message;
    }
  }

  return null;
}

function findNestedString(
  input: unknown,
  preferredKeys: string[],
  visited = new WeakSet<object>(),
): string | null {
  if (typeof input === "string") {
    const value = input.trim();
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }

    return value.endsWith(".glb") ? value : null;
  }

  if (!input || typeof input !== "object") {
    return null;
  }

  if (visited.has(input)) {
    return null;
  }

  visited.add(input);

  if (Array.isArray(input)) {
    for (const entry of input) {
      const match = findNestedString(entry, preferredKeys, visited);
      if (match) {
        return match;
      }
    }

    return null;
  }

  const record = input as Record<string, unknown>;

  for (const key of preferredKeys) {
    if (!(key in record)) {
      continue;
    }

    const match = findNestedString(record[key], preferredKeys, visited);
    if (match) {
      return match;
    }
  }

  for (const value of Object.values(record)) {
    const match = findNestedString(value, preferredKeys, visited);
    if (match) {
      return match;
    }
  }

  return null;
}

function findPreferredStringValue(
  input: unknown,
  preferredKeys: string[],
  visited = new WeakSet<object>(),
): string | null {
  if (typeof input === "string") {
    return getStringValue(input);
  }

  if (!input || typeof input !== "object") {
    return null;
  }

  if (visited.has(input)) {
    return null;
  }

  visited.add(input);

  if (Array.isArray(input)) {
    for (const entry of input) {
      const match = findPreferredStringValue(entry, preferredKeys, visited);
      if (match) {
        return match;
      }
    }

    return null;
  }

  const record = input as Record<string, unknown>;

  for (const key of preferredKeys) {
    if (!(key in record)) {
      continue;
    }

    const directValue = getStringValue(record[key]);
    if (directValue) {
      return directValue;
    }

    const nestedMatch = findPreferredStringValue(
      record[key],
      preferredKeys,
      visited,
    );
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  for (const value of Object.values(record)) {
    const match = findPreferredStringValue(value, preferredKeys, visited);
    if (match) {
      return match;
    }
  }

  return null;
}

function findTaskId(input: unknown) {
  return (
    findPreferredStringValue(input, ["task_id", "taskId", "id"]) ??
    getStringValue(asObject(input).id) ??
    getStringValue(asObject(asObject(input).data).task_id) ??
    getStringValue(asObject(asObject(input).data).id) ??
    `mock-${Date.now()}`
  );
}

function findStatus(input: unknown) {
  return (
    getStringValue(asObject(input).status) ??
    getStringValue(asObject(input).state) ??
    getStringValue(asObject(asObject(input).data).status) ??
    getStringValue(asObject(asObject(input).data).state) ??
    "queued"
  );
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
  const apiKey = getApiKey();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);

  const response = await fetch(`${TRIPO_API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const apiMessage = getErrorMessage(payload);
    throw new Error(
      apiMessage ??
        `Tripo API request failed with status ${response.status}.`,
    );
  }

  return payload;
}

function buildMockCreateTask(prompt: string): TripoCreateTaskResponse {
  const taskId = `mock-${Date.now()}`;

  return {
    taskId,
    status: "mock_queued",
    mock: true,
    message:
      "Using mock Tripo task because USE_MOCK_TRIPO is enabled or TRIPO_API_KEY is missing.",
    raw: {
      id: taskId,
      task_id: taskId,
      status: "mock_queued",
      type: "text_to_model",
      prompt,
      mock: true,
    },
  };
}

function buildMockTaskStatus(taskId: string): TripoTaskStatusResponse {
  const modelUrl = `https://example.com/mock/tripo/${taskId}.glb`;

  return {
    taskId,
    status: MOCK_TASK_STATUS,
    mock: true,
    modelUrl,
    raw: {
      id: taskId,
      task_id: taskId,
      status: MOCK_TASK_STATUS,
      output: {
        modelUrl,
        glbUrl: modelUrl,
      },
      mock: true,
    },
  };
}

export function extractModelUrl(raw: unknown) {
  return findNestedString(raw, [
    "modelUrl",
    "model_url",
    "glbUrl",
    "glb_url",
    "outputUrl",
    "output_url",
    "url",
    "fileUrl",
    "file_url",
    "downloadUrl",
    "download_url",
    "model",
    "glb",
  ]);
}

export async function createTripoTask(
  prompt: string,
): Promise<TripoCreateTaskResponse> {
  if (shouldUseMockTripo()) {
    return buildMockCreateTask(prompt);
  }

  try {
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

    return {
      taskId: findTaskId(payload),
      status: findStatus(payload),
      mock: false,
      message: "Tripo task created successfully.",
      raw: asObject(payload),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create a Tripo task.";

    throw new Error(message);
  }
}

export async function getTripoTask(
  taskId: string,
): Promise<TripoTaskStatusResponse> {
  if (shouldUseMockTripo() || taskId.startsWith("mock-")) {
    return buildMockTaskStatus(taskId);
  }

  try {
    const payload = await requestTripo(`/task/${encodeURIComponent(taskId)}`, {
      method: "GET",
    });

    return {
      taskId: findTaskId(payload) ?? taskId,
      status: findStatus(payload),
      mock: false,
      modelUrl: extractModelUrl(payload),
      raw: asObject(payload),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Failed to get Tripo task ${taskId}.`;

    throw new Error(message);
  }
}
