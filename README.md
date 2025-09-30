# CodeGenius AI VS Code Extension

This extension brings the functionality of the CodeGenius AI desktop application into VS Code, allowing you to interact with an AI programming assistant directly within your development environment.

## Features

- AI-powered Python programming assistance
- Stream responses from the AI agent
- Full file operation support (create, read, update, delete files)
- Configurable API settings (API key, base URL, model)
- Customizable system prompt
- Integrated chat interface
- Automatic log file creation
- Support for complex multi-step operations
- **Pure TypeScript implementation** - No Python dependency required!

## Requirements

- VS Code 1.85.0 or higher
- Node.js 18+ (for development)
- OpenAI-compatible API key
- Internet connection for API calls

## Setup

### 1. Install Dependencies

Navigate to the `vscode-extension` directory and install dependencies:

```bash
npm install
```

### 2. Build the Extension

Compile the TypeScript code:

```bash
npm run compile
```

### 3. Configure the Extension

1. Open VS Code settings (Ctrl+, or Cmd+,)
2. Search for "CodeGenius"
3. Configure the following settings:
   - `codegenius.apiKey`: Your OpenAI API key
   - `codegenius.baseUrl`: Base URL for the LLM API (default: https://api.openai.com/v1)
   - `codegenius.modelName`: Model name to use (default: gpt-4o-mini)
   - `codegenius.systemPrompt`: System prompt for the AI agent

### 4. Start Using

1. Open a workspace folder in VS Code
2. Run the "CodeGenius: Start AI Assistant" command from the command palette (Ctrl+Shift+P or Cmd+Shift+P)
3. Start sending programming tasks to the AI assistant

## Usage

Once started, you can:
- Send programming tasks to the AI assistant
- Receive streaming responses with real-time token updates
- View generated code and file operations
- The AI will automatically create the necessary directory structure and files
- Log files will be created in the `log/` directory of your workspace

## File Operations Support

The AI agent supports the following file operations through structured XML-like tags:

- `<create_file path="relative/path">content</create_file>`
- `<read_file path="filename" />`
- `<update_file path="relative/path">new content