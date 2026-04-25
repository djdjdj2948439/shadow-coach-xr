import type { Action, DemoSource, Episode, Policy, StepRecord, TaskSpec } from "@/features/shared/types"
import { clamp } from "@/features/shared/utils"
import { buildFeatures, forwardKin, initSim, stepSim, type SimState } from "../simulator"
import { ACTION_DIM, FEATURE_DIM, MIN_BOOTSTRAP_DEMOS, type JointKey } from "./config"
import {
  angleDelta,
  dot3,
  norm3,
  normalizeFeatures,
  ridgeRegression,
  scale3,
  sub3,
} from "./math"
import { computeMeasures } from "./measures"
import { actionToRaw, clonePolicy, normalizePolicyShape } from "./policy-core"
import type { DemoDataset, DemoSample } from "./types"

export function buildDemoDataset(
  episodes: Episode[],
  tasks: TaskSpec[],
  opts: { minSuccessfulDemos?: number; synthesizeMissing?: boolean } = {},
): DemoDataset {
  const minSuccessfulDemos = opts.minSuccessfulDemos ?? MIN_BOOTSTRAP_DEMOS
  const synthesizeMissing = opts.synthesizeMissing ?? true
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const selected: Episode[] = []

  for (const ep of episodes) {
    if (!ep.success || !ep.steps?.length || !taskMap.has(ep.taskId)) continue
    const source = inferDemoSource(ep)
    if (source !== "human") continue
    const task = taskMap.get(ep.taskId)!
    selected.push({
      ...ep,
      demoSource: "human",
      measures: ep.measures ?? computeMeasures(ep, { task }),
    })
  }

  if (synthesizeMissing) {
    let syntheticSeed = 200
    for (const task of tasks) {
      const hasTaskDemo = selected.some((ep) => ep.taskId === task.id)
      if (hasTaskDemo && selected.length >= minSuccessfulDemos) continue
      const synthetic = rolloutExpertDemo(task, syntheticSeed++)
      selected.push(synthetic)
    }
  }

  const samples: DemoSample[] = []
  const referencesByTask = new Map<string, StepRecord[][]>()
  for (const ep of selected) {
    const task = taskMap.get(ep.taskId)
    if (!task) continue
    const refs = referencesByTask.get(ep.taskId) ?? []
    refs.push(ep.steps)
    referencesByTask.set(ep.taskId, refs)
    samples.push(...extractDemoSamples(ep, task, inferDemoSource(ep)))
  }

  const human = selected.filter((ep) => inferDemoSource(ep) === "human").length
  const synthetic = selected.filter((ep) => inferDemoSource(ep) === "synthetic").length
  return {
    episodes: selected,
    samples,
    referencesByTask,
    count: { human, synthetic, total: selected.length },
  }
}

export function initializePolicyFromDemos(base: Policy, dataset: DemoDataset): Policy {
  const initialized = clonePolicy(base)
  if (dataset.samples.length < Math.max(12, FEATURE_DIM)) {
    return normalizePolicyShape(initialized)
  }

  const fittedW = Array.from({ length: ACTION_DIM }, () => new Array(FEATURE_DIM).fill(0))
  const fittedB = new Array(ACTION_DIM).fill(0)

  for (let actionIndex = 0; actionIndex < ACTION_DIM; actionIndex++) {
    const y = dataset.samples.map((sample) => actionToRaw(sample.action, actionIndex))
    fittedW[actionIndex] = ridgeRegression(
      dataset.samples.map((sample) => sample.features),
      y,
      0.08,
    )
  }

  initialized.W = fittedW
  initialized.b = fittedB
  initialized.updatedAt = Date.now()
  return initialized
}

function rolloutExpertDemo(task: TaskSpec, seed: number): Episode {
  let s = initSim(task, seed)
  const steps: StepRecord[] = []
  while (!s.done) {
    const action = expertAction(s)
    const r = stepSim(s, action)
    s = r.state
    steps.push(r.record)
  }
  const ep: Episode = {
    id: `synthetic_${task.id}_${seed}`,
    taskId: task.id,
    taskName: task.name,
    mode: "learn",
    steps,
    totalReward: s.totalReward,
    success: s.success,
    durationSteps: s.step,
    energyUsed: s.agent.energyUsed,
    createdAt: Date.now(),
    demoSource: "synthetic",
  }
  ep.measures = computeMeasures(ep, { task })
  return ep
}

function expertAction(s: SimState): Action {
  const holding = s.agent.holding === s.task.target.id
  const target = holding ? s.task.target.goal : s.targetPos
  const ee = s.agent.endEffector
  const error = sub3(target, ee)
  const dist = norm3(error)
  const joints = s.agent.joints
  const eps = 0.015
  const gain = 2.8
  const action: Record<JointKey, number> = { base: 0, shoulder: 0, elbow: 0, wrist: 0 }
  const jointKeys: JointKey[] = ["base", "shoulder", "elbow", "wrist"]

  for (const key of jointKeys) {
    const perturbed = { ...joints, [key]: joints[key] + eps }
    const moved = forwardKin(perturbed)
    const derivative = scale3(sub3(moved, ee), 1 / eps)
    action[key] = dot3(error, derivative) * gain
  }

  const desiredBase = Math.atan2(target[2], target[0])
  action.base += angleDelta(desiredBase, joints.base) * 0.8

  const grip = holding
    ? dist <= s.task.toleranceM * 1.1
      ? 0
      : 1
    : dist <= s.task.target.radius + 0.18
      ? 1
      : 0

  return {
    base: clamp(action.base, -1, 1),
    shoulder: clamp(action.shoulder, -1, 1),
    elbow: clamp(action.elbow, -1, 1),
    wrist: clamp(action.wrist, -1, 1),
    grip,
    thrust: holding ? clamp(dist * 0.2, 0, 0.4) : 0,
  }
}

function extractDemoSamples(ep: Episode, task: TaskSpec, source: DemoSource): DemoSample[] {
  const samples: DemoSample[] = []
  let s = initSim(task, 1)
  for (const step of ep.steps) {
    samples.push({
      taskId: task.id,
      source,
      features: normalizeFeatures(buildFeatures(s)),
      action: step.action,
    })
    const r = stepSim(s, step.action)
    s = r.state
    if (s.done) break
  }
  return samples
}

function inferDemoSource(ep: Episode): DemoSource {
  if (ep.demoSource) return ep.demoSource
  return ep.mode === "manual" ? "human" : "policy"
}
