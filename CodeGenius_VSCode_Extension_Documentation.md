# CodeGenius VSCode Extension 文档

## 概述

CodeGenius 是一个 VSCode 扩展，提供 AI 驱动的 Python 开发助手。它集成了大型语言模型（LLM）来帮助开发者生成代码、解答问题和提供编程建议。扩展支持流式响应、会话持久化和工作区集成。

## 架构设计

扩展采用模块化架构，主要包含以下组件：

- **Extension 主入口** (`extension.ts`)：注册命令和视图提供者
- **视图提供者** (`CodeGeniusViewProvider.ts`)：实现侧边栏视图
- **Webview 面板** (`CodeGeniusPanel.ts`)：实现独立面板视图（向后兼容）
- **AI 代理** (`CodeGeniusAgent.ts`)：封装 AI 交互逻辑
- **会话管理** (`SessionManager.ts`)：管理聊天历史的持久化
- **Python 后端** (`PythonBackend.ts`)：调用 Python 脚本执行 AI 任务

## 核心组件详解

### 1. Extension 主入口 (`extension.ts`)

负责扩展的激活和命令注册：

- **`activate()`**: 
  - 注册 `CodeGeniusViewProvider` 作为侧边栏视图提供者
  - 注册 `codegenius.start` 命令用于打开独立面板
  - 注册 `codegenius.configure` 命令用于打开设置

- **命令**:
  - `codegenius.start`: 启动 AI 助手（独立面板模式）
  - `codegenius.configure`: 打开扩展设置

### 2. CodeGeniusViewProvider (`CodeGeniusViewProvider.ts`)

实现 VSCode 侧边栏视图，提供主要的用户交互界面：

**主要功能**:
- 自动初始化（工作区打开时）
- 配置读取（从 VSCode 设置）
- 会话加载和保存
- 流式消息处理
- 暂停/继续流式输出
- 会话清除

**消息处理**:
- `sendMessage`: 处理用户消息
- `initializeAgent`: 初始化 AI 代理
- `loadSession`: 加载会话历史
- `clearSession`: 清除会话
- `togglePause`: 切换暂停状态

**会话管理**:
- 使用 `SessionManager` 持久化聊天历史
- 用户消息立即保存
- AI 响应完成后保存完整消息
- 错误消息也会被保存

### 3. CodeGeniusPanel (`CodeGeniusPanel.ts`)

提供独立的 Webview 面板（向后兼容），功能相对简化：

**特点**:
- 单例模式（`currentPanel`）
- 基本的流式消息处理
- 暂停/继续功能
- 会话清除（仅前端清除）

**与 ViewProvider 的区别**:
- 不支持会话持久化
- 配置在创建时传入，不自动重新加载
- 功能较为基础

### 4. CodeGeniusAgent (`CodeGeniusAgent.ts`)

AI 代理的核心封装：

**构造函数参数**:
- `apiKey`: LLM API 密钥
- `baseUrl`: LLM API 基础 URL
- `modelName`: 使用的模型名称
- `systemPrompt`: 系统提示词
- `projectDir`: 项目目录

**主要方法**:
- `chat()`: 与 AI 代理对话，支持流式回调
  - `onToken`: 流式 token 回调
  - `onSystemMessage`: 系统消息回调（仅 ViewProvider 使用）

**内部实现**:
- 使用 `OpenAILLM` 作为 LLM 客户端
- 使用 `PythonProgrammerAgent` 作为具体代理实现
- 自动创建日志目录

### 5. SessionManager (`SessionManager.ts`)

负责聊天会话的持久化管理：

**数据结构**:
```typescript
interface ChatMessage {
    role: 'user' | 'ai' | 'error';
    content: string;
    timestamp: number;
}
```

**主要方法**:
- `saveSession()`: 保存会话到 `.codegenius_session.json`
- `loadSession()`: 从文件加载会话
- `clearSession()`: 删除会话文件
- `getSessionFilePath()`: 获取会话文件路径

**文件位置**: 工作区根目录下的 `.codegenius_session.json`

### 6. PythonBackend (`PythonBackend.ts`)

用于调用 Python 后端脚本（注：当前代码中未实际使用）：

**功能**:
- 通过子进程调用 Python 脚本
- 支持流式输出处理
- Python 环境验证

**注意**: 当前实现中，`CodeGeniusAgent` 直接使用 TypeScript 实现的 `PythonProgrammerAgent`，而不是通过 `PythonBackend` 调用外部 Python 脚本。

## 配置选项

扩展支持以下 VSCode 设置：

- **`codegenius.apiKey`**: LLM API 密钥（必需）
- **`codegenius.baseUrl`**: LLM API 基础 URL（默认: `https://api.openai.com/v1`）
- **`codegenius.modelName`**: 模型名称（默认: `gpt-4o-mini`）
- **`codegenius.systemPrompt`**: 系统提示词

## 使用流程

1. **安装扩展**: 从 VSCode 扩展市场安装 CodeGenius
2. **配置设置**: 
   - 打开 VSCode 设置 (`Ctrl+,`)
   - 搜索 "codegenius"
   - 配置 API 密钥和其他选项
3. **打开工作区**: 确保已打开一个文件夹作为工作区
4. **使用助手**:
   - **侧边栏方式**: 在侧边栏找到 CodeGenius 视图
   - **面板方式**: 执行 `CodeGenius: Start` 命令

## 功能特性

### 流式响应
- 实时显示 AI 生成的每个 token
- 支持暂停/继续流式输出
- 新消息可中断当前流式响应

### 会话管理
- 自动保存聊天历史到工作区
- 重启 VSCode 后自动恢复会话
- 支持手动清除会话历史

### 错误处理
- 网络错误和 API 错误的友好提示
- 错误消息也会被保存到会话中
- 配置验证（API 密钥、工作区等）

### 工作区集成
- 会话文件存储在工作区根目录
- 日志文件存储在工作区的 `log` 目录
- 支持多工作区独立会话

## 依赖关系

### TypeScript 依赖
- `vscode`: VSCode Extension API
- `fs`, `path`, `os`: Node.js 核心模块
- `child_process`: 用于 Python 后端调用（未使用）

### Python 依赖（间接）
- `OpenAILLM`: LLM 客户端实现
- `PythonProgrammerAgent`: 具体的 AI 代理实现
- `FileOperationHandler`: 文件操作工具

## 开发注意事项

### 文件结构
```
src/
├── CodeGeniusAgent.ts          # AI 代理封装
├── CodeGeniusPanel.ts          # 独立面板实现
├── CodeGeniusViewProvider.ts   # 侧边栏视图提供者
├── PythonBackend.ts            # Python 后端调用（未使用）
├── SessionManager.ts           # 会话管理
└── extension.ts                # 扩展主入口
```

### Webview 资源
- HTML/CSS/JS 文件位于 `media/` 目录
- 通过 `webview.asWebviewUri()` 加载本地资源
- 启用脚本执行 (`enableScripts: true`)

### 安全考虑
- 本地资源限制 (`localResourceRoots`)
- API 密钥存储在 VSCode 设置中
- 会话文件存储在工作区目录

## 调试信息

扩展包含详细的控制台日志，用于调试：

- 会话加载/保存状态
- 消息接收和处理
- 错误详细信息
- 流式响应状态

日志前缀说明：
- `✅`: 成功操作
- `❌`: 错误操作  
- `📥`: 数据加载
- `💾`: 数据保存
- `🗑️`: 清除操作
- `🔍`: 消息处理
- `📁`: 文件操作

## 未来改进方向

1. **性能优化**: 实现真正的流式中断（取消后端请求）
2. **多工作区支持**: 更好的多根工作区处理
3. **自定义提示词**: 支持用户自定义系统提示词模板
4. **代码高亮**: 在聊天界面中支持代码语法高亮
5. **文件上传**: 支持上传文件供 AI 分析
6. **多模型支持**: 支持不同 LLM 提供商

## 版本兼容性

- **VSCode 版本**: 需要支持 Webview View API 的版本
- **Node.js 版本**: 使用 VSCode 内置的 Node.js 环境
- **Python 版本**: 如果使用 Python 后端，需要 Python 3.7+