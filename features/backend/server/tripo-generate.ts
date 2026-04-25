import { NextResponse } from "next/server"
import { store, emitAssetEvent } from "@/features/shared/server-store"
import { createTextToModelTask, getTaskStatus, extractModelUrl, extractThumbnail, isTerminal } from "@/features/backend/tripo"
import type { AssetItem, TargetSpec } from "@/features/shared/types"
import { shortId } from "@/features/shared/utils"
import { GET as getAssets } from "./assets"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: Request) {
  const s = store()
  const body = await req.json().catch(() => ({}))
  const prompt: string = (body.prompt ?? "").trim()
  const kind: TargetSpec["kind"] = body.kind ?? "custom"
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 })

  const asset: AssetItem = {
    id: "asset_" + shortId(),
    prompt,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
    kind,
  }
  s.assets.set(asset.id, asset)

  ;(async () => {
    try {
      const taskId = await createTextToModelTask(prompt)
      asset.taskId = taskId
      asset.status = "running"
      asset.progress = 0.05
      s.assets.set(asset.id, asset)
      emitAssetEvent(asset.id, { type: "progress", assetId: asset.id, progress: 0.05, status: "running" })

      const start = Date.now()
      while (Date.now() - start < 8 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 4000))
        try {
          const data = await getTaskStatus(taskId)
          const terminal = isTerminal(data.status)
          const prog =
            typeof data.progress === "number" ? Math.max(asset.progress, data.progress / 100) : asset.progress + 0.04
          asset.progress = Math.min(0.95, prog)
          asset.status = "running"
          s.assets.set(asset.id, asset)
          emitAssetEvent(asset.id, {
            type: "progress",
            assetId: asset.id,
            progress: asset.progress,
            status: data.status,
          })

          if (terminal === "success") {
            const modelUrl = extractModelUrl(data)
            const thumbnailUrl = extractThumbnail(data)
            if (!modelUrl) throw new Error("no model URL in result")
            asset.status = "succeeded"
            asset.progress = 1
            asset.modelUrl = modelUrl
            asset.thumbnailUrl = thumbnailUrl
            s.assets.set(asset.id, asset)
            emitAssetEvent(asset.id, {
              type: "completed",
              assetId: asset.id,
              modelUrl,
              thumbnailUrl,
            })
            return
          }
          if (terminal === "failed") {
            throw new Error(data.error_msg ?? `task ${data.status}`)
          }
        } catch (innerErr: any) {
          emitAssetEvent(asset.id, {
            type: "progress",
            assetId: asset.id,
            progress: asset.progress,
            status: "polling",
          })
          // eslint-disable-next-line no-console
          console.log("[v0] tripo poll error:", innerErr?.message)
        }
      }
      throw new Error("Tripo task timed out")
    } catch (err: any) {
      asset.status = "failed"
      asset.error = err?.message ?? "generation failed"
      s.assets.set(asset.id, asset)
      emitAssetEvent(asset.id, { type: "failed", assetId: asset.id, error: asset.error })
    }
  })().catch(() => {})

  return NextResponse.json({ asset })
}

export const GET = getAssets
