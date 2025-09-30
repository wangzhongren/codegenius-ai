import * as vscode from 'vscode';
import * as path from 'path';
import { CodeGeniusAgent } from './CodeGeniusAgent';

export class CodeGeniusPanel {
    public static currentPanel: CodeGeniusPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _agent: CodeGeniusAgent;
    private _disposables: vscode.Disposable[] = [];
    private _isStreaming: boolean = false;
    private _isPaused: boolean = false;
    private _currentChatPromise: Promise<void> | null = null;

    public static createOrShow(extensionUri: vscode.Uri, agent: CodeGeniusAgent) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (CodeGeniusPanel.currentPanel) {
            CodeGeniusPanel.currentPanel._panel.reveal(column);
            CodeGeniusPanel.currentPanel._agent = agent;
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'codegenius',
            'CodeGenius AI',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        CodeGeniusPanel.currentPanel = new CodeGeniusPanel(panel, extensionUri, agent);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, agent: CodeGeniusAgent) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._agent = agent;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'sendMessage':
                        this._handleUserMessage(message.text);
                        return;
                    case 'initializeAgent':
                        // Already initialized in extension.ts
                        return;
                    case 'clearSession':
                        // Handle clear session for panel (simple version)
                        this._panel.webview.postMessage({ command: 'clearSession' });
                        vscode.window.showInformationMessage('会话历史已清除');
                        return;
                    case 'togglePause':
                        this._isPaused = !this._isPaused;
                        this._panel.webview.postMessage({ 
                            command: 'pauseToggled', 
                            isPaused: this._isPaused 
                        });
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    private async _handleUserMessage(text: string) {
        // If there's an ongoing chat, we should interrupt it
        if (this._isStreaming) {
            console.log(' INTERRUPTION: New message received while streaming, interrupting current response');
            // Reset streaming state to allow new message
            this._isStreaming = false;
            this._isPaused = false;
            // Note: We can't actually cancel the backend AI request, but we can ignore its tokens
            // and start a new conversation
        }

        // Add user message to chat
        this._panel.webview.postMessage({ command: 'addUserMessage', text });

        try {
            this._isStreaming = true;
            this._isPaused = false;
            
            // Stream response from agent
            const chatPromise = this._agent.chat(text, (token) => {
                if (!this._isPaused && this._isStreaming) {
                    this._panel.webview.postMessage({ command: 'addStreamToken', token });
                }
            });
            this._currentChatPromise = chatPromise;
            await chatPromise;
            this._currentChatPromise = null;
            
            this._panel.webview.postMessage({ command: 'endStream' });
            this._isStreaming = false;
        } catch (error) {
            this._panel.webview.postMessage({ command: 'addErrorMessage', text: `Error: ${error}` });
            this._isStreaming = false;
            this._currentChatPromise = null;
        }
    }

    private _update() {
        const webview = this._panel.webview;

        this._panel.title = 'CodeGenius AI';
        this._panel.webview.html = this._getHtmlForWebview(webview);
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
                            <button id="pause-btn" title="暂停/继续流式输出" style="display: none;">⏸️</button>
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

    public dispose() {
        CodeGeniusPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}