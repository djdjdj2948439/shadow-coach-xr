# 四人协作归属

本项目按文件归属并行协作。默认不要跨区直接修改代码；需要改共享接口时，先更新 `docs/API_CONTRACTS.md`，再同步相关实现。

## 成员 A：项目负责人 / 产品与任务设计

负责目录：

- `features/product/**`
- `docs/**`
- `app/page.tsx`

主要职责：

- 维护 ISS 舱内维护任务定义、成功条件、失败条件。
- 维护 demo 剧本和展示顺序。
- 负责最终 presentation 和现场讲解。
- 协调各功能区效果统一。

## 成员 B：前端与 3D 交互

负责目录：

- `features/frontend/**`
- `components/ui/**`
- `app/globals.css`
- `tailwind.config.ts`

主要职责：

- 维护 3D 场景、机器人、目标物和可视化 HUD。
- 维护 Manual、Replay、Auto 交互面板。
- 保证浏览器 demo 流畅运行。

## 成员 C：Agent 策略与学习逻辑

负责目录：

- `features/agent/**`
- `app/api/policies/**`
- `app/api/episodes/**`
- `app/api/metrics/**`

主要职责：

- 维护 `TaskDef`、`Episode`、`AgentPolicy`、`Measures` 相关逻辑。
- 维护示范轨迹、策略训练、评分和泛化评估。
- 维护 Learn、Curriculum、Metrics 相关 UI 和 API handler。

## 成员 D：Tripo3D / 后端 / 部署

负责目录：

- `features/backend/**`
- `app/api/tripo/**`
- `app/api/assets/**`
- `.env.example`
- `next.config.mjs`
- 部署相关文档

主要职责：

- 维护 Tripo3D 服务端 API、轮询、SSE 和资产缓存。
- 保护 `TRIPO_API_KEY`，保证 key 不进入浏览器包。
- 负责 Vercel 或本地部署稳定性。

## 共享区规则

- `features/shared/types.ts`、`features/shared/client-store.ts`、`features/shared/server-store.ts` 是共享契约。
- 修改共享类型、store action、API payload 前，先在 `docs/API_CONTRACTS.md` 写清变更。
- `lib/*` 只保留兼容 re-export，不再作为新代码的主要入口。
- `app/api/**/route.ts` 只做薄路由导出，业务逻辑放回对应 `features/*/server`。
