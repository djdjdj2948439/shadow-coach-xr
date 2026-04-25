import { store } from "@/features/shared/server-store"
import { buildDemoDataset, clonePolicy, trainCEM, type CEMUpdate } from "@/features/agent/policy"
import type { TaskSpec, TrainingConfig } from "@/features/shared/types"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const s = store()
  const body = await req.json().catch(() => ({}))
  const {
    policyId,
    taskIds,
    iterations = 16,
    populationSize = 24,
    eliteRatio = 0.25,
    trialsPerTask = 3,
    initialSigma = 0.35,
    sigmaDecay = 0.9,
    seed = 7,
  } = body ?? {}

  const base = policyId ? s.policies.get(policyId) : Array.from(s.policies.values())[0]
  if (!base) return new Response(JSON.stringify({ error: "no base policy" }), { status: 400 })

  const tasks: TaskSpec[] = (taskIds && taskIds.length
    ? (taskIds as string[]).map((id) => s.tasks.get(id)).filter(Boolean)
    : Array.from(s.tasks.values()).slice(0, 3)) as TaskSpec[]

  if (tasks.length === 0) return new Response(JSON.stringify({ error: "no tasks" }), { status: 400 })

  const trainingConfig: TrainingConfig = {
    iterations,
    populationSize,
    eliteRatio,
    trialsPerTask,
    initialSigma,
    sigmaDecay,
    seed,
  }
  const demoDataset = buildDemoDataset(Array.from(s.episodes.values()), tasks)

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`))

      send({
        type: "start",
        iterations,
        populationSize,
        tasks: tasks.map((t) => t.id),
        demoCount: demoDataset.count,
        trainingConfig: { ...trainingConfig, demoCount: demoDataset.count },
      })

      try {
        const trained = clonePolicy(base)
        let last: CEMUpdate | null = null
        for (const update of trainCEM(trained, tasks, { ...trainingConfig, demoDataset })) {
          last = update
          send({
            type: "iter",
            iter: update.iter,
            total: update.total,
            eliteAvg: update.eliteAvg,
            best: update.best,
            successRate: update.successRate,
            demoSimilarity: update.demoSimilarity,
            scoreBreakdown: update.scoreBreakdown,
            demoCount: update.demoCount,
            learningCurve: update.learningCurve,
          })
        }
        if (last?.bestPolicy) {
          const p = last.bestPolicy
          p.taskFamily = tasks.map((t) => t.id)
          s.policies.set(p.id, p)
          send({
            type: "done",
            policy: p,
            scoreBreakdown: p.scoreBreakdown,
            demoCount: demoDataset.count,
            learningCurve: p.learningCurve ?? [],
          })
        } else {
          send({ type: "done" })
        }
      } catch (err: any) {
        send({ type: "error", error: err?.message ?? "training failed" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
