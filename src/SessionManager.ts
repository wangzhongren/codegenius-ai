import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ChatMessage {
    role: 'user' | 'ai' | 'error';
    content: string;
    timestamp: number;
}

export class SessionManager {
    private static readonly SESSION_FILE_NAME = '.codegenius_session.json';
    private workspaceFolder: string;
    private sessionFile: string;

    constructor(workspaceFolder: string) {
        this.workspaceFolder = workspaceFolder;
        this.sessionFile = path.join(this.workspaceFolder, SessionManager.SESSION_FILE_NAME);
        console.log('SessionManager initialized with file:', this.sessionFile);
    }

    async saveSession(messages: ChatMessage[]): Promise<void> {
        try {
            const sessionData = {
                messages,
                lastUpdated: Date.now(),
                workspace: this.workspaceFolder
            };
            await fs.promises.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2));
            console.log('✅ Session saved successfully to:', this.sessionFile);
            console.log('💾 Saved messages count:', messages.length);
        } catch (error) {
            console.error('❌ Failed to save session:', error);
            // Don't throw error as it shouldn't break the main functionality
        }
    }

    async loadSession(): Promise<ChatMessage[]> {
        try {
            if (!fs.existsSync(this.sessionFile)) {
                console.log('📁 No session file found at:', this.sessionFile);
                return [];
            }
            
            const data = await fs.promises.readFile(this.sessionFile, 'utf8');
            const sessionData = JSON.parse(data);
            console.log('✅ Session loaded successfully from:', this.sessionFile);
            console.log('📥 Loaded messages count:', Array.isArray(sessionData.messages) ? sessionData.messages.length : 0);
            
            // Validate session data
            if (Array.isArray(sessionData.messages)) {
                return sessionData.messages;
            }
            return [];
        } catch (error) {
            console.error('❌ Failed to load session:', error);
            return [];
        }
    }

    async clearSession(): Promise<void> {
        try {
            if (fs.existsSync(this.sessionFile)) {
                await fs.promises.unlink(this.sessionFile);
                console.log('🗑️ Session file deleted:', this.sessionFile);
            } else {
                console.log('ℹ️ No session file to delete at:', this.sessionFile);
            }
        } catch (error) {
            console.error('❌ Failed to clear session:', error);
        }
    }

    getSessionFilePath(): string {
        return this.sessionFile;
    }
}