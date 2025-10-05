// 使用 VS Code 的官方 API
const vscode = acquireVsCodeApi();

// 状态管理
let isStreaming = false;
let hasInitialized = false;
let currentAiMessageElement = null;
let lastAiMessageContent = ''; // 保存最后的AI消息内容，用于恢复

// 初始化
function initializeApp() {
    console.log('🔍 Initializing app...');
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const clearSessionBtn = document.getElementById('clear-session-btn');
    const stopBtn = document.getElementById('stop-btn');

    console.log('DOM Elements found:', {
        chatMessages: !!chatMessages,
        userInput: !!userInput,
        sendButton: !!sendButton,
        clearSessionBtn: !!clearSessionBtn,
        stopBtn: !!stopBtn
    });

    if (!chatMessages || !userInput || !sendButton) {
        console.error('❌ Failed to get required DOM elements');
        return;
    }

    // Setup event listeners
    sendButton.addEventListener('click', () => handleSendMessage(userInput, sendButton, chatMessages));
    
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(userInput, sendButton, chatMessages);
        }
    });
    
    userInput.addEventListener('input', () => adjustTextareaHeight(userInput));
    
    if (clearSessionBtn) {
        clearSessionBtn.addEventListener('click', (e) => {
            console.log('🗑️ Clear session button clicked - event fired');
            e.preventDefault();
            e.stopPropagation();
            handleClearSession(chatMessages);
        });
        console.log('✅ Clear session button event listener added');
    } else {
        console.error('❌ Clear session button not found');
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', (e) => {
            console.log('⏹️ Stop button clicked');
            e.preventDefault();
            e.stopPropagation();
            abortCurrentChat();
        });
        console.log('✅ Stop button event listener added');
    } else {
        console.error('❌ Stop button not found');
    }

    // Request load session
    vscode.postMessage({
        command: 'loadSession'
    });

    console.log('✅ App initialized successfully');
    
    // Set up periodic check for streaming state recovery
    setupStreamingRecovery();
}

function setupStreamingRecovery() {
    // Periodically check if we need to recover streaming state
    // This helps when the webview is hidden and shown again
    setInterval(() => {
        if (isStreaming && currentAiMessageElement === null) {
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                const messages = chatMessages.querySelectorAll('.message');
                if (messages.length > 0) {
                    const lastMessage = messages[messages.length - 1];
                    if (lastMessage.classList.contains('ai-message') && 
                        lastMessage.classList.contains('streaming')) {
                        currentAiMessageElement = lastMessage;
                        console.log('🔄 Recovered streaming message element');
                    }
                }
            }
        }
    }, 1000); // Check every second
}

function adjustTextareaHeight(userInput) {
    userInput.style.height = 'auto';
    const newHeight = Math.min(userInput.scrollHeight, 120);
    userInput.style.height = newHeight + 'px';
}

function handleSendMessage(userInput, sendButton, chatMessages) {
    const text = userInput.value.trim();
    // Allow sending messages at any time - this will interrupt current streaming if needed
    if (!text) return;
    
    userInput.value = '';
    adjustTextareaHeight(userInput);
    
    // Reset last AI message content when sending new message
    lastAiMessageContent = '';
    
    vscode.postMessage({
        command: 'sendMessage',
        text: text
    });
}

function addMessage(text, type, chatMessages) {
    if (!text || !chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    
    if (type === 'ai') {
        messageDiv.classList.add('streaming');
    }
    
    const processedText = processMessageText(text, type);
    messageDiv.innerHTML = processedText;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom(chatMessages);
}

function processMessageText(text, type) {
    if (type === 'error') {
        return `<div class="error-message">${escapeHtml(text)}</div>`;
    }
    
    // 检查是否是系统消息（包含特定的emoji前缀）
    if (isSystemMessage(text)) {
        // 系统消息直接显示，不进行文件操作格式化
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
    
    // 检查是否是XML格式的文件操作指令
    if (text.trim().startsWith('<create_file') || 
        text.trim().startsWith('<update_file') || 
        text.trim().startsWith('<delete_file') || 
        text.trim().startsWith('<read_file') || 
        text.trim().startsWith('<list_files') || 
        text.trim().startsWith('<list_dir')) {
        return formatFileOperation(text);
    }
    
    // 检查是否是文件操作结果文本（但不是系统消息）
    if (isFileOperationResult(text)) {
        return formatFileOperationText(text);
    }
    
    // 普通文本
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function isSystemMessage(text) {
    // 系统消息通常以特定emoji开头
    const systemPrefixes = ['🔍', '✅', '🔄', '❌', '⚠️', '📂', '📁', '📖', '✏️', '🗑️', '🔁'];
    const trimmedText = text.trim();
    return systemPrefixes.some(prefix => trimmedText.startsWith(prefix));
}

function isFileOperationResult(text) {
    // 文件操作结果文本通常包含操作类型和文件信息
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('{"success":') || 
            (trimmedLine.includes('operation') && 
             (trimmedLine.includes('CREATE_FILE') || 
              trimmedLine.includes('UPDATE_FILE') || 
              trimmedLine.includes('DELETE_FILE') || 
              trimmedLine.includes('READ_FILE') ||
              trimmedLine.includes('LIST_FILES') || 
              trimmedLine.includes('LIST_DIR')))) {
            return true;
        }
    }
    return false;
}

function formatFileOperation(text) {
    try {
        const regex = /<(\w+)(?:\s+([^>]*?))?\s*>([\s\S]*?)<\/\1>/g;
        let match;
        let result = '';
        let lastIndex = 0;
        
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                const beforeText = text.substring(lastIndex, match.index);
                if (beforeText.trim()) {
                    result += escapeHtml(beforeText).replace(/\n/g, '<br>');
                }
            }
            
            const operation = match[1].toUpperCase();
            const attributes = match[2] || '';
            const content = match[3];
            
            let path = '';
            const pathMatch = attributes.match(/path\s*=\s*["']([^"']*)["']/);
            if (pathMatch) {
                path = pathMatch[1];
            }
            
            result += `
                <div class="file-operation">
                    <span class="operation-type">${operation}</span>
                    ${path ? `<span class="file-path">${escapeHtml(path)}</span>` : ''}
                </div>
            `;
            
            if (content.trim()) {
                result += `
                    <div class="code-block">
                        <span class="language">Code</span>
                        ${escapeHtml(content)}
                    </div>
                `;
            }
            
            lastIndex = regex.lastIndex;
        }
        
        if (lastIndex < text.length) {
            const remaining = text.substring(lastIndex);
            if (remaining.trim()) {
                result += escapeHtml(remaining).replace(/\n/g, '<br>');
            }
        }
        
        return result || escapeHtml(text).replace(/\n/g, '<br>');
    } catch (e) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
}

function formatFileOperationText(text) {
    try {
        const lines = text.split('\n');
        let html = '';
        
        for (const line of lines) {
            if (line.includes('CREATE_FILE') || line.includes('UPDATE_FILE') || 
                line.includes('DELETE_FILE') || line.includes('READ_FILE') ||
                line.includes('LIST_FILES') || line.includes('LIST_DIR')) {
                
                const parts = line.split(' ');
                const operation = parts[0];
                let path = '';
                
                if (line.includes('path="')) {
                    const pathMatch = line.match(/path="([^"]*)"/);
                    if (pathMatch) {
                        path = pathMatch[1];
                    }
                }
                
                html += `<div class="file-operation">
                    <span class="operation-type">${operation}</span>
                    ${path ? `<span class="file-path">${escapeHtml(path)}</span>` : ''}
                </div>`;
            } else if (line.trim()) {
                html += escapeHtml(line) + '<br>';
            }
        }
        
        return html || escapeHtml(text).replace(/\n/g, '<br>');
    } catch (e) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
}

function addStreamToken(token, chatMessages) {
    if (!chatMessages) return;
    
    // 如果当前没有流式消息元素，检查是否需要恢复
    if (!currentAiMessageElement) {
        // 检查最后一个消息是否是AI消息且处于streaming状态
        const messages = chatMessages.querySelectorAll('.message');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.classList.contains('ai-message') && 
                lastMessage.classList.contains('streaming')) {
                currentAiMessageElement = lastMessage;
                // 如果有保存的内容，使用它作为基础
                if (lastAiMessageContent) {
                    currentAiMessageElement.innerHTML = lastAiMessageContent;
                }
            }
        }
        
        // 如果还是没有，创建新的流式消息元素
        if (!currentAiMessageElement) {
            currentAiMessageElement = document.createElement('div');
            currentAiMessageElement.className = 'message ai-message streaming';
            chatMessages.appendChild(currentAiMessageElement);
        }
    }
    
    const processedToken = token.replace(/\n/g, '<br>');
    currentAiMessageElement.innerHTML += processedToken;
    lastAiMessageContent = currentAiMessageElement.innerHTML; // 保存当前内容
    scrollToBottom(chatMessages);
}

function addSystemMessage(text, chatMessages) {
    if (!chatMessages) return;
    
    // End any current streaming message
    if (currentAiMessageElement) {
        currentAiMessageElement.classList.remove('streaming');
        currentAiMessageElement = null;
        lastAiMessageContent = '';
    }
    
    // Add system message as a separate AI message
    addMessage(text, 'ai', chatMessages);
}

function endStream() {
    if (currentAiMessageElement) {
        currentAiMessageElement.classList.remove('streaming');
        currentAiMessageElement = null;
        lastAiMessageContent = '';
    }
    
    // Get UI elements and enable them
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    if (userInput) {
        userInput.disabled = false;
    }
    if (sendButton) {
        sendButton.disabled = false;
    }
    
    // Hide stop button when streaming ends
    const stopBtn = document.getElementById('stop-btn');
    if (stopBtn) {
        stopBtn.style.display = 'none';
    }
    
    isStreaming = false;
}

function clearCurrentResponse() {
    // Clear the current streaming AI response
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages && currentAiMessageElement) {
        chatMessages.removeChild(currentAiMessageElement);
        currentAiMessageElement = null;
        lastAiMessageContent = '';
        console.log('✅ Current AI response cleared from UI');
    }
}

function abortCurrentChat() {
    // Send abort message to backend
    vscode.postMessage({
        command: 'abortCurrentChat'
    });
}

function scrollToBottom(chatMessages) {
    if (!chatMessages) return;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleClearSession(chatMessages) {
    console.log('🗑️ Clear session button clicked - handleClearSession called');
    // 移除确认对话框以测试是否能正常发送消息
    console.log('✅ Clear session confirmed (no confirmation dialog)');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
    hasInitialized = false;
    currentAiMessageElement = null;
    lastAiMessageContent = '';
    
    // Enable input after clear session
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    if (userInput && sendButton) {
        userInput.disabled = false;
        sendButton.disabled = false;
    }
    
    console.log('📤 Sending clearSession message to backend');
    // 添加一个简单的测试消息来确认 postMessage 是否工作
    try {
        vscode.postMessage({
            command: 'clearSession'
        });
        console.log('✅ clearSession message sent successfully');
    } catch (error) {
        console.error('❌ Failed to send clearSession message:', error);
    }
}

// Handle messages from extension
window.addEventListener('message', event => {
    const message = event.data;
    console.log('📥 Received message from backend:', message.command);
    
    const chatMessages = document.getElementById('chat-messages');

    switch (message.command) {
        case 'addUserMessage':
            addMessage(message.text, 'user', chatMessages);
            break;
        case 'addStreamToken':
            addStreamToken(message.token, chatMessages);
            isStreaming = true; // Set streaming state when receiving tokens
            
            // Show stop button when streaming starts
            const stopBtn = document.getElementById('stop-btn');
            if (stopBtn) {
                stopBtn.style.display = 'block';
            }
            
            // Note: We don't disable input here because input should remain enabled
            // so user can send new messages or click stop
            break;
        case 'addSystemMessage':
            addSystemMessage(message.text, chatMessages);
            break;
        case 'endStream':
            endStream();
            break;
        case 'addErrorMessage':
            addMessage(message.text, 'error', chatMessages);
            endStream();
            break;
        case 'loadSession':
            loadSessionFromData(message.messages, chatMessages);
            break;
        case 'clearSession':
            console.log('✅ Backend confirmed session cleared');
            // 直接显示欢迎消息，不要重新请求加载会话
            hasInitialized = false;
            if (chatMessages) {
                chatMessages.innerHTML = '';
                showWelcomeMessage(chatMessages);
            }
            break;
        case 'clearCurrentResponse':
            clearCurrentResponse();
            break;
    }
});

function loadSessionFromData(messages, chatMessages) {
    if (!chatMessages) return;
    
    if (!Array.isArray(messages) || messages.length === 0) {
        showWelcomeMessage(chatMessages);
        return;
    }
    
    chatMessages.innerHTML = '';
    
    messages.forEach(msg => {
        if (msg.role === 'user') {
            addMessage(msg.content, 'user', chatMessages);
        } else if (msg.role === 'ai') {
            addMessage(msg.content, 'ai', chatMessages);
        } else if (msg.role === 'error') {
            addMessage(msg.content, 'error', chatMessages);
        }
    });
    
    hasInitialized = true;
    console.log('✅ Loaded session with', messages.length, 'messages');
}

function showWelcomeMessage(chatMessages) {
    if (hasInitialized || !chatMessages) return;
    
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'message ai-message';
    welcomeDiv.innerHTML = `
        <strong>👋 欢迎使用 CodeGenius AI！</strong><br><br>
        我是您的 Python 编程助手，可以帮助您：<br>
        • 创建完整的 Python 项目<br>
        • 生成模块化代码结构<br>
        • 实现日志系统和配置管理<br>
        • 执行文件操作（创建、读取、更新、删除）<br><br>
        <em>请输入您的开发需求开始吧！</em>
    `;
    chatMessages.appendChild(welcomeDiv);
    scrollToBottom(chatMessages);
    hasInitialized = true;
    
    // Ensure input is enabled when showing welcome message
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    if (userInput && sendButton) {
        userInput.disabled = false;
        sendButton.disabled = false;
    }
}

// Handle webview visibility changes
// When the webview becomes visible again, we might need to restore streaming state
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && isStreaming) {
        console.log('🔄 Webview became visible, checking streaming state');
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages && currentAiMessageElement === null) {
            // Try to restore the streaming message element
            const messages = chatMessages.querySelectorAll('.message');
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                if (lastMessage.classList.contains('ai-message') && 
                    lastMessage.classList.contains('streaming')) {
                    currentAiMessageElement = lastMessage;
                    console.log('✅ Restored streaming message element from visibility change');
                }
            }
        }
    }
});

// Also handle the case where the webview might be reinitialized
// Listen for focus events as an additional recovery mechanism
window.addEventListener('focus', () => {
    if (isStreaming && currentAiMessageElement === null) {
        console.log('🔍 Window focused, checking for streaming recovery');
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            const messages = chatMessages.querySelectorAll('.message');
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                if (lastMessage.classList.contains('ai-message') && 
                    lastMessage.classList.contains('streaming')) {
                    currentAiMessageElement = lastMessage;
                    console.log('✅ Recovered streaming message element from focus event');
                }
            }
        }
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    console.log('监听页面加载完成事件');
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    console.log('DOM已经加载完成，立即初始化');
    initializeApp();
}