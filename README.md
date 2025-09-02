# Better Log Viewer

一个基于 Rust + Tauri 的桌面端日志查看工具，专门用于查看和分析包含 ANSI 转义序列的日志文件。

## 功能特性

- **文件操作**
  - 支持拖拽日志文件到窗口直接打开
  - 支持通过文件选择器打开日志文件
  - 自动保存历史记录，方便快速访问最近查看的文件

- **日志解析**
  - 自动识别并处理 ANSI 转义序列（终端颜色代码）
  - 智能识别日志级别（ERROR、WARN、INFO、DEBUG、TRACE）
  - 自动提取时间戳和 JSON 格式的元数据
  - 支持多种日志格式

- **界面功能**
  - 实时搜索：快速查找日志内容
  - 级别过滤：按日志级别筛选显示
  - 统计信息：实时显示各级别日志数量
  - 主题切换：支持亮色/暗色主题
  - 响应式设计：适配不同屏幕尺寸

## 开发环境准备

### 安装依赖

1. 安装 Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. 安装 pnpm
```bash
npm install -g pnpm
```

3. 安装项目依赖
```bash
cd better-log-viewer
pnpm install
```

## 开发调试

```bash
pnpm tauri dev
```

这将启动开发服务器，自动打开应用窗口，支持热重载。

## 构建发布

### 构建应用

```bash
pnpm tauri build
```

构建完成后，可执行文件将生成在 `src-tauri/target/release/bundle/` 目录下：

- **macOS**: `bundle/macos/Better Log Viewer.app`
- **Windows**: `bundle/msi/` 或 `bundle/nsis/` 目录下的安装程序
- **Linux**: `bundle/deb/` 或 `bundle/appimage/` 目录下的安装包

### 直接运行可执行文件

如果只需要可执行文件而不需要安装包：

```bash
cargo build --release --manifest-path src-tauri/Cargo.toml
```

可执行文件位置：
- **macOS/Linux**: `src-tauri/target/release/better-log-viewer`
- **Windows**: `src-tauri/target/release/better-log-viewer.exe`

## 使用说明

1. **打开日志文件**
   - 方法一：拖拽日志文件到应用窗口
   - 方法二：点击 "Open File" 按钮选择文件
   - 方法三：从历史记录中选择最近打开的文件

2. **搜索和过滤**
   - 在搜索框输入关键词进行实时搜索
   - 勾选/取消勾选日志级别进行过滤
   - 查看顶部统计栏了解日志分布

3. **主题切换**
   - 点击右上角的月亮/太阳图标切换主题

## 支持的日志格式

- 标准文本日志
- JSON 格式日志
- 带 ANSI 转义序列的终端输出
- 带行号前缀的日志（如 "5→"）
- 多种时间戳格式

## 技术栈

- **后端**: Rust + Tauri
- **前端**: Vanilla JavaScript + Vite
- **样式**: 原生 CSS（支持暗色模式）

## 许可证

MIT