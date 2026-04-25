import type {
  Episode,
  EpisodeMeasures,
  Policy,
  TaskSpec,
  TrainingConfig,
  TrainingCurvePoint,
} from "@/features/shared/types"
import { clamp } from "@/features/shared/utils"
import { ACTION_DIM, DEFAULT_TRAINING_CONFIG, FEATURE_DIM } from "./config"
import { buildDemoDataset, initializePolicyFromDemos } from "./demos"
import { clampInt, createRng, gaussian } from "./math"
import { averageMeasures } from "./measures"
import { clonePolicy, flattenPolicy, stampPolicy, unflattenPolicy } from "./policy-core"
import { rolloutPolicyEpisode } from "./rollout"
import type { CandidateEval, CEMUpdate, DemoDataset } from "./types"

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

function averageCandidateEval(evals: CandidateEval[]): CandidateEval {
  const scoreBreakdown = averageMeasures(evals.map((item) => item.scoreBreakdown))
  return {
    score: evals.reduce((sum, item) => sum + item.score, 0) / Math.max(1, evals.length),
    avgReturn: evals.reduce((sum, item) => sum + item.avgReturn, 0) / Math.max(1, evals.length),
    successRate: evals.reduce((sum, item) => sum + item.successRate, 0) / Math.max(1, evals.length),
    scoreBreakdown,
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
