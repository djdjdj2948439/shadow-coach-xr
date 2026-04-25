import type {
  Action,
  DemoCount,
  EpisodeMeasures,
  Policy,
  TrainingConfig,
  TrainingCurvePoint,
  Vec3,
} from "@/features/shared/types"
import { clamp, shortId } from "@/features/shared/utils"
import { forwardKin } from "../simulator"
import { ACTION_DIM, FEATURE_DIM, type JointKey } from "./config"
import { actionToRawValue, angleDelta, dot3, normalizeFeatures, scale3, sub3 } from "./math"

export function emptyPolicy(name = "policy-" + shortId()): Policy {
  const W = Array.from({ length: ACTION_DIM }, () => new Array(FEATURE_DIM).fill(0))

  // Motion follows the active waypoint: target object before grasp, goal slot while holding.
  W[0][0] = 0.25
  W[0][2] = 0.55
  W[1][1] = 0.55
  W[1][13] = -0.15
  W[2][3] = -0.25
  W[2][14] = 0.12
  W[3][1] = -0.25
  W[3][15] = -0.15

  // Grip closes near an unheld object and stays closed while carried away from goal.
  W[4][10] = 5.0
  W[4][11] = 4.0
  W[5][4] = 0.2

  const b = [0, 0, 0, 0, -2.0, 0]
  return {
    id: shortId(),
    name,
    W,
    b,
    iterations: 0,
    bestReturn: -Infinity,
    avgReturn: 0,
    taskFamily: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function policyAct(p: Policy, features: number[]): Action {
  const out = new Array(ACTION_DIM).fill(0)
  for (let i = 0; i < ACTION_DIM; i++) {
    let s = p.b[i] ?? 0
    const row = p.W[i] ?? []
    for (let j = 0; j < Math.min(FEATURE_DIM, features.length); j++) {
      s += (row[j] ?? 0) * features[j]
    }
    out[i] = Math.tanh(s)
  }
  const linear: Action = {
    base: out[0],
    shoulder: out[1],
    elbow: out[2],
    wrist: out[3],
    grip: (out[4] + 1) / 2,
    thrust: out[5],
  }
  const prior = priorActionFromFeatures(features)
  const priorWeight = p.trainingConfig ? 0.72 : 0.62
  const residualWeight = 1 - priorWeight
  return {
    base: clamp(prior.base * priorWeight + linear.base * residualWeight, -1, 1),
    shoulder: clamp(prior.shoulder * priorWeight + linear.shoulder * residualWeight, -1, 1),
    elbow: clamp(prior.elbow * priorWeight + linear.elbow * residualWeight, -1, 1),
    wrist: clamp(prior.wrist * priorWeight + linear.wrist * residualWeight, -1, 1),
    grip: prior.grip,
    thrust: clamp(prior.thrust * priorWeight + linear.thrust * residualWeight, -1, 1),
  }
}

function priorActionFromFeatures(features: number[]): Action {
  const f = normalizeFeatures(features)
  const error: Vec3 = [f[0], f[1], f[2]]
  const dist = Math.max(0, f[3])
  const holding = f[4] > 0.5
  const acquireConfidence = f[11]
  const joints = { base: f[12], shoulder: f[13], elbow: f[14], wrist: f[15] }
  const ee = forwardKin(joints)
  const target: Vec3 = [ee[0] + error[0], ee[1] + error[1], ee[2] + error[2]]
  const eps = 0.015
  const gain = 3.0
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

  const grip = holding ? (dist <= 0.1 ? 0 : 1) : acquireConfidence > 0.35 ? 1 : 0
  return {
    base: clamp(action.base, -1, 1),
    shoulder: clamp(action.shoulder, -1, 1),
    elbow: clamp(action.elbow, -1, 1),
    wrist: clamp(action.wrist, -1, 1),
    grip,
    thrust: holding ? clamp(dist * 0.2, 0, 0.4) : 0,
  }
}

export function clonePolicy(p: Policy): Policy {
  return {
    ...p,
    W: p.W.map((r) => [...r]),
    b: [...p.b],
    learningCurve: p.learningCurve ? p.learningCurve.map((point) => ({ ...point })) : undefined,
    scoreBreakdown: p.scoreBreakdown ? { ...p.scoreBreakdown } : undefined,
    trainingConfig: p.trainingConfig
      ? {
          ...p.trainingConfig,
          demoCount: p.trainingConfig.demoCount ? { ...p.trainingConfig.demoCount } : undefined,
        }
      : undefined,
  }
}

export function actionToRaw(action: Action, index: number) {
  return actionToRawValue(action, index)
}

export function stampPolicy(
  policy: Policy,
  base: Policy,
  stats: {
    iterations: number
    avgReturn: number
    bestReturn: number
    scoreBreakdown: EpisodeMeasures
    learningCurve: TrainingCurvePoint[]
    config: TrainingConfig
    demoCount: DemoCount
  },
): Policy {
  const stamped = normalizePolicyShape(clonePolicy(policy))
  stamped.id = base.id
  stamped.name = base.name
  stamped.createdAt = base.createdAt
  stamped.iterations = (base.iterations ?? 0) + stats.iterations
  stamped.avgReturn = stats.avgReturn
  stamped.bestReturn = stats.bestReturn
  stamped.updatedAt = Date.now()
  stamped.scoreBreakdown = { ...stats.scoreBreakdown }
  stamped.learningCurve = stats.learningCurve.map((point) => ({ ...point }))
  stamped.trainingConfig = { ...stats.config, demoCount: { ...stats.demoCount } }
  return stamped
}

export function normalizePolicyShape(policy: Policy): Policy {
  policy.W = Array.from({ length: ACTION_DIM }, (_, i) => normalizeFeatures(policy.W[i] ?? []))
  policy.b = Array.from({ length: ACTION_DIM }, (_, i) => policy.b[i] ?? 0)
  return policy
}

export function flattenPolicy(p: Policy): number[] {
  const out: number[] = []
  for (let i = 0; i < ACTION_DIM; i++) {
    const row = p.W[i] ?? []
    for (let j = 0; j < FEATURE_DIM; j++) out.push(row[j] ?? 0)
  }
  for (let i = 0; i < ACTION_DIM; i++) out.push(p.b[i] ?? 0)
  return out
}

export function unflattenPolicy(flat: number[], base: Policy): Policy {
  const W: number[][] = []
  let k = 0
  for (let i = 0; i < ACTION_DIM; i++) {
    const row: number[] = []
    for (let j = 0; j < FEATURE_DIM; j++) row.push(flat[k++] ?? 0)
    W.push(row)
  }
  const b: number[] = []
  for (let i = 0; i < ACTION_DIM; i++) b.push(flat[k++] ?? 0)
  return {
    ...base,
    W,
    b,
    updatedAt: Date.now(),
  }
}
