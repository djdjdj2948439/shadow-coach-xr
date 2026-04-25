"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Bot,
  Copy,
  ExternalLink,
  FileImage,
  LoaderCircle,
  RefreshCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";

import { TRIPO_PROMPT_PRESETS, TRIPO_PROMPT_PRESET_ORDER } from "@/lib/tripoPresets";
import {
  isFinalTripoStatus,
  TripoCacheEntry,
  TripoInputMode,
  TripoReferenceImage,
  TripoTaskStatus,
  TRIPO_MAX_PROMPT_LENGTH,
  TRIPO_REFERENCE_IMAGE_ACCEPT,
  TRIPO_REFERENCE_IMAGE_ACCEPTED_MIME_TYPES,
  TRIPO_REFERENCE_IMAGE_MAX_BYTES,
} from "@/lib/types";

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

type GenerateApiResponse =
  | {
      ok: true;
      mock: boolean;
      inputMode: TripoInputMode;
      referenceImage: TripoReferenceImage | null;
      taskId: string;
      status: TripoTaskStatus;
      prompt: string;
      message: string;
      raw: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    };

type TaskApiResponse =
  | {
      ok: true;
      cached: boolean;
      mock: boolean;
      taskId: string;
      status: TripoTaskStatus;
      modelUrl: string | null;
      raw: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    };

type CacheApiResponse = {
  ok: true;
  count: number;
  ttlSeconds: number;
  tasks: TripoCacheEntry[];
};

type ActiveTask = {
  taskId: string;
  status: TripoTaskStatus;
  mock: boolean;
  inputMode: TripoInputMode;
  referenceImage: TripoReferenceImage | null;
  modelUrl: string | null;
  prompt: string;
  message: string;
  raw: Record<string, unknown>;
  cached: boolean;
};

function getRawNumber(raw: Record<string, unknown>, path: string[]) {
  let current: unknown = raw;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function getProgress(raw: Record<string, unknown>) {
  return (
    getRawNumber(raw, ["progress"]) ??
    getRawNumber(raw, ["data", "progress"]) ??
    getRawNumber(raw, ["result", "progress"])
  );
}

function getPromptFromRaw(raw: Record<string, unknown>) {
  const candidates = [raw.prompt, raw.input, raw.request, raw.data, raw.result];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }

    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const record = candidate as Record<string, unknown>;
      const prompt = record.prompt;

      if (typeof prompt === "string" && prompt.trim().length > 0) {
        return prompt.trim();
      }

      if (
        record.input &&
        typeof record.input === "object" &&
        !Array.isArray(record.input)
      ) {
        const nestedPrompt = (record.input as Record<string, unknown>).prompt;

        if (typeof nestedPrompt === "string" && nestedPrompt.trim().length > 0) {
          return nestedPrompt.trim();
        }
      }
    }
  }

  return "";
}

function getStatusClasses(status: TripoTaskStatus) {
  switch (status) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/12 text-emerald-200";
    case "failed":
    case "banned":
    case "expired":
    case "cancelled":
      return "border-rose-500/30 bg-rose-500/12 text-rose-200";
    case "running":
      return "border-sky-500/30 bg-sky-500/12 text-sky-200";
    default:
      return "border-amber-500/30 bg-amber-500/12 text-amber-100";
  }
}

function shortTaskId(taskId: string) {
  return taskId.length > 18
    ? `${taskId.slice(0, 8)}...${taskId.slice(-6)}`
    : taskId;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function getEntryInputMode(entry: TripoCacheEntry): TripoInputMode {
  if (entry.inputMode) {
    return entry.inputMode;
  }

  const type =
    typeof entry.raw.type === "string"
      ? entry.raw.type
      : typeof (entry.raw.data as Record<string, unknown> | undefined)?.type ===
          "string"
        ? ((entry.raw.data as Record<string, unknown>).type as string)
        : "";

  return type === "image_to_model" ? "image" : "text";
}

export default function TripoAssetGenerator() {
  const [selectedPreset, setSelectedPreset] =
    useState<(typeof TRIPO_PROMPT_PRESET_ORDER)[number]>("ISS_MODULE");
  const [prompt, setPrompt] = useState(TRIPO_PROMPT_PRESETS.ISS_MODULE.prompt);
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [referenceImagePreviewUrl, setReferenceImagePreviewUrl] = useState<
    string | null
  >(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  const [cacheEntries, setCacheEntries] = useState<TripoCacheEntry[]>([]);
  const [ttlSeconds, setTtlSeconds] = useState(3600);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollStartedAt, setPollStartedAt] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (referenceImagePreviewUrl) {
        URL.revokeObjectURL(referenceImagePreviewUrl);
      }
    };
  }, [referenceImagePreviewUrl]);

  const promptLength = prompt.length;
  const trimmedPrompt = prompt.trim();
  const hasReferenceImage = Boolean(referenceImageFile);
  const canGenerate =
    (trimmedPrompt.length > 0 || hasReferenceImage) &&
    promptLength <= TRIPO_MAX_PROMPT_LENGTH &&
    !isGenerating;
  const progress = activeTask ? getProgress(activeTask.raw) : null;

  async function refreshCache() {
    const response = await fetch("/api/tripo/cache", {
      cache: "no-store",
    });
    const payload = (await response.json()) as CacheApiResponse;

    if (payload.ok) {
      setCacheEntries(payload.tasks);
      setTtlSeconds(payload.ttlSeconds);
    }
  }

  async function refreshTask(forceRefresh = false) {
    if (!activeTask) {
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        taskId: activeTask.taskId,
      });

      if (forceRefresh) {
        params.set("refresh", "1");
      }

      const response = await fetch(`/api/tripo/task?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as TaskApiResponse;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      setActiveTask((current) =>
        current
          ? {
              ...current,
              taskId: payload.taskId,
              status: payload.status,
              modelUrl: payload.modelUrl,
              mock: payload.mock,
              raw: payload.raw,
              cached: payload.cached,
            }
          : current,
      );

      if (isFinalTripoStatus(payload.status)) {
        setIsPolling(false);
      }

      if (payload.status === "success") {
        setInfo("Generation finished. Model URL is ready for review.");
      }

      await refreshCache();
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh task status.",
      );
      setIsPolling(false);
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleGenerate() {
    if (!canGenerate) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    setInfo(null);
    setCopyState(null);

    try {
      const response = await (async () => {
        if (referenceImageFile) {
          const body = new FormData();

          if (trimmedPrompt) {
            body.append("prompt", trimmedPrompt);
          }

          body.append("image", referenceImageFile);

          return fetch("/api/tripo/generate", {
            method: "POST",
            body,
          });
        }

        return fetch("/api/tripo/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: trimmedPrompt,
          }),
        });
      })();
      const payload = (await response.json()) as GenerateApiResponse;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      setActiveTask({
        taskId: payload.taskId,
        status: payload.status,
        mock: payload.mock,
        inputMode: payload.inputMode,
        referenceImage: payload.referenceImage,
        modelUrl: null,
        prompt: payload.prompt,
        message: payload.message,
        raw: payload.raw,
        cached: false,
      });
      setPollStartedAt(Date.now());
      setIsPolling(!isFinalTripoStatus(payload.status));
      setInfo(payload.message);

      await refreshCache();
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Failed to create Tripo task.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopyModelUrl() {
    if (!activeTask?.modelUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeTask.modelUrl);
      setCopyState("Model URL copied.");
    } catch {
      setCopyState("Clipboard copy is unavailable in this browser.");
    }
  }

  function clearReferenceImage() {
    setReferenceImageFile(null);
    setReferenceImagePreviewUrl(null);
    setFileInputKey((current) => current + 1);
  }

  function handleReferenceImageChange(file: File | null) {
    if (!file) {
      return;
    }

    if (
      file.type &&
      !TRIPO_REFERENCE_IMAGE_ACCEPTED_MIME_TYPES.includes(
        file.type as (typeof TRIPO_REFERENCE_IMAGE_ACCEPTED_MIME_TYPES)[number],
      )
    ) {
      setError("Reference image must be JPEG, PNG, or WEBP.");
      return;
    }

    if (file.size > TRIPO_REFERENCE_IMAGE_MAX_BYTES) {
      setError("Reference image must be 20MB or smaller.");
      return;
    }

    setReferenceImagePreviewUrl(URL.createObjectURL(file));
    setReferenceImageFile(file);
    setError(null);
    setInfo(
      trimmedPrompt
        ? "Reference image attached. The next request will use image-to-3D with prompt guidance."
        : "Reference image attached. The next request will use image-to-3D.",
    );
  }

  const refreshCacheEffect = useEffectEvent(() => {
    void refreshCache();
  });

  const refreshTaskEffect = useEffectEvent((forceRefresh = false) => {
    void refreshTask(forceRefresh);
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      refreshCacheEffect();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!activeTask || !isPolling || isFinalTripoStatus(activeTask.status)) {
      return;
    }

    if (pollStartedAt && Date.now() - pollStartedAt >= POLL_TIMEOUT_MS) {
      const timeoutId = window.setTimeout(() => {
        setIsPolling(false);
        setInfo("Generation is still running. Please refresh status manually.");
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    const timeoutId = window.setTimeout(() => {
      refreshTaskEffect(true);
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTask, isPolling, pollStartedAt]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 shadow-[0_32px_80px_rgba(3,7,18,0.55)] sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.28em] text-sky-100">
                <Sparkles className="h-3.5 w-3.5" />
                Secure Tripo Debug Route
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Generate ISS assets from text or text + image
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                  Presets, prompt editing, optional reference image upload,
                  server-side generation, polling, and result links stay inside
                  this isolated debug page. The frontend never receives the
                  Tripo API key, and this route does not implement the main 3D
                  scene.
                </p>
              </div>
            </div>
            <div className="grid min-w-[220px] gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Server-side auth only
              </div>
              <div className="flex items-center gap-3">
                <Server className="h-4 w-4 text-sky-300" />
                Poll interval: 4 seconds
              </div>
              <div className="flex items-center gap-3">
                <Boxes className="h-4 w-4 text-amber-200" />
                Cache TTL: {ttlSeconds}s
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {TRIPO_PROMPT_PRESET_ORDER.map((presetId) => {
              const preset = TRIPO_PROMPT_PRESETS[presetId];
              const isActive = presetId === selectedPreset;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(presetId);
                    setPrompt(preset.prompt);
                    setInfo(null);
                    setError(null);
                  }}
                  className={`rounded-2xl border px-4 py-4 text-left transition duration-200 ${
                    isActive
                      ? "border-sky-400/50 bg-sky-400/12 text-white shadow-[0_12px_30px_rgba(14,165,233,0.18)]"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-sky-400/30 hover:bg-white/8"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2 text-sky-200">
                      {preset.id === "ASSISTANT_ROBOT" ? (
                        <Bot className="h-4 w-4" />
                      ) : (
                        <Boxes className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{preset.label}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {preset.prompt.slice(0, 66)}...
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.72fr)_minmax(0,1fr)]">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    Reference image
                  </div>
                  <p className="mt-1 text-xs leading-6 text-slate-400">
                    Optional. If attached, the backend uploads the image to
                    Tripo and switches generation to <code>image_to_model</code>.
                  </p>
                </div>
                {referenceImageFile ? (
                  <button
                    type="button"
                    onClick={clearReferenceImage}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-4">
                <label className="block cursor-pointer rounded-[1.25rem] border border-dashed border-sky-400/25 bg-sky-400/6 p-4 transition hover:border-sky-300/40 hover:bg-sky-400/10">
                  <input
                    key={fileInputKey}
                    type="file"
                    accept={TRIPO_REFERENCE_IMAGE_ACCEPT}
                    className="hidden"
                    onChange={(event) => {
                      handleReferenceImageChange(event.target.files?.[0] ?? null);
                    }}
                  />
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-sky-300/20 bg-sky-300/10 p-3 text-sky-100">
                      <Upload className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">
                        Upload reference image
                      </div>
                      <div className="mt-1 text-xs text-slate-300">
                        JPEG / PNG / WEBP up to 20MB
                      </div>
                    </div>
                  </div>
                </label>

                {referenceImagePreviewUrl ? (
                  <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
                    <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80">
                      <Image
                        src={referenceImagePreviewUrl}
                        alt="Selected Tripo reference"
                        width={320}
                        height={320}
                        unoptimized
                        className="h-36 w-full object-cover"
                      />
                    </div>
                    <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/80 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <FileImage className="h-4 w-4 text-sky-200" />
                        {referenceImageFile?.name}
                      </div>
                      <div className="mt-3 space-y-2 text-xs text-slate-400">
                        <div>Type: {referenceImageFile?.type || "Unknown"}</div>
                        <div>
                          Size:{" "}
                          {referenceImageFile
                            ? formatFileSize(referenceImageFile.size)
                            : "Unknown"}
                        </div>
                        <div>
                          Mode after submit:{" "}
                          <span className="text-sky-100">Text + image</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                    No reference image attached. Generate with prompt only, or
                    add an image to guide the model.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label
                  htmlFor="tripo-prompt"
                  className="text-sm font-medium text-slate-100"
                >
                  Prompt guidance
                </label>
                <div
                  className={`rounded-full px-3 py-1 text-xs ${
                    promptLength > TRIPO_MAX_PROMPT_LENGTH
                      ? "bg-rose-500/15 text-rose-200"
                      : "bg-white/8 text-slate-300"
                  }`}
                >
                  {promptLength}/{TRIPO_MAX_PROMPT_LENGTH}
                </div>
              </div>
              <textarea
                id="tripo-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={7}
                className="w-full resize-none rounded-[1.25rem] border border-white/10 bg-slate-950/80 px-4 py-4 text-sm leading-7 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/15"
                placeholder="Describe the WebXR asset you want to generate. Prompt is optional when a reference image is attached."
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={!canGenerate}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  {isGenerating ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {hasReferenceImage ? "Generate from Text + Image" : "Generate from Text"}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshTask(true)}
                  disabled={!activeTask || isRefreshing}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRefreshing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Manual Refresh
                </button>
                {isPolling ? (
                  <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                    Auto polling every 4s
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {info ? (
            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100">
              {info}
            </div>
          ) : null}

          {activeTask ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] ${getStatusClasses(
                      activeTask.status,
                    )}`}
                  >
                    {activeTask.status}
                  </span>
                  <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
                    {activeTask.inputMode === "image" ? "Text + image" : "Text only"}
                  </span>
                  {activeTask.mock ? (
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-amber-100">
                      Mock mode
                    </span>
                  ) : null}
                  {activeTask.cached ? (
                    <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs uppercase tracking-[0.22em] text-slate-300">
                      Cached response
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Task ID
                    </div>
                    <div className="mt-2 break-all font-mono text-sm text-slate-100">
                      {activeTask.taskId}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Progress
                    </div>
                    <div className="mt-2 text-sm text-slate-100">
                      {progress ?? "Pending"} {typeof progress === "number" ? "%" : ""}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Generation Mode
                    </div>
                    <div className="mt-2 text-sm text-slate-100">
                      {activeTask.inputMode === "image"
                        ? "Image-guided generation"
                        : "Prompt-only generation"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                      Reference Image
                    </div>
                    <div className="mt-2 text-sm text-slate-100">
                      {activeTask.referenceImage
                        ? `${activeTask.referenceImage.name} (${formatFileSize(
                            activeTask.referenceImage.size,
                          )})`
                        : "None"}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Prompt
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    {activeTask.prompt || "No prompt guidance was submitted."}
                  </p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-slate-900/80 p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  Result
                </div>
                {activeTask.modelUrl ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4">
                      <div className="text-sm font-medium text-emerald-100">
                        Model URL ready
                      </div>
                      <div className="mt-3 break-all text-sm text-slate-200">
                        {activeTask.modelUrl}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopyModelUrl()}
                        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10"
                      >
                        <Copy className="h-4 w-4" />
                        Copy modelUrl
                      </button>
                      <a
                        href={activeTask.modelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-200"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open in new tab
                      </a>
                    </div>
                    <p className="text-xs leading-6 text-slate-500">
                      Tripo task output URLs are temporary and may expire after a
                      few minutes.
                    </p>
                    {copyState ? (
                      <p className="text-xs text-sky-100">{copyState}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                    No model URL yet. Keep polling until the task reaches
                    success, or use manual refresh if the generation is still
                    running.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 shadow-[0_24px_64px_rgba(3,7,18,0.45)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Recent cache</h3>
              <p className="mt-1 text-sm text-slate-400">
                Debug view of in-memory Tripo tasks for this runtime instance.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshCache()}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh Cache
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {cacheEntries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                No cached tasks yet. Generate an asset to populate this panel.
              </div>
            ) : (
              cacheEntries.slice(0, 6).map((entry) => (
                <button
                  key={entry.taskId}
                  type="button"
                  onClick={() => {
                    setActiveTask({
                      taskId: entry.taskId,
                      status: entry.status,
                      mock: entry.mock,
                      inputMode: getEntryInputMode(entry),
                      referenceImage: entry.referenceImage ?? null,
                      modelUrl: entry.modelUrl,
                      prompt: entry.prompt ?? getPromptFromRaw(entry.raw),
                      message: "Loaded from cache.",
                      raw: entry.raw,
                      cached: true,
                    });
                    setPollStartedAt(Date.now());
                    setIsPolling(!isFinalTripoStatus(entry.status));
                    setInfo("Loaded a cached task.");
                    setError(null);
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-sky-400/30 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">
                        {shortTaskId(entry.taskId)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span>
                          {entry.modelUrl ? "Model URL cached" : "Waiting for model URL"}
                        </span>
                        <span>•</span>
                        <span>
                          {getEntryInputMode(entry) === "image"
                            ? "Text + image"
                            : "Text only"}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getStatusClasses(
                        entry.status,
                      )}`}
                    >
                      {entry.status}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-slate-950/90 p-6 shadow-[0_24px_64px_rgba(3,7,18,0.45)]">
          <h3 className="text-lg font-semibold text-white">Viewer status</h3>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            This debug page now supports both text-only and image-assisted
            Tripo generation. No existing GLB viewer or XR scene loader was
            found in this repo, so the current integration still stops at
            stable <code>modelUrl</code> output for downstream Member B scene
            loading.
          </p>
        </section>
      </aside>
    </div>
  );
}
