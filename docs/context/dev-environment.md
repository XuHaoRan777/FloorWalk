# 开发环境与验证入口

本文件只记录环境事实和命令。规则在 [`../../AGENTS.md`](../../AGENTS.md)，操作步骤在 [`../howto/`](../howto/README.md)。

## 环境

- 运行时与包管理器：此前意向为 Node.js >=23.9、pnpm >=10.20、TypeScript 5.9；新骨架须结合本次框架选型重新确定，不直接套用旧版本范围。本仓库尚未放入业务代码。
- 应用与包（目标，尚未创建）：API 使用 NestJS 12；Mobile 使用 React Native + Expo + gluestack-ui v5；Web 基于 shadcn-admin 合并公开宣传首页与登录后控制台，不再单独创建 Admin 应用。选型与版本核对见下节。`@libs/shared` 保留为共享模块，原构建意向为 tsup，须先于依赖它的包构建。具体目录与 API 包名在骨架规格中确定。
- 本地数据库 / 缓存 / 端口：未建立。schema 名预定 `floorwalk`。
- 部署验证环境：无。无生产数据。
- 只读参考仓库：`F:\react_project\Gift2CashApp`（CardFlow）。未经批准不拷贝源码。

## 基础依赖选型（尚未安装）

2026-10-06 用户确定 API 使用 NestJS 12、Mobile 使用较新的 Expo / React Native 与 gluestack-ui v5、Web 使用 [shadcn-admin](https://github.com/satnaing/shadcn-admin)。该选择替代此前 Web / Admin 的 Next.js 与 Ant Design Pro + UmiJS 方案；不代表已建立工程或验证兼容性。

| 模块 | 已选技术 | 本次核对结果 |
| --- | --- | --- |
| API | NestJS 12 | npm 稳定版 `@nestjs/core`、`@nestjs/common`、`@nestjs/platform-express` 均为 `12.1.2`；HTTP 适配器与具体补丁版本在骨架中锁定 |
| Mobile | React Native + Expo；gluestack-ui v5 | Expo 稳定通道为 `57.0.26`，其配套版本为 React Native `0.86.3`、React `19.2.3`；gluestack-ui CLI 稳定版为 `5.0.3`。这是候选组合，尚未安装或真机验证 |
| Web | shadcn-admin | 上游声明版本 `2.2.1`，采用 React、Vite、TanStack Router、shadcn/ui、Tailwind CSS；集成时锁定源码版本并按需保留组件 |

版本依据：[NestJS npm 元数据](https://registry.npmjs.org/@nestjs%2Fcore/latest)、[Expo 配套依赖](https://unpkg.com/expo@57.0.26/bundledNativeModules.json)、[gluestack-ui npm 元数据](https://registry.npmjs.org/gluestack-ui/latest)、[gluestack-ui 使用方式](https://github.com/gluestack/gluestack-ui)、[shadcn-admin 依赖](https://github.com/satnaing/shadcn-admin/blob/main/package.json)。`latest` 仅用于查询发布状态，实际工程使用确定版本与锁文件。

gluestack-ui v5 按需添加组件源码，结合 NativeWind 使用；不是仅安装 CLI 包即完成 UI 接入。Web 与 Mobile 的 React / 样式依赖分别遵循各自兼容要求。原 TypeORM + MySQL + Redis 属于后续数据层意向，本轮尚未确定接入范围。运行时、包管理器、TypeScript、代码检查工具及 shared 构建方式仍待骨架阶段确认。

## 验证命令

| 范围 | 命令 |
| --- | --- |
| 文档 | `python scripts/validate_docs.py`；归档前 `--archive-gate`；改校验器后 `python -m unittest scripts.tests.test_validate_docs` |
| 全量 | 尚无业务代码。骨架建立后按 API、Web、Mobile、shared 的实际包脚本执行类型检查、lint 和构建；具体命令随骨架验证后更新。 |

## 已知偏差

- 仓库目前只有文档与校验脚本，没有 `packages/`。

## 工作流配套

- 上游模板：`F:\project\workflow\template`；同步日期：2026-10-06。项目协议中的授权与产品边界保留为本地配置。
- 本地适配：上下文压缩后落盘并继续；testlog 阈值按上游校验器与测试使用“超过 5 条 / 超过 2 天”；长期事实不链接任何工作单元快照。
- `scripts/hooks/commit-msg` 已随模板提供，尚未启用。它只检查 `Mode: fix` 提交在改代码时是否同时暂存 `docs/testlog.md` 的变更，不验证是否实际追加记录。具备 Git 仓库后可用 `git config core.hooksPath scripts/hooks` 启用。
- 2026-10-06 检查：当前目录不在 Git 工作树内；`git status --short` 与 `--archive-gate` 无法通过，提交及 hook 启用也不可用。文档检查与校验器测试可独立运行。
