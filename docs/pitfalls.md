# FloorWalk 已知陷阱

只记录已经由代码、测试或实际故障确认且仍可能影响后续工作的经验，每条可核对。动手前按触发条件 grep 本页（[`AGENTS.md`](../AGENTS.md) 第 1 节），不通读；工作单元收尾时把最终审查发现的可复现陷阱追加到此处（[`howto/archive.md`](howto/archive.md)）。

改工作流规则的准入也是本页：没有对应失败条目的机制不加。

## 检索方式

按 `触发场景` 分组，不按时间排列——让"我正要做 X"能在读全文之前定位到相关条目。组名取自项目实际动作类型（构建与产物、依赖与包管理、认证与会话、数据库与迁移、渲染与样式……）；一组超过 8 条再分，只有一条时放 `其他`。一条陷阱属于多个场景时放最可能被查到的那组，另一组留一行链接。

## 记录格式

```markdown
### <短标题>

- 触发条件：什么动作或组合会碰到；写具体版本号
- 现象：可观察到的错误信息或行为
- 根因：已确认的机制，不是猜测
- 规避方式：已验证的做法，以及明确禁止的做法
- 验证方式：怎么确认已规避
- 失效条件：什么变化会让本条不再适用
- 首次记录：`FW-NNN`
```

`触发条件` 决定能不能被检索到，写不具体等于没记录。`失效条件` 决定什么时候该标过时——没有它，本页会随依赖升级慢慢变成误导；写一个能观察到的变化（版本号、工具能力、协作方式），不写"无"：工作流规则的失效条件写"无"，规则就永远退不出内核。条目过时后标注失效原因并保留，不删除。并行组试行期的坑记在 [`parallel-trial.md`](parallel-trial.md)，不记在这里。

## 陷阱清单

### Expo 真机扫码与主题

- 触发条件：Expo 57 在 Windows 以 localhost 模式启动，手机通过同一 Wi-Fi 的 Expo Go 扫码；或 gluestack Provider 同时用于原生与 react-native-web 0.21.2。
- 现象：真机无法加载且 Metro 无应用日志；Expo Web 报 Appearance.default.setColorScheme is not a function。
- 根因：回环监听地址无法被另一台设备访问；react-native-web 的 Appearance 只有读取与监听接口，没有原生主题设置方法。
- 规避方式：真机默认使用 LAN 并重启扫码；Provider 按平台设置主题，Web 使用已有根样式类，原生 system 映射为 RN 0.86.3 的 unspecified。不要用类型强转掩盖参数不匹配。
- 验证方式：Mobile 类型与 Android bundle 通过；用户确认真机首页与按钮通过。Expo Web 修复后浏览器交互尚未另行采集，不将静态检查当作浏览器验收。
- 失效条件：网络入口或 Appearance API 随依赖升级发生变化。
- 首次记录：`FW-001`

### Windows pnpm 包筛选

- 触发条件：Windows package script 用单引号包裹 pnpm filter。
- 现象：未匹配任何包，命令仍可能退出 0，应用没有构建。
- 根因：Windows 脚本的单引号没有按预期作为 shell 引号去除。
- 规避方式：使用不带单引号的包名筛选，例如 `@apps/*`，并检查实际包输出。
- 验证方式：修正后 shared、API、Web 与 Android bundle 均生成，命令不能仅看退出码。
- 失效条件：切换 shell 或 pnpm 参数解析行为变化。
- 首次记录：`FW-001`

### Expo 57 原生上传图片

- 触发条件：Expo SDK 57（`expo` 57.0.x、React Native 0.86.3）在 Android 原生端用 `FormData` 上传图片，文件部分按 React Native 的旧写法传 `{ uri, name, type }`；或者用 `typeof window` 区分 Web 和原生。
- 现象：上传抛出 `Unsupported FormDataPart implementation`，应用把它统一显示成"网络连接失败"；走错分支时，Expo 会警告 `Response.blob() is using React Native's Blob`，服务端拒绝这个请求。
- 根因：Expo 57 的 `expo/fetch` 不接受 React Native 专用的文件对象；原生环境里也有 `window`，`typeof window` 区分不了平台。
- 规避方式：原生端用 `expo-file-system` 的 `File` 对象作为上传部分，Web 端用 Blob，平台用 `Platform.OS === 'web'` 区分。上传异常在开发态打印原始错误，不要只显示通用提示。不要照搬 Expo 54 之前的 `{ uri, name, type }` 写法。
- 验证方式：Android 真机或模拟器上传照片，服务端收到文件；Expo Web 的 e2e 覆盖不到原生分支。
- 失效条件：Expo 恢复对 `{ uri, name, type }` 的支持，或者项目改用别的上传库。
- 首次记录：`FW-005`

### 同一 e2e 槽位的套件重置互相干扰

- 触发条件：API 测试、e2e 或界面套件使用相同 `FW_SLOT` 并发运行。
- 现象：同槽位 API 测试出现表缺失、401/500 和种子查询为空。
- 根因：测试初始化会清空并重建同一槽位的 schema、种子与存储；另一个套件仍在读取时被重置。
- 规避方式：单槽位各套件串行，前一个退出后再清理其监听进程、启动下一个；不同槽位的隔离见开发环境文档。
- 验证方式：FW-008 首轮 API 3/8；等待重叠套件退出并清端口后，未改代码串行重跑 8/8，其余业务套件全绿。
- 失效条件：测试设施不再共享可重置的槽位资源后。
- 首次记录：`FW-008`

### Mobile e2e 按文字定位，标题和 Tab 同名时歧义

- 触发条件：`tests/mobile/` 用 `getByText('今日待巡')` 这类文字定位，而页面标题和底部 Tab 文字相同（FW-008 改 Tabs 之后）。
- 现象：单独跑这条用例通过，整套跑时偶发严格模式报错（匹配到两个元素）。
- 根因：两个元素文字相同，是否同时出现在可访问性树里取决于渲染时机；不是产品 bug。
- 规避方式：按角色和名称定位，如 `getByRole('tab', { name: '今日待巡' })`；FW-010 已改 NB-002（`66172ac`）。写 spec 时不要一刀切"不改 tests/"：允许只改定位、不放宽断言，改动在证据里写明。
- 验证方式：`FW_SLOT=1 pnpm e2e:mobile` 整套连续跑两次都通过。
- 失效条件：Mobile 页面标题与 Tab 文字不再重复。
