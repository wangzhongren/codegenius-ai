# 项目摘要：CodeGenius AI VS Code扩展

## 项目概述
CodeGenius AI VS Code扩展将桌面端AI编程助手功能集成到Visual Studio Code编辑器中，提供实时的AI编程支持。采用纯TypeScript开发，无需Python依赖，支持OpenAI兼容接口。

## 核心功能
### 🧠 AI编程辅助
- 提供AI驱动的Python开发支持
- 支持流式响应与实时token计数
- 自动创建文件和目录结构
- 支持复杂多步骤操作

### ⚙️ 高度配置化
- 自定义系统提示词（systemPrompt）
- 配置API参数：
  - API密钥（apiKey）
  - 基础URL（baseUrl）
  - 模型名称（modelName）
- 支持OpenAI接口自定义扩展

### 📁 文件操作支持
通过结构化XML标签实现：
- &lt;create_file path="relative/path"&gt;content&lt;/create_file&gt;
- &lt;read_file path="filename" /&gt;
- &lt;update_file path="relative/path"&gt;new content&lt;/update_file&gt;
- &lt;delete_file path="filename"&gt;&lt;/delete_file&gt;

## 使用指南
### ✅ 环境要求
- VS Code 1.85.0+
- Node.js 18+
- OpenAI兼容API密钥

### 📦 安装流程
1. 进入 `vscode-extension` 目录
2. 执行 `npm install` 安装依赖
3. 使用 `npm run compile` 编译TypeScript代码

### 🛠 配置方法
1. 打开VS Code设置 (Ctrl+, 或 Cmd+,)
2. 搜索 "CodeGenius"
3. 配置以下参数：
   - `codegenius.apiKey`: OpenAI API密钥
   - `codegenius.baseUrl`: LLM API基础地址（默认：https://api.openai.com/v1）
   - `codegenius.modelName`: 模型名称（默认：gpt-4o-mini）
   - `codegenius.systemPrompt`: 自定义系统提示词

### 🚀 使用流程
1. 打开工作区文件夹
2. 通过命令面板启动AI助手：`CodeGenius: Start AI Assistant`
3. 用自然语言发送编程任务
4. 实时接收代码生成与文件操作建议
5. 自动生成日志文件（存储在workspace的log目录）

## 技术特点
- 纯TypeScript实现，确保代码质量
- 支持结构化文件操作指令
- 模块化设计便于扩展维护
- 自动化日志记录系统
- 流式响应架构优化交互体验