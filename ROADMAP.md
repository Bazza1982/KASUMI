# KASUMI Platform — Product Roadmap

> 目标：从浏览器前端原型，演进为 AI 原生、企业级、可独立安装的桌面工作平台。
> 产品线：**KASUMI Nexcel**（Excel-like）+ **KASUMI WORDO**（Word-like）

---

## ✅ v1.0 — Nexcel 初始发布（已完成）

- ✅ Excel-like 网格引擎（虚拟滚动、冻结列、排序、搜索）
- ✅ 多种字段类型（文本、数字、日期、布尔、单选、多选）
- ✅ 键盘导航 + 范围选择 + 填充柄
- ✅ 剪贴板（支持从 Excel 粘贴整块）
- ✅ 导入 / 导出（CSV + XLSX）
- ✅ 撤销 / 重做（50 步）
- ✅ WebSocket 实时协作框架
- ✅ 访问模式（data-entry / analyst / admin）
- ✅ 77 个单元测试 + E2E 套件
- ✅ 企业级 Lint + Prettier + 错误边界

---

## ✅ v1.2-beta — KASUMI Platform + WORDO（已完成，2026-03-22）

> 目标：扩展为双 shell 平台，引入 WORDO 文档编辑器，统一品牌 UI。

### Platform 层（共享基础设施）
- ✅ `platform/` 共享层：object-registry, command-bus, access-control, realtime, baserow adapter
- ✅ Shell switcher：NEXCEL / WORDO 快速切换，持久化到 localStorage
- ✅ KASUMI 品牌 UI：Design Token 体系（CSS 变量）、启动 Splash 动画、统一 Switcher Wordmark

### KASUMI WORDO
- ✅ Section-per-instance ProseMirror 架构（每个 DocumentSection = 独立编辑器实例）
- ✅ Canonical Document IR（KasumiDocument → DocumentSection → AnyBlock）
- ✅ 完整 ProseMirror schema：段落、标题(H1-H6)、列表、表格、引用、代码、nexcel_embed
- ✅ 实时 Outline Panel（H1-H6 标题树，点击跳转）
- ✅ Header / Footer 编辑器（独立 ProseMirror 实例，含页码显示）
- ✅ 水印（文字、透明度、角度，绝对定位叠加层）
- ✅ 页面设置（A4/A3/Letter/Legal，横/纵向，页边距 mm 精确控制）
- ✅ Nexcel 数据嵌入：Snapshot / Live Link 模式，NexcelEmbedView NodeView
- ✅ .docx 导出（docx 库，所有节点类型映射，含页眉页脚）
- ✅ .docx 导入（mammoth → HTML → ProseMirror，多节支持）
- ✅ PDF 导出（浏览器打印窗口，`@media print` 分页）
- ✅ 访问控制：data-entry / analyst / admin，12 项 WORDO 专属能力
- ✅ 17 种类型化命令（InsertBlock, DeleteBlock, RewriteBlock, InsertNexcelEmbed 等）
- ✅ 89 个 WORDO 单元测试（accessStore + orchestrator + docxImporter + store + ribbon）

### 测试总计
- ✅ **166 个单元测试，全部通过**（77 Nexcel + 89 WORDO）

---

## 下一步 — v1.2 正式版（Electron 桌面打包）

> 目标：让 KASUMI Platform 成为可安装的 Windows 桌面应用。

- [ ] 集成 Electron + electron-builder
- [ ] 配置 Windows `.exe` 安装包（NSIS installer）
- [ ] 应用图标（KASUMI 品牌 Logo）
- [ ] 原生菜单栏（文件 / 编辑 / 视图 / 帮助）
- [ ] 原生文件对话框（导入/导出替代浏览器 download）
- [ ] 自动更新（electron-updater）
- [ ] 首次启动向导（连接 Baserow 实例）
- [ ] 打包体积优化（target < 150 MB）

---

## v1.3 — 企业级 UX 完善

- [ ] Dark Mode 支持（基于现有 CSS Token 体系扩展）
- [ ] 国际化框架（i18n，中英文切换）
- [ ] 全局快捷键文档（Cheatsheet 可导出）
- [ ] WORDO：目录自动生成（基于 H1-H3 大纲）
- [ ] WORDO：评论/批注层
- [ ] Nexcel：多表切换（Workbook tabs）
- [ ] 无障碍支持（WCAG 2.1 AA）

---

## v1.4 — Baserow 深度集成

- [ ] 真实 Baserow API 连接（Token 认证）
- [ ] Schema 变更流（新增字段需 admin 确认）
- [ ] 实时协作视觉提示（远端编辑高亮、用户头像）
- [ ] 冲突解决策略（last-write-wins / 显式合并）
- [ ] 离线缓存 + 重连自动同步

---

## v2.0 — AI 原生层（长期规划）

- [ ] 自然语言查询（「找出所有逾期任务」→ 自动过滤）
- [ ] AI 批量填充（选区 + 指令 → 自动生成数据）
- [ ] WORDO AI 重写 / 润色（RewriteBlockCommand）
- [ ] 异常检测高亮（AI 标记异常值）
- [ ] 数据摘要侧栏（AI 生成当前视图业务洞察）
- [ ] KASUMI POWERPOIT（演示文稿 shell，第三个产品线）

---

## 非技术建议

### 品牌
- ✅ KASUMI 品牌色盘已定义（CSS Design Tokens）
- ✅ 启动 Splash 页面已实现
- [ ] 设计正式 Logo SVG（替换文字 wordmark）

### 安全 & 合规
- [ ] 本地数据落盘加密（Electron safeStorage）
- [ ] API Token 存入系统 Keychain
- [ ] 审计日志（谁、何时、改了什么）

### 分发
- [ ] 内网离线安装包
- [ ] 企业 IT 静默部署（MSI）
- [ ] 用户手册 + 管理员配置指南

---

_Last updated: 2026-03-22_
