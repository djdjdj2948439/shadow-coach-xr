import { NextResponse } from "next/server";

import {
  createTripoTask,
  validateTripoReferenceImage,
} from "@/lib/tripo";
import { setCachedTask } from "@/lib/tripoCache";
import { TRIPO_MAX_PROMPT_LENGTH } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseGenerateRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const promptEntry = formData.get("prompt");
    const imageEntry = formData.get("image");
    const prompt =
      typeof promptEntry === "string" ? promptEntry.trim() : "";
    const referenceImage =
      imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;

    return {
      prompt,
      referenceImage,
    };
  }

  const body = await request.json();
  const prompt =
    typeof body === "object" && body !== null && typeof body.prompt === "string"
      ? body.prompt.trim()
      : "";

  return {
    prompt,
    referenceImage: null,
  };
}

export async function POST(request: Request) {
  let parsedRequest:
    | {
        prompt: string;
        referenceImage: File | null;
      }
    | null = null;

  try {
    parsedRequest = await parseGenerateRequest(request);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid request body. Use JSON for text-only generation or multipart/form-data for image-assisted generation.",
      },
      { status: 400 },
    );
  }

  const promptValue = parsedRequest.prompt;
  const referenceImage = parsedRequest.referenceImage;

  if (!referenceImage && !promptValue) {
    return NextResponse.json(
      {
        ok: false,
        error: "Prompt must be a non-empty string when no reference image is provided.",
      },
      { status: 400 },
    );
  }

  if (promptValue.length > TRIPO_MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        error: `Prompt must be ${TRIPO_MAX_PROMPT_LENGTH} characters or fewer.`,
      },
      { status: 400 },
    );
  }

  if (referenceImage) {
    const imageValidationError = validateTripoReferenceImage(referenceImage);

    if (imageValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: imageValidationError,
        },
        { status: 400 },
      );
    }
  }

  try {
    const result = await createTripoTask({
      prompt: promptValue,
      referenceImage,
    });
    const raw = {
      ...result.raw,
      request: {
        prompt: promptValue,
        inputMode: result.inputMode,
        referenceImage: result.referenceImage,
      },
    };

    setCachedTask(result.taskId, {
      taskId: result.taskId,
      status: result.status,
      modelUrl: null,
      raw,
      mock: result.mock,
      inputMode: result.inputMode,
      prompt: promptValue,
      referenceImage: result.referenceImage,
    });

    return NextResponse.json({
      ok: true,
      mock: result.mock,
      inputMode: result.inputMode,
      referenceImage: result.referenceImage,
      taskId: result.taskId,
      status: result.status,
      prompt: promptValue,
      message: result.message,
      raw,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to create Tripo task.",
      },
      { status: 500 },
    );
  }
}
