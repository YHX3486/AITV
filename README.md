# libtv-lite

> 无限画布 · AI 视频创作

libtv-lite 是一个**基于无限画布的 AI 短视频创作工作台**：把「写文案 → 配图 → 生成视频 → 语音配音」的完整流程拆成画布上的节点，节点之间用连线表达依赖（上游文本 = 提示词、上游图片 = 参考素材），所有生成能力由**阿里云百炼（DashScope）多模态大模型**提供。

## ✨ 功能特性

- **项目管理**：项目列表 / 新建 / 双击重命名 / 删除；URL 带 `?project=<id>`，刷新后直达画布
- **无限画布**（React Flow）：缩放平移、小地图、右键 / 双击 / 拖连线到空白处添加节点；本地图片 / 视频 / 音频**直接拖进画布**即可上传并建节点
- **节点类型**
  - `文本`：手写提示词，或调用 LLM 流式生成（打字机效果）
  - `图片`：AI 文生图（参考图 + 多尺寸 + 张数），保留**版本历史**，可回退 / 切换版本，支持灯箱大图查看
  - `视频`：文生视频 / 图生视频（上游图片作为首帧）
  - `音频`：文本转语音（TTS）
  - `脚本`：分镜节点（开发中）
- **连线语义**：上游 `文本` 节点 → 作为下游的生成提示词注入；上游 `图片/视频` 节点 → 作为参考素材
- **可靠的异步生成**：任务入队 → 并发执行（默认 3）→ 轮询百炼 → 结果自动下载落盘并**静默回填**到节点；任务状态持久化，**服务重启后自动续查**未完成任务
- **历史与撤销**：画布支持撤销 / 重做（50 步）；拖动合并为一步；任务回填不污染撤销历史
- **自动保存**：画布快照自动落库（防抖 + 单事务），顶栏实时显示保存状态
- **成本控制**：每日预算熔断（默认 ¥50/天），超出后提交返回 429；界面展示今日用量与剩余预算
- **队列感知**：任务显示排队位次、运行耗时、失败原因；媒体节点保留每次生成历史

## 🧩 支持的模型（百炼）

模型清单统一注册在后端 `server/core/config.py`，前端从 `/api/config/models` 动态拉取，**换模型只改注册表一处**：

| 类别 | 模型 | 说明 |
| --- | --- | --- |
| 文本 | qwen3.7-flash-2026-07-15 | LLM，快 |
| 文本 | qwen3.8-27b | LLM，更强 |
| 图片 | qwen-image-2.0-pro-2026-06-22 | 同步通道，最高 3 张参考图 |
| 图片 | qwen-image-3.0 | 异步通道，最高 3 张参考图 |
| 视频 | happyhorse-1.1-i2v | 图生视频（首帧），480P/720P/1080P，5/10 秒 |
| 视频 | wan2.7-t2v-2026-06-12 | 文生视频，720P/1080P，2/5/10 秒，多画幅 |
| 音频 | qwen-audio-3.0-tts-flash / plus | 语音合成（音色：龙暗桓） |

## 🏗 技术栈

| 端 | 技术 |
| --- | --- |
| 后端 | Python · FastAPI · SQLAlchemy · SQLite(WAL) · httpx / openai SDK / dashscope SDK(WebSocket TTS) · uvicorn |
| 前端 | React 19 · TypeScript · Vite · React Flow · Zustand + Zundo(撤销) · TanStack Query · Tailwind CSS 4 · shadcn/ui |
| AI 能力 | 阿里云百炼 DashScope（文本 / 图像 / 视频 / 语音） |

## 📁 目录结构

```
libtv-lite/
├── server/                  # FastAPI 后端
│   ├── main.py              #   入口：API + 静态托管 web/dist + /files
│   ├── api/                 #   路由：projects / canvas / files / config / generate / tasks / stats
│   ├── core/config.py       #   .env 加载、模型注册表、价格表、预算
│   ├── services/            #   model_gateway（百炼唯一入口）/ task_runner（任务执行器）/ files（上传）
│   ├── db/                  #   SQLAlchemy models / engine / session
│   ├── data/                #   运行时数据：app.db + uploads/ + generated/（已 gitignore）
│   ├── .env.example         #   环境变量模板
│   └── check_*.py           #   LLM/图像/视频/音频 连通性冒烟脚本（仅本机，已 gitignore）
├── web/                     # React + Vite 前端
│   └── src/
│       ├── canvas/          #   画布页、五类节点组件、store、hooks（自动保存/任务回填/快捷键…）
│       ├── api/             #   后端接口客户端
│       └── components/ui/   #   shadcn/ui 基础组件
├── Makefile                 #   常用命令（dev-server / dev-web / dev / build）
└── requirements.txt         #   后端全量锁定依赖
```

## 🚀 快速开始

环境要求：Python ≥ 3.10（建议 3.11+）、Node.js ≥ 20（Vite 8 要求 20.19+ 或 22.12+）。

### 1. 后端

```bash
# 创建虚拟环境并安装依赖（依赖已全部锁定在根目录 requirements.txt）
python -m venv server/.venv

# Windows
server\.venv\Scripts\pip install -r requirements.txt
# macOS / Linux
server/.venv/bin/pip install -r requirements.txt

# 配置环境变量（必填 DASHSCOPE_API_KEY）
cp server/.env.example server/.env
# 编辑 server/.env，填入你的百炼 API Key

# 启动后端（监听 http://127.0.0.1:8000）
# Windows（与 Makefile 一致）
cd server && .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
# macOS / Linux
cd server && .venv/bin/python -m uvicorn main:app --reload --port 8000
```

### 2. 前端（开发模式）

```bash
cd web
npm install
npm run dev        # http://localhost:5173 ，/api 与 /files 已代理到 127.0.0.1:8000
```

或用 Makefile 一条命令启动（Windows 下已配置好 `.venv\Scripts\python.exe`）：

```bash
make dev-server    # 只起后端
make dev-web       # 只起前端
make dev           # 前后端一起
```

### 3. 生产 / 单端口部署

```bash
cd web && npm run build     # 产物输出到 web/dist（make build 等价）
```

后端启动时检测到 `web/dist` 存在即自动托管前端静态资源——之后**只需跑后端一个进程**，浏览器打开 <http://127.0.0.1:8000> 即可，无需前端开发服务器。

## ⚙️ 配置说明

环境变量（`server/.env`，模板见 `server/.env.example`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | — | 阿里云百炼 API Key，**必填**（缺失时后端直接拒绝启动） |
| `MAX_CONCURRENT` | 3 | 同时执行的生成任务数（信号量） |
| `DAILY_BUDGET` | 50 | 每日预算（元），超出后生成接口返回 429（LLM 文本流式共用此闸门） |
| `UPLOAD_MAX_MB` | 1024 | 单文件上传大小上限（MB），超出返回 413 |

模型、音色、尺寸、价格等集中维护在 `server/core/config.py` 的 `MODEL_REGISTRY` / `PRICES`。

> ⚠️ **注意**：`PRICES` 价格表目前是**占位值**，每日预算熔断按此表计算成功任务的花费——正式使用前务必按百炼官方价目表核对。

## 🔌 API 一览

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查 |
| `GET/POST /api/projects` | 项目列表 / 新建 |
| `GET/PATCH/DELETE /api/projects/{id}` | 项目详情 / 重命名 / 删除 |
| `GET/PUT /api/projects/{id}/canvas` | 读取 / 全量快照保存画布 |
| `POST /api/files` | 上传素材（multipart，字段名 `file`） |
| `GET /api/files` `GET /api/files/{file_id}` | 素材列表 / 详情 |
| `GET /api/config/models` | 模型注册表（前端唯一数据源） |
| `POST /api/generate/text` | LLM 流式生成（SSE） |
| `POST /api/generate/image` / `video` / `audio` | 提交生成任务（异步返回 `task_id`） |
| `GET /api/tasks/active` | 活动任务 + 队列位次 + 最近 60s 内完结任务 |
| `GET /api/tasks/node/{node_id}` | 某节点的任务历史（版本切换数据源） |
| `GET /api/stats/usage` | 今日 / 累计用量与花费、预算剩余 |

## 💾 数据存储

- SQLite 数据库：`server/data/app.db`（WAL 模式；文件表、任务表、画布节点/连线均落库）
- 上传素材：`server/data/uploads/`；AI 生成结果：`server/data/generated/`
- 上述目录以 `/files` 静态路径对外提供；首次启动自动建库建表（暂无迁移，改表结构需删库重建）

## 📌 项目状态与路线

当前 `master` 分支完成 **M1 + M2**（最后提交 2026-09-01，「Phase 1 验收关闭」）：

- **M1**：项目体系、无限画布、LLM 流式生成、图像生成（同步/异步双通道）、参考图、版本历史、图片灯箱
- **M2**：视频生成（wan2.7 文生视频 / HappyHorse 图生视频）、全屏播放器、TTS 配音、每日预算熔断、任务队列位次、UX 修复（输入不拖画布、自动增高输入框、时区修复等）

已知限制 / 待办：

- [ ] `脚本`（分镜）节点尚未实现（画布中为占位）
- [ ] 价格表 `PRICES` 为占位值，需按官方价目核对
- [ ] LLM 文本流式已受每日预算闸门约束，但**尚未按 token 精确计量入账**（待拿到官方价格表补齐）
- [ ] 暂无自动化测试（`server/check_*.py` 为手动连通性冒烟脚本）
- [ ] 任务执行器跑在应用进程内（单机部署假设）；多 worker 部署需额外加互斥或独立执行进程
- [ ] 上传文件类型校验依赖客户端声明的 Content-Type，若对外部署建议补充魔数校验与后缀白名单

## ❓ 常见问题

- **后端启动即报「缺少 DASHSCOPE_API_KEY」** → 在 `server/` 下创建 `.env`（参考 `.env.example`）并填入 Key
- **生成提交返回 429** → 已达每日预算上限（`DAILY_BUDGET` 可在 `.env` 调整）
- **想换模型 / 价格 / 尺寸选项** → 修改 `server/core/config.py` 的 `MODEL_REGISTRY` 后重启后端
- **生成很久没结果** → 图片/视频为百炼异步任务，后端每 5s 轮询，节点上会显示排队位次与耗时；确认后端日志无报错
- **想重置所有数据** → 停止后端后删除 `server/data/` 下的 `app.db*`（将同时丢失上传与生成文件，谨慎操作）
