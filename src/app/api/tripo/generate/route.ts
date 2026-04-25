import { NextResponse } from "next/server";

import { createTripoTask } from "@/lib/tripo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const prompt =
    typeof body === "object" && body !== null
      ? (body as { prompt?: unknown })
      : null;
  const promptValue =
    prompt && typeof prompt.prompt === "string"
      ? prompt.prompt.trim()
      : null;

  if (!promptValue) {
    return NextResponse.json(
      {
        ok: false,
        error: "Prompt must be a non-empty string.",
      },
      { status: 400 },
    );
  }

  if (promptValue.length > 800) {
    return NextResponse.json(
      {
        ok: false,
        error: "Prompt must be 800 characters or fewer.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await createTripoTask(promptValue);

    return NextResponse.json({
      ok: true,
      mock: result.mock,
      taskId: result.taskId,
      status: result.status,
      prompt: promptValue,
      message: result.message,
      raw: result.raw,
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
