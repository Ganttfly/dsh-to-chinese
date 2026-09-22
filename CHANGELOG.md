# Changelog

本文件记录本项目的所有重要变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
