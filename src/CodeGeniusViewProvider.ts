import * as vscode from 'vscode';
import * as path from 'path';
import { CodeGeniusAgent } from './CodeGeniusAgent';
import { SessionManager, ChatMessage } from './SessionManager';

export class CodeGeniusViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codegeniusView';
    
    private _view?: vscode.WebviewView;
    private _agent: CodeGeniusAgent | undefined;
    private _sessionManager: SessionManager | undefined;
    private _messages: ChatMessage[] = [];
    private _currentAiMessage: string = '';
    private _isStreaming: boolean = false;
    private _isPaused: boolean = false;
    private _currentChatPromise: Promise<void> | null = null;
    private _currentAbortController: AbortController | null = null;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                console.log('🔍 Backend received message:', message.command, message);
                switch (message.command) {
                    case 'sendMessage':
                        await this._handleUserMessage(message.text);
                        return;
                    case 'initializeAgent':
                        await this._initializeAgent();
                        return;
                    case 'loadSession':
                        await this._loadSession();
                        return;
                    case 'clearSession':
                        console.log('🗑️ Clear session command received from frontend');
                        await this._clearSession();
                        return;
                    case 'togglePause':
                        await this._togglePause();
                        return;
                    case 'abortCurrentChat':
                        this._abortCurrentChat();
                        return;
                }
            }
        );

        // Initialize when view is resolved
        this._initializeView();
    }

    private async _initializeView() {
        if (!vscode.workspace.workspaceFolders) {
            this._showErrorMessage('请先打开一个工作区文件夹。');
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
        this._sessionManager = new SessionManager(workspaceFolder);
        
        // Load session immediately
        await this._loadSession();
        
        // Initialize agent
        await this._initializeAgent();
    }

    private async _initializeAgent() {
        if (this._agent) {
            return;
        }

        const config = vscode.workspace.getConfiguration('codegenius');
        const apiKey = config.get<string>('apiKey') || '';
        const baseUrl = config.get<string>('baseUrl') || 'https://api.openai.com/v1';
        const modelName = config.get<string>('modelName') || 'gpt-4o-mini';
        const systemPrompt = config.get<string>('systemPrompt') || '';

        if (!apiKey || apiKey === 'YOUR_API_KEY') {
            this._showErrorMessage('请先在设置中配置您的 API 密钥。');
            return;
        }

        if (!vscode.workspace.workspaceFolders) {
            this._showErrorMessage('请先打开一个工作区文件夹。');
            return;
        }

        const projectDir = vscode.workspace.workspaceFolders[0].uri.fsPath;

        try {
            this._agent = new CodeGeniusAgent(apiKey, baseUrl, modelName, systemPrompt, projectDir);
        } catch (error) {
            this._showErrorMessage(`初始化失败: ${error}`);
        }
    }

    private async _loadSession() {
        if (!this._sessionManager) {
            console.log('❌ No session manager available');
            return;
        }

        try {
            this._messages = await this._sessionManager.loadSession();
            this._view?.webview.postMessage({ 
                command: 'loadSession', 
                messages: this._messages 
            });
            console.log('✅ Session loaded in view provider:', this._messages.length, 'messages');
        } catch (error) {
            console.error('❌ Failed to load session in view provider:', error);
        }
    }

    private async _clearSession() {
        if (!this._sessionManager) {
            console.log('❌ No session manager available for clearing');
            return;
        }

        try {
            // Clear the session file
            await this._sessionManager.clearSession();
            
            // Clear local messages array
            this._messages = [];
            this._currentAiMessage = '';
            
            // Notify webview to clear display
            this._view?.webview.postMessage({ 
                command: 'clearSession' 
            });
            
            // Show success message
            vscode.window.showInformationMessage('会话历史已清除');
            console.log('✅ Session cleared successfully');
        } catch (error) {
            console.error('❌ Failed to clear session:', error);
            this._showErrorMessage('清除会话失败');
        }
    }

    private async _togglePause(): Promise<void> {
        if (!this._agent || !this._isStreaming) {
            return;
        }
        
        this._isPaused = !this._isPaused;
        this._agent.setPaused(this._isPaused);
        
        this._view?.webview.postMessage({ 
            command: 'pauseToggled', 
            isPaused: this._isPaused 
        });
        
        console.log(`⏸️ Pause toggled: ${this._isPaused}`);
    }

    // Helper function to check if error is an abort error
    private isAbortError(error: any): boolean {
        if (!error) return false;
        
        // Check for AbortError name
        if (error.name === 'AbortError') return true;
        
        // Check for DOMException with ABORT_ERR code (code 20)
        if (error instanceof DOMException && error.code === 20) return true;
        
        // Check for common abort error messages
        const abortMessages = ['abort', 'aborted', 'cancel', 'cancelled'];
        const errorMessage = error.message?.toLowerCase() || '';
        return abortMessages.some(msg => errorMessage.includes(msg));
    }

    private _abortCurrentChat(): void {
        if (this._currentAbortController) {
            this._currentAbortController.abort();
            this._currentAbortController = null;
        }
        if (this._agent && typeof this._agent.abortCurrentChat === 'function') {
            this._agent.abortCurrentChat();
        }
        this._isStreaming = false;
        this._isPaused = false;
        this._currentAiMessage = '';
        this._view?.webview.postMessage({ command: 'endStream' });
        this._view?.webview.postMessage({ command: 'clearCurrentResponse' });
        console.log('✅ Current chat aborted successfully');
    }

    private async _handleUserMessage(text: string) {
        if (!this._agent) {
            await this._initializeAgent();
            if (!this._agent) {
                return;
            }
        }

        // If there's an ongoing chat, interrupt it properly
        if (this._isStreaming) {
            console.log(' INTERRUPTION: New message received while streaming, interrupting current response');
            
            // Properly abort the current AI request
            this._abortCurrentChat();
        }

        // Add user message to local messages array immediately
        const userMessage: ChatMessage = {
            role: 'user',
            content: text,
            timestamp: Date.now()
        };
        this._messages.push(userMessage);

        // Save session immediately after adding user message
        if (this._sessionManager) {
            await this._sessionManager.saveSession(this._messages);
            console.log('✅ User message saved immediately');
        }

        // Add user message to webview
        this._view?.webview.postMessage({
            command: 'addUserMessage',
            text: text
        });

        try {
            // Reset current AI message and streaming state
            this._currentAiMessage = '';
            this._isStreaming = true;
            this._isPaused = false;
            
            // Ensure agent is not paused
            this._agent.setPaused(false);
            
            // Create new AbortController for this chat
            this._currentAbortController = new AbortController();
            
            // Stream response from agent
            const chatPromise = this._agent.chat(
                text, 
                (token) => {
                    // The agent's BaseAgent will handle pause state internally
                    // We don't need to check _isPaused here anymore
                    this._currentAiMessage += token;
                    this._view?.webview.postMessage({ command: 'addStreamToken', token });
                }, 
                (systemMessage) => {
                    // Handle system messages separately - add as system messages to chat
                    const systemMsg: ChatMessage = {
                        role: 'ai',
                        content: systemMessage,
                        timestamp: Date.now()
                    };
                    this._messages.push(systemMsg);
                    this._view?.webview.postMessage({ command: 'addSystemMessage', text: systemMessage });
                },
                this._currentAbortController.signal
            );

            this._currentChatPromise = chatPromise;
            await chatPromise;
            this._currentChatPromise = null;
            this._currentAbortController = null;

            // Add complete AI response to messages (excluding system messages which are already added)
            const aiMessage: ChatMessage = {
                role: 'ai',
                content: this._currentAiMessage,
                timestamp: Date.now()
            };
            this._messages.push(aiMessage);

            // Save session with complete AI response
            if (this._sessionManager) {
                await this._sessionManager.saveSession(this._messages);
                console.log('✅ Complete AI response saved');
            }

            this._view?.webview.postMessage({ command: 'endStream' });
            this._isStreaming = false;
        } catch (error) {
            // Check if error is due to abortion
            if (this.isAbortError(error)) {
                console.log('Chat was aborted, not treating as error');
                this._isStreaming = false;
                this._currentChatPromise = null;
                this._currentAbortController = null;
                return;
            }
            
            const errorMessage: ChatMessage = {
                role: 'error',
                content: `错误: ${error}`,
                timestamp: Date.now()
            };
            this._messages.push(errorMessage);
            
            if (this._sessionManager) {
                await this._sessionManager.saveSession(this._messages);
                console.log('✅ Error message saved');
            }
            
            this._view?.webview.postMessage({ command: 'addErrorMessage', text: `错误: ${error}` });
            this._isStreaming = false;
            this._currentChatPromise = null;
            this._currentAbortController = null;
        }
    }

    private _showErrorMessage(message: string) {
        this._view?.webview.postMessage({ command: 'addErrorMessage', text: message });
        vscode.window.showErrorMessage(message);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>CodeGenius AI</title>
        </head>
        <body>
            <div id="chat-container">
                <div id="chat-header">
                    <div class="header-content">
                        CodeGenius AI
                        <div class="header-buttons">
                            <button id="stop-btn" title="暂停/继续流式输出" style="display: none;">⏹️</button>
                            <button id="clear-session-btn" title="清除会话历史">🗑️</button>
                        </div>
                    </div>
                </div>
                <div id="chat-messages"></div>
                <div id="input-area">
                    <textarea id="user-input" placeholder="请输入您的Python开发需求..."></textarea>
                    <button id="send-button">发送</button>
                </div>
            </div>
            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}