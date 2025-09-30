import * as vscode from 'vscode';
import { CodeGeniusPanel } from './CodeGeniusPanel';
import { CodeGeniusAgent } from './CodeGeniusAgent';
import { CodeGeniusViewProvider } from './CodeGeniusViewProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register the view provider for the sidebar
    const viewProvider = new CodeGeniusViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CodeGeniusViewProvider.viewType,
            viewProvider
        )
    );

    let agent: CodeGeniusAgent | undefined;

    // Command to start the AI assistant (webview panel - kept for backward compatibility)
    const startCommand = vscode.commands.registerCommand('codegenius.start', async () => {
        const config = vscode.workspace.getConfiguration('codegenius');
        const apiKey = config.get<string>('apiKey') || '';
        const baseUrl = config.get<string>('baseUrl') || 'https://api.openai.com/v1';
        const modelName = config.get<string>('modelName') || 'gpt-4o-mini';
        const systemPrompt = config.get<string>('systemPrompt') || '';

        if (!apiKey || apiKey === 'YOUR_API_KEY') {
            vscode.window.showErrorMessage('Please configure your API key in settings.');
            return;
        }

        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace folder first.');
            return;
        }

        const projectDir = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // Initialize agent if not already done
        if (!agent) {
            try {
                agent = new CodeGeniusAgent(apiKey, baseUrl, modelName, systemPrompt, projectDir);
                vscode.window.showInformationMessage('CodeGenius AI agent initialized successfully!');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to initialize agent: ${error}`);
                return;
            }
        }

        // Create and show the webview panel
        CodeGeniusPanel.createOrShow(context.extensionUri, agent);
    });

    // Command to configure settings
    const configureCommand = vscode.commands.registerCommand('codegenius.configure', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'codegenius');
    });

    context.subscriptions.push(startCommand, configureCommand);
}

export function deactivate() {}