/**
 * Electron Preload Script — 安全桥接层
 * NOTE: 兼容 contextIsolation: true 和 false 两种模式
 * contextIsolation: false 时 contextBridge.exposeInMainWorld 不工作，
 * 需要直接挂载到 window 对象上
 */
const { contextBridge, ipcRenderer } = require('electron');

const electronAPI = {
    // --- 缓存管理 ---
    checkAssetOffline: (fileName) => ipcRenderer.invoke('check-asset-offline', fileName),
    clearLocalCache: (options) => ipcRenderer.invoke('clear-local-cache', options),
    getCacheInfo: () => ipcRenderer.invoke('get-cache-info'),
    downloadAsset: (data) => ipcRenderer.send('download-asset', data),

    // --- 系统信息 ---
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getMac: () => ipcRenderer.invoke('get-mac'),
    getConfig: () => ipcRenderer.invoke('get-config'),
    getPdfPageCount: (filePath) => ipcRenderer.invoke('get-pdf-page-count', filePath),
    capturePage: () => ipcRenderer.invoke('capture-page'),

    // --- 电源控制 ---
    terminalPower: (action) => ipcRenderer.send('terminal-power', action),

    // --- 在线升级 ---
    upgradeApp: (data) => ipcRenderer.send('upgrade-app', data),

    // --- 配置与日志 ---
    saveSetup: (config) => ipcRenderer.send('save-setup', config),
    writeLog: (msg) => ipcRenderer.send('write-log', msg),

    // --- 事件监听 ---
    onAssetCached: (callback) => {
        const handler = (_event, fileName) => callback(fileName);
        ipcRenderer.on('asset-cached', handler);
        return () => ipcRenderer.removeListener('asset-cached', handler);
    },
    onPlayerLog: (callback) => {
        const handler = (_event, message) => callback(message);
        ipcRenderer.on('player-log', handler);
        return () => ipcRenderer.removeListener('player-log', handler);
    }
};

// NOTE: 关键兼容逻辑 — contextIsolation:false 时 contextBridge 不工作
if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI);
} else {
    window.electronAPI = electronAPI;
}
