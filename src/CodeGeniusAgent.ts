import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAILLM } from './llms/OpenAILLM';
import { PythonProgrammerAgent } from './agent/PythonProgrammerAgent';
import { FileOperationHandler } from './utils/FileOperationHandler';

export class CodeGeniusAgent {
    private apiKey: string;
    private baseUrl: string;
    private modelName: string;
    private systemPrompt: string;
    private projectDir: string;
    private agent: PythonProgrammerAgent;
    private currentAbortController: AbortController | null = null;

    constructor(apiKey: string, baseUrl: string, modelName: string, systemPrompt: string, projectDir: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.modelName = modelName;
        this.systemPrompt = systemPrompt;
        this.projectDir = projectDir;

        // Setup logging directory (same as original app)
        const logDir = path.join(this.projectDir, 'log');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        // Initialize the LLM and agent
        const llm = new OpenAILLM(this.apiKey, this.baseUrl, this.modelName);
        this.agent = new PythonProgrammerAgent(llm, this.systemPrompt, this.projectDir);
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

    // Chat with the AI agent using TypeScript implementation
    async chat(
        userMessage: string, 
        onToken: (token: string) => void,
        onSystemMessage?: (message: string) => void,
        signal?: AbortSignal
    ): Promise<void> {
        // Cancel previous request if exists and no external signal provided
        if (!signal && this.currentAbortController) {
            this.currentAbortController.abort();
        }

        // Create new AbortController if no external signal provided
        const abortController = signal ? undefined : new AbortController();
        
        // Set up callbacks for streaming
        this.agent.setTokenCallback(onToken);
        if (onSystemMessage) {
            this.agent.setSystemMessageCallback(onSystemMessage);
        }
        this.agent.setCompleteCallback((response) => {
            // Handle complete response if needed
            console.log("Complete response received");
        });
        
        try {
            await this.agent.chat(userMessage, signal || abortController?.signal);
            
            // Clean up abort controller if we created it
            if (!signal) {
                this.currentAbortController = null;
            }
        } catch (error) {
            if (this.isAbortError(error)) {
                console.log('AI chat was aborted');
                return;
            }
            throw new Error(`AI agent error: ${error}`);
        } finally {
            if (!signal && this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }
    }

    setPaused(paused: boolean): void {
        if (this.agent && typeof this.agent.setPaused === 'function') {
            this.agent.setPaused(paused);
        }
    }

    isPaused(): boolean {
        if (this.agent && typeof this.agent.isPaused === 'function') {
            return this.agent.isPaused();
        }
        return false;
    }

    abortCurrentChat(): void {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        if (this.agent && typeof this.agent.abortCurrentChat === 'function') {
            this.agent.abortCurrentChat();
        }
    }
}