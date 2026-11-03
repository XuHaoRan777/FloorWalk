# 阿里云 OSS 存储驱动

> ID：`FW-021`
>
> 状态：`approved`

## 目标

并行组 g03 线 L2，只有一个单元（槽位 2）。在 FW-017 定的存储接口后面实现阿里云 OSS 驱动：照片和聊天图片存进私有 Bucket，读取走 OSS 签名链接，键按商家分路径。设 `STORAGE_DRIVER=oss` 即可切换，不设时仍是本地存储。

## 非目标

- 不改存储接口、不改调用它的控制器和种子（FW-017 已改好），不改 `storage/index.ts` 的驱动选择。
- 不做客户端直传、STS 临时凭证、图片处理（缩放、水印）。
- 不迁移已有的本地文件到 OSS；开发库在集成单元重置，种子重新写入。
- e2e 不走 OSS：各槽位仍用本地存储。

## 验收标准

- AC-01（`用户要求`）：`OssStorageDriver` 实现 `put`、`get`、`delete`、`signedUrl`；对象键为 `OSS_PREFIX` + 接口给的键（如 `dev/org/<orgId>/evidence/...`）；Bucket 私有，`signedUrl` 返回 OSS 的带签名 GET 链接，有效期用接口传入的秒数。
- AC-02（`用户要求`）：单元测试用可注入的假 OSS 客户端验证：键拼接、mime 透传、`signedUrl` 的有效期参数、`get` 不存在时抛出接口约定的"不存在"错误（控制器据此回 404）、网络错误原样抛出。
- AC-03（`用户要求`）：配置检查：`STORAGE_DRIVER=oss` 而 `OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_PREFIX` 缺任何一个时，API 启动失败并报出缺的键名，不打印值。
- AC-04（`用户要求`）：冒烟测试 `oss.smoke.test.ts`，只在 `FW_OSS_SMOKE=1` 时运行，默认跳过：用主目录 env 里的真实凭据，在 `OSS_PREFIX` 下的 `smoke/` 路径 put 一张 JPEG → 用签名链接 GET 回来字节一致 → 不带签名 GET 被拒（403）→ delete → 再 GET 不存在。测试结束无论成败都删除自己写的对象。env 里缺 OSS 键时，这一条登记「待人工验收」，单元仍可 `verified`。

## 验收方式

`B Agent 验收`

## 涉及的当前事实

- [`specs/workspace.md`](../../specs/workspace.md)：存储驱动与 OSS 配置。由 FW-023 Promote。
- [`context/dev-environment.md`](../../context/dev-environment.md)：OSS 环境变量键名。

## 依赖

- FW-017

## 批准记录

- 批准依据：用户 2026-11-03 原话"一起批准"（g03 七个单元一起批准）；组的构成与 9 条产品语义见 FW-017 plan「决策与偏差」
- 批准时间：`2026-11-03`
- 特殊授权：并行组 g03 线 L2 槽位 2。写入范围见 FW-017 spec「写入范围」L2 一行，只加新文件；冒烟测试调用真实阿里云 OSS 一次，只写 `OSS_PREFIX` 下的 `smoke/`，测完删除；在 `g03/L2` 本地提交，不推送；不读、不打印 env 的值。
