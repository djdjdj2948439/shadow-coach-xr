"use client"

import { useState } from "react"
import { HabitatSceneClient } from "@/features/frontend/scene/scene-loader"
import { DataBootstrap } from "@/features/shared/components/data-bootstrap"
import { ModeSwitcher } from "@/features/frontend/modes/mode-switcher"
import { ModePanel } from "@/features/frontend/modes/mode-panel"
import { TaskSelector } from "@/features/product/components/task-selector"
import { GenerationPanel } from "@/features/backend/components/generation-panel"
import { MetricsPanel } from "@/features/agent/components/metrics-panel"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Activity, Boxes, Cpu } from "lucide-react"

export default function Page() {
  const [tab, setTab] = useState<"generate" | "metrics">("generate")

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <DataBootstrap />

      <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary glow-cyan">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              ORBITAL · SKILL · HABITAT
            </div>
            <div className="text-base font-semibold tracking-tight">自演化的微重力训练场</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Badge variant="outline" className="font-mono">
            <Activity className="mr-1 h-3 w-3" />
            sim 20Hz
          </Badge>
          <Badge variant="outline" className="font-mono">
            <Boxes className="mr-1 h-3 w-3" />
            Tripo3D · live
          </Badge>
          <Badge variant="default" className="font-mono">
            CEM · demo
          </Badge>
        </div>
      </header>

      <div className="border-b border-border/60 bg-card/30 px-5 py-2">
        <ModeSwitcher />
      </div>

      <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-[60vh] flex-col gap-3">
          <div className="min-h-[420px] flex-1">
            <HabitatSceneClient />
          </div>
          <div className="rounded-lg border border-border bg-card/40">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "generate" | "metrics")} className="flex flex-col">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <TabsList>
                  <TabsTrigger value="generate">生成与资产</TabsTrigger>
                  <TabsTrigger value="metrics">指标与评估</TabsTrigger>
                </TabsList>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Agent · Policy · Metrics
                </div>
              </div>
              <TabsContent value="generate" className="max-h-[44vh] overflow-auto scrollbar-thin">
                <GenerationPanel />
              </TabsContent>
              <TabsContent value="metrics" className="max-h-[44vh] overflow-auto scrollbar-thin">
                <MetricsPanel />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-card/40 p-3">
            <TaskSelector />
          </div>
          <div className="min-h-[420px] flex-1 overflow-hidden rounded-lg border border-border bg-card/40">
            <ModePanel />
          </div>
        </aside>
      </div>

      <footer className="border-t border-border/60 px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Manual · Replay · Learn · Auto · Curriculum · Tripo3D · CEM · Generalization
      </footer>
    </main>
  )
}
