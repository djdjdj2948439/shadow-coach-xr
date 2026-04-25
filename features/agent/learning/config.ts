import type { TrainingConfig } from "@/features/shared/types"

export const ACTION_DIM = 6
export const FEATURE_DIM = 16
export const MIN_BOOTSTRAP_DEMOS = 2

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  iterations: 16,
  populationSize: 24,
  eliteRatio: 0.25,
  trialsPerTask: 3,
  initialSigma: 0.35,
  sigmaDecay: 0.9,
  seed: 7,
}

export type JointKey = "base" | "shoulder" | "elbow" | "wrist"
