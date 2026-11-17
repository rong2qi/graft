# Graft 任务书

> 本文件是 Graft 工作的**权威任务书**。任务状态、验收标准、运行环境与关键决策都以这里为准；其他说明与它冲突时，先更新本文件，再按本文件执行。
>
> 最后更新：2026-11-14（Asia/Shanghai）

## 索引

| 编号 | 任务                                          | 状态   |
| ---- | --------------------------------------------- | ------ |
| T-01 | 将 `rong2qi/graft` 与上游最新提交同步         | 已完成 |
| T-02 | 建立可视化分支，提供简体中文的实时插件树界面  | 已完成 |
| T-03 | 本地启动可视化，并在桌面放置启动/停止快捷脚本 | 已完成 |
| T-04 | 将任务书与对话输出要求写入 `AGENTS.md`        | 已完成 |
| T-05 | 类型检查、测试、构建、提交与推送验收          | 已完成 |
| T-06 | 修复桌面启动脚本：依赖缺失时自动安装并启动    | 已完成 |

## 基线

| 项                        | 值                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| 本地仓库                  | `/Users/kai/Documents/Codex/Projects/graft`                                                        |
| 上游                      | `graftland/graft`                                                                                  |
| Fork                      | `rong2qi/graft`                                                                                    |
| 同步前 fork main          | `743779b`（落后 169 个提交）                                                                       |
| 上游与 fork main 当前提交 | `5c019e5`（`v0.6.0`，`test(remote): expect the reset when a killed unit's barrier socket closes`） |
| 工作分支                  | `feat/visualizer`                                                                                  |
| 实现提交                  | `241d65c`（`feat(samples): add a live plugin tree visualizer`）                                    |
| 规则提交                  | `343a2fd`（`docs: add the project task book and conversation rules`）                              |
| 可视化包                  | `samples/visualizer`（`@graftland/sample-visualizer`）                                             |
| 本地地址                  | `http://127.0.0.1:4712`                                                                            |
| 启动命令                  | `corepack pnpm --filter @graftland/sample-visualizer start`                                        |
| 桌面启动脚本              | `~/Desktop/Graft 可视化.command`                                                                   |
| 桌面停止脚本              | `~/Desktop/Graft 可视化（停止）.command`                                                           |
| 仓库启动脚本              | `samples/visualizer/scripts/start.sh`                                                              |
| 仓库停止脚本              | `samples/visualizer/scripts/stop.sh`                                                               |
| 运行日志                  | `.cache/graft-visualizer.log`（随仓库工作区）                                                      |
| PID 文件                  | `.cache/graft-visualizer.pid`（随仓库工作区）                                                      |

## T-01 同步 fork

- **目标**：把 `rong2qi/graft` 的 `main` 快进到上游最新提交。
- **结果**：`main` 从 `743779b` 快进到 `5c019e5`；本地 `main`
  与上游一致，工作区干净。
- **过程记录**：
  - `gh auth status` 确认登录账号为 `rong2qi`。
  - `gh repo sync` 被 GitHub 拒绝，因为上游包含 workflow 文件改动，而 OAuth
    token 缺少 `workflow` scope。
  - 将 `origin` 改为 SSH（`git@github.com:rong2qi/graft.git`）后，使用现有 SSH
    key 成功推送 `743779b..5c019e5`。
- **验收**：
  - `gh api repos/rong2qi/graft/commits/main --jq .sha` =
    `5c019e5322454901c17c28756f3474800c48d7b5`。
  - `git rev-list --left-right --count origin/main...upstream/main` =
    `0 0`（同步时点）。
- **注意**：`main` 保持与上游一致；本次所有可视化与协作规则提交在
  `feat/visualizer`，便于下次继续同步上游。

## T-02 可视化分支

- **目标**：提供一个能直接看到 Graft 运行时插件树的分支，并在本地运行呈现。
- **交付物**：
  - `samples/visualizer`：一个可运行示例。
  - 应用根插件
    `@graftland/sample-visualizer/app`，加载 HTTP 路由器、监听服务器、花园和观察器。
  - 花园
    `@graftland/sample-visualizer/garden`：土壤、阳光、水、橡树/橡果、兰花，以及按需播种的幼苗、竹子和荆棘。
  - 观察器
    `@graftland/sample-visualizer/lens`：提供页面、静态资源、`GET /api/state`、SSE
    `GET /api/events` 和操作接口。
  - 浏览器端零依赖的 SVG/HTML 树形地图，显示 fork 状态、父子关系、配置、实时日志和选中分支的详情。
  - 操作：播种幼苗、种竹子、种下会失败的荆棘、断水/浇水、重启选中分支、移除选中分支。
- **界面语言**：简体中文。插件全名、日志正文和代码保持英文，这是仓库的代码文字规则；界面框架、状态名、按钮、提示和错误提示均为中文。
- **关键实现**：
  - 树数据来自 `Graft.forks` 流；服务端用 SSE 推送快照和 `Graft.logs` 日志。
  - 花园在 `apply` 结束后仍能生长：`Garden`
    服务捕获花园激活时的上下文，HTTP 请求通过 `Effect.provideContext`
    在花园的 Scope 中加载新 fork。
  - 断水通过卸载 Water 服务提供者完成；依赖 Water 的插件自动转为 Pending，恢复供水后重新加载。
- **验收**：
  - `corepack pnpm exec tsc -p samples/visualizer/tsconfig.json --noEmit` 通过。
  - `corepack pnpm --filter @graftland/sample-visualizer test` 通过（快照编码 +
    HTTP 集成测试）。
  - 本地页面加载后显示 11 个 fork；通过真实页面按钮断水后，橡树和兰花进入等待中，恢复水后重新运行；播种后出现「幼苗 1」并自动选中。
  - 页面截图与交互记录见 T-05 证据。

## T-03 本地启动与桌面快捷脚本

- **目标**：双击桌面脚本即可启动/打开本地可视化，并可停止后台进程。
- **启动脚本职责**：
  - 桌面 `.command` 只作为包装，实际逻辑在
    `samples/visualizer/scripts/start.sh`。
  - 若 `http://127.0.0.1:4712/api/health` 已可用，直接打开浏览器。
  - 否则用 `nohup` 在后台启动
    `corepack pnpm --filter @graftland/sample-visualizer start`，等待健康检查通过后打开浏览器。
  - 日志写入仓库的 `.cache/graft-visualizer.log`，PID 写入
    `.cache/graft-visualizer.pid`，不依赖工作区外的目录。
- **停止脚本职责**：
  - 优先按 PID 文件停止；只在命令行确认属于 `sample-visualizer` 时执行。
  - 兜底停止占用 4712 端口的监听进程。
- **验收**：
  - 双击启动脚本后，浏览器打开 `http://127.0.0.1:4712`，页面显示实时插件树。
  - 双击停止脚本后，健康检查失败且 4712 端口不再监听。
  - 再次启动可以恢复；已在当前环境完成“启动 → 停止 → 启动”验证。
  - 当前最终状态：PID 文件 `.cache/graft-visualizer.pid`
    存在，4712 端口监听，健康检查返回 `200`。
- **边界**：脚本绑定本机 loopback，无认证；不要把 4712 暴露到外网。

## T-04 AGENTS 对话规则

- **目标**：把“任务书索引 + 结尾反馈块”的对话格式固化为仓库级规则。
- **写入内容**：
  - 每次对话第一条可见输出必须是「任务书索引」，逐行列出本文件索引表的编号、任务与状态。
  - 每次对话结尾必须在**同一个可复制文本块**中给出 2–3 条推荐回复提示词，最后一行固定为
    `用户自然语言反馈：`。
  - 使用单个以 `text` 标注的围栏代码块（三个反引号加
    `text`）；块内不写其他内容，不拆成第二个代码块。
  - 完成任务后更新本文件的状态、证据与索引；新增任务先写入本文件。
- **验收**：`AGENTS.md`
  的「任务书」与「对话输出」两节存在，且与本节一致；本对话结尾按该格式输出。规则已用 Prettier 检查，内容未被改写。

## T-05 验证与交付

- **检查命令与结果**：
  - `corepack pnpm typecheck` -> 通过。
  - `corepack pnpm --filter @graftland/sample-visualizer test` ->
    2 个文件、7 个测试通过。
  - `corepack pnpm build` -> 通过（完整构建，文档站 2578 页；当前环境没有
    `devenv`，且 `pnpm` 不在 PATH，使用 `.cache/bin/pnpm` shim 等价执行）。
  - `node --check samples/visualizer/public/app.js` -> 通过。
  - `git status --porcelain` -> 提交前仅包含本任务预期文件。
- **提交与推送**：
  - 实现提交：`241d65c`。
  - 任务书与 AGENTS 规则提交：`343a2fd`。
  - 分支：`feat/visualizer`，已推送到 `origin/feat/visualizer`；使用 SSH
    origin。
  - 本验收记录提交后，分支 HEAD 以 `git rev-parse HEAD` 为准。
- **证据**：
  - 本地健康检查：`curl -fsS http://127.0.0.1:4712/api/health` -> `ok`。
  - 最终状态：11 个 fork，11 个运行中；页面为简体中文。
  - 页面截图：`/tmp/graft-final.png`、`/tmp/graft-zh-selected.png`、`/tmp/graft-e2e-drought.png`（本机临时文件，不作为仓库交付物）。
  - 交互验证：在真实页面上点“断水”，橡树和兰花转为等待中，计数为 2；点“浇水”恢复；点“播种幼苗”出现「幼苗 1」并自动选中。

## T-06 桌面启动自举

- **现象**：2026-11-17 双击 `Graft 可视化.command`
  后弹出「Graft 花园启动超时」。
- **日志**：`.cache/graft-visualizer.log` 显示
  `ERR_MODULE_NOT_FOUND: Cannot find package 'effect'`，并提示
  `samples/visualizer/node_modules` 缺失。
- **根因**：工作区的 `node_modules` 被清理后，桌面脚本仍直接执行
  `pnpm ... start`，没有先安装依赖；健康检查等待 20 秒后超时。
- **修复**：
  - 把启动/停止逻辑移入仓库内的 `samples/visualizer/scripts/start.sh` 与
    `stop.sh`，可审查、可复用。
  - 启动脚本检测根目录和 `samples/visualizer/node_modules`；缺失时执行
    `CI=true corepack pnpm install --frozen-lockfile --prefer-offline`。
  - 检测 `packages/core/dist/index.js` 与
    `packages/plugin-http/dist/index.js`；缺失时按需构建这两个包。
  - 依赖就绪后再后台启动，健康检查等待时间从 20 秒延长到 120 秒。
  - 桌面 `.command` 只保留可执行包装，调用仓库脚本。
- **验收**：
  - 在缺少 `node_modules` 的状态下执行
    `samples/visualizer/scripts/start.sh`：日志在 11:05:35 记录
    `Installing workspace dependencies`，11:06:52 记录安装完成，11:06:53 健康检查通过；耗时约 78 秒，健康检查返回
    `200`。
  - 之后启动约 2.4 秒完成；停止后健康检查为
    `000`，4712 端口不再监听；再次启动恢复 `200`。
  - 桌面包装调用的就是这两个仓库脚本；最终页面仍为简体中文，11 个 fork 全部运行中。
- **状态**：已完成（2026-11-17）。

## 决策记录

1. **main 保持上游一致**：同步后不向 `main`
   追加个人提交；可视化、任务书和 AGENTS 规则放在
   `feat/visualizer`。下次同步上游不会产生额外冲突。
2. **可视化做成示例，而不是新的公开包**：不扩大公开 API，不触发 TypeDoc/发布流程；需要时可以把它提炼为工具包。
3. **观察器是运行时的一部分**：页面本身由 Graft 插件提供，因此地图里能看到它自己；HTTP 基础设施也如实显示。
4. **简体中文界面，英文代码与日志**：遵守 `AGENTS.md`
   的代码文字规则；只本地化用户界面。插件全名保留英文，方便对照源码。
5. **SSE 而不是轮询**：`Graft.forks` 和 `Graft.logs`
   本身就是流；SSE 直接复用，不需要前端框架或额外依赖。
6. **固定端口 4712**：桌面脚本、任务书和文档共享一个地址；端口冲突时启动会失败并在日志中说明。

## 维护规则

- 完成一个任务后，把索引状态改为「已完成」，在对应任务下补充验收命令、输出和日期。
- 新增任务必须先写入「索引」和任务详情，再开始执行；不要另建并行的 TODO 清单。
- 本文件与 `AGENTS.md` 的对话规则保持一致；修改格式时两边同时改。
- 任务书中的命令使用仓库约定：`devenv shell -- <command>`
  是正式写法；当前环境没有 `devenv` 时使用等价的 `corepack pnpm`
  命令，并在证据中注明。

## 变更日志

| 日期       | 变更                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-14 | 建立任务书；完成 fork 同步；实现并运行简体中文可视化；完成桌面脚本、类型检查、测试与完整构建；实现提交 241d65c，规则提交 343a2fd，分支已推送。 |
| 2026-11-17 | 修复桌面启动脚本在依赖缺失时直接超时的问题；增加依赖安装与按需构建，移动到仓库脚本并完成启动/停止/重启验证。                                   |
