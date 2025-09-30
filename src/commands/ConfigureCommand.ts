import * as vscode from 'vscode';

export class ConfigureCommand {
    public static register(): vscode.Disposable {
        return vscode.commands.registerCommand('codegenius.configure', async () => {
            try {
                // Open the settings page filtered to codegenius settings
                await vscode.commands.executeCommand('workbench.action.openSettings', 'codegenius');
                
                // Show a helpful message
                vscode.window.showInformationMessage(
                    'Configure your CodeGenius AI settings below. ' +
                    'You can get an OpenAI API key from https://platform.openai.com/api-keys'
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open settings: ${error}`);
            }
        });
    }
}