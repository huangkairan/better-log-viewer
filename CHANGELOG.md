# Changelog

所有对此项目的重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且此项目遵循 [语义版本控制](https://semver.org/spec/v2.0.0.html)。

## [Unreleased]

### 新增
- 初始版本的 Better Log Viewer
- 支持拖拽和选择日志文件
- ANSI 转义序列自动清理
- 搜索功能，支持关键词高亮显示
- 按日期分组的历史记录管理
- 多级日志过滤（ERROR, WARN, INFO, DEBUG）
- 明暗主题切换
- 多平台图标支持

### 技术特性
- 使用 Tauri 2.0 + Rust 后端
- 前端使用原生 JavaScript + CSS
- 支持正则表达式日志解析
- 本地历史记录存储
- 响应式界面设计

## [0.1.0] - 2024-09-02

### 新增
- 初始发布版本