# Demo 剧本

## 展示目标

展示一个面向太空机器人的 3D 训练场：先人工示范 ISS 舱内维护任务，再记录 episode、训练策略、自动执行，并通过 Tripo3D 生成新目标资产扩展任务。

## 推荐流程

1. 打开首页，确认任务面板已有初始 ISS 维护任务。
2. 进入 `Manual`，启动任务，手动控制机械臂接近目标物、抓取、移动到目标点并释放。
3. 结束运行，说明本次轨迹已保存为 episode。
4. 切到 `Replay`，选择刚才 episode，回放轨迹并说明每步 state/action/reward 都被记录。
5. 切到 `Learn`，选择当前任务或任务族，启动 CEM 训练，观察 best reward 和 success rate。
6. 切到 `Auto`，使用训练后的 policy 自动执行任务。
7. 切到 `Curriculum`，生成一批新任务，训练并展示泛化评分。
8. 打开“生成与资产”，提交 Tripo3D prompt，生成完成后作为任务目标加入场景。

## 成功条件

- 目标物进入目标位置容差内。
- 释放目标物后仍保持在目标容差内。
- 任务在 `maxSteps` 内完成。
- 展示时可看到 episode、policy、metrics 或 asset 数量发生变化。

## 失败条件

- 目标物漂移出安全边界。
- 超过 `maxSteps` 未完成对接。
- Tripo3D 生成失败或超时。
- 没有可用 policy 时直接进入 Auto，导致机械臂无法执行策略。

## 讲解分工

- 成员 A：讲项目目标、任务定义、demo 剧本和评审逻辑。
- 成员 B：讲 3D 场景、机器人控制、Manual / Replay / Auto 可视化。
- 成员 C：讲 episode、policy、reward、CEM、curriculum 和 metrics。
- 成员 D：讲 Tripo3D API、服务端 key 保护、SSE、资产缓存和部署。
