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

    // Chat with the AI agent using TypeScript implementation
    async chat(
        userMessage: string, 
        onToken: (token: string) => void,
        onSystemMessage?: (message: string) => void
    ): Promise<void> {
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
            await this.agent.chat(userMessage);
        } catch (error) {
            throw new Error(`AI agent error: ${error}`);
        }
    }
}