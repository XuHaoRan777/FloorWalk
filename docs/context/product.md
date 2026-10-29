# 产品基线

FloorWalk 做连锁门店巡店：现场按模板拍照提交，主管审，总部看分。成功标准是 8 分钟能讲完这条链，不是获客或赚钱。

## 角色

| 角色 | 谁 | 主表面 |
| --- | --- | --- |
| Inspector | 店员 / 店长 | Mobile |
| Supervisor | 区域主管 | Admin 审核队列 + 门店/模板配置 |
| HQ | 总部运营 | Web 看板 + Admin 配置 |

没有 C 端消费者账户，没有钱包。

## 意图中的主对象

Organization（演示里即 Northbean Coffee）、User、Site、Template、TemplateItem、Inspection、InspectionItem、Evidence、Review、按单 Chat。

巡检单的目标状态意图为 `draft → submitted → in_review → rework|passed|failed → closed`。当前代码已实现 `draft → submitted → in_review → rework|passed|failed`，`passed` 和 `failed` 为终态，尚未实现 `closed`。分数在提交时按巡检单中复制的检查项快照锁定，重新提交时重新计算；存在严重项不合格时不能审核通过。当前事实以 [`../specs/`](../specs/README.md) 及其下的功能规格为准。

## 三端意图

- Mobile：今日待巡、做巡检、记录、我的。当前已实现今日待巡、做巡检和我的；记录页及直接调用相机尚未实现。主路径是逐项勾选 + 上传照片。
- Admin：当前已实现审核队列；门店、模板、用户管理页尚未实现。
- Web：当前已有登录首页、主管审核和总部只读看板；正式 Demo 说明页尚未实现。店员不在 Web 提交。

## 演示

虚构连锁 Northbean Coffee，12 家店。演示：开店检查里冷柜项不合格 → 主管打回 → 补拍通过 → 看板看到该店分数变化。

## 禁区

礼品卡 / 卡密 / 兑付；可提现余额与银行卡；积分当钱；转盘、邀请返现、发钱排行；假用户数；西非支付通道作为主认证；万能工业巡检平台。

## 命名

产品与仓库：FloorWalk。schema：`floorwalk`。演示组织：Northbean Coffee。中文：门店巡检系统。
