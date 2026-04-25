# API 与共享接口契约

## 共享类型

主要入口：`features/shared/types.ts`

- `TaskDef` / `TaskSpec`：任务定义，包含目标物、难度、步数、容差、漂移和 reward 权重。
- `Episode`：一次运行轨迹，包含 task、mode、steps、reward、success、energy。
- `AgentPolicy` / `Policy`：线性策略参数和训练统计。
- `Measures`：展示和评估时使用的基础评分指标。
- `AssetItem`：Tripo3D 资产生成状态、进度、GLB URL 和缩略图 URL。

旧入口 `lib/types.ts` 仅做 re-export，新增代码应直接从 `features/shared/types.ts` 导入。

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
