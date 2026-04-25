import type {
  Action,
  DemoCount,
  DemoSource,
  Episode,
  EpisodeMeasures,
  Policy,
  StepRecord,
  TrainingUpdate,
} from "@/features/shared/types"

export type DemoSample = {
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

export type CandidateEval = {
  score: number
  avgReturn: number
  successRate: number
  scoreBreakdown: EpisodeMeasures
}

export type CEMUpdate = TrainingUpdate & {
  meanPolicy: Policy
  bestPolicy: Policy
}
