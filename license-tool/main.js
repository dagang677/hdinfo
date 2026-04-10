const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const MASTER_KEY = "MATRIX_MASTER_2026";

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
        resizable: false,
        frame: false, // 无边框窗口更符合科技感
        backgroundColor: '#0a0f1d',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// 处理授权生成请求
ipcMain.on('generate-license', (event, data) => {
    const { projectName, expiry, quota, secret } = data;

    try {
        // 关键补丁：授权信息中必须内置超级标志位
        const payload = `${projectName}:${expiry}:${quota}:${secret}:true`;
        const payloadB64 = Buffer.from(payload).toString('base64');
        const sig = crypto.createHmac('sha256', MASTER_KEY).update(payloadB64).digest('hex').substring(0, 16);
        const licenseText = `${sig}|${payloadB64}`;

        // 关键：针对 Portable (便携版) 路径重定向
        // 便携版运行在临时目录，app.getPath('exe') 会返回临时路径。
        // electron-builder 会在运行便携版时设置 PORTABLE_EXECUTABLE_DIR 环境变量。
        const appPath = process.env.PORTABLE_EXECUTABLE_DIR ||
            (app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname);

        // 1. 安全化项目名并准备默认文件名
        const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `license_${safeProjectName}_${Date.now()}.dat`;
        const filePath = path.join(appPath, fileName);

        // 2. 物理写入 .dat 文件 (就在授权工具根目录)
        fs.writeFileSync(filePath, licenseText);

        // 3. 同步更新/追加 CSV 记录
        const csvPath = path.join(appPath, 'license_history.csv');
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString();
        const csvLine = `"${projectName}","${expiry}","${quota}","${secret}","${dateStr} ${timeStr}"\n`;

        if (!fs.existsSync(csvPath)) {
            // 添加 \ufeff 作为 UTF-8 BOM，解决 Excel 乱码
            fs.writeFileSync(csvPath, "\ufeff项目名称,有效期,终端限额,项目密钥,生成时间\n" + csvLine);
        } else {
            fs.appendFileSync(csvPath, csvLine);
        }

        event.reply('generate-success', { fileName, filePath });

    } catch (error) {
        event.reply('generate-error', error.message);
    }
});

ipcMain.on('close-app', () => app.quit());
ipcMain.on('minimize-app', () => BrowserWindow.getFocusedWindow().minimize());
