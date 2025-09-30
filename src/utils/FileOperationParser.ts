import * as vscode from 'vscode';

export interface FileOperation {
    operation: string;
    attributes: { [key: string]: string };
    content: string | null;
    selfClosing: boolean;
}

export class FileOperationParser {
    static parseStructuredOperations(text: string): FileOperation[] {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const operations: FileOperation[] = [];
        
        // Match closing tags: <tag attrs>content</tag>
        const blockPattern = /<(\w+)\s*([^>]*)>(.*?)<\/\1\s*>/gs;
        // Match self-closing tags: <tag attrs />
        const selfClosingPattern = /<(\w+)\s*([^>]*)\/\s*>/gs;

        // Find closing tags first
        let match;
        while ((match = blockPattern.exec(text)) !== null) {
            const [, tagName, attrsStr, content] = match;
            const attrs = this.parseAttributes(attrsStr);
            operations.push({
                operation: tagName.trim().toUpperCase(),
                attributes: attrs,
                content: content ? content.trim() : null,
                selfClosing: false
            });
        }

        // Find self-closing tags
        while ((match = selfClosingPattern.exec(text)) !== null) {
            const [, tagName, attrsStr] = match;
            const attrs = this.parseAttributes(attrsStr);
            operations.push({
                operation: tagName.trim().toUpperCase(),
                attributes: attrs,
                content: null,
                selfClosing: true
            });
        }

        return operations;
    }

    private static parseAttributes(attrStr: string): { [key: string]: string } {
        if (!attrStr) {
            return {};
        }
        
        const attrs: { [key: string]: string } = {};
        const pattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let match;
        
        while ((match = pattern.exec(attrStr)) !== null) {
            const [, key, v1, v2] = match;
            attrs[key] = v1 || v2 || '';
        }
        
        return attrs;
    }

    static hasFileOperations(text: string): boolean {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const operationTags = [
            'create_file', 'read_file', 'update_file',
            'delete_file', 'list_files', 'list_dir', 'again'
        ];
        
        const pattern = new RegExp(
            `<(${operationTags.join('|')})\\s*[^>]*/?\\s*(?:>|/>|>.*?</\\1>)`,
            'is'
        );
        
        return pattern.test(text);
    }
}