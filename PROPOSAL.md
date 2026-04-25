# Orbital Skill Habitat Proposal

## ISS 场景下的具身机器人 AI 训练场

### 1. 项目定位

Orbital Skill Habitat 是一个面向 ISS 空间站场景的具身机器人 AI 训练场。它不是单纯的 3D 展示项目，也不是只做聊天式 AI，而是构建一个可以持续生成场景、持续生成任务、持续采集示范、持续训练策略、持续评估表现的 Web 端机器人学习系统。

项目核心目标是：让一个自由漂浮的空间站维护机器人，在 ISS 风格舱内环境中学习完成细化功能任务，例如抓取漂浮工具、归位储物、擦拭面板、避开敏感设备、返回 dock、执行巡检与维护流程。

系统参考 Habitat-Lab 的 task、episode、agent、metrics 结构，参考 Habitat-Sim 的 embodied environment、sensor、robot、physics 概念，参考 Habitat-Web 的浏览器端遥操作和示范采集方式，但不复刻 Habitat-Sim。项目使用轻量 Web 3D 技术实现一个适合黑客松展示、后续可扩展的机器人训练场。

### 2. 核心愿景

最终产品不是一个固定 demo，而是一个“可生长的 ISS 训练平台”。

平台支持：

- 用 Tripo3D 持续生成 ISS 场景资产、工具、设备、维护对象和任务物体。
- 在 Web 端实时查看生成进度，生成过程中不断把新资产加入训练场。
- 让用户或 AI 遥操作机器人完成示范。
- 系统将每次示范保存为 episode。
- 系统根据 episode 评分并改进 agent policy。
- 机器人可以自动执行当前最佳策略。
- 平台持续生成新任务、新障碍、新设备位置，测试机器人泛化能力。
- 最终形成一个可迭代的 embodied AI training ground。

### 3. 当前完成状态

当前项目已经从 proposal 进入可运行原型阶段。

已完成：

- 搭建 Next.js / React / Three.js Web demo。
- 实现 ISS 风格舱内 3D 场景。
- 实现自由漂浮机器人、工具、储物位、面板、dock、fragile 区域。
- 实现 Manual、Replay、Learn、Autonomous、Curriculum 五种模式。
- 实现 `TaskDef`、`Episode`、`AgentPolicy`、`Measures`、`AssetRecord`、`GenerationJob`、`CurriculumBatch` 数据结构。
- 实现示范 episode 记录、评分函数、策略更新和指标面板。
- 实现 Asset Library、Generation Stream Panel、Curriculum Panel。
- 实现 Tripo3D 服务端代理路由，API key 不进入前端。
- 实现生成任务 SSE 流，用后端轮询/模拟包装成前端可订阅进度。
- 完成桌面和移动端 WebGL 渲染验证。

### 4. 产品功能设计

#### 4.1 训练场主界面

训练场主界面由四个核心区域组成：

- 3D ISS Training Arena：显示空间站舱内、机器人、任务目标、障碍物、生成中的资产。
- Mission Control Panel：选择任务、模式、训练轮次、生成参数。
- Learning Dashboard：显示 success rate、collision、fuel、coverage、placement error、policy score。
- Asset Generation Stream：显示 Tripo3D 生成队列、进度、预览图、GLB 加载状态和失败重试。

主界面不是静态场景，而是持续变化的训练环境。用户可以生成新工具、新设备、新面板、新舱段模块，也可以让系统自动生成一组训练任务。

#### 4.2 机器人训练模式

系统包含五种模式：

- Manual Mode：用户遥操作机器人，完成一次示范。
- Replay Mode：回放历史 episode，观察轨迹和动作细节。
- Learn Mode：系统根据示范 episode 优化策略参数。
- Autonomous Mode：机器人使用当前最佳策略自动完成任务。
- Curriculum Mode：系统连续生成新任务，逐步提高难度，测试策略泛化能力。

Curriculum Mode 是最终训练场的关键能力。它让平台不只是演示一次任务，而是形成“连续任务生成 + 连续策略评估 + 连续学习改进”的闭环。

### 5. ISS 场景体系

ISS 训练场由多个可组合模块组成：

- Core Cabin：基础维护舱段，用于抓取、归位、擦拭任务。
- Tool Bay：工具存放区，用于工具识别、抓取、归位。
- Control Panel Zone：控制面板区，用于擦拭、按钮、旋钮、插拔任务。
- Fragile Equipment Rack：敏感设备区，用于避障和碰撞惩罚。
- Docking Port：机器人出发和返回位置。
- Expansion Module：由 Tripo3D 持续生成的新舱段或设备区。

训练场中的任务物体包括漂浮工具包、扳手、螺丝刀、清洁布、储物袋、控制面板、实验设备盒、电缆接口、可移动维护板、漂浮碎片和敏感设备 rack。

资产创建分两层：

- Demo 阶段使用程序化简化模型，保证现场稳定运行。
- 完整阶段使用 Tripo3D 生成 GLB 资产，并缓存到对象存储或 CDN。

### 6. Tripo3D 模型生成方案

Tripo3D 不只是用于“一次性生成几个模型”，而是作为训练场的资产生成引擎。

它负责生成：

- ISS 风格舱段
- 维护工具
- 控制面板
- 储物袋
- 机器人外观
- 任务道具
- 障碍物
- 新训练模块
- 不同磨损、污染、摆放状态的资产变体

#### 6.1 流式生成设计

Tripo3D 的生成任务本质上适合异步任务流。平台后端将其包装成前端可订阅的生成流。

前端体验：

1. 用户输入任务主题，例如 `generate a microgravity tool repair zone inside ISS cabin`。
2. 后端创建 Tripo3D generation job。
3. 前端通过 SSE 订阅生成进度。
4. UI 实时显示状态：queued、prompting、generating、texturing、persisting、ready。
5. 生成完成后，GLB 自动加入 Asset Library。
6. 用户可以一键把新资产放入训练场。
7. 系统可以基于新资产生成新任务。

如果 Tripo3D 环境提供原生 streaming 接口，则直接适配；如果当前接口是异步 task + polling，则后端用轮询包装成 SSE 流，对前端保持同样的 streaming 体验。

#### 6.2 连续生成设计

连续生成是项目的重要特色。

系统支持三类连续生成：

- Scene Expansion：连续生成新舱段、新设备、新训练区域。
- Object Variation：连续生成同一任务物体的不同版本，例如不同形状工具、不同污染面板。
- Task Curriculum：连续生成任务组合，例如“抓取工具 -> 擦拭面板 -> 避障返回”。

连续生成流程：

1. 用户选择生成目标：scene / object / task set。
2. 系统根据当前训练失败点生成 prompt。
3. 后端批量创建 Tripo3D tasks。
4. 生成结果进入资产库。
5. 系统自动标注资产用途：tool、panel、obstacle、dock、storage。
6. 训练场刷新任务配置。
7. agent 在新任务中再次训练和评估。

### 7. 前端架构

前端使用 Next.js + React + Three.js / React Three Fiber。

核心模块：

- `TrainingArena`：3D 训练场容器。
- `RobotAgent`：机器人模型、姿态、机械臂、夹爪状态。
- `TaskObjects`：工具、面板、储物位、障碍物。
- `MissionControl`：任务选择、模式切换、生成按钮。
- `GenerationStreamPanel`：Tripo3D 生成进度和资产预览。
- `MetricsDashboard`：学习指标、曲线、episode 列表。
- `PolicyInspector`：展示当前策略步骤和技能参数。
- `AssetLibrary`：展示已生成资产，可拖入训练场。

前端需要支持：

- WebGL 3D 渲染。
- 键盘和按钮遥操作。
- Episode 轨迹回放。
- 策略路径可视化。
- 生成任务流式进度。
- 新资产动态加载到场景。
- 桌面和移动端基础适配。

### 8. 后端架构

后端负责保护密钥、管理生成任务、保存训练数据、提供策略训练接口。

核心服务：

- Task Service：管理任务定义和训练目标。
- Episode Service：保存每次机器人执行记录。
- Policy Service：训练和读取 agent policy。
- Metrics Service：统一计算任务评分。
- Tripo Service：创建 Tripo3D 任务、轮询状态、下载结果。
- Asset Service：保存 GLB、预览图、metadata。
- Stream Service：向前端推送生成进度和训练进度。
- Curriculum Service：根据失败指标生成下一批任务。

当前接口：

- `GET /api/tasks`
- `GET /api/episodes`
- `POST /api/episodes`
- `GET /api/policies/:taskId`
- `POST /api/policies/:taskId/train`
- `GET /api/assets`
- `POST /api/assets`
- `POST /api/assets/generate`
- `POST /api/assets/:assetId/place`
- `GET /api/generation/:jobId/stream`
- `POST /api/curriculum/next`
- `POST /api/tripo/text-to-model`
- `POST /api/tripo/image-to-model`
- `GET /api/tripo/tasks/:taskId`

### 9. 数据结构设计

`TaskDef` 描述一次训练任务：task id、场景模块、机器人初始位置、目标物体、成功条件、失败条件、动作空间、指标权重、难度等级、可用资产列表。

`Episode` 记录一次执行过程：episode id、task id、policy id、mode、frame 序列、robot pose、object state、action log、collision log、completion state、metrics、failure reason。

`AgentPolicy` 描述机器人策略：policy id、generation、task id、skill steps、参数集合、上一次训练来源、最佳得分、适用场景范围。

`AssetRecord` 描述 Tripo3D 资产：asset id、source prompt、tripo task id、status、type、model url、preview url、scale、collision shape、semantic tags、generated at、used in tasks。

`GenerationJob` 描述一次资产生成任务：job id、asset type、prompt、status、progress、created at、mode、tripo task id、events、asset、error。

`CurriculumBatch` 描述一次课程任务生成：batch id、difficulty、objective、generated tasks、generated asset ids、rationale。

### 10. 学习与训练逻辑

第一阶段不做真实强化学习，而是实现可解释、可展示、可迭代的示范驱动策略优化。

训练闭环：

1. 用户或 AI 完成一次示范。
2. 系统保存 episode。
3. Metrics Service 计算分数。
4. Policy Service 提取成功轨迹。
5. 系统生成候选策略参数。
6. 在训练场中自动跑多次候选策略。
7. 选择得分最高策略作为当前 policy。
8. Curriculum Service 生成更难任务。
9. 重复训练。

评分指标：

- success rate
- task completion time
- fuel cost
- collision count
- grasp stability
- wipe coverage
- placement error
- path smoothness
- dock precision
- generalization score

训练场的重点不是证明模型已经具备真实 RL 能力，而是展示一个完整 embodied AI 训练系统应该如何收集数据、评估行为、改进策略和扩展任务。

### 11. 流式训练与连续学习体验

项目需要把“生成”和“学习”都做成可观察的流。

前端应该看到：

- Tripo3D asset generation stream
- robot execution stream
- episode recording stream
- policy training stream
- curriculum generation stream

每个 stream 都显示当前阶段、进度百分比、中间结果、错误状态、retry 状态和最终产物。

示例：

- `Asset 01: ISS storage bag generating 64%`
- `Asset 02: maintenance panel texturing`
- `Episode 18: collision detected`
- `Policy G4: candidate 3 scored 82`
- `Curriculum: generated harder task with floating obstacle`

这样评委能直观看到系统不是静态 demo，而是一个持续运行的训练平台。

### 12. Tripo3D Prompt 策略

为了生成稳定资产，需要维护 prompt 模板库。

场景 prompt：

`ISS-inspired modular cabin interior, microgravity maintenance area, white and grey aerospace panels, handrails, storage pockets, control screens, clean industrial sci-fi design, game-ready 3D asset, GLB, PBR texture`

工具 prompt：

`compact astronaut maintenance wrench, floating tool for space station repair, yellow handle, metallic head, low-poly game-ready 3D model, clean topology, GLB`

面板 prompt：

`space station control panel with buttons, warning labels, screen surface, slightly dirty area for cleaning task, game-ready 3D model, PBR texture`

机器人 prompt：

`free-floating spherical maintenance robot with small robotic arm and gripper, ISS cabin assistant, white shell, teal lights, compact embodied AI robot, game-ready GLB`

生成策略：

- 默认使用 GLB，方便 Web 端加载。
- 默认开启 texture / PBR。
- 对训练物体限制面数，避免浏览器卡顿。
- 生成完成后统一做 scale、origin、collision metadata 标注。
- 现场 demo 使用缓存资产，不依赖实时生成成功率。

### 13. 完整项目阶段安排

#### Phase 1：MVP 训练场

目标：稳定展示 ISS 机器人学习闭环。

完成内容：

- 完善现有 Web demo。
- 增强 ISS 场景视觉质量。
- 完善 Manual / Replay / Learn / Auto / Curriculum。
- 增强评分函数和学习曲线。
- 完成 proposal 和 presentation。
- 使用程序化资产保证稳定演示。

验收标准：

- 用户能录制一次示范。
- 系统能生成 episode。
- 系统能更新 policy。
- 机器人能自动完成任务。
- Metrics 能展示学习前后变化。

#### Phase 2：Tripo3D 资产生成系统

目标：让训练场具备持续生成能力。

完成内容：

- 接入 text-to-model、image-to-model。
- 增加 Tripo generation job 数据结构。
- 增加 SSE stream 进度接口。
- 增加 Asset Library。
- 支持生成完成后自动加载 GLB。
- 支持资产缓存和失败重试。

验收标准：

- 用户可创建 Tripo 生成任务。
- 前端可实时查看生成进度。
- 生成完成后资产进入库。
- 用户可将资产加入训练场。
- API key 不出现在前端。

#### Phase 3：连续任务与课程学习

目标：让平台从单任务 demo 变成训练系统。

完成内容：

- 增加 Curriculum Service。
- 根据当前 policy 弱点生成任务变体。
- 支持连续 episode 评估。
- 支持 task difficulty 等级。
- 支持策略跨任务测试。
- 增加 generalization score。

验收标准：

- 系统可连续生成 3 个以上任务。
- robot policy 在多个任务中评估。
- dashboard 显示策略迭代趋势。
- 任务难度可逐步提升。

#### Phase 4：完整训练场展示版本

目标：形成最终可展示的 ISS embodied AI training ground。

完成内容：

- 完成高质量 ISS 资产包。
- 完成训练场全流程 UI。
- 完成流式生成、流式训练、连续任务。
- 完成项目介绍页或答辩 deck。
- 完成演示脚本和备用缓存数据。
- 完成部署到 Vercel 或云服务。

验收标准：

- 现场可稳定运行 5 分钟完整演示。
- 无需实时消耗 Tripo credit 也能展示。
- 有实时生成能力作为亮点演示。
- 有完整学习闭环和指标对比。
- 有清晰项目价值和后续扩展路径。

### 14. 部署方案

推荐部署方式：

- Frontend：Vercel
- API：Next.js Route Handlers 或独立 Node/FastAPI 服务
- Database：Postgres / Supabase
- Queue：Redis / Upstash / BullMQ
- Storage：S3 / R2 / OSS
- Streaming：SSE
- 3D Assets：GLB + CDN
- Secrets：平台环境变量

安全要求：

- `TRIPO_API_KEY` 只存在服务端。
- 不使用 `NEXT_PUBLIC_TRIPO_API_KEY`。
- 不在日志中打印 key。
- Tripo 输出 URL 要及时转存。
- 前端只访问自己的 asset URL。

### 15. 最终交付物

最终项目应交付：

- 完整 Web 端 ISS 机器人训练场。
- 可交互 3D 场景。
- 可训练机器人 agent。
- 示范采集与 episode 回放系统。
- 策略学习与评分系统。
- Tripo3D 流式生成面板。
- 连续资产生成与任务生成能力。
- Asset Library。
- Metrics Dashboard。
- API 文档。
- Proposal 文档。
- Demo script。
- 部署说明。

### 16. 项目价值

Orbital Skill Habitat 的价值在于，它把 embodied AI 从抽象概念变成一个可见、可交互、可评估的训练系统。

它展示了一个未来机器人学习平台的最小形态：

- 场景可以生成。
- 任务可以生成。
- 机器人可以示范学习。
- 策略可以持续优化。
- 表现可以被量化评估。
- 训练场可以不断扩展。

ISS 场景只是第一个训练环境。相同架构可以扩展到客厅清扫、厨房整理、洗车房洗车、工厂巡检、医疗辅助和灾害环境操作。核心框架是可复用的：场景生成、任务定义、示范采集、策略训练、指标评估、连续课程学习。
