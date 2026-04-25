import type { Episode, EpisodeMeasures, StepRecord, TaskSpec } from "@/features/shared/types"
import { clamp } from "@/features/shared/utils"
import { dist3 } from "./math"

export function computeMeasures(
  episode: Partial<Episode> & { steps: StepRecord[]; task?: TaskSpec },
  opts: { task?: TaskSpec; demoTrajectories?: StepRecord[][] } = {},
): EpisodeMeasures {
  const task = opts.task ?? episode.task
  const steps = episode.steps ?? []
  const last = steps[steps.length - 1]
  const totalReward = episode.totalReward ?? steps.reduce((sum, step) => sum + step.reward, 0)
  const success = Boolean(episode.success)
  const durationSteps = episode.durationSteps ?? steps.length
  const energyUsed = episode.energyUsed ?? last?.agent.energyUsed ?? 0

  const finalDistance = task && last ? dist3(last.targetPos, task.target.goal) : success ? 0 : 1
  const initialDistance = task ? Math.max(0.001, dist3(task.target.initial, task.target.goal)) : 1
  const taskProgress = success ? 1 : clamp((initialDistance - finalDistance) / initialDistance, 0, 1)

  const pathLength = computeEndEffectorPathLength(steps)
  const idealPath =
    task && steps[0]
      ? dist3(steps[0].agent.endEffector, task.target.initial) + dist3(task.target.initial, task.target.goal)
      : pathLength
  const pathEfficiency = pathLength > 0 ? clamp(idealPath / pathLength, 0, 1) : success ? 1 : 0

  const unsafeActionPenalty = computeUnsafeActionPenalty(steps)
  const collisionPenalty = computeCollisionProxy(steps)
  const timeCost = task ? clamp(durationSteps / Math.max(1, task.maxSteps), 0, 1) : clamp(durationSteps / 500, 0, 1)
  const energyCost = clamp(energyUsed / Math.max(1, durationSteps * 0.05), 0, 1)
  const safetyScore = clamp(1 - collisionPenalty - unsafeActionPenalty * 0.5, 0, 1)
  const demoSimilarity = computeDemoSimilarity(steps, opts.demoTrajectories ?? [])

  const measures: EpisodeMeasures = {
    score: 0,
    successRate: success ? 1 : 0,
    taskProgress,
    pathEfficiency,
    collisionPenalty,
    timeCost,
    energyCost,
    safetyScore,
    unsafeActionPenalty,
    demoSimilarity,
    finalDistance,
    pathLength,
    durationSteps,
    totalReward,
    success,
    energyUsed,
  }
  measures.score = scoreEpisode(measures)
  return measures
}

export function scoreEpisode(measures: EpisodeMeasures): number {
  const score =
    measures.successRate * 45 +
    measures.taskProgress * 25 +
    measures.pathEfficiency * 12 +
    measures.safetyScore * 8 +
    measures.demoSimilarity * 6 -
    measures.collisionPenalty * 6 -
    measures.timeCost * 5 -
    measures.energyCost * 4 -
    measures.unsafeActionPenalty * 5
  return Number(score.toFixed(4))
}

export function averageMeasures(items: EpisodeMeasures[]): EpisodeMeasures {
  if (items.length === 0) {
    return {
      score: 0,
      successRate: 0,
      taskProgress: 0,
      pathEfficiency: 0,
      collisionPenalty: 0,
      timeCost: 0,
      energyCost: 0,
      safetyScore: 0,
      unsafeActionPenalty: 0,
      demoSimilarity: 0,
      finalDistance: 0,
      pathLength: 0,
      durationSteps: 0,
      totalReward: 0,
      success: false,
      energyUsed: 0,
    }
  }
  const avg = (pick: (m: EpisodeMeasures) => number) => items.reduce((sum, item) => sum + pick(item), 0) / items.length
  const successRate = avg((m) => m.successRate)
  const measures: EpisodeMeasures = {
    score: 0,
    successRate,
    taskProgress: avg((m) => m.taskProgress),
    pathEfficiency: avg((m) => m.pathEfficiency),
    collisionPenalty: avg((m) => m.collisionPenalty),
    timeCost: avg((m) => m.timeCost),
    energyCost: avg((m) => m.energyCost),
    safetyScore: avg((m) => m.safetyScore),
    unsafeActionPenalty: avg((m) => m.unsafeActionPenalty),
    demoSimilarity: avg((m) => m.demoSimilarity),
    finalDistance: avg((m) => m.finalDistance),
    pathLength: avg((m) => m.pathLength),
    durationSteps: avg((m) => m.durationSteps),
    totalReward: avg((m) => m.totalReward),
    success: successRate >= 0.5,
    energyUsed: avg((m) => m.energyUsed),
  }
  measures.score = scoreEpisode(measures)
  return measures
}

function computeEndEffectorPathLength(steps: StepRecord[]) {
  let total = 0
  for (let i = 1; i < steps.length; i++) {
    total += dist3(steps[i - 1].agent.endEffector, steps[i].agent.endEffector)
  }
  return total
}

function computeUnsafeActionPenalty(steps: StepRecord[]) {
  if (steps.length === 0) return 0
  let unsafe = 0
  for (const step of steps) {
    const a = step.action
    const actionLoad = Math.abs(a.base) + Math.abs(a.shoulder) + Math.abs(a.elbow) + Math.abs(a.wrist) + Math.abs(a.thrust)
    if (actionLoad > 4.2 || a.grip < 0 || a.grip > 1) unsafe++
  }
  return unsafe / steps.length
}

function computeCollisionProxy(steps: StepRecord[]) {
  if (steps.length === 0) return 0
  let risky = 0
  for (const step of steps) {
    const p = step.targetPos
    if (Math.abs(p[0]) > 5.7 || Math.abs(p[1]) > 3.7 || Math.abs(p[2]) > 5.7) risky++
  }
  return risky / steps.length
}

function computeDemoSimilarity(steps: StepRecord[], refs: StepRecord[][]) {
  if (steps.length === 0 || refs.length === 0) return 0
  let best = 0
  for (const ref of refs) {
    if (ref.length === 0) continue
    const sampleCount = Math.min(24, steps.length, ref.length)
    let total = 0
    for (let i = 0; i < sampleCount; i++) {
      const a = steps[Math.floor((i / Math.max(1, sampleCount - 1)) * (steps.length - 1))]
      const b = ref[Math.floor((i / Math.max(1, sampleCount - 1)) * (ref.length - 1))]
      total += dist3(a.agent.endEffector, b.agent.endEffector) * 0.7 + dist3(a.targetPos, b.targetPos) * 0.3
    }
    const avgDistance = total / sampleCount
    best = Math.max(best, clamp(1 - avgDistance / 3.0, 0, 1))
  }
  return best
}
