# ToChinese — 中英对照翻译

在右侧边栏的**文件标签页菜单**里加一项「翻译成中文（中英对照）」。点击后立刻开一个标签页显示进度，完成后在**同一个位置**换成生成的中英对照文档。

源文件 `foo.md` → 生成 `foo-cn.md`（英文原文一句 + 中文译文一句，逐句交替），并在新标签页打开。

```
点击菜单项
  → 标签页立刻出现，显示「翻译中…」+ 文件名
  → 成功后：同一个位置换成正经的文档标签页，展示成果
  → 失败后：原地显示「翻译失败 + 原因 + 重试按钮」
```

**特色**：翻译成功之前，磁盘上不会多出任何文件。

---

## 目录

- [1. 怎么用](#1-怎么用)
- [2. 产物长什么样](#2-产物长什么样)
- [3. 安装、卸载与开发](#3-安装卸载与开发)
- [4. 架构总览](#4-架构总览) ← **先读这节**
- [5. Client 半边：Slot 与 Tab](#5-client-半边slot-与-tab)
- [6. Host 半边](#6-host-半边)
- [7. 双语对照与结构保护](#7-双语对照与结构保护)
- [8. 三态设计](#8-三态设计)
- [9. 代码地图](#9-代码地图)
- [10. 验证状态](#10-验证状态)
- [11. 已知限制](#11-已知限制)
- [12. 学习笔记：五个反直觉的坑](#12-学习笔记五个反直觉的坑)

---

## 1. 怎么用

1. 打开右侧边栏，点开任意 `.md` 或其他文本文件
2. 点该标签页的 **⋯** 菜单
3. 选「翻译成中文（中英对照）」

菜单项只在**内容是文件**的标签页上出现。引导页、文件树之类不显示——这一判断由插件自己做（读 `tab.contentId`），框架不做。

用的是**你在模型选择器里选的那个模型**（通过 `ctx.agentDefaultModel.currentSelection()`），不需要另外配 API key。

---

## 2. 产物长什么样

假设源文件是：

```markdown
# Hard limits on the number of questions during grilling

The `/grill-me` skill does not enforce a maximum number of questions.
Requests to add a configurable cap are out of scope.

- The user can stop the session at any time.
```

生成的 `-cn.md` 是（实测输出）：

```markdown
# Hard limits on the number of questions during grilling
# 盘问期间问题数量的硬性限制

The `/grill-me` skill does not enforce a maximum number of questions.
`/grill-me` 技能不强制执行问题数量上限。

Requests to add a configurable cap are out of scope.
添加可配置上限的请求不在范围内。

- The user can stop the session at any time.
- 用户可以随时停止会话。
```

规则：

- 每个**句子**一行英文，紧接着一行中文；句对之间空一行，所以在渲染后每一对自成一段
- **标题**变成两行标题（原文 + 译文），Markdown 结构留在原地
- **列表项**的标记保留，译文占下一行
- **代码块**和 **YAML front matter** 原样保留，不翻译（见 [第 7 节](#7-双语对照与结构保护)）

---

## 3. 安装、卸载与升级

### 安装

在 dsh 的 **Plugins** 页面点 **Add plugin**，输入：

```
github:Ganttfly/dsh-to-chinese#v1.0.0
```

也可以走命令行：

```sh
dsh plugin --profile <profile 名> add github:Ganttfly/dsh-to-chinese#v1.0.0
```

装完如果没自动启用，在 Plugins 页面把它打开。

**建议带上 `#v1.0.0` 这样的版本标签。** 三种地址形式的区别：

| 地址 | 拿到的版本 |
|---|---|
| `github:Ganttfly/dsh-to-chinese#v1.0.0` | 固定到 v1.0.0 ✅ 推荐 |
| `github:Ganttfly/dsh-to-chinese#semver:^1.0.0` | 1.x 里最新的标签，小版本自动跟进 |
| `github:Ganttfly/dsh-to-chinese` | 默认分支最新提交 ⚠️ 不可重现 |

### 卸载

在 Plugins 页面点该插件的移除按钮，或者：

```
plugin_manager remove_bundle  "dsh-to-chinese"
```

### 升级

```
① Plugins 页面 → 移除旧版
② Add plugin → 输入新的版本标签（如 #v1.0.1）
③ Enable now
④ 重启 dsh          ← 必须做，否则仍在跑旧的 Host 代码
```

插件管理器**没有「升级」按钮，也没有版本选择器**——输入框里的字符串会被原样交给 pnpm。所以升级 = 移除 + 用新标签重装 + 重启。改动记录见 [CHANGELOG.md](CHANGELOG.md)。

### 开发时的重载行为

| 改了哪半边 | 怎么生效 |
|---|---|
| `client.js`（客户端） | **刷新页面**即可。客户端 bundle 是按请求从磁盘读的（`/plugins/<id>/<file>?rev=<内容+mtime哈希>`） |
| `index.js`（Host） | 默认**需要重启 dsh**，见下 |

Host 半边在 Node 的 ESM 模块缓存里，改文件不会重新 import。`dsh-base` 挂 HMR 那行时写的是：

```yaml
# Profile configuration reloads by default; module roots are opt-in.
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: []
```

意思是**配置变更热重载开着，模块源码监听是关的**。想让它监听源码，在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里加：

```yaml
- id: hmr
  config:
    root:
      - '<你的插件源码目录>'
```

要点：

- ⚠️ **这一整段只对本地开发有效。** 它要求你用 `link:` 方式安装自己工作区里的目录。通过 git / npm 安装的包位于 profile 的 `node_modules` 下，而 HMR 默认的 `ignored` 列表里就包含 `**/node_modules`——源码监听对它无效，只能重启
- 填 `link:` bundle 背后**真实目录的路径**。profile 里的 `node_modules/dsh-to-chinese` 只是个 junction，而 HMR 按 Node ESM 解析的 `realpathSync()` 拼写匹配模块缓存
- 补丁会**整段替换**该行的 `config`，不是合并，所以要把 `root` 写全
- 不要重写 `disabled`，让 base 里那条 `!ctx.get('profileContext')` 条件继续决定 HMR 要不要跑
- 写入后配置本身会热重载（配置监听本来就是开的），但**下一次源码变更**才走新路径；若首次不生效，重启一次

---

## 4. 架构总览

这一节是理解其余部分的前提。

### 4.1 一切皆插件行

这个 harness 是 **Cordis** 应用。核心思想一句话：

> **一切能力都是一个插件行（plugin row），插件之间通过「服务（service）」互相寻找。**

没有中央配置系统，没有能力开关。某功能存在，只因为有一行插件被加载。所有插件挂在同一棵**上下文树**上，服务沿树向下传递，所以任何插件都能 `ctx.get('某服务')` 拿到别人提供的能力。

本插件就是这棵树上的两行：一行在 Host，一行在 Client。

### 4.2 两个半边

| | Host 半边 | Client 半边 |
|---|---|---|
| 运行位置 | dsh 的 **Node 进程** | **浏览器页面**里的 JS |
| 代码形态 | 普通 ES 模块（可用 `Buffer`、`node:http`） | 由 `window.__ModuleLoader__.load(...)` 装载的模块 |
| 服务数量 | **81 个** | **8 个** |
| 独有能力 | 文件读写、子进程、调模型、会话日志、**沙箱与审批** | DOM、React、布局、主题、语言 |

**关键：两者之间没有共享内存，没有函数调用桥，只能通过网络说话。** 这一点决定了整个方案的形状——必须自己造一根「管子」。本插件用的是 **HTTP 路由 + 浏览器 `fetch`**。

> 官方还有更高层的通道 `ctx.remote.<namespace>`（Typert 生成的 Remote 命名空间，有类型、取消、错误码协议），但那是**固定的、由装配选定的集合**，手写 bundle 加不了新命名空间。`ctx.webServer.register()` 是它自己声明的低层逃生口。

### 4.3 分界线是「权威 / 呈现」，不是「前端 / 后端」

> **有副作用、要持久化、需要被信任的事 → Host。**
> **只是「看得见、点得着」的事 → Client。**

理由是**客户端不可信**：浏览器里的代码能被用户改、被插件改、被中间人改，所以任何「要不要允许」的判断都不能放在客户端。

本插件的落法：**客户端只递一个地址字符串，Host 自己解析、自己拼绝对路径、自己过沙箱策略。** 客户端从头到尾没说「你要写哪个文件」。

### 4.4 一个反直觉细节：客户端服务可能是「幌子」

Client 那 8 个服务里，有些只是 Host 状态的瘦封装。比如 `ctx.uiWorkspace.listDirectory()`——签名在客户端，实际干活的是 Host 的 `directoryPickerController`，返回值甚至是 `RemoteResult<...>`（带失败码的信封）。

**看到「客户端有个服务」不等于「客户端有这个能力」。能力永远在 Host。**

---

## 5. Client 半边：Slot 与 Tab

### 5.1 Slot 是什么

**Slot（插槽）就是别人在 UI 上预留的、有名字的位置。**

想象一块钉板，上面有很多写着名字的挂钩（`shell.overlay`、`sidebar.right.tab.menu.item`、`sidebar.right.pane.tab`……）。官方插件挂上自己的组件，你也挂上自己的，大家并列显示。

四种形态：

| 形态 | 语义 | 本插件是否使用 |
|---|---|---|
| `single` | 只有一个占位者，后来者顶掉先来者 | 否 |
| `list` | 可挂多个，按 `order` 排序 | ✅ 菜单项、兜底胶囊 |
| `keyed` | 按 key 查表派发 | ✅ tab body |
| `chain` | 层层替换（如替换 guide 页内容） | 否 |

### 5.2 为什么必须用 Slot，而不是直接改 DOM

**第一版**是直接操作 DOM 的：读文档预览头部自己发布的 `data-*` 属性（`data-textpreview-state`、`data-document-viewer-menu`），量出位置，用 `position: fixed` 把按钮「贴」在那排图标旁边。

那版能用，但用户立刻发现「样式和旁边的按钮不一致」——根因是：**在模仿别人的视觉，而不是加入别人的系统。**

改用真座位后有三个好处：

1. 不需要知道对方内部怎么实现、用什么 CSS 类
2. 对方布局变了，自己的东西跟着变，不会错位
3. 对方升级重构，只要座位契约不变就不会坏

**这就是「用契约」和「抄实现」的区别。**

### 5.3 三个座位

| 座位名 | 形态 | 作用 | owner 提供的东西 |
|---|---|---|---|
| `sidebar.right.tab.menu.item` | list | 标签页 ⋯ 菜单里的一行 | `{ tab, dismiss }` |
| `sidebar.right.pane.tab` | keyed | 自己 tab 的内容 | `{ sidebar, panel, tab }`（经 `useTabInfo()`） |
| `shell.overlay` | list | 兜底错误提示 | 无（根级浮层） |

两个契约细节值得注意：

- **`tab` 是交给自己判断的。** 框架不帮着筛——不是文件标签页，自己返回 `null`。座位文档原话：*Entries decide their own visibility from the tab they are given.*
- **`dismiss` 是必须调的。** 座位文档原话：*An item that acts MUST call this: the menu is the kit's, and it closes on its own actions only.* 动作型条目必须自己关掉菜单——正因为菜单立刻关闭，「翻译中」的反馈必须搬到别处，这直接决定了 [第 8 节](#8-三态设计)的设计。

`shell.overlay` 是**点击穿透**的浮层（不会挡住底下的应用），占位者要用 `pointer-events: auto` 主动接管指针事件。

### 5.4 Tab 是什么

一个 tab 是**两样东西的组合**：

1. **一条记录** —— 存在客户端 store 里：`kind`、`contentId`、`title`、`navigation.params`、`visible`、`signal`、`actions`
2. **一个 React 组件** —— 挂在与主应用**同一棵 React 树**里的 body

**它不是网页**：没有 iframe、没有 URL、没有独立 document。整个布局（分栏比例、浮动位置、标签顺序）被序列化成 JSON 存进 localStorage 的 `dsh.sidebar-right.v1.<sessionId>` 键下。

正确的类比不是「浏览器标签页」，而是：**VS Code 的一个编辑器面板，扩展提供一个 React 组件来画内容。**

#### 两种 tab

| | **resource tab**（标准文档 tab） | **page tab**（本插件） |
|---|---|---|
| 地址 | `dsh-resource://file/session/.../SKILL.md` | `sidebar://to-chinese` |
| 背后有什么 | 真实资源，body 从地址**读字节** | **什么都没有** |
| 内容由谁决定 | 资源内容 | 组件想画什么画什么 |
| 标题来源 | 从地址抓（文件名） | 类型注册时的 `title()` |

那个 `sidebar://to-chinese` 是框架自己编的，源码里就一行：

```js
function pageAddress(kind) { return `sidebar://${kind}`; }
```

**page tab 的「地址」只是身份标识，不是位置。**

#### 在 tab 里能做什么

和任何 React 组件完全一样，**没有沙箱**：

- 完整 `document` / `window` / `fetch` / 定时器 / `MutationObserver` / portal
- 框架额外注入一批 hooks：`useTabInfo`（拿 `tab.navigation.params`、`tab.actions`、`tab.visible`、`tab.signal`）、`useResource`、`useChat`、`useConversation`、`useInput`、`useSession`、`useProjection`、`useTrajectory`

同源、同一 JS realm、与应用同等权限。**可以**在里面嵌 iframe，但那是自愿选择，不是机制强加。

### 5.5 两阶段注册

```js
// 阶段一：声明 —— 谁处理这个 kind，标签上写什么
ctx.effect(
  () => ctx.sidebarRightTabs.register({
    id: 'dsh-to-chinese',
    kind: 'to-chinese',
    title: () => t('tabTitle'),
  }),
  'to-chinese tab type',
)

// 阶段二：实现 —— 画这个 body 的组件
ctx.slots.inject('sidebar.right.pane.tab', () =>
  ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: 'dsh-to-chinese' },
    TranslateTab,
  ),
)
```

**两段之间只有一个字符串 `'dsh-to-chinese'`。**

这意味着侧边栏代码**从不 import 本插件**。面板渲染时做的是：查 `tab.kind` 现在归哪个 id 管 → 用那个 id 去 keyed 座位查表 → 渲染查到的组件。它根本不知道插件是谁。

这就是**解耦**：可以随时换掉组件实现，只要 id 与座位契约不变。

`ctx.effect` 不是装饰：它表示「这段注册的生命周期与插件绑定」。插件卸载时返回值（注册函数给的 disposer）被调用，座位自动空出。**这也是客户端 HMR 重载不会残留两份注册的原因**——框架里同一 id 注册两次会直接抛错，所以这个保护是必需的。

---

## 6. Host 半边

### 6.1 注册路由

```js
ctx.effect(
  () => ctx.webServer.register({
    kind: 'exact',
    path: '/to-chinese/translate',
    handler,
  }),
  'to-chinese translate route',
)
```

非 `POST` 返回 405，地址非法返回 400，会话或文件不存在返回 404，其余错误返回 500。

### 6.2 一次请求的完整链路

```
地址字符串
  → parseFileAddress()                          拆成 { scope, sessionId, path }
  → ctx.sessions.get(sessionId).header.cwd      拿会话工作目录
  → ctx.fs.resolve(path, { cwd })               解析成真实路径
  → ctx.fs.stat(target)                         确认存在
  → ctx.fs.readText(target)                     读全文
  → translateBilingual(...)                     调模型
  → chineseSiblingPath(path)                    算出 foo-cn.md
  → ctx.sandboxPolicy.resolve({ session })      ★ 拿沙箱策略
  → ctx.fs.writeText(target, text, …, policy)   ★ 写，带策略
  → 返回 { ok, address: 新地址, path, bytes }
```

**每一步都在 Host，客户端一个都没参与。** 尤其带 ★ 的两步——写文件必须过沙箱策略与审批，这是 Host 的权威，客户端碰不到。

地址有两种作用域：

- `dsh-resource://file/session/<sessionId>/<相对路径>` —— 相对会话工作目录
- `dsh-resource://file/absolute/<绝对路径>`

### 6.3 调模型

走 `ctx.llm.stream()`，参数从 `ctx.agentDefaultModel.currentSelection()` 取（即模型选择器里选的那个），所以用的是用户自己的配置，不需要额外配 key。收集 `text-delta`，遇到 `finish` 且 reason 是 `error`/`aborted` 就抛错。

---

## 7. 双语对照与结构保护

### 7.1 问题

直接让模型「把这段翻译成中英对照」有隐患：**模型会顺手改掉不该改的东西**——翻译代码块里的标识符、改 YAML 的 key、吃掉围栏标记。

### 7.2 解法：把危险区域「抽走」

翻译前先把两类内容**从文档里挖出来**，换成占位符：

```
原文                                发给模型的内容
---                                 <!--KEEP:0-->
name: to-prd                        （模型看不到）
---                                 
                                    # The heading
# The heading                       
                                    The problem the user is facing...
The problem the user is facing...   
                                    <!--KEEP:1-->
```js                                 
const a = 1                         
```                                 
```

代码块与 front matter 被换成 `<!--KEEP:n-->`（HTML 注释，在 Markdown 里惰性，不渲染出东西）。模型收到的是**已不含危险内容**的版本，想改也改不到。

翻完再**原位还原**，并校验：**每个占位符必须出现且只出现一次**。少一个或多一个 → 直接报错，不写文件。

> 宁可失败，也不要写出一份被悄悄改烂的文档。

占位符匹配是**容错的**（允许 `<!--  KEEP : 0  -->` 这种内部空格），因为模型偶尔会自己加空格。

### 7.3 这里踩过一个真 bug

写了个往返测试（protect → restore，结果必须与原文**逐字节相同**），第一次跑就红了。

原因：处理代码块的**结束围栏**时，把「缓冲区」内容**输出**了一遍，又把同样内容**登记为受保护区域**——于是代码块在结果里出现两次（一次原样、一次占位符）。

修复是一行：`flushProse()`（吐出去）改成 `buffer = []`（吃掉）。

**教训**：这种「收集-输出」逻辑里，`flush` 和 `consume` 是两种完全相反的语义，极易混淆。没有往返测试的话，这个 bug 会以「偶尔多一段代码」的形式漂到线上，而且看起来像模型抽风，极难定位。

---

## 8. 三态设计

### 8.1 演进

- **第一版**：右下角小胶囊显示全部三态
- **现在**：进度与结果都在 tab 里，胶囊降级成兜底

### 8.2 为什么改

原话点破了关键：**用户的视线在右边栏，反馈却出现在屏幕右下角，眼睛要跑一趟。**

### 8.3 流程

```
点击菜单
  → dismiss()                                    立刻关菜单（契约要求）
  → openTab('to-chinese', { params: { address } })
     ↓
  新 tab 出现，body 挂载，读 tab.navigation.params.address
     ↓
  显示「翻译中…」+ 呼吸动画 + 文件名
     ↓
  fetch POST /to-chinese/translate
     ↓
  ┌─ 成功 → tab.actions.openResource(成果地址, { replaceTab: true })
  │        → 新文档 tab 占用当前位置，本 tab 消失
  └─ 失败 → 原地显示「翻译失败 + 原因 + 重试按钮」
```

`replaceTab: true` 是关键：它让新标签页**占用当前标签页的位置并关掉它**。用户视角就是「同一个 tab 刷成了成果」，而且成果是一个**正经的文档标签页**——带路径头、换行开关、查看器菜单，不必自己画 Markdown 渲染器。

### 8.4 为什么失败要留在 tab 里

如果失败时关掉 tab 再弹提示，用户就失去上下文（哪个文件、什么原因）。留在原地还能挂**重试按钮**——这是角落 toast 做不到的。

而且最关键：**翻译成功之前，磁盘上什么都没有。**

曾考虑过「先写个占位文件再刷新 tab」的做法（靠 `navigation.revision` 递增让 body 重读资源），但那样：

- 翻译还没开始，用户工作目录里就多了一个文件
- 失败时要么把错误写进 `-cn.md`，要么删掉让 tab 显示「文件不存在」
- 进程中途挂掉会留残骸

**UI 状态不该持久化进用户的工作目录。**

### 8.5 兜底胶囊

只在 `openTab` 抛错（座位没注册等接线故障）时出现，否则不参与。这样「连 tab 都开不起来」的失败也有地方显示，而不是静默无反应。

---

## 9. 代码地图

| 文件 | 作用 |
|---|---|
| [package.json](package.json) | bundle 清单：`dsh.bundle.patch` 指向补丁，`dsh.client` 声明客户端半边入口 |
| [cordis.patch.yml](cordis.patch.yml) | 插入插件行：`{ id: to-chinese, name: 'dsh-to-chinese' }` |
| [index.js](index.js) | **Host 半边**：路由、地址解析、结构保护、调模型、写文件 |
| [client.js](client.js) | **Client 半边**：菜单项、page tab 类型与 body、兜底胶囊 |

### `index.js` 导出

| 名称 | 说明 |
|---|---|
| `name` | Cordis 插件名 |
| `inject` | 依赖服务：`webServer`、`fs`、`sessions`、`sandboxPolicy`、`llm`、`agentDefaultModel` |
| `TRANSLATE_PATH` | `/to-chinese/translate` |
| `parseFileAddress(address)` | 解析 `dsh-resource://file/…` → `{ scope, sessionId?, path }` |
| `chineseSiblingPath(path)` | `foo/bar.md` → `foo/bar-cn.md` |
| `chineseSiblingAddress(address)` | 地址层面同样处理，保留编码与作用域 |
| `protectVerbatim(source)` | 抽出 front matter 与代码块 → `{ text, values }` |
| `restoreVerbatim(text, values)` | 还原并校验，占位符丢失/重复则抛错 |
| `apply(ctx)` | 挂载路由 |

后四个纯函数**不依赖 Cordis**，可以直接用 Node 单测。

### `client.js` 内部结构

| 名称 | 说明 |
|---|---|
| `TranslateBadge` | 翻译徽标：圆角方块 + 挖空的「文」「A」（SVG mask，跟随 `currentColor`） |
| `TabMenuEntry` | 菜单行；读 `tab.contentId` 决定显不显示 |
| `TranslateTab` | tab body；`props.useTabInfo()` 拿 `tab`，跑任务，成功后 `replaceTab` |
| `FallbackPill` | 兜底错误胶囊 |
| `createErrorStore` | 极简可观察 store，兜底胶囊读它 |
| `CSS` | 全部样式；菜单行照抄设计系统 `Menu.module.css` 的 `.item` |

---

## 10. 验证状态

### 已实测

- Host 路由端到端跑通，双语格式正确（2453 字节，英文原文与中文译文逐句交替）
- 占位符机制正反用例都验过：往返逐字节一致；丢失/重复会被拦下；内部空格容错有效
- 三个座位注册全部生效（`sidebar.right.pane.tab` 占位者含 `dsh-to-chinese`）
- 契约均读源码确认：`openTab(kind, options = {})` 是服务方法；`sidebarRightTabs` 是合法 inject 名（documentpreview 自己就声明了）；`useTabInfo` **以 prop 注入**
- `node --check` 通过

### 未验证

开发环境没有浏览器控制能力，以下靠用户实测：

1. 点击后的完整流程（菜单 → tab → 翻译 → 换成文档 tab）
2. **`replaceTab` 的去重边界**——若 `-cn.md` 已经开着，框架可能优先聚焦那个已存在的 tab
3. tab 内进度界面的实际观感

---

## 11. 已知限制

1. **同一时间只有一个翻译 tab**。page tab 默认按 kind 在面板内去重，翻译 A 时去翻 B 会复用该 tab（`params` 更新、`revision` +1，body 跟着重跑），不会开第二个。需要并行的话给类型注册加 `multiple: true`
2. **刷新页面会重启未完成的翻译**。布局持久化在 localStorage，body 重新挂载。加个 sessionStorage 标记即可改成「显示重试按钮」
3. **tab 标题是静态的「翻译」**，没显示文件名。`sidebar.right.pane.tab.title` 座位能拿到 `useTabInfo`，想做可以十几行加上
4. **Host 抛的错是英文**，失败界面会中英混排
5. **front matter 与代码块不翻译**（设计如此）。若想让 SKILL.md 的 `description` 也翻译，需要把 front matter 从保护列表里拿出来单独处理
6. **文件名仍是 `-cn.md`**，但内容已经是双语的
7. 文档超过 120000 字符会被拒绝，而不是截断

---

## 12. 学习笔记：五个反直觉的坑

### 12.1 `host.call` 是个陷阱

客户端 Builtin 列表里有个 `host.call(method, args)`，看着就是「调用我的 Host 半边」，非常诱人。但它**只属于动态 Cordis 包**（`cordis_define`/`cordis_run` 那套，Host 半边跑在 `node:vm` 里，用 `harness.handle()` 注册处理器）。官方 Creator 流程用的是**已安装 bundle**，是另一套机制。容易在这上面绕圈。

### 12.2 「热重载」有两个层次，默认只开了一个

见 [第 3 节](#3-安装卸载与开发)：`dsh-base` 把 HMR 的 `root` 配成 `[]`——**配置改了热重载，模块源码改了不会**。所以改 `index.js` 不生效，得重启。

当时是靠**调接口发现输出还是旧格式**才定位到的，而不是读代码。**看现象比看代码更重要。**

### 12.3 浏览器端与 Host 端的「重载」完全无关

Client 半边按请求从磁盘读（`?rev=<内容+mtime哈希>`），改完刷新页面即可。Host 半边在 Node 的 ESM 模块缓存里，要重新 import。两件事机制完全不同，极易混为一谈。

### 12.4 客户端 inspect 会挂起等页面

`cordis_inspect_query` 查 Client 平台时会**等浏览器页面回话**，页面不回就一直挂着直到被取消，而且是**逐方法不同**的：`Slots.listSubTree` 可靠，`Service.listService` 会挂。

**很多时候直接 grep 源码几秒就拿到答案了。**

### 12.5 两个半边不一定在同一台机器

web server 默认绑 `127.0.0.1`，但配置允许 `0.0.0.0`（文档明说这是「故意的网络暴露」）——那就是「dsh 跑在远端开发机、你在笔记本上开 GUI」的场景。Electron 里更是走 IPC 而非 HTTP。

所以客户端用的是**相对 URL** `fetch('/to-chinese/translate')`，永远打向「给我这个页面的那个 origin」，跨机器照样能用。若在客户端写死 `127.0.0.1:3080` 立刻就崩。

---

## 相关外部契约

| 契约 | 来源 |
|---|---|
| `sidebar.right.tab.menu.item` / `sidebar.right.pane.tab` / `shell.overlay` | `@deepseek-ai/dsh-client-ui-sidebar-right`、`dsh-client-ui-slots` |
| `ctx.sidebarRight.openTab` / `openResource` | `@deepseek-ai/dsh-client-ui-sidebar-right` |
| `ctx.sidebarRightTabs.register` | 同上（README「A tab type registers in two stages」） |
| `ctx.webServer.register` | `@deepseek-ai/dsh-host-webserver` |
| `ctx.fs` / `ctx.sandboxPolicy` / `ctx.llm` | `dsh-fs` / `dsh-sandbox-policy` / `dsh-llm` |
| `Menu.module.css` | `@deepseek-ai/dsh-client-ui-primitives` |
| HMR 配置 | `@deepseek-ai/dsh-hmr` README + `dsh-base/cordis.patch.yml` |

---

## License

[MIT](LICENSE) © 2026 Ganttfly
