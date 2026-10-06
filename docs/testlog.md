# FloorWalk 修正记录

修正模式的缓冲（[`AGENTS.md`](../AGENTS.md) 第 3 节）：只存上次"收一下"以来的改动，一条一行。`python scripts/validate_docs.py` 在 `待同步` 超过 5 条或最早一行超过 2 天时报错，提示该收了。收尾时 `待同步` 进 specs 并加修订记录、`待审查` 合成一轮审查，然后删掉全部数据行；历史查 `git log --grep 'Mode: fix'` 和各 spec 的修订记录，不在这里。

列说明：`日期`；`场景` 用户在哪看到的；`改动` 一句话；`验证` 跑了什么；`specs` 为 `无` 或 `待同步 <文件>「<小节>」`；`审查` 为 `无` 或 `待审查`（命中硬线但用户执意）。

| 日期 | 场景 | 改动 | 验证 | specs | 审查 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-06 | 本地开发启动端口 | 按用户要求将 API 改为 3018、Web dev 改为 3019、Mobile Metro（含 android 入口）改为 3020；同步 API 日志、开发环境和 adb reverse 说明；Web preview 仍为 4173 | API / Web / Mobile 各包 typecheck 通过；对应文件无既有测试，未新增测试或重跑构建；未启动服务 | 无（工程环境配置，已同步 context/howto；workspace 规格尚未生成） | 无 |
| 2026-10-06 | 三端开发与生产配置 | 按用户批准接入每应用 .env.development / .env.production；API/Web 使用 PORT，Mobile 开发用 RCT_METRO_PORT；Web preview 统一 3019，实际文件忽略、模板可提交；同步加载和生效时机说明 | 三包类型通过；API/Web 构建及 dev、生产 start/preview HTTP 通过；Metro 3020 status 通过；Mobile 默认 worker 导出 0xC0000005，单 worker 导出成功并固化命令；无对应既有测试，未新增测试；全部测试进程清理 | 无（工程环境配置已同步 context/howto；workspace 归档时生成） | 无 |
