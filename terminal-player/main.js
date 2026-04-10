const { app, BrowserWindow, ipcMain, Menu, shell, protocol, globalShortcut } = require('electron');
const http = require('http');
const path = require('path');
const url = require('url');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const crypto = require('crypto'); // [v7.7.7] 引入加密模块用于 MD5 校验
const getmac = require('getmac');
const getMacAddress = () => {
    try {
        // 兼容 getmac 不同版本的导出结构
        if (typeof getmac.default === 'function') return getmac.default();
        if (typeof getmac === 'function') return getmac();
        return '00-00-00-00-00-00';
    } catch (e) {
        return '00-00-00-00-00-00';
    }
};

let mainWindow;
// NOTE: 版本号从 package.json 动态读取，升级后自动反映新版本
const APP_VERSION = (() => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        return pkg.version || '0.0.0';
    } catch (e) {
        return '0.0.0';
    }
})();
const CONFIG_FILE = path.join(app.getPath('userData'), 'player_config.json');

// --- 核心工具：ID 归一化 (匹配服务器逻辑) ---
const normalizeId = (id) => {
    if (!id) return '';
    let clean = id.toString().toUpperCase().trim();
    while (clean.startsWith('TERM-') || clean.startsWith('NODE-')) {
        clean = clean.replace(/^TERM-/, '').replace(/^NODE-/, '');
    }
    return clean;
};

// --- 缓存系统配置 (迁至程序同级目录) ---
const CACHE_DIR = path.join(path.dirname(app.isPackaged ? process.execPath : app.getAppPath()), 'media_cache');
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        try {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
            writeLog(`[System] Cache directory created at: ${CACHE_DIR} `);
        } catch (e) {
            console.error('Failed to create cache dir:', e);
        }
    }
}
ensureCacheDir();

// 注册本地资源协议 (必须在 app ready 之前完成)
protocol.registerSchemesAsPrivileged([
    { scheme: 'local-asset', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
]);

const LOG_FILE = path.join(path.dirname(app.isPackaged ? process.execPath : app.getAppPath()), 'player.log');

function writeLog(message) {
    const timestamp = new Date().toLocaleString();
    const logEntry = `[${timestamp}] ${message} \n`;
    try {
        fs.appendFileSync(LOG_FILE, logEntry);
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('player-log', message);
        }
    } catch (e) {
        console.error('Failed to write log:', e);
    }
}

// NOTE: PDF 頁數探測引擎 (究极版：2MB 深度搜索 + 增强正则)
async function getPdfPageCount(filePath) {
    if (!fs.existsSync(filePath)) return 1;
    try {
        const stats = fs.statSync(filePath);
        if (stats.size < 100) return 1;

        // [v7.7.9] 探测加固：全量二进制读取 (最高 20MB) 以绕过压缩干扰
        const readSize = Math.min(stats.size, 20 * 1024 * 1024);
        const buffer = fs.readFileSync(filePath).slice(0, readSize);
        const content = buffer.toString('latin1'); // latin1 保持字节一致性

        // 方案 A: 查找 /Type /Pages (获取根容器)
        const rootPagesMatch = content.match(/\/Type\s*\/Pages[\s\S]{1,500}\/Count\s*(\d+)/i);
        if (rootPagesMatch) {
            const count = parseInt(rootPagesMatch[1]);
            if (count > 0 && count < 10000) return count;
        }

        // 方案 B: 全局查找 /Count (取最大合理值)
        const allCounts = [...content.matchAll(/\/Count\s*(\d+)/gi)]
            .map(m => parseInt(m[1]))
            .filter(c => c > 0 && c < 10000);
        if (allCounts.length > 0) {
            return Math.max(...allCounts);
        }

        // 方案 C: 统计 /Type /Page 实体
        const pageMatches = content.match(/\/Type\s*\/Page\b/gi);
        if (pageMatches) {
            const plural = content.match(/\/Type\s*\/Pages\b/gi) || [];
            const count = pageMatches.length - plural.length;
            if (count > 0) return count;
        }

        // 方案 D: 搜索 /N
        const nMatches = content.match(/\/N\s+(\d+)/gi);
        if (nMatches) {
            const count = parseInt(nMatches[nMatches.length - 1].match(/\d+/)[0]);
            if (count > 0) return count;
        }

        return 1;
    } catch (e) {
        writeLog(`[PDF Probe] Error: ${e.message}`);
        return 1;
    }
}

// --- IPC 核心接口 ---
ipcMain.handle('get-pdf-page-count', async (event, fileName) => {
    const filePath = path.join(CACHE_DIR, fileName);
    return await getPdfPageCount(filePath);
});

ipcMain.handle('get-mac', async () => normalizeId(getMacAddress()));
ipcMain.handle('get-app-version', async () => app.getVersion());
ipcMain.handle('is-online', async () => {
    return new Promise((resolve) => {
        require('dns').lookup('google.com', (err) => {
            if (err) resolve(false);
            else resolve(true);
        });
    });
});

// [v7.9.4] 原生快照引擎：支持 PDF/网页真实画面捕获
ipcMain.handle('capture-page', async (event) => {
    if (!mainWindow || !mainWindow.webContents) return null;
    try {
        const image = await mainWindow.webContents.capturePage();
        return image.toDataURL(); // 返回 base64
    } catch (e) {
        writeLog(`[Snap] Native capture failed: ${e.message}`);
        return null;
    }
});

// 增加 IPC 监听，允许渲染进程写入 player.log
ipcMain.on('write-log', (event, msg) => {
    writeLog(msg);
});

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            writeLog(`[Config] Load error: ${e.message} `);
        }
    }
    return {
        serverIp: '127.0.0.1',
        serverPort: 3003,
        terminalId: '',
        terminalName: '未命名终端',
        groupId: 'default'
    };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (e) {
        writeLog(`[Config] Save error: ${e.message} `);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        fullscreen: true,
        kiosk: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            plugins: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    Menu.setApplicationMenu(null);

    const indexPath = path.join(__dirname, 'dist', 'index.html');
    const config = loadConfig();
    const mac = normalizeId(getMacAddress());
    const tid = config.terminalId || mac;
    const name = encodeURIComponent(config.terminalName || '未命名终端');
    const group = encodeURIComponent(config.groupId || 'default');

    if (fs.existsSync(indexPath)) {
        mainWindow.loadFile(indexPath, {
            query: { dna: mac, tid: tid, name: name, group: group, sip: config.serverIp, mode: 'terminal' }
        });
    } else {
        const url = `http://${config.serverIp}:${config.serverPort}/terminal.html?dna=${mac}&tid=${tid}&name=${name}&group=${group}&mode=terminal`;
        mainWindow.loadURL(url);
    }

    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true);

    // 关键修复：仅主框架加载失败才回退到本地离线模式，防止 PDF 加载错误由于事件冒泡导致主界面误跳
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) {
            writeLog(`[Boot] Main frame load failed: ${errorDescription}. Falling back to LOCAL CACHE mode.`);
            const indexPath = path.join(__dirname, 'dist', 'index.html');
            if (fs.existsSync(indexPath)) {
                const config = loadConfig();
                const mac = normalizeId(getMacAddress());
                const tid = config.terminalId || mac;
                const name = encodeURIComponent(config.terminalName || '未命名终端');
                const group = encodeURIComponent(config.groupId || 'default');

                mainWindow.loadFile(indexPath, {
                    query: { dna: mac, tid: tid, name: name, group: group, sip: config.serverIp, mode: 'terminal', offline: 'true' }
                });
            } else {
                writeLog('[Boot] Local dist not found, showing setup.');
                mainWindow.loadFile('setup.html');
            }
        } else {
            writeLog(`[System] Child element (possibly PDF) load failed at ${validatedURL}`);
        }
    });

    // [v7.8.3] 再次强化置顶与信号逻辑：启动即强制恢复显示信号
    mainWindow.on('ready-to-show', () => {
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.show();
        setDisplaySignal('on');
    });
}

app.whenReady().then(() => {
    // 设置开机自启动
    if (app.isPackaged) {
        app.setLoginItemSettings({
            openAtLogin: true,
            path: app.getPath('exe')
        });
    }

    // 注册调试快捷键 Shift+Ctrl+L 打开程序目录
    globalShortcut.register('Shift+Ctrl+L', () => {
        const programDir = path.dirname(app.isPackaged ? process.execPath : app.getAppPath());
        writeLog(`[Debug] Shortcut triggered: Opening program directory: ${programDir}`);
        shell.openPath(programDir);
    });

    // 实施本地资产协议拦截器
    protocol.registerFileProtocol('local-asset', (request, callback) => {
        try {
            // [v7.7.3] 究极加固：不再依赖 URL 对象解析域名，直接通过字符串切割获取文件名
            // 这种方式能完美处理所有异常字符 (空格、中文、多点、特殊字符)
            const rawUrl = request.url;
            let pathPart = '';

            // 识别并切割协议头
            if (rawUrl.startsWith('local-asset:///')) {
                pathPart = rawUrl.substring('local-asset:///'.length);
            } else if (rawUrl.startsWith('local-asset://')) {
                pathPart = rawUrl.substring('local-asset://'.length);
            } else {
                pathPart = rawUrl.replace(/^local-asset:?\/+/, '');
            }

            // 剥离查询参数与哈希 (如 ?f=A&t=...)
            const cleanPath = pathPart.split(/[?#]/)[0];

            // 步骤 1：先解码 %XX 编码 (如空格 %20)
            let decoded = decodeURIComponent(cleanPath);

            // 步骤 2：深度还原 Punycode (针对 Electron 自动对某些段落执行的转码)
            // 文件名可能被点号拆分为多组，每组都可能是 Punycode
            let fileName = decoded.split('/').map(segment => {
                return segment.split('.').map(label => {
                    if (label.startsWith('xn--')) {
                        try { return url.domainToUnicode(label); } catch (e) { return label; }
                    }
                    return label;
                }).join('.');
            }).join('/');

            // 步骤 3：归一化路径，移除多余斜杠
            fileName = fileName.replace(/^\/+/, '').replace(/\/+$/, '');

            const filePath = path.join(CACHE_DIR, fileName);

            if (fs.existsSync(filePath)) {
                callback({ path: filePath });
            } else {
                // 模糊匹配兜底 (处理编码、大小写或截断差异)
                const files = fs.readdirSync(CACHE_DIR);
                const matched = files.find(f =>
                    f.toLowerCase() === fileName.toLowerCase() ||
                    encodeURIComponent(f).toLowerCase() === fileName.toLowerCase() ||
                    f.includes(fileName.split('.')[0])
                );

                if (matched) {
                    callback({ path: path.join(CACHE_DIR, matched) });
                } else {
                    writeLog(`[Protocol] local-asset NOT FOUND: ${fileName} (Original: ${request.url})`);
                    callback({ error: -6 });
                }
            }
        } catch (e) {
            writeLog(`[Protocol] Critical Error: ${e.message} (URL: ${request.url})`);
            callback({ error: -2 });
        }
    });

    createWindow();
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll(); // 清理快捷键
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC 通信处理器
ipcMain.on('save-setup', (event, config) => {
    // 1. 物理固化配置 (React 传入 serverId, 映射为 serverIp，同时保留 serverId 提高兼容性)
    const finalConfig = {
        serverIp: config.serverId || config.serverIp,
        serverId: config.serverId || config.serverIp,
        serverPort: config.serverPort,
        terminalId: config.terminalId,
        terminalName: config.terminalName,
        groupId: config.groupId || 'default',
        license: config.license || ''
    };
    writeLog(`[Config] Solidifying setup: ID=${finalConfig.terminalId}, Name=${finalConfig.terminalName}`);
    saveConfig(finalConfig);

    // 2. 构造新的启动参数并重新加载 (彻底解决重启生效问题)
    const mac = normalizeId(getMacAddress());
    const tid = finalConfig.terminalId || mac;
    const name = encodeURIComponent(finalConfig.terminalName);
    const group = encodeURIComponent(finalConfig.groupId);
    const sip = finalConfig.serverIp;

    if (mainWindow) {
        const indexPath = path.join(__dirname, 'dist', 'index.html');
        writeLog('[Config] Re-loading window with new parameters.');

        if (fs.existsSync(indexPath)) {
            mainWindow.loadFile(indexPath, {
                query: {
                    dna: mac, tid: tid, name: name, group: group, sip: sip, mode: 'terminal'
                }
            });
        } else {
            const url = `http://${sip}:${finalConfig.serverPort}/terminal.html?dna=${mac}&tid=${tid}&name=${name}&group=${group}&mode=terminal`;
            mainWindow.loadURL(url);
        }
    }
});

// 获取配置供页面使用
ipcMain.handle('get-config', () => loadConfig());

// 获取缓存目录总大小
ipcMain.handle('get-cache-info', () => {
    try {
        const files = fs.readdirSync(CACHE_DIR);
        let totalSize = 0;
        files.forEach(f => {
            const stats = fs.statSync(path.join(CACHE_DIR, f));
            totalSize += stats.size;
        });
        return { count: files.length, size: (totalSize / (1024 * 1024)).toFixed(2) + ' MB' };
    } catch (e) {
        return { count: 0, size: '0 MB' };
    }
});

// [v7.7.7] 增强版离线检查：支持 MD5 强校验
ipcMain.handle('check-asset-offline', async (event, fileName, expectedMd5) => {
    try {
        const filePath = path.join(CACHE_DIR, fileName);
        if (!fs.existsSync(filePath)) return false;

        const stats = fs.statSync(filePath);
        if (stats.size < 10) return false;

        // [v7.8.0] 弱化校验：如果服务器未返回预期 MD5，则退化为“文件存在”模式，不进行 Hash 耗时计算
        if (!expectedMd5 || expectedMd5 === "") {
            return true;
        }

        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);

        return new Promise((resolve) => {
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => {
                const finalMd5 = hash.digest('hex');
                resolve(finalMd5.toLowerCase() === expectedMd5.toLowerCase());
            });
            stream.on('error', () => resolve(false));
        });
    } catch (e) {
        return false;
    }
});

// [v7.6 NEW] 直接读取本地文本文件，绕过 Fetch 协议限制
ipcMain.handle('read-text-file', async (event, fileName) => {
    try {
        const filePath = path.join(CACHE_DIR, fileName);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        return null;
    } catch (e) {
        writeLog(`[IPC] read-text-file error (${fileName}): ${e.message}`);
        return null;
    }
});

// 智能缓存清理 (支持排除正在使用的文件)
ipcMain.handle('clear-local-cache', async (event, options = {}) => {
    const protectedFiles = options.protectedFiles || []; // 正在播放的文件名列表

    try {
        writeLog(`[System] Smart cache cleanup started. Protected: ${protectedFiles.length} files`);

        if (!fs.existsSync(CACHE_DIR)) {
            return { success: true, message: 'Cache dir not found, nothing to clear.' };
        }

        const allFiles = fs.readdirSync(CACHE_DIR);
        let deletedCount = 0;
        let skippedCount = 0;
        let freedBytes = 0;

        for (const fileName of allFiles) {
            // 排除正在播放的文件
            if (protectedFiles.includes(fileName)) {
                writeLog(`[Cache] Skipping protected file: ${fileName}`);
                skippedCount++;
                continue;
            }

            const filePath = path.join(CACHE_DIR, fileName);
            try {
                const stats = fs.statSync(filePath);
                freedBytes += stats.size;
                fs.unlinkSync(filePath);
                deletedCount++;
            } catch (e) {
                writeLog(`[Cache] Failed to delete ${fileName}: ${e.message}`);
            }
        }

        writeLog(`[System] Cache cleanup complete. Deleted: ${deletedCount}, Skipped: ${skippedCount}, Freed: ${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
        return { success: true, deleted: deletedCount, skipped: skippedCount, freedMB: (freedBytes / 1024 / 1024).toFixed(2) };
    } catch (e) {
        writeLog(`[Error] Failed to clear cache: ${e.message}`);
        return { success: false, error: e.message };
    }
});

// 下载管理逻辑
const activeDownloads = new Map();
const https = require('https');


ipcMain.on('download-asset', (event, { url, fileName }) => {
    if (activeDownloads.has(fileName)) return;

    const finalPath = path.join(CACHE_DIR, fileName);
    if (fs.existsSync(finalPath)) {
        writeLog(`[Cache] Asset already exists, skipping: ${fileName}`);
        return;
    }

    const tmpPath = finalPath + '.tmp';
    writeLog(`[Cache] Syncing asset: ${fileName} from ${url}`);

    activeDownloads.set(fileName, true);

    const client = url.startsWith('https') ? require('https') : require('http');
    const request = client.get(url, (res) => {
        if (res.statusCode !== 200) {
            activeDownloads.delete(fileName);
            writeLog(`[Download] Failed: ${url} (Status: ${res.statusCode})`);
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            return;
        }

        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedSize = 0;
        const fileStream = fs.createWriteStream(tmpPath);
        const hash = crypto.createHash('md5');

        res.on('data', (chunk) => {
            downloadedSize += chunk.length;
            fileStream.write(chunk);
            hash.update(chunk); // 同步计算 MD5
        });

        res.on('end', () => {
            fileStream.end();
            activeDownloads.delete(fileName);
            const finalMd5 = hash.digest('hex');

            // [v7.7.7] 完整性与 MD5 双重校验
            if (totalSize > 0 && downloadedSize < totalSize) {
                writeLog(`[Download] Truncated: ${fileName} (${downloadedSize}/${totalSize})`);
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                return;
            }

            try {
                if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                fs.renameSync(tmpPath, finalPath);
                writeLog(`[Cache] Asset cached successfully: ${fileName} (MD5: ${finalMd5})`);
                if (mainWindow && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.webContents.send('asset-cached', fileName, finalMd5);
                }
            } catch (err) {
                writeLog(`[Cache] Finalize failed: ${err.message}`);
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            }
        });
    }).on('error', (err) => {
        activeDownloads.delete(fileName);
        writeLog(`[Download] Network Error: ${err.message}`);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    });
});

// --- 物理硬件重启函数 ---
function rebootHardware() {
    writeLog('[Power] Initiating hardware REBOOT (Restart-Computer -Force)...');
    exec('powershell -Command "Restart-Computer -Force"', (error, stdout, stderr) => {
        if (error) {
            writeLog(`[Power] PowerShell Reboot Failed: ${error.message}. Falling back to shutdown.exe...`);
            exec('C:\\Windows\\System32\\shutdown.exe /r /t 0 /f', (e2) => {
                if (e2) writeLog(`[Power] All reboot methods failed: ${e2.message}`);
            });
        }
        if (stderr) writeLog(`[Power] Reboot stderr: ${stderr.trim()}`);
    });
}

// --- 接收来自前端的物理控制指令 ---
ipcMain.on('terminal-power', (event, action) => {
    writeLog(`[Power] Received IPC action: ${action}`);
    if (action === 'off') {
        setDisplaySignal('off');
    } else if (action === 'on' || action === 'reboot') {
        // [v7.8.4] 恢复物理重启开机逻辑，配合 ready-to-show 的信号锁实现完美开屏
        rebootHardware();
    }
});

// --- 在线升级引擎 ---
ipcMain.on('upgrade-app', (event, { url }) => {
    // NOTE: 服务端下发的可能是相对路径 /api/assets/stream?filename=xxx
    // http.get() 需要完整 URL，这里自动从配置补全服务器地址
    let fullUrl = url;
    if (url && !url.startsWith('http')) {
        const cfg = loadConfig();
        fullUrl = `http://${cfg.serverIp}:${cfg.serverPort}${url}`;
    }

    // 将更新目录切到系统临时文件夹，避免安装程序因为脚本在应用目录内而无法删除旧文件夹
    const updateDir = path.join(app.getPath('temp'), 'MatrixUpdate');
    if (!fs.existsSync(updateDir)) fs.mkdirSync(updateDir, { recursive: true });

    const fileName = 'update.exe';
    const finalPath = path.join(updateDir, fileName);
    const tmpPath = finalPath + '.tmp';

    writeLog(`[Upgrade] Starting download from: ${fullUrl}`);
    const file = fs.createWriteStream(tmpPath);

    const client = fullUrl.startsWith('https') ? https : http;

    client.get(fullUrl, (response) => {
        if (response.statusCode !== 200) {
            writeLog(`[Upgrade] Download failed: Status ${response.statusCode} - ${url}`);
            file.close();
            if (fs.existsSync(tmpPath)) try { fs.unlinkSync(tmpPath); } catch (e) { }
            return;
        }

        response.pipe(file);

        file.on('finish', () => {
            file.close(() => {
                try {
                    if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
                    fs.renameSync(tmpPath, finalPath);
                    writeLog('[Upgrade] Package downloaded. Initializing detached updater...');

                    // NOTE: 使用绝对路径引用安装包，防止批处理脚本在切换目录后失效
                    // FIXME: 不可使用 taskkill /T (进程树杀死)，因为会连带杀掉执行本脚本的 cmd.exe
                    const updaterBat = [
                        '@echo off',
                        'cls',
                        'echo ========================================',
                        'echo   Matrix Terminal Player 正在更新...',
                        'echo ========================================',
                        'echo [1/4] 等待主程序退出...',
                        'timeout /t 3 /nobreak > nul',
                        'echo [2/4] 确保进程已关闭...',
                        'taskkill /F /IM MatrixTerminalPlayer.exe > nul 2>&1',
                        'timeout /t 2 /nobreak > nul',
                        'echo [3/4] 正在执行静默安装...',
                        `"${finalPath}" /S`,
                        'timeout /t 3 /nobreak > nul',
                        'echo [4/4] 正在重新启动程序...',
                        `start "" "${process.execPath}"`,
                        'echo 更新完成！',
                        'timeout /t 2 > nul',
                        'exit'
                    ].join('\r\n');
                    const scriptPath = path.join(updateDir, 'updater.bat');
                    fs.writeFileSync(scriptPath, updaterBat);

                    // 脱离父进程执行批处理 (移除 windowsHide 确保 UAC 提示可见)
                    const child = spawn('cmd.exe', ['/c', scriptPath], {
                        detached: true,
                        stdio: 'ignore'
                    });
                    child.on('error', (err) => {
                        writeLog(`[Upgrade] Failed to launch updater: ${err.message}`);
                    });
                    child.unref();

                    writeLog('[Upgrade] Batch trigger successful. System will exit in 1s for replacement.');
                    setTimeout(() => app.quit(), 1000);
                } catch (e) {
                    writeLog(`[Upgrade] Critical failure: ${e.message}`);
                }
            });
        });
    }).on('error', (err) => {
        writeLog(`[Upgrade] Network error: ${err.message}`);
        file.close();
        if (fs.existsSync(tmpPath)) try { fs.unlinkSync(tmpPath); } catch (e) { }
    });
});

/**
 * 设置显示器信号拓扑与电源状态 (深度加固版)
 * @param {'on' | 'off'} state 
 */
function setDisplaySignal(state) {
    const topology = state === 'on' ? 8 : 1; // 8: EXTERNAL, 1: INTERNAL
    const pwr = state === 'on' ? -1 : 2;     // -1: Wake, 2: Sleep
    writeLog(`[Power] Force Signal: ${state} (Topology: ${topology}, Power: ${pwr})`);

    // 采用 GUID 随机化类名，彻底杜绝所有 PowerShell 环境类型冲突
    const guid = Math.random().toString(36).substring(7);
    const psScript = `
        try {
            # 1. 设置显示拓扑
            $c = '[DllImport("user32.dll")] public static extern int SetDisplayConfig(uint n1, IntPtr p1, uint n2, IntPtr p2, uint f);'
            $t1 = Add-Type -MemberDefinition $c -Name "T_${guid}" -PassThru -ErrorAction SilentlyContinue
            $t1::SetDisplayConfig(0, [IntPtr]::Zero, 0, [IntPtr]::Zero, (0x80 -bor ${topology}))

            # 2. 发送显示器电源指令 (HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER)
            $m = '[DllImport("user32.dll")] public static extern int SendMessage(int h, int m, int w, int l);'
            $t2 = Add-Type -MemberDefinition $m -Name "P_${guid}" -PassThru -ErrorAction SilentlyContinue
            $t2::SendMessage(0xffff, 0x112, 0xf170, ${pwr})
        } catch {}
    `;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

    // 执行加固指令
    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, { timeout: 15000 }, (error, stdout, stderr) => {
        if (error) writeLog(`[Power] Hardware command error: ${error.message}`);
        else writeLog(`[Power] Hardware command sequence completed: ${state}`);

        // 只有当有实质性错误时才记录 stderr，过滤掉那些无意义的 CLIXML 进度通知
        if (stderr && stderr.includes('Error')) {
            writeLog(`[Power] Hardware command stderr: ${stderr.trim()}`);
        }
    });
}
