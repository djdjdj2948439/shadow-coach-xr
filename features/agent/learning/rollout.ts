import type { Episode, EpisodeMeasures, Policy, StepRecord, TaskSpec } from "@/features/shared/types"
import { buildFeatures, initSim, stepSim } from "../simulator"
import { addActionNoise, createRng } from "./math"
import { computeMeasures } from "./measures"
import { policyAct } from "./policy-core"

export function rolloutTask(
  policy: Policy,
  task: TaskSpec,
  seed = 1,
  noise = 0,
): { totalReward: number; success: boolean; steps: number } {
  const { episode } = rolloutPolicyEpisode(policy, task, seed, noise)
  return { totalReward: episode.totalReward, success: episode.success, steps: episode.durationSteps }
}

export function rolloutPolicyEpisode(
  policy: Policy,
  task: TaskSpec,
  seed = 1,
  noise = 0,
  demoTrajectories: StepRecord[][] = [],
): { episode: Episode; measures: EpisodeMeasures } {
  let s = initSim(task, seed)
  const rng = createRng(seed + 1009)
  const steps: StepRecord[] = []

  while (!s.done) {
    const f = buildFeatures(s)
    const a = policyAct(policy, f)
    if (noise > 0) addActionNoise(a, noise, rng)
    const r = stepSim(s, a)
    s = r.state
    steps.push(r.record)
  }

  const episode: Episode = {
    id: `eval_${task.id}_${seed}`,
    taskId: task.id,
    taskName: task.name,
    mode: "auto",
    steps,
    totalReward: s.totalReward,
    success: s.success,
    durationSteps: s.step,
    energyUsed: s.agent.energyUsed,
    createdAt: Date.now(),
    policyId: policy.id,
    demoSource: "policy",
  }
  const measures = computeMeasures(episode, { task, demoTrajectories })
  episode.measures = measures
  return { episode, measures }
}
