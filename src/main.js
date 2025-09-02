// 使用全局 Tauri API
const { invoke } = window.__TAURI_INTERNALS__ || {};
const { open } = window.__TAURI_PLUGIN_DIALOG__ || {};
const { listen } = window.__TAURI__ || {};

// 全局状态
let currentLogFile = null;
let allEntries = [];
let filteredEntries = [];
let currentSearchQuery = '';

// DOM 元素
const elements = {
    dropZone: document.getElementById('dropZone'),
    logContainer: document.getElementById('logContainer'),
    logList: document.getElementById('logList'),
    loading: document.getElementById('loading'),
    openFile: document.getElementById('openFile'),
    toggleHistory: document.getElementById('toggleHistory'),
    toggleTheme: document.getElementById('toggleTheme'),
    searchInput: document.getElementById('searchInput'),
    historyPanel: document.getElementById('historyPanel'),
    historyList: document.getElementById('historyList'),
    closeHistory: document.getElementById('closeHistory'),
    statTotal: document.getElementById('statTotal'),
    statError: document.getElementById('statError'),
    statWarn: document.getElementById('statWarn'),
    statInfo: document.getElementById('statInfo'),
    statDebug: document.getElementById('statDebug'),
};

// Tauri API 引用（动态获取）
let tauriInvoke, tauriOpen, tauriListen;

// 初始化
async function init() {
    console.log('Initializing app...');
    
    // 检查所有可能的 Tauri 全局变量
    console.log('Checking Tauri globals:', {
        __TAURI__: typeof window.__TAURI__,
        __TAURI_INTERNALS__: typeof window.__TAURI_INTERNALS__,
        __TAURI_PLUGIN_DIALOG__: typeof window.__TAURI_PLUGIN_DIALOG__,
        __TAURI_PLUGIN_FS__: typeof window.__TAURI_PLUGIN_FS__
    });
    
    // 等待 Tauri 完全加载
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
        // 检查各种可能的 API 位置
        if (window.__TAURI__) {
            console.log('Found __TAURI__, checking contents:', Object.keys(window.__TAURI__));
            
            // 尝试不同的 API 路径
            tauriInvoke = window.__TAURI_INTERNALS__?.invoke || 
                         window.__TAURI__?.core?.invoke ||
                         window.__TAURI__?.invoke;
                         
            tauriOpen = window.__TAURI_PLUGIN_DIALOG__?.open ||
                       window.__TAURI__?.dialog?.open ||
                       window.__TAURI__?.pluginDialog?.open;
                       
            tauriListen = window.__TAURI__?.event?.listen ||
                         window.__TAURI__.listen;
            
            if (tauriInvoke) {
                console.log('Found invoke function');
                break;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        
        if (attempts % 10 === 0) {
            console.log(`Waiting for Tauri... attempt ${attempts}`);
        }
    }
    
    // 如果全局 API 不可用，尝试使用模块导入
    if (!tauriInvoke) {
        console.log('Global APIs not found, trying module imports...');
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { open } = await import('@tauri-apps/plugin-dialog');
            const { listen } = await import('@tauri-apps/api/event');
            
            tauriInvoke = invoke;
            tauriOpen = open;
            tauriListen = listen;
            
            console.log('Module imports successful');
        } catch (error) {
            console.error('Module imports failed:', error);
        }
    }
    
    if (!tauriInvoke) {
        console.error('Failed to load Tauri APIs');
        alert('Failed to initialize application. Please restart.');
        return;
    }
    
    console.log('Tauri APIs loaded successfully');
    console.log('Available APIs:', {
        invoke: typeof tauriInvoke,
        open: typeof tauriOpen,
        listen: typeof tauriListen
    });
    
    // 检查关键DOM元素
    console.log('Key DOM elements:', {
        dropZone: !!elements.dropZone,
        logContainer: !!elements.logContainer,
        logList: !!elements.logList
    });
    
    // 测试基本 invoke 功能
    try {
        console.log('Testing basic invoke...');
        const result = await tauriInvoke('get_history');
        console.log('Basic invoke test successful');
    } catch (error) {
        console.error('Basic invoke test failed:', error);
    }
    
    setupEventListeners();
    setupFileDropZone();
    loadTheme();
    await loadHistory();
}

// 设置事件监听器
function setupEventListeners() {
    // 打开文件
    elements.openFile.addEventListener('click', async () => {
        console.log('Open file button clicked');
        try {
            if (!tauriOpen) {
                throw new Error('File dialog API not available');
            }
            
            console.log('Opening file dialog...');
            const selected = await tauriOpen({
                multiple: false,
                filters: [{
                    name: 'Log Files',
                    extensions: ['log', 'txt', 'json']
                }]
            });
            
            console.log('File selected:', selected);
            if (selected) {
                await loadLogFile(selected);
            }
        } catch (error) {
            console.error('Error opening file:', error);
            alert(`Failed to open file: ${error.message}`);
        }
    });
    
    // 切换历史面板
    elements.toggleHistory.addEventListener('click', () => {
        elements.historyPanel.classList.toggle('hidden');
    });
    
    elements.closeHistory.addEventListener('click', () => {
        elements.historyPanel.classList.add('hidden');
    });
    
    // 切换主题
    elements.toggleTheme.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // 更新图标
        const icon = elements.toggleTheme.querySelector('svg path');
        if (newTheme === 'dark') {
            icon.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
        } else {
            icon.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
        }
    });
    
    // 搜索
    let searchTimeout;
    elements.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchLogs(e.target.value);
        }, 300);
    });
    
    // 级别过滤
    const levelCheckboxes = document.querySelectorAll('.filter-label input[type="checkbox"]');
    levelCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            filterByLevel();
        });
    });
}

// 设置文件拖拽区域
function setupFileDropZone() {
    console.log('Setting up file drop zone...');
    
    // 监听文件拖拽事件
    if (tauriListen) {
        tauriListen('tauri://drag-drop', async (event) => {
            console.log('Drag drop event received:', event);
            try {
                const paths = event.payload.paths;
                if (paths && paths.length > 0) {
                    console.log('File dropped:', paths[0]);
                    console.log('About to call loadLogFile...');
                    await loadLogFile(paths[0]);
                    console.log('loadLogFile completed');
                } else {
                    console.warn('No file paths in drop event');
                }
            } catch (error) {
                console.error('Error handling dropped file:', error);
                console.error('Error details:', error);
                alert(`Failed to load dropped file: ${error.message || 'Unknown error'}`);
            }
        }).catch(error => {
            console.error('Error setting up drag-drop listener:', error);
        });
    } else {
        console.warn('Drag-drop listener not available');
    }
    
    // 视觉反馈
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('dragover');
        console.log('Drag over');
    });
    
    elements.dropZone.addEventListener('dragleave', (e) => {
        elements.dropZone.classList.remove('dragover');
        console.log('Drag leave');
    });
    
    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('dragover');
        console.log('Drop event');
    });
    
    // 添加点击事件作为备选
    elements.dropZone.addEventListener('click', () => {
        console.log('Drop zone clicked');
        elements.openFile.click();
    });
}

// 加载日志文件
async function loadLogFile(path) {
    console.log('Loading log file:', path);
    try {
        showLoading(true);
        
        // 解析日志文件
        console.log('Invoking parse_log_file...');
        const logFile = await tauriInvoke('parse_log_file', { path });
        console.log('Log file parsed successfully:', logFile);
        console.log('Entries count:', logFile.entries?.length || 0);
        
        if (!logFile.entries || logFile.entries.length === 0) {
            console.warn('No log entries found in file');
            alert('No log entries found in this file. The file might be empty or in an unsupported format.');
            return;
        }
        
        currentLogFile = logFile;
        allEntries = logFile.entries;
        filteredEntries = [...allEntries];
        
        console.log('Setting up entries:', {
            total: allEntries.length,
            filtered: filteredEntries.length
        });
        
        // 保存到历史
        console.log('Saving to history...');
        await tauriInvoke('save_history', { filePath: path });
        await loadHistory();
        
        // 切换视图
        console.log('Switching views...');
        console.log('Drop zone element:', elements.dropZone);
        console.log('Log container element:', elements.logContainer);
        
        elements.dropZone.classList.add('hidden');
        elements.logContainer.classList.remove('hidden');
        
        console.log('Drop zone hidden:', elements.dropZone.classList.contains('hidden'));
        console.log('Log container visible:', !elements.logContainer.classList.contains('hidden'));
        
        // 显示日志
        console.log('Displaying logs...');
        displayLogs();
        
        console.log('Updating stats...');
        await updateStats();
        console.log('Stats update completed');
        
        // 强制刷新界面
        setTimeout(() => {
            console.log('Force UI refresh...');
            elements.logContainer.style.display = 'flex';
            elements.dropZone.style.display = 'none';
        }, 100);
        
        console.log('Log file loaded successfully');
        
    } catch (error) {
        console.error('Failed to load log file:', error);
        console.error('Error stack:', error.stack);
        alert(`Failed to load log file: ${error.message || error}`);
    } finally {
        showLoading(false);
    }
}

// 显示日志
function displayLogs() {
    console.log('displayLogs called, filteredEntries:', filteredEntries.length);
    elements.logList.innerHTML = '';
    
    if (!filteredEntries || filteredEntries.length === 0) {
        console.warn('No entries to display');
        elements.logList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">No log entries to display</div>';
        return;
    }
    
    // 使用虚拟滚动优化大量日志的显示
    const fragment = document.createDocumentFragment();
    const maxDisplay = 1000; // 最多显示1000条
    const entriesToShow = filteredEntries.slice(0, maxDisplay);
    
    console.log('Creating', entriesToShow.length, 'log entry elements');
    
    entriesToShow.forEach((entry, index) => {
        try {
            const entryEl = createLogEntry(entry);
            fragment.appendChild(entryEl);
        } catch (error) {
            console.error('Error creating log entry', index, ':', error);
        }
    });
    
    elements.logList.appendChild(fragment);
    console.log('Log entries added to DOM');
    
    // 如果有更多日志，显示提示
    if (filteredEntries.length > maxDisplay) {
        const moreEl = document.createElement('div');
        moreEl.className = 'log-entry';
        moreEl.style.textAlign = 'center';
        moreEl.style.color = 'var(--text-muted)';
        moreEl.textContent = `Showing first ${maxDisplay} of ${filteredEntries.length} entries`;
        elements.logList.appendChild(moreEl);
    }
}

// 创建日志条目元素
function createLogEntry(entry) {
    const div = document.createElement('div');
    div.className = `log-entry level-${entry.level.toLowerCase()}`;
    
    // 级别标签
    const levelSpan = document.createElement('span');
    levelSpan.className = `log-level ${entry.level.toLowerCase()}`;
    levelSpan.textContent = entry.level;
    div.appendChild(levelSpan);
    
    // 时间戳
    if (entry.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-timestamp';
        timeSpan.textContent = formatTimestamp(entry.timestamp);
        div.appendChild(timeSpan);
    }
    
    // 消息内容
    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    
    // 如果有搜索查询，高亮显示匹配的文本
    if (currentSearchQuery && currentSearchQuery.trim()) {
        messageSpan.innerHTML = highlightSearchTerms(entry.message, currentSearchQuery);
    } else {
        messageSpan.textContent = entry.message;
    }
    
    div.appendChild(messageSpan);
    
    return div;
}

// 高亮搜索关键词
function highlightSearchTerms(text, searchQuery) {
    if (!text || !searchQuery) return text;
    
    // 转义HTML特殊字符
    const escapedText = text.replace(/[&<>"']/g, function(match) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return escapeMap[match];
    });
    
    // 转义正则表达式特殊字符
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 创建不区分大小写的正则表达式
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    // 替换匹配的文本为高亮版本
    return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// 格式化时间戳
function formatTimestamp(timestamp) {
    try {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date.toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3
            });
        }
    } catch (e) {
        // 如果解析失败，返回原始时间戳
    }
    return timestamp;
}

// 更新统计信息
async function updateStats() {
    console.log('updateStats called, filteredEntries length:', filteredEntries.length);
    if (!filteredEntries.length) {
        elements.statTotal.textContent = '0';
        elements.statError.textContent = '0';
        elements.statWarn.textContent = '0';
        elements.statInfo.textContent = '0';
        elements.statDebug.textContent = '0';
        console.log('Stats cleared (no entries)');
        return;
    }
    
    try {
        const stats = await tauriInvoke('get_log_stats', { entries: filteredEntries });
        console.log('Stats received:', stats);
        
        elements.statTotal.textContent = stats.total;
        elements.statError.textContent = stats.error;
        elements.statWarn.textContent = stats.warn;
        elements.statInfo.textContent = stats.info;
        elements.statDebug.textContent = stats.debug;
        console.log('Stats updated in UI');
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// 搜索日志
async function searchLogs(query) {
    if (!allEntries.length) return;
    
    // 保存当前搜索查询
    currentSearchQuery = query;
    
    if (!query) {
        filteredEntries = [...allEntries];
    } else {
        filteredEntries = await tauriInvoke('search_logs', {
            entries: allEntries,
            query: query
        });
    }
    
    // 应用级别过滤
    await filterByLevel();
}

// 按级别过滤
async function filterByLevel() {
    const checkedLevels = Array.from(
        document.querySelectorAll('.filter-label input[type="checkbox"]:checked')
    ).map(cb => cb.value);
    
    if (!allEntries.length) return;
    
    // 先获取搜索过滤后的结果
    const searchQuery = elements.searchInput.value;
    let baseEntries = allEntries;
    
    if (searchQuery) {
        baseEntries = await tauriInvoke('search_logs', {
            entries: allEntries,
            query: searchQuery
        });
    }
    
    // 再应用级别过滤
    if (checkedLevels.length === 0 || checkedLevels.length === 4) {
        filteredEntries = baseEntries;
    } else {
        filteredEntries = await tauriInvoke('filter_by_level', {
            entries: baseEntries,
            levels: checkedLevels
        });
    }
    
    displayLogs();
    updateStats();
}

// 按日期分组历史记录
function groupHistoryByDate(history) {
    const grouped = {};
    
    history.forEach(item => {
        const accessedAt = typeof item === 'object' && item.accessed_at !== 'Unknown'
            ? item.accessed_at
            : new Date().toISOString();
        
        const date = new Date(accessedAt);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        let dateKey;
        if (date.toDateString() === today.toDateString()) {
            dateKey = '今天';
        } else if (date.toDateString() === yesterday.toDateString()) {
            dateKey = '昨天';
        } else {
            // 格式化为 "MM月DD日"
            dateKey = date.toLocaleDateString('zh-CN', { 
                month: 'long', 
                day: 'numeric' 
            });
        }
        
        if (!grouped[dateKey]) {
            grouped[dateKey] = [];
        }
        grouped[dateKey].push(item);
    });
    
    return grouped;
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 加载历史记录
async function loadHistory() {
    try {
        const history = await tauriInvoke('get_history');
        
        elements.historyList.innerHTML = '';
        
        if (history.length === 0) {
            elements.historyList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No recent files</p>';
            return;
        }
        
        // 按日期分组
        const groupedHistory = groupHistoryByDate(history);
        
        // 渲染分组历史记录
        Object.keys(groupedHistory).forEach(dateGroup => {
            // 创建日期分组标题
            const dateHeader = document.createElement('div');
            dateHeader.className = 'history-date-group';
            dateHeader.textContent = dateGroup;
            elements.historyList.appendChild(dateHeader);
            
            // 添加该日期组下的文件
            groupedHistory[dateGroup].forEach(historyItem => {
                const item = document.createElement('div');
                item.className = 'history-item';
                
                // 处理兼容性：历史项可能是字符串（旧格式）或对象（新格式）
                const filePath = typeof historyItem === 'string' ? historyItem : historyItem.path;
                const fileName = typeof historyItem === 'string' 
                    ? filePath.split(/[/\\]/).pop()
                    : historyItem.file_name;
                const accessTime = typeof historyItem === 'object' && historyItem.accessed_at !== 'Unknown'
                    ? new Date(historyItem.accessed_at).toLocaleTimeString('zh-CN', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })
                    : '';
                const fileSize = typeof historyItem === 'object' && historyItem.file_size
                    ? formatFileSize(historyItem.file_size)
                    : '';
                
                item.innerHTML = `
                    <div class="history-item-name">${fileName}</div>
                    <div class="history-item-meta">
                        ${accessTime ? `<span class="history-time">${accessTime}</span>` : ''}
                        ${fileSize ? `<span class="history-size">${fileSize}</span>` : ''}
                    </div>
                    <div class="history-item-path">${filePath}</div>
                `;
                
                item.addEventListener('click', () => {
                    loadLogFile(filePath);
                    elements.historyPanel.classList.add('hidden');
                });
                
                elements.historyList.appendChild(item);
            });
        });
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

// 加载主题
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // 更新图标
    const icon = elements.toggleTheme.querySelector('svg path');
    if (savedTheme === 'dark') {
        icon.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
    }
}

// 显示/隐藏加载指示器
function showLoading(show) {
    if (show) {
        elements.loading.classList.remove('hidden');
    } else {
        elements.loading.classList.add('hidden');
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    
    init().catch(error => {
        console.error('Failed to initialize app:', error);
    });
});