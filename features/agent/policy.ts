import type {
  Action,
  DemoCount,
  DemoSource,
  Episode,
  EpisodeMeasures,
  Policy,
  StepRecord,
  TaskSpec,
  TrainingConfig,
  TrainingCurvePoint,
  TrainingUpdate,
  Vec3,
} from "@/features/shared/types"
import { buildFeatures, forwardKin, initSim, stepSim, type SimState } from "./simulator"
import { clamp, shortId } from "@/features/shared/utils"

const ACTION_DIM = 6
const FEATURE_DIM = 16
const MIN_BOOTSTRAP_DEMOS = 2

const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  iterations: 16,
  populationSize: 24,
  eliteRatio: 0.25,
  trialsPerTask: 3,
  initialSigma: 0.35,
  sigmaDecay: 0.9,
  seed: 7,
}

type JointKey = "base" | "shoulder" | "elbow" | "wrist"

type DemoSample = {
  taskId: string
  source: DemoSource
  features: number[]
  action: Action
}

export type DemoDataset = {
  episodes: Episode[]
  samples: DemoSample[]
  referencesByTask: Map<string, StepRecord[][]>
  count: DemoCount
}

type CandidateEval = {
  score: number
  avgReturn: number
  successRate: number
  scoreBreakdown: EpisodeMeasures
}

export type CEMUpdate = TrainingUpdate & {
  meanPolicy: Policy
  bestPolicy: Policy
}

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
    fittedW[actionIndex] = ridgeRegression(dataset.samples.map((sample) => sample.features), y, 0.08)
  }

  initialized.W = fittedW
  initialized.b = fittedB
  initialized.updatedAt = Date.now()
  return initialized
}

export function* trainCEM(
  base: Policy,
  tasks: TaskSpec[],
  opts: Partial<TrainingConfig> & {
    demoEpisodes?: Episode[]
    demoDataset?: DemoDataset
  } = {},
): Generator<CEMUpdate> {
  const config = normalizeTrainingConfig(opts)
  const dataset = opts.demoDataset ?? buildDemoDataset(opts.demoEpisodes ?? [], tasks)
  const initialized = initializePolicyFromDemos(base, dataset)
  const flatLen = ACTION_DIM * FEATURE_DIM + ACTION_DIM
  const rng = createRng(config.seed)
  let mean = flattenPolicy(initialized)
  let std = new Array(flatLen).fill(config.initialSigma)
  let bestPolicy = clonePolicy(initialized)
  let bestEval = evaluatePolicyCandidate(bestPolicy, tasks, dataset, config.trialsPerTask, config.seed)
  const eliteCount = Math.max(2, Math.floor(config.populationSize * config.eliteRatio))
  const learningCurve: TrainingCurvePoint[] = []

  for (let iter = 0; iter < config.iterations; iter++) {
    const pop: { params: number[]; eval: CandidateEval }[] = []
    for (let i = 0; i < config.populationSize; i++) {
      const params = i === 0 ? [...mean] : mean.map((m, d) => m + gaussian(rng) * std[d])
      const policy = unflattenPolicy(params, initialized)
      const evalResult = evaluatePolicyCandidate(
        policy,
        tasks,
        dataset,
        config.trialsPerTask,
        config.seed + iter * 10_000 + i * 137,
      )
      pop.push({ params, eval: evalResult })
      if (evalResult.score > bestEval.score) {
        bestEval = evalResult
        bestPolicy = policy
      }
    }

    pop.sort((a, b) => b.eval.score - a.eval.score)
    const elite = pop.slice(0, eliteCount)

    for (let d = 0; d < flatLen; d++) {
      const avg = elite.reduce((sum, item) => sum + item.params[d], 0) / elite.length
      const variance = elite.reduce((sum, item) => sum + (item.params[d] - avg) ** 2, 0) / elite.length
      mean[d] = avg
      std[d] = clamp(Math.sqrt(variance) * config.sigmaDecay, 0.015, config.initialSigma)
    }

    const eliteEval = averageCandidateEval(elite.map((item) => item.eval))
    const curvePoint: TrainingCurvePoint = {
      iter: iter + 1,
      eliteAvg: eliteEval.score,
      best: bestEval.score,
      successRate: eliteEval.successRate,
      demoSimilarity: eliteEval.scoreBreakdown.demoSimilarity,
      score: bestEval.score,
    }
    learningCurve.push(curvePoint)

    const meanPolicy = stampPolicy(unflattenPolicy(mean, initialized), base, {
      iterations: iter + 1,
      avgReturn: eliteEval.score,
      bestReturn: bestEval.score,
      scoreBreakdown: eliteEval.scoreBreakdown,
      learningCurve,
      config,
      demoCount: dataset.count,
    })
    const stampedBest = stampPolicy(bestPolicy, base, {
      iterations: iter + 1,
      avgReturn: eliteEval.score,
      bestReturn: bestEval.score,
      scoreBreakdown: bestEval.scoreBreakdown,
      learningCurve,
      config,
      demoCount: dataset.count,
    })

    yield {
      ...curvePoint,
      total: config.iterations,
      scoreBreakdown: eliteEval.scoreBreakdown,
      demoCount: dataset.count,
      learningCurve: [...learningCurve],
      meanPolicy,
      bestPolicy: stampedBest,
    }
  }
}

export function clonePolicy(p: Policy): Policy {
  return {
    ...p,
    W: p.W.map((r) => [...r]),
    b: [...p.b],
    learningCurve: p.learningCurve ? p.learningCurve.map((point) => ({ ...point })) : undefined,
    scoreBreakdown: p.scoreBreakdown ? { ...p.scoreBreakdown } : undefined,
    trainingConfig: p.trainingConfig ? { ...p.trainingConfig, demoCount: p.trainingConfig.demoCount ? { ...p.trainingConfig.demoCount } : undefined } : undefined,
  }
}

export function evaluateOnTaskFamily(
  policy: Policy,
  tasks: TaskSpec[],
  trialsPerTask = 2,
  demoDataset?: DemoDataset,
): {
  perTask: {
    taskId: string
    avgReturn: number
    avgScore: number
    successRate: number
    scoreBreakdown: EpisodeMeasures
  }[]
  generalization: number
  generalizationScore: number
  scoreBreakdown: EpisodeMeasures
} {
  const dataset = demoDataset ?? buildDemoDataset([], tasks, { minSuccessfulDemos: 0, synthesizeMissing: false })
  const perTask: {
    taskId: string
    avgReturn: number
    avgScore: number
    successRate: number
    scoreBreakdown: EpisodeMeasures
  }[] = []
  const allBreakdowns: EpisodeMeasures[] = []
  let avgSucc = 0
  let avgScore = 0

  for (const task of tasks) {
    const result = evaluatePolicyCandidate(policy, [task], dataset, trialsPerTask, 50_000 + perTask.length * 1000)
    perTask.push({
      taskId: task.id,
      avgReturn: result.avgReturn,
      avgScore: result.score,
      successRate: result.successRate,
      scoreBreakdown: result.scoreBreakdown,
    })
    allBreakdowns.push(result.scoreBreakdown)
    avgSucc += result.successRate
    avgScore += result.score
  }

  return {
    perTask,
    generalization: avgSucc / Math.max(1, tasks.length),
    generalizationScore: avgScore / Math.max(1, tasks.length),
    scoreBreakdown: averageMeasures(allBreakdowns),
  }
}

function evaluatePolicyCandidate(
  policy: Policy,
  tasks: TaskSpec[],
  dataset: DemoDataset,
  trialsPerTask: number,
  seedBase: number,
): CandidateEval {
  const measures: EpisodeMeasures[] = []
  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
    const task = tasks[taskIndex]
    const refs = dataset.referencesByTask.get(task.id) ?? []
    for (let trial = 0; trial < trialsPerTask; trial++) {
      const seed = seedBase + taskIndex * 1009 + trial * 97
      measures.push(rolloutPolicyEpisode(policy, task, seed, 0, refs).measures)
    }
  }
  const scoreBreakdown = averageMeasures(measures)
  return {
    score: scoreBreakdown.score,
    avgReturn: scoreBreakdown.totalReward,
    successRate: scoreBreakdown.successRate,
    scoreBreakdown,
  }
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

function normalizeFeatures(features: number[]): number[] {
  const out = new Array(FEATURE_DIM).fill(0)
  for (let i = 0; i < FEATURE_DIM; i++) out[i] = features[i] ?? 0
  return out
}

function inferDemoSource(ep: Episode): DemoSource {
  if (ep.demoSource) return ep.demoSource
  return ep.mode === "manual" ? "human" : "policy"
}

function averageCandidateEval(evals: CandidateEval[]): CandidateEval {
  const scoreBreakdown = averageMeasures(evals.map((item) => item.scoreBreakdown))
  return {
    score: evals.reduce((sum, item) => sum + item.score, 0) / Math.max(1, evals.length),
    avgReturn: evals.reduce((sum, item) => sum + item.avgReturn, 0) / Math.max(1, evals.length),
    successRate: evals.reduce((sum, item) => sum + item.successRate, 0) / Math.max(1, evals.length),
    scoreBreakdown,
  }
}

function averageMeasures(items: EpisodeMeasures[]): EpisodeMeasures {
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

function actionToRaw(action: Action, index: number) {
  const values = [action.base, action.shoulder, action.elbow, action.wrist, action.grip * 2 - 1, action.thrust]
  return atanh(clamp(values[index] ?? 0, -0.98, 0.98))
}

function ridgeRegression(rows: number[][], y: number[], lambda: number): number[] {
  const n = FEATURE_DIM
  const a = Array.from({ length: n }, () => new Array(n).fill(0))
  const b = new Array(n).fill(0)

  for (let r = 0; r < rows.length; r++) {
    const x = normalizeFeatures(rows[r])
    for (let i = 0; i < n; i++) {
      b[i] += x[i] * y[r]
      for (let j = 0; j < n; j++) a[i][j] += x[i] * x[j]
    }
  }
  for (let i = 0; i < n; i++) a[i][i] += lambda
  return solveLinearSystem(a, b)
}

function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-9) continue
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    const div = m[col][col]
    for (let j = col; j <= n; j++) m[col][j] /= div
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col]
      for (let j = col; j <= n; j++) m[row][j] -= factor * m[col][j]
    }
  }
  return m.map((row) => (Number.isFinite(row[n]) ? row[n] : 0))
}

function stampPolicy(
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

function normalizePolicyShape(policy: Policy): Policy {
  policy.W = Array.from({ length: ACTION_DIM }, (_, i) => normalizeFeatures(policy.W[i] ?? []))
  policy.b = Array.from({ length: ACTION_DIM }, (_, i) => policy.b[i] ?? 0)
  return policy
}

function flattenPolicy(p: Policy): number[] {
  const out: number[] = []
  for (let i = 0; i < ACTION_DIM; i++) {
    const row = p.W[i] ?? []
    for (let j = 0; j < FEATURE_DIM; j++) out.push(row[j] ?? 0)
  }
  for (let i = 0; i < ACTION_DIM; i++) out.push(p.b[i] ?? 0)
  return out
}

function unflattenPolicy(flat: number[], base: Policy): Policy {
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

function normalizeTrainingConfig(opts: Partial<TrainingConfig>): TrainingConfig {
  return {
    iterations: clampInt(opts.iterations ?? DEFAULT_TRAINING_CONFIG.iterations, 1, 60),
    populationSize: clampInt(opts.populationSize ?? DEFAULT_TRAINING_CONFIG.populationSize, 4, 80),
    eliteRatio: clamp(opts.eliteRatio ?? DEFAULT_TRAINING_CONFIG.eliteRatio, 0.1, 0.6),
    trialsPerTask: clampInt(opts.trialsPerTask ?? DEFAULT_TRAINING_CONFIG.trialsPerTask, 1, 8),
    initialSigma: clamp(opts.initialSigma ?? DEFAULT_TRAINING_CONFIG.initialSigma, 0.02, 1.2),
    sigmaDecay: clamp(opts.sigmaDecay ?? DEFAULT_TRAINING_CONFIG.sigmaDecay, 0.5, 0.99),
    seed: clampInt(opts.seed ?? DEFAULT_TRAINING_CONFIG.seed, 1, 2_147_483_647),
  }
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function addActionNoise(action: Action, noise: number, rng: () => number) {
  action.base += (rng() - 0.5) * 2 * noise
  action.shoulder += (rng() - 0.5) * 2 * noise
  action.elbow += (rng() - 0.5) * 2 * noise
  action.wrist += (rng() - 0.5) * 2 * noise
  action.thrust += (rng() - 0.5) * 2 * noise
}

function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rng: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function atanh(v: number) {
  return 0.5 * Math.log((1 + v) / (1 - v))
}

function dist3(a: Vec3, b: Vec3) {
  return norm3(sub3(a, b))
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

function dot3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function norm3(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2])
}

function angleDelta(target: number, current: number) {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return delta
}
