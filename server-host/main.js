const { app, BrowserWindow, Menu, Tray, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow;

// --- [核心增强] 单实例锁定机制 ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('Another instance is already running. Quitting.');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 当尝试启动第二个实例时，唤醒并聚焦到主窗口
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
let tray;
let serverChildProcess;
let bootRetryTimer;

// 环境路径探测逻辑: 优先使用安装目录/便携目录下的 matrix_storage
// 理由: 用户期望软件数据留在安装位置，除非明确修改
const getInitialStoragePath = () => {
    const exeDir = path.dirname(app.getPath('exe'));
    const localPath = path.join(exeDir, 'matrix_storage');
    const appDataPath = path.join(app.getPath('userData'), 'matrix_storage');

    // 探测策略:
    // 1. 如果 EXE 同级目录已存在存储文件夹，使用它 (安装版/便携版优先)
    if (fs.existsSync(localPath)) return localPath;
    // 2. 如果 AppData 里有且本地没有，使用 AppData (兼容升级)
    if (fs.existsSync(appDataPath)) return appDataPath;
    // 3. 都没有，默认在 EXE 同级创建 (防止占用 C 盘)
    return localPath;
};

const STORAGE_ROOT = getInitialStoragePath();
const CONFIG_FILE = path.join(STORAGE_ROOT, 'config.json');
const LOG_FILE = path.join(path.dirname(STORAGE_ROOT), 'boot.log');

// 内嵌 Base64 图标 (32x32 PNG, Matrix 风格蓝色 M)
const EMBEDDED_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABUklEQVR4nO2XO07DQBCGP0JBQUFBQYGgoKCgoEBQUFAgKBAUCAoEBYKCAsGLoOARiRcvggJBgaBAUCAoEBT8FLuyjnfXu7aTCH7J0mhn5p+dnZ0x/BMAE8AMMAL0gQvgGHgA3oAP4BN4Bz6AV+AZeAKegEfgAXgA7oE74Ba4AW6Aa+AquASugAvgHDgDToFT4AQ4Bo6AI+AQOAAOgH1gD9gFdoAdYBvYAjaATWADWAfWgFVgBVgGloAlYBFYABaAeWAOmAVmgGlgCpgEJoBxYAwYBUaAYWAIGAQGgH6gD+gFeoAeoBvoArqATqADaAfagFagBWgGmoBGoAGoB+qAWqAGqAaqgEqgAigHyoBSoAQoBooAM1AIFAB5QC6QA2QDWUAmkAGkA2lAKpACJAPJQBKQCCQA8UAcEAvEANFAFBD5FxH5r+IfA18gUH7rwd8HCQAAAABJRU5ErkJggg==';

function getAppIcon() {
    // 检查 resources 目录中的图标 (extraResources 配置)
    const resourcesPath = process.resourcesPath;
    let iconPath = path.join(resourcesPath, 'icon.png');
    if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
    }
    iconPath = path.join(resourcesPath, 'icon.ico');
    if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
    }
    // 检查开发环境的图标
    iconPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
    }
    iconPath = path.join(__dirname, 'icon.ico');
    if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
    }
    // 降级使用内嵌图标
    logToFile('External icon not found, using embedded icon.');
    return nativeImage.createFromDataURL(`data:image/png;base64,${EMBEDDED_ICON_BASE64}`);
}

// NOTE: 添加日志滚动机制，防止长期运行导致磁盘写满
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

function logToFile(msg) {
    const time = new Date().toLocaleString();
    const logMsg = `[${time}] ${msg}\n`;
    try {
        // 日志滚动：超过上限时归档旧文件
        if (fs.existsSync(LOG_FILE)) {
            const stats = fs.statSync(LOG_FILE);
            if (stats.size > MAX_LOG_SIZE) {
                const bakFile = LOG_FILE + '.bak';
                if (fs.existsSync(bakFile)) fs.unlinkSync(bakFile);
                fs.renameSync(LOG_FILE, bakFile);
            }
        }
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {
        console.error('Logging failed:', e);
    }
}

// 确保存储目录存在
if (!fs.existsSync(STORAGE_ROOT)) {
    fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            // 补丁：如果配置文件里显式指定了 storagePath，使用它
            if (config.storagePath && fs.existsSync(config.storagePath)) {
                return config;
            }
            return config;
        } catch (e) {
            logToFile(`Config parse error: ${e.message}`);
        }
    }
    return {};
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    logToFile('Config saved successfully.');
}

function getServerPath() {
    // ASAR 解压后的路径 (asarUnpack 配置)
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js');
    if (fs.existsSync(unpackedPath)) {
        logToFile(`Using unpacked server: ${unpackedPath}`);
        return unpackedPath;
    }
    // 开发环境路径
    const devPath = path.join(__dirname, 'server.js');
    if (fs.existsSync(devPath)) {
        logToFile(`Using dev server: ${devPath}`);
        return devPath;
    }
    logToFile('ERROR: server.js not found in any expected location!');
    return null;
}

function startServer() {
    if (serverChildProcess) return;

    const serverPath = getServerPath();
    if (!serverPath) {
        logToFile('Cannot start server: server.js not found.');
        return;
    }

    logToFile(`Starting server at: ${serverPath}`);
    logToFile(`STORAGE_ROOT: ${STORAGE_ROOT}`);

    try {
        // 使用系统 Node.js 或 Electron 内置 Node
        // 由于 server.js 已被 asarUnpack，我们可以直接用 Node.js 执行
        const nodePath = process.execPath; // Electron 自带 Node

        // 优先级：配置中保存的路径 > 初始探测路径
        const config = loadConfig();
        const finalStoragePath = config.storagePath || STORAGE_ROOT;

        serverChildProcess = spawn(nodePath, [serverPath], {
            env: {
                ...process.env,
                MATRIX_STORAGE_PATH: finalStoragePath,
                ELECTRON_RUN_AS_NODE: '1' // 关键：让 Electron 以纯 Node 模式运行
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: path.dirname(serverPath)
        });

        serverChildProcess.stdout.on('data', (data) => {
            logToFile(`[Server] ${data.toString().trim()}`);
        });

        serverChildProcess.stderr.on('data', (data) => {
            logToFile(`[Server ERR] ${data.toString().trim()}`);
        });

        serverChildProcess.on('error', (err) => {
            logToFile(`Server spawn error: ${err.message}`);
        });

        serverChildProcess.on('exit', (code) => {
            logToFile(`Server process exited with code ${code}`);
            serverChildProcess = null;
        });

        logToFile('✅ Server child process started. Waiting for port...');
        triggerSafeLoad();
    } catch (err) {
        logToFile(`Spawn exception: ${err.stack}`);
    }
}

function triggerSafeLoad() {
    if (bootRetryTimer) clearInterval(bootRetryTimer);

    let retryCount = 0;
    const MAX_RETRIES = 60;

    bootRetryTimer = setInterval(() => {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
            logToFile('❌ Boot failed: Server port 3003 not responding after 120s.');
            clearInterval(bootRetryTimer);
            return;
        }

        http.get('http://127.0.0.1:3003/', (res) => {
            logToFile(`Probe response: status=${res.statusCode}`);
            // 任何非错误状态码 (2xx, 3xx) 都表示服务器已就绪
            if (res.statusCode >= 200 && res.statusCode < 400) {
                logToFile(`✅ Server is ready (Attempt ${retryCount}, status ${res.statusCode}). Loading UI...`);
                clearInterval(bootRetryTimer);
                if (mainWindow) {
                    mainWindow.loadURL('http://127.0.0.1:3003').then(() => {
                        logToFile('✅ Management UI loaded successfully.');
                    }).catch(e => {
                        logToFile(`LoadURL error: ${e.message}`);
                    });
                }
            }
            res.resume();
        }).on('error', (err) => {
            if (retryCount % 5 === 0) logToFile(`Waiting for server (Attempt ${retryCount}): ${err.message}`);
        });
    }, 2000);
}

function createWindow() {
    const config = loadConfig();
    const appIcon = getAppIcon();

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: appIcon,
        webPreferences: {
            nodeIntegration: true, // 启用以确保引导页 100% 正常通信
            contextIsolation: false,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        },
        show: false,
        title: "MATRIX DMS - 管理节点"
    });

    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);

    logToFile('Booting loading screen.');
    // 如果没有配置过 IP 或角色，强制进入设置引导页
    if (!config.ip || !config.server_role) {
        logToFile('Config incomplete. Loading setup wizard.');
        mainWindow.setSize(480, 600); // 更加一致和美观的初始尺寸
        mainWindow.center();
        mainWindow.loadFile('setup.html').then(() => {
            mainWindow.show();
        });
    } else {
        mainWindow.loadFile('loading.html').then(() => {
            mainWindow.show();
        });
        startServer();
    }
    createTray();

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        if (validatedURL.includes('127.0.0.1:3003') || validatedURL.includes('localhost:3003')) {
            logToFile(`App load failed: ${errorDescription}. Falling back to loader.`);
            mainWindow.loadFile('loading.html');
            triggerSafeLoad();
        }
    });

    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    if (tray) return;

    try {
        const appIcon = getAppIcon();
        tray = new Tray(appIcon);
        logToFile('Tray created successfully.');

        const wakeWindow = () => {
            if (!mainWindow) return;
            logToFile('Waking window via tray action...');
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(true);
            setTimeout(() => mainWindow.setAlwaysOnTop(false), 200);
        };

        const contextMenu = Menu.buildFromTemplate([
            { label: '显示管理中心', click: () => wakeWindow() },
            { type: 'separator' },
            { label: '查看运行日志', click: () => shell.openPath(LOG_FILE) },
            { type: 'separator' },
            {
                label: '退出系统 (Exit)', click: () => {
                    app.isQuitting = true;
                    if (serverChildProcess) serverChildProcess.kill();
                    app.quit();
                }
            }
        ]);

        tray.setToolTip('Matrix DMS Server');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => wakeWindow());
        tray.on('double-click', () => wakeWindow());
    } catch (e) {
        logToFile(`Tray creation failed: ${e.message}`);
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => { });

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 重新实现 save-setup 监听，处理初始配置逻辑
ipcMain.on('save-setup', (event, data) => {
    logToFile(`[Setup] Received initial setup data: ${JSON.stringify(data)}`);
    const config = loadConfig();

    // 合并初始配置
    config.ip = data.serverIp || '127.0.0.1';
    config.server_role = data.serverRole || 'master';
    config.master_ip = data.masterIp || '';
    config.server_name = data.projectName || 'Matrix Server';
    config.storagePath = STORAGE_ROOT; // 默认存储路径

    // [v8.6.1] 初始导入授权
    if (data.licenseData) {
        config.sys_metadata = data.licenseData;
        logToFile('License imported during setup.');
    }

    saveConfig(config);

    logToFile('✅ Setup complete. Rebooting server...');
    if (serverChildProcess) {
        serverChildProcess.kill();
        serverChildProcess = null;
    }

    // 配置完成后恢复全屏管理尺寸
    if (mainWindow) {
        mainWindow.setSize(1200, 800);
        mainWindow.center();
        mainWindow.loadFile('loading.html');
        startServer();
    }
});

// [v8.6.1] 允许从管理界面重新调起初始化页面
ipcMain.on('open-setup', (event) => {
    logToFile('[Setup] Opening setup wizard via manual request.');
    if (mainWindow) {
        mainWindow.setSize(480, 600);
        mainWindow.center();
        mainWindow.loadFile('setup.html').then(() => {
            mainWindow.show();
        });
    }
});
