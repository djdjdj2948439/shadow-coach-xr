import type { Action, Vec3 } from "@/features/shared/types"
import { clamp } from "@/features/shared/utils"
import { FEATURE_DIM } from "./config"

export function normalizeFeatures(features: number[]): number[] {
  const out = new Array(FEATURE_DIM).fill(0)
  for (let i = 0; i < FEATURE_DIM; i++) out[i] = features[i] ?? 0
  return out
}

export function ridgeRegression(rows: number[][], y: number[], lambda: number): number[] {
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

export function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function addActionNoise(action: Action, noise: number, rng: () => number) {
  action.base += (rng() - 0.5) * 2 * noise
  action.shoulder += (rng() - 0.5) * 2 * noise
  action.elbow += (rng() - 0.5) * 2 * noise
  action.wrist += (rng() - 0.5) * 2 * noise
  action.thrust += (rng() - 0.5) * 2 * noise
}

export function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gaussian(rng: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function atanh(v: number) {
  return 0.5 * Math.log((1 + v) / (1 - v))
}

export function dist3(a: Vec3, b: Vec3) {
  return norm3(sub3(a, b))
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

export function dot3(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function norm3(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2])
}

export function angleDelta(target: number, current: number) {
  let delta = target - current
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

export function actionToRawValue(action: Action, index: number) {
  const values = [action.base, action.shoulder, action.elbow, action.wrist, action.grip * 2 - 1, action.thrust]
  return atanh(clamp(values[index] ?? 0, -0.98, 0.98))
}
