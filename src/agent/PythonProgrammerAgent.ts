import * as vscode from 'vscode';
import * as path from 'path';
import { BaseAgent } from './BaseAgent';
import { BaseLLM } from '../llms/BaseLLM';
import { FileOperationHandler, FileOperationResult } from '../utils/FileOperationHandler';
import { FileOperationParser, FileOperation } from '../utils/FileOperationParser';

export class PythonProgrammerAgent extends BaseAgent {
    private projectDir: string;
    private fileHandler: FileOperationHandler;
    private currentResponse: string = "";
    private onTokenCallback?: (token: string) => void;
    private onSystemMessageCallback?: (message: string) => void;
    private onCompleteCallback?: (response: string) => void;
    private pendingFileOperations: FileOperation[] = [];
    private processingFileOperations: boolean = false;

    constructor(
        basellm: BaseLLM,
        systemPrompt: string = "你是个有用的助手",
        projectDir: string = "output"
    ) {
        const enhancedSystemPrompt = systemPrompt + FileOperationHandler.getFileOperationPrompt();
        super(basellm, enhancedSystemPrompt, 50);
        this.projectDir = projectDir;
        this.fileHandler = new FileOperationHandler(projectDir);
    }

    setTokenCallback(callback: (token: string) => void): void {
        this.onTokenCallback = callback;
    }

    setSystemMessageCallback(callback: (message: string) => void): void {
        this.onSystemMessageCallback = callback;
    }

    setCompleteCallback(callback: (response: string) => void): void {
        this.onCompleteCallback = callback;
    }

    // 辅助方法 - 直接文件操作
    async createFile(filename: string, content: string): Promise<FileOperationResult> {
        return await this.fileHandler.createFile(filename, content);
    }

    async readFile(filename: string): Promise<FileOperationResult> {
        return await this.fileHandler.readFile(filename);
    }

    async updateFile(filename: string, content: string): Promise<FileOperationResult> {
        return await this.fileHandler.updateFile(filename, content);
    }

    async deleteFile(filename: string): Promise<FileOperationResult> {
        return await this.fileHandler.deleteFile(filename);
    }

    async listFiles(fileFilter?: string): Promise<FileOperationResult> {
        return await this.fileHandler.listFiles(fileFilter);
    }

    async listDir(dirPath: string, fileFilter?: string): Promise<FileOperationResult> {
        return await this.fileHandler.listDir(dirPath, fileFilter);
    }

    // 发送系统消息到UI
    private sendSystemMessage(message: string): void {
        // 发送到系统消息回调（不会影响AI响应流）
        if (this.onSystemMessageCallback) {
            this.onSystemMessageCallback(message);
        }
        // 同时输出到控制台
        console.log(message);
    }

    async tokenDeal(token: string): Promise<void> {
        this.currentResponse += token;
        
        // 始终发送token到UI，不中断流式显示
        if (this.onTokenCallback) {
            this.onTokenCallback(token);
        }
        process.stdout.write(token);
        
        // 实时检查是否有完整的文件操作指令
        if (FileOperationParser.hasFileOperations(this.currentResponse)) {
            const operations = FileOperationParser.parseStructuredOperations(this.currentResponse);
            const newOperations = operations.filter(op => 
                !this.pendingFileOperations.some(pending => 
                    pending.operation === op.operation && 
                    pending.attributes.path === op.attributes.path
                )
            );
            
            if (newOperations.length > 0) {
                this.pendingFileOperations.push(...newOperations);
            }
        }
    }

    async todo(token: string): Promise<void> {
        try {
            const needData: FileOperationResult[] = [];
            this.sendSystemMessage(`🔍 收到Python开发响应，长度: ${token.length} 字符`);
            
            if (this.onCompleteCallback) {
                this.onCompleteCallback(token);
            }

            // Check if contains file operations
            if (FileOperationParser.hasFileOperations(token)) {
                this.sendSystemMessage("✅ 检测到文件操作指令");
                
                const operations = FileOperationParser.parseStructuredOperations(token);
                this.sendSystemMessage(`🔄 找到 ${operations.length} 个结构化操作指令`);
                
                for (const op of operations) {
                    this.sendSystemMessage(`  执行: ${op.operation} → ${op.attributes.path || ''}`);
                    const result = await this.fileHandler.executeOperation(op);
                    needData.push(result);
                }
                
                this.sendSystemMessage("✅ 文件操作处理完成");
                
                // Call chat again to let the model know about operation results
                if (needData.length > 0) {
                    const jsonResult = JSON.stringify(needData, null, 2);
                    // 重置当前响应，避免重复处理
                    this.currentResponse = "";
                    await this.chat(jsonResult);
                }
            } else {
                this.sendSystemMessage("⚠️ 未检测到文件操作指令");
                this.currentResponse = "";
            }
        } catch (error: any) {
            this.sendSystemMessage(`❌ Python程序员处理失败: ${error}`);
            this.sendSystemMessage(`原始响应: ${token}`);
            // 打印详细错误堆栈
            if (error.stack) {
                this.sendSystemMessage(`堆栈跟踪: ${error.stack}`);
            }
            throw error;
        }
    }
}