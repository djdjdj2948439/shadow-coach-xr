# API 与共享接口契约

## 共享类型

主要入口：`features/shared/types.ts`

- `TaskDef` / `TaskSpec`：任务定义，包含目标物、难度、步数、容差、漂移和 reward 权重。
- `Episode`：一次运行轨迹，包含 task、mode、steps、reward、success、energy；可选 `measures` 保存综合评分分项，可选 `demoSource` 标记 `human` / `synthetic` / `policy` 来源。
- `AgentPolicy` / `Policy`：线性策略参数和训练统计；可选 `learningCurve`、`scoreBreakdown`、`trainingConfig` 保存示范正则化 CEM 的训练产物。
- `EpisodeMeasures` / `Measures`：展示、训练和评估共用的评分指标，包含 success、progress、path efficiency、time/energy cost、safety、demo similarity 和综合 `score`。
- `TrainingUpdate`：`POST /api/policies/train` SSE 每轮训练事件的共享结构，兼容原有 `iter` / `eliteAvg` / `best` / `successRate` 字段，并附带 `scoreBreakdown`、`demoCount`、`learningCurve`。
- `AssetItem`：Tripo3D 资产生成状态、进度、GLB URL 和缩略图 URL。

旧入口 `lib/types.ts` 仅做 re-export，新增代码应直接从 `features/shared/types.ts` 导入。

### Agent 学习契约补充

- `POST /api/policies/train` 请求体继续兼容 `{ policyId, taskIds, iterations, populationSize }`。
- 新增可选请求字段：`eliteRatio`、`trialsPerTask`、`initialSigma`、`sigmaDecay`、`seed`。
- 默认训练配置：`iterations=16`、`populationSize=24`、`eliteRatio=0.25`、`trialsPerTask=3`、`initialSigma=0.35`、`sigmaDecay=0.9`。
- 训练会优先使用 `demoSource="human"` 或 `mode="manual"` 且成功的 episode；不足 2 条时生成 `demoSource="synthetic"` 的启发式专家示范作为冷启动参考，synthetic demo 不写入持久 store。
- SSE `start` 事件新增 `demoCount` 和 `trainingConfig`。
- SSE `iter` 事件新增 `scoreBreakdown`、`demoSimilarity`、`learningCurve`。
- SSE `done` 事件返回的 policy 会带上 `learningCurve`、`scoreBreakdown`、`trainingConfig`。
- `POST /api/policies/evaluate` 返回继续兼容 `result.perTask[].avgReturn` / `successRate`；新增 `avgScore`、`scoreBreakdown` 和 `generalizationScore`。
- `GET /api/metrics` 新增 `avgScore`、`avgDemoSimilarity`、`avgPathEfficiency`、`avgSafetyScore`、`latestLearningCurve`，`series[]` 新增 `score`、`demoSimilarity`、`pathEfficiency`。

## Client Store

主要入口：`features/shared/client-store.ts`

- 前端组件通过 `useHabitat` 读取任务、episode、policy、asset、运行状态和 mode。
- 组件应优先调用公开 action，例如 `setMode`、`startRun`、`tickAuto`、`addEpisode`、`upsertPolicy`。
- 不要在业务组件里绕过 store 直接改内部运行结构。

## Server Store

主要入口：`features/shared/server-store.ts`

- 当前 demo 使用 Node 进程内存保存 tasks、episodes、policies、assets。
- 重启服务会清空数据，这是 demo 设计，不是生产持久化。
- 如需接入数据库，应保持现有 API payload 兼容。

## API 路由归属

- `app/api/tasks/**`：薄路由，委托 `features/product/server/tasks.ts`。
- `app/api/episodes/**`、`app/api/policies/**`、`app/api/metrics/**`：薄路由，委托 `features/agent/server/**`。
- `app/api/assets/**`、`app/api/tripo/**`：薄路由，委托 `features/backend/server/**`。

## 变更流程

1. 在本文件写清新增字段、默认值、兼容行为和调用方。
2. 更新 `features/shared/types.ts` 或相关 server handler。
3. 更新对应 feature 组件和 API route。
4. 跑 `npx tsc --noEmit` 和 `npm run build`。
