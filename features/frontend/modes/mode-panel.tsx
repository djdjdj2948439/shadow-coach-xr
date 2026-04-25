"use client"

import { useHabitat } from "@/features/shared/client-store"
import { ManualMode } from "@/features/frontend/modes/manual-mode"
import { ReplayMode } from "@/features/frontend/modes/replay-mode"
import { LearnMode } from "@/features/agent/components/modes/learn-mode"
import { AutoMode } from "@/features/frontend/modes/auto-mode"
import { CurriculumMode } from "@/features/agent/components/modes/curriculum-mode"

export function ModePanel() {
  const mode = useHabitat((s) => s.mode)
  switch (mode) {
    case "manual":
      return <ManualMode />
    case "replay":
      return <ReplayMode />
    case "learn":
      return <LearnMode />
    case "auto":
      return <AutoMode />
    case "curriculum":
      return <CurriculumMode />
  }
}
