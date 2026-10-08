# Changelog

本文件记录本项目的所有重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 菜单新增「To Chinese」动作：只保留中文译文，写入 `-zh` 副本
- 两种译文各有独立的标签页类型，同一文件的「纯中文」与「中英对照」可以并排打开

### Changed

- 「翻译成中文（中英对照）」改名为「To Chinese (bilingual)」，行为不变（仍写 `-cn`），并排在「To Chinese」下面
- 菜单行样式改为照抄 dockkit 标签菜单自己的 `.menuItem`：与 Kit 自带的「Close」行完全同款（此前照抄的是另一套菜单单元格，行高、字号、圆角都偏大，且行内多一个图标）
- Host 侧 `chineseSiblingPath` / `chineseSiblingAddress` 泛化为 `siblingPath(path, suffix)` / `siblingAddress(address, suffix)`
- 翻译请求体新增 `mode` 字段；缺省仍是 `bilingual`，只发 `address` 的旧客户端行为不变

## [1.0.0] - 2026-09-18

首个公开版本。

### Added

- 右侧边栏文件标签页的 **⋯** 菜单中加入「翻译成中文（中英对照）」动作
- 生成中英逐句对照的 `-cn` 副本，并在同一个标签页位置打开
- 翻译过程中在标签页内显示进度，失败时原地显示原因与重试按钮
- 代码块与 YAML front matter 通过占位符机制原样保留，不参与翻译
- 占位符还原时校验「每个必须出现且只出现一次」，不通过则拒绝写文件
- 翻译成功前不向磁盘写入任何文件

### Notes

- 使用模型选择器中当前选定的模型，无需额外配置 API key
- 同一时间只保留一个翻译标签页；再次触发会复用该标签页
- 升级本插件后需要**重启 dsh** 才能加载新的 Host 端代码

[1.0.0]: https://github.com/Ganttfly/dsh-to-chinese/releases/tag/v1.0.0
