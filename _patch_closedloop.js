const fs = require('fs');

// 1. 修复 TerminalClientView.tsx — 在任务引擎中添加 cache 类型处理
let tcv = fs.readFileSync('views/TerminalClientView.tsx', 'utf8');

// 在 broadcastMatch 之后、JSON.stringify(primaryMatch) 之前插入 cache 处理
const cacheEngineCode = `
        // NOTE: cache 类型任务 — 时间窗命中时自动执行本地缓存清理
        const cacheMatch = activeMatches.find(t => t.type === 'cache');
        if (cacheMatch) {
          try {
            const { ipcRenderer } = window.require('electron');
            // 收集当前播放中的文件作为保护列表
            const protectedFiles: string[] = [];
            playlist.forEach((item: any) => {
              if (item.name) protectedFiles.push(item.name);
              if (item.content?.asset) protectedFiles.push(item.content.asset);
            });
            templates.forEach((tpl: any) => {
              tpl.layers?.forEach((l: any) => {
                if (l.type === 'media') {
                  const list = l.config?.playlist || [];
                  list.forEach((m: any) => { if (m.name) protectedFiles.push(m.name); });
                }
              });
            });
            ipcRenderer.invoke('clear-local-cache', { protectedFiles }).then((result: any) => {
              console.log('[Matrix Engine] Scheduled cache cleanup result:', result);
            });
          } catch (e) { /* 非 Electron 环境静默退出 */ }
        }

`;

const insertPoint = "        // 分离主任务 (asset/template) 与 叠加任务 (broadcast)";
if (tcv.includes(insertPoint)) {
    tcv = tcv.replace(insertPoint, cacheEngineCode + insertPoint);
    console.log('OK: cache engine code inserted');
} else {
    console.log('MISS: insert point not found');
}

// 但是 cache 不该每 5 秒都执行，需要加去重标记
// 在 cache 处理中加一个去重: 用 ref 记录上次清理时间
// 先找到 useRef 区域，在 layerIndices 后面加一个
const cacheLastCleanRef = "  const [layerIndices, setLayerIndices] = useState<Record<string, number>>({});";
if (tcv.includes(cacheLastCleanRef)) {
    tcv = tcv.replace(
        cacheLastCleanRef,
        cacheLastCleanRef + "\n  const lastCacheCleanTime = useRef<number>(0); // 防止 cache 任务重复执行"
    );
    console.log('OK: lastCacheCleanTime ref added');
} else {
    console.log('MISS: layerIndices line not found');
}

// 更新 cache 引擎代码，添加 30 分钟去重
tcv = tcv.replace(
    "        const cacheMatch = activeMatches.find(t => t.type === 'cache');\n        if (cacheMatch) {",
    "        const cacheMatch = activeMatches.find(t => t.type === 'cache');\n        // 30 分钟内不重复执行 cache 清理\n        if (cacheMatch && (Date.now() - lastCacheCleanTime.current > 30 * 60 * 1000)) {\n          lastCacheCleanTime.current = Date.now();"
);

fs.writeFileSync('views/TerminalClientView.tsx', tcv);
console.log('TerminalClientView.tsx patched');

// 2. 修复 server-host/main.js — 添加日志滚动
let shm = fs.readFileSync('server-host/main.js', 'utf8');

const oldLogFn = `function logToFile(msg) {\r\n    const time = new Date().toLocaleString();\r\n    const logMsg = \`[\${time}] \${msg}\\\\n\`;\r\n    try {\r\n        fs.appendFileSync(LOG_FILE, logMsg);\r\n    } catch (e) {\r\n        console.error('Logging failed:', e);\r\n    }\r\n}`;

const newLogFn = `// NOTE: 添加日志滚动机制，防止长期运行导致磁盘写满
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

function logToFile(msg) {
    const time = new Date().toLocaleString();
    const logMsg = \`[\${time}] \${msg}\\n\`;
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
}`;

if (shm.includes('function logToFile(msg)')) {
    // 替换整个函数
    const fnStart = shm.indexOf('function logToFile(msg)');
    const fnEnd = shm.indexOf('\n}', fnStart) + 2;
    shm = shm.substring(0, fnStart) + newLogFn + shm.substring(fnEnd);
    console.log('OK: server-host logToFile patched with rolling');
} else {
    console.log('MISS: logToFile not found in server-host');
}

fs.writeFileSync('server-host/main.js', shm);
console.log('server-host/main.js patched');

console.log('\nAll patches complete!');
