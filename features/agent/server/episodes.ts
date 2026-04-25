import { NextResponse } from "next/server"
import { store } from "@/features/shared/server-store"
import { computeMeasures } from "@/features/agent/policy"
import type { Episode } from "@/features/shared/types"

export async function GET() {
  const s = store()
  const eps = Array.from(s.episodes.values()).sort((a, b) => b.createdAt - a.createdAt)
  const summary = eps.map((e) => ({ ...e, steps: [] }))
  return NextResponse.json({ episodes: summary })
}

export async function POST(req: Request) {
  const s = store()
  const ep = (await req.json()) as Episode
  if (!ep?.id) return NextResponse.json({ error: "invalid episode" }, { status: 400 })
  const task = s.tasks.get(ep.taskId)
  const enriched: Episode = {
    ...ep,
    demoSource: ep.demoSource ?? (ep.mode === "manual" ? "human" : "policy"),
  }
  enriched.measures = ep.measures ?? computeMeasures(enriched, { task })
  s.episodes.set(enriched.id, enriched)
  return NextResponse.json({ ok: true })
}
