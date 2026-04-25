import { NextResponse } from "next/server"
import { store } from "@/features/shared/server-store"
import { computeMeasures } from "@/features/agent/policy"
import type { EpisodeMeasures } from "@/features/shared/types"

export async function GET() {
  const s = store()
  const eps = Array.from(s.episodes.values()).sort((a, b) => a.createdAt - b.createdAt)
  const measured = eps.map((episode) => {
    const task = s.tasks.get(episode.taskId)
    return {
      episode,
      measures: episode.measures ?? computeMeasures(episode, { task }),
    }
  })
  const total = eps.length
  const success = eps.filter((e) => e.success).length
  const avgReturn = total ? eps.reduce((a, b) => a + b.totalReward, 0) / total : 0
  const avgEnergy = total ? eps.reduce((a, b) => a + b.energyUsed, 0) / total : 0
  const avgScore = average(measured.map((row) => row.measures.score))
  const avgDemoSimilarity = average(measured.map((row) => row.measures.demoSimilarity))
  const avgPathEfficiency = average(measured.map((row) => row.measures.pathEfficiency))
  const avgSafetyScore = average(measured.map((row) => row.measures.safetyScore))
  const last20 = eps.slice(-20)
  const last20Success = last20.length ? last20.filter((e) => e.success).length / last20.length : 0

  const byMode: Record<string, { total: number; success: number; avgReturn: number; avgScore: number }> = {}
  for (const { episode: e, measures } of measured) {
    const m = (byMode[e.mode] ||= { total: 0, success: 0, avgReturn: 0, avgScore: 0 })
    m.total += 1
    if (e.success) m.success += 1
    m.avgReturn += e.totalReward
    m.avgScore += measures.score
  }
  for (const k of Object.keys(byMode)) {
    byMode[k].avgReturn = byMode[k].avgReturn / Math.max(1, byMode[k].total)
    byMode[k].avgScore = byMode[k].avgScore / Math.max(1, byMode[k].total)
  }

  const byTask: Record<string, { name: string; total: number; success: number; difficulty: number; avgScore: number }> = {}
  for (const { episode: e, measures } of measured) {
    const t = s.tasks.get(e.taskId)
    const row = (byTask[e.taskId] ||= {
      name: e.taskName,
      total: 0,
      success: 0,
      difficulty: t?.difficulty ?? 0,
      avgScore: 0,
    })
    row.total += 1
    if (e.success) row.success += 1
    row.avgScore += measures.score
  }
  for (const k of Object.keys(byTask)) {
    byTask[k].avgScore = byTask[k].avgScore / Math.max(1, byTask[k].total)
  }

  const series = measured.map(({ episode: e, measures }, i) => {
    const window = eps.slice(Math.max(0, i - 9), i + 1)
    const succ = window.filter((x) => x.success).length / Math.max(1, window.length)
    return {
      i: i + 1,
      reward: e.totalReward,
      score: measures.score,
      successRate: succ,
      energy: e.energyUsed,
      demoSimilarity: measures.demoSimilarity,
      pathEfficiency: measures.pathEfficiency,
    }
  })

  const latestPolicy = Array.from(s.policies.values()).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const latestScoreBreakdown: EpisodeMeasures | null = latestPolicy?.scoreBreakdown ?? null

  return NextResponse.json({
    total,
    success,
    successRate: total ? success / total : 0,
    avgReturn,
    avgEnergy,
    avgScore,
    avgDemoSimilarity,
    avgPathEfficiency,
    avgSafetyScore,
    last20Success,
    byMode,
    byTask,
    series,
    latestLearningCurve: latestPolicy?.learningCurve ?? [],
    latestScoreBreakdown,
    taskCount: s.tasks.size,
    policyCount: s.policies.size,
    assetCount: s.assets.size,
  })
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}
