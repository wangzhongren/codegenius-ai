import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileOperation } from './FileOperationParser';
import { minimatch } from 'minimatch';

export interface FileOperationResult {
    success: boolean;
    operation?: string;
    error?: string;
    [key: string]: any;
}

export class FileOperationHandler {
    private outputDir: string;
    private createdFiles: string[] = [];

    constructor(outputDir: string = "output") {
        this.outputDir = path.resolve(outputDir);
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    static getFileOperationPrompt(): string {
        return (
            "📁 文件操作指令支持：\n" +
            "请使用以下 XML-like 标签格式包围操作指令：\n\n" +

            "<create_file path=\"相对路径\">\n" +
            "文件内容（支持多行）\n" +
            "</create_file>\n\n" +

            "<read_file path=\"文件名\" />\n\n" +

            "<update_file path=\"相对路径\">\n" +
            "完整的代码（可直接覆盖）\n" +
            "</update_file>\n\n" +

            "<delete_file path=\"文件名\" />\n\n" +

            "<list_files filter=\"可选的文件名或路径过滤模式（如 *.py, log/*.log）\" />\n" +
            "  <!-- 无 filter：仅列出 / 根目录文件（不递归） -->\n" +
            "  <!-- 有 filter：递归搜索所有子目录并匹配 -->\n\n" +

            "<list_dir path=\"子目录路径\" filter=\"可选的过滤模式\" />\n" +
            "  <!-- 无 filter：仅列出该目录下文件（不递归） -->\n" +
            "  <!-- 有 filter：递归搜索该目录及其子目录并匹配 -->\n\n" +

            "📌 规则说明：\n" +
            "- 所有路径相对于 ./ 目录\n" +
            "- 不允许 ../ 路径穿越\n" +
            "- 更新文件之前必须要先阅读文件\n" +
            "- `filter` 支持通配符：`*` 匹配任意字符，`?` 匹配单个字符\n" +
            "- 过滤时，匹配的是 **相对于 ./ 的完整路径**（例如：log/app_2024-06-25.log）\n" +
            "- 内容可包含换行、冒号、引号等字符\n" +
            "- 如果需要分步决策，请返回 <again reason=\"...\" />\n" +
            "- 系统将自动执行并反馈结果，您可以基于新状态继续操作。\n\n"
        );
    }

    async executeOperation(op: FileOperation): Promise<FileOperationResult> {
        const operation = op.operation;
        const attrs = op.attributes;
        const content = op.content;

        try {
            switch (operation) {
                case "CREATE_FILE":
                    return await this.createFile(attrs.path, content || "");
                case "READ_FILE":
                    return await this.readFile(attrs.path);
                case "UPDATE_FILE":
                    return await this.updateFile(attrs.path, content || "");
                case "DELETE_FILE":
                    return await this.deleteFile(attrs.path);
                case "LIST_FILES":
                    return await this.listFiles(attrs.filter);
                case "LIST_DIR":
                    return await this.listDir(attrs.path, attrs.filter);
                case "AGAIN":
                    const reason = attrs.reason || "无明确原因";
                    console.log(`🔁 请求再次处理: ${reason}`);
                    return {
                        success: true,
                        operation: "AGAIN",
                        reason: reason,
                        requiresFollowUp: true
                    };
                default:
                    console.log(`⚠️ 未知操作: ${operation}`);
                    return {
                        success: false,
                        error: `不支持的操作: ${operation}`,
                        operation: operation
                    };
            }
        } catch (error: any) {
            console.error(`❌ 执行 ${operation} 时异常:`, error);
            return {
                success: false,
                error: error.message || String(error),
                operation: operation
            };
        }
    }

    private validatePath(filename: string): { valid: boolean; path: string; error?: string } {
        const fullPath = path.resolve(this.outputDir, filename);
        const normalizedPath = path.normalize(fullPath);

        if (!normalizedPath.startsWith(this.outputDir + path.sep) && normalizedPath !== this.outputDir) {
            return {
                valid: false,
                path: normalizedPath,
                error: `非法路径（路径逃逸检测）: ${filename}`
            };
        }

        return { valid: true, path: normalizedPath };
    }

    private safeJoin(base: string, subpath: string): { valid: boolean; path: string; error?: string } {
        const fullPath = path.resolve(base, subpath);
        const normalizedPath = path.normalize(fullPath);
        
        if (!normalizedPath.startsWith(base + path.sep) && normalizedPath !== base) {
            return {
                valid: false,
                path: normalizedPath,
                error: `非法子目录路径: ${subpath}`
            };
        }

        return { valid: true, path: normalizedPath };
    }

    async createFile(filename: string, content: string): Promise<FileOperationResult> {
        console.log(`📁 创建文件 → ${filename}`);

        const validation = this.validatePath(filename);
        if (!validation.valid) {
            console.log(`❌ ${validation.error}`);
            return { success: false, error: validation.error! };
        }

        const fullPath = validation.path;

        try {
            await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.promises.writeFile(fullPath, content, 'utf-8');
            this.createdFiles.push(fullPath);
            console.log(`✅ 成功创建: ${fullPath}`);

            return {
                success: true,
                operation: "CREATE_FILE",
                filename: filename,
                path: fullPath,
                size: content.length
            };
        } catch (error: any) {
            const errorMsg = `写入失败: ${error.message}`;
            console.log(`❌ ${errorMsg}`);
            return { success: false, error: errorMsg, filename: filename };
        }
    }

    async readFile(filename: string): Promise<FileOperationResult> {
        console.log(`📖 读取文件 ← ${filename}`);

        const validation = this.validatePath(filename);
        if (!validation.valid) {
            console.log(`❌ ${validation.error}`);
            return { success: false, error: validation.error! };
        }

        const fullPath = validation.path;
        
        try {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
            console.log(`📄 内容预览 (${content.length} 字): ${preview}`);

            return {
                success: true,
                operation: "READ_FILE",
                filename: filename,
                content: content,
                path: fullPath
            };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.log(`❌ 文件不存在: ${fullPath}`);
                return { success: false, error: "文件不存在", filename: filename };
            }
            const errorMsg = `读取失败: ${error.message}`;
            console.log(`❌ ${errorMsg}`);
            return { success: false, error: errorMsg, filename: filename };
        }
    }

    async updateFile(filename: string, content: string): Promise<FileOperationResult> {
        console.log(`✏️ 更新文件 → ${filename}`);

        const validation = this.validatePath(filename);
        if (!validation.valid) {
            console.log(`❌ ${validation.error}`);
            return { success: false, error: validation.error! };
        }
        
        const fullPath = validation.path;

        try {
            await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.promises.writeFile(fullPath, content, 'utf-8');
            console.log(`✅ 文件已更新: ${fullPath}`);

            return {
                success: true,
                operation: "UPDATE_FILE",
                filename: filename,
                path: fullPath,
                size: content.length
            };
        } catch (error: any) {
            const errorMsg = `更新失败: ${error.message}`;
            console.log(`❌ ${errorMsg}`);
            return { success: false, error: errorMsg, filename: filename };
        }
    }

    async deleteFile(filename: string): Promise<FileOperationResult> {
        console.log(`🗑️ 删除文件 × ${filename}`);

        const validation = this.validatePath(filename);
        if (!validation.valid) {
            console.log(`❌ ${validation.error}`);
            return { success: false, error: validation.error! };
        }

        const fullPath = validation.path;

        try {
            await fs.promises.unlink(fullPath);
            const index = this.createdFiles.indexOf(fullPath);
            if (index > -1) {
                this.createdFiles.splice(index, 1);
            }
            console.log(`✅ 已删除: ${fullPath}`);

            return {
                success: true,
                operation: "DELETE_FILE",
                filename: filename,
                path: fullPath
            };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.log(`❌ 文件不存在，无需删除: ${fullPath}`);
                return { success: false, error: "文件不存在", filename: filename };
            }
            const errorMsg = `删除失败: ${error.message}`;
            console.log(`❌ ${errorMsg}`);
            return { success: false, error: errorMsg, filename: filename };
        }
    }

    async listFiles(fileFilter?: string): Promise<FileOperationResult> {
        if (fileFilter === undefined) {
            console.log("📂 列出 output/ 根目录文件（不递归）:");
            try {
                const items = await fs.promises.readdir(this.outputDir);
                const files = [];
                for (const item of items) {
                    const itemPath = path.join(this.outputDir, item);
                    const stat = await fs.promises.stat(itemPath);
                    if (stat.isFile()) {
                        files.push(item);
                    }
                }
                const sortedFiles = files.sort();
                for (const f of sortedFiles) {
                    console.log(`  - ${f}`);
                }
                if (sortedFiles.length === 0) {
                    console.log("  (无文件)");
                }

                return {
                    success: true,
                    operation: "LIST_FILES",
                    files: sortedFiles,
                    recursive: false
                };
            } catch (error: any) {
                const errorMsg = `列出根目录失败: ${error.message}`;
                console.log(`❌ ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
        } else {
            console.log(`🔍 递归搜索 output/ 下匹配 '${fileFilter}' 的文件:`);
            try {
                const matched: string[] = [];

                const walk = async (dir: string): Promise<void> => {
                    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            await walk(fullPath);
                        } else {
                            const relPath = path.relative(this.outputDir, fullPath).replace(/\\/g, '/');
                            if (minimatch(relPath, fileFilter)) {
                                matched.push(relPath);
                            }
                        }
                    }
                };

                await walk(this.outputDir);
                const sortedMatched = matched.sort();
                for (const f of sortedMatched) {
                    console.log(`  - ${f}`);
                }
                if (sortedMatched.length === 0) {
                    console.log("  (无匹配文件)");
                }

                return {
                    success: true,
                    operation: "LIST_FILES",
                    files: sortedMatched,
                    filter: fileFilter,
                    recursive: true
                };
            } catch (error: any) {
                const errorMsg = `递归搜索失败: ${error.message}`;
                console.log(`❌ ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
        }
    }

    async listDir(dirPath: string, fileFilter?: string): Promise<FileOperationResult> {
        const validation = this.safeJoin(this.outputDir, dirPath);
        if (!validation.valid) {
            console.log(`❌ ${validation.error}`);
            return { success: false, error: validation.error! };
        }

        const targetDir = validation.path;

        try {
            await fs.promises.access(targetDir);
        } catch {
            return { success: false, error: `目录不存在: ${dirPath}` };
        }

        const stat = await fs.promises.stat(targetDir);
        if (!stat.isDirectory()) {
            return { success: false, error: `不是目录: ${dirPath}` };
        }

        if (fileFilter === undefined) {
            console.log(`📂 列出目录 '${dirPath}' 下的文件（不递归）:`);
            try {
                const items = await fs.promises.readdir(targetDir, { withFileTypes: true });
                const files: string[] = [];
                for (const item of items) {
                    if (item.isFile()) {
                        const relPath = path.join(dirPath, item.name).replace(/\\/g, '/');
                        files.push(relPath);
                    }
                }
                const sortedFiles = files.sort();
                for (const f of sortedFiles) {
                    console.log(`  - ${f}`);
                }
                if (sortedFiles.length === 0) {
                    console.log("  (无文件)");
                }

                return {
                    success: true,
                    operation: "LIST_DIR",
                    directory: dirPath,
                    files: sortedFiles,
                    recursive: false
                };
            } catch (error: any) {
                const errorMsg = `列出目录失败: ${error.message}`;
                console.log(`❌ ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
        } else {
            console.log(`🔍 递归搜索目录 '${dirPath}' 下匹配 '${fileFilter}' 的文件:`);
            try {
                const matched: string[] = [];

                const walk = async (currentDir: string): Promise<void> => {
                    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(currentDir, entry.name);
                        if (entry.isDirectory()) {
                            await walk(fullPath);
                        } else {
                            const relToOutput = path.relative(this.outputDir, fullPath).replace(/\\/g, '/');
                            if (minimatch(relToOutput, fileFilter)) {
                                matched.push(relToOutput);
                            }
                        }
                    }
                };

                await walk(targetDir);
                const sortedMatched = matched.sort();
                for (const f of sortedMatched) {
                    console.log(`  - ${f}`);
                }
                if (sortedMatched.length === 0) {
                    console.log("  (无匹配文件)");
                }

                return {
                    success: true,
                    operation: "LIST_DIR",
                    directory: dirPath,
                    files: sortedMatched,
                    filter: fileFilter,
                    recursive: true
                };
            } catch (error: any) {
                const errorMsg = `递归搜索目录失败: ${error.message}`;
                console.log(`❌ ${errorMsg}`);
                return { success: false, error: errorMsg };
            }
        }
    }
}