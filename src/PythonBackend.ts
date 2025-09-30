import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';

/**
 * Python 后端管理器 - 用于调用 Python 代理
 */
export class PythonBackend {
    private pythonPath: string;
    private scriptPath: string;
    private projectDir: string;
    private apiKey: string;
    private baseUrl: string;
    private modelName: string;
    private systemPrompt: string;

    constructor(
        pythonPath: string,
        scriptPath: string,
        projectDir: string,
        apiKey: string,
        baseUrl: string,
        modelName: string,
        systemPrompt: string
    ) {
        this.pythonPath = pythonPath;
        this.scriptPath = scriptPath;
        this.projectDir = projectDir;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.modelName = modelName;
        this.systemPrompt = systemPrompt;
    }

    /**
     * 调用 Python 后端处理消息
     */
    async chat(message: string, onToken: (token: string) => void): Promise<string> {
        return new Promise((resolve, reject) => {
            const args = [
                this.scriptPath,
                '--project-dir', this.projectDir,
                '--api-key', this.apiKey,
                '--base-url', this.baseUrl,
                '--model-name', this.modelName,
                '--system-prompt', this.systemPrompt,
                '--message', message
            ];

            const child = cp.spawn(this.pythonPath, args, {
                cwd: path.dirname(this.scriptPath),
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            });

            let fullResponse = '';
            let errorOutput = '';

            // 处理 stdout - 流式 token
            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                fullResponse += chunk;
                
                // 将每个字符作为 token 发送（模拟原应用的流式行为）
                for (const char of chunk) {
                    onToken(char);
                }
            });

            // 处理 stderr
            child.stderr?.on('data', (data) => {
                errorOutput += data.toString();
                console.error('Python stderr:', data.toString());
            });

            // 处理进程结束
            child.on('close', (code) => {
                if (code === 0) {
                    resolve(fullResponse);
                } else {
                    reject(new Error(`Python process exited with code ${code}. ${errorOutput}`));
                }
            });

            // 处理错误
            child.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * 验证 Python 环境
     */
    static async validatePythonEnvironment(): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = cp.spawn('python', ['--version']);
            let output = '';
            let error = '';

            child.stdout?.on('data', (data) => {
                output += data.toString();
            });

            child.stderr?.on('data', (data) => {
                error += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve('python');
                } else {
                    // Try python3
                    const child3 = cp.spawn('python3', ['--version']);
                    child3.on('close', (code3) => {
                        if (code3 === 0) {
                            resolve('python3');
                        } else {
                            reject(new Error('Python not found. Please install Python 3.7+'));
                        }
                    });
                }
            });
        });
    }
}