export const demoTitle = "ISS 舱内维护任务 Demo"

export const maintenanceTaskBrief = {
  scenario: "机器人在 ISS 舱内完成微重力维护操作，将目标物抓取并稳定对接到指定位置。",
  successConditions: [
    "目标物进入目标位姿容差范围内。",
    "机械臂释放目标物后目标仍保持在容差范围内。",
    "episode 在任务 maxSteps 内完成。",
  ],
  failureConditions: [
    "目标物漂移出舱内安全边界。",
    "任务超过 maxSteps 仍未完成对接。",
    "能耗和路径质量导致评分低于展示阈值。",
  ],
}

export const demoFlow = [
  "Manual：人工示范一次抓取与放置，生成 episode。",
  "Replay：回放刚才 episode，说明数据被记录为示范轨迹。",
  "Learn：基于当前任务或任务族训练策略，观察 reward / success 曲线。",
  "Auto：使用已训练策略自动执行同一任务。",
  "Curriculum：自动生成更难任务并评估泛化能力。",
  "Tripo3D：生成新资产，将 GLB 作为新任务目标接入场景。",
]
