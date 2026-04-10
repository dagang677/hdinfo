
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = 3003;

// 跨环境路径兼容逻辑 (兼容本地开发、pkg 打包与 Electron 托管)
const isPackaged = process.pkg !== undefined;
const BASE_BIN_PATH = process.env.MATRIX_STORAGE_PATH
  ? process.env.MATRIX_STORAGE_PATH
  : (isPackaged ? path.dirname(process.execPath) : __dirname);

const STORAGE_ROOT = process.env.MATRIX_STORAGE_PATH || path.join(BASE_BIN_PATH, 'matrix_storage');
const TEMP_DIR = path.join(STORAGE_ROOT, '_temp');
const TEMPLATES_DIR = path.join(STORAGE_ROOT, '_templates');
const TEMPLATES_FILE = path.join(STORAGE_ROOT, 'templates.json');
const TASKS_DIR = path.join(STORAGE_ROOT, '_tasks');
const LOGS_DIR = path.join(STORAGE_ROOT, '_logs');
const CATEGORIES_FILE = path.join(STORAGE_ROOT, 'categories.json');
const USERS_FILE = path.join(STORAGE_ROOT, 'users.json');
const ROLES_FILE = path.join(STORAGE_ROOT, 'roles.json');

const CONFIG_FILE = path.join(STORAGE_ROOT, 'config.json');
const CMD_QUEUE_DIR = path.join(STORAGE_ROOT, '_cmd_queue');

const SNAPSHOTS_DIR = path.join(STORAGE_ROOT, '_snapshots');

// 自动化环境初始化 (出厂状态保障)
[STORAGE_ROOT, TEMP_DIR, TEMPLATES_DIR, TASKS_DIR, LOGS_DIR, CMD_QUEUE_DIR, SNAPSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 默认初始化角色 (物理固化)
const INITIAL_ROLES = [
  { id: 'role-super', name: '超级管理员组', permissions: ['dashboard', 'assets', 'templates', 'terminals', 'tasks', 'logs', 'users', 'system-settings'], isImmutable: true }
];

if (!fs.existsSync(ROLES_FILE)) {
  fs.writeFileSync(ROLES_FILE, JSON.stringify(INITIAL_ROLES, null, 2));
} else {
  // 维护逻辑：合并/迁移旧版管理员角色并强制物理固化
  let roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));
  // 移除旧版 role-admin，全量迁移至 role-super
  roles = roles.filter(r => r.id !== 'role-admin');
  if (!roles.find(r => r.id === 'role-super')) {
    roles.push(INITIAL_ROLES[0]);
  } else {
    // 强制同步超级组权限
    const superRole = roles.find(r => r.id === 'role-super');
    superRole.permissions = INITIAL_ROLES[0].permissions;
    superRole.isImmutable = true;
  }
  fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
}

// 默认初始化账号 (物理固化)
const INITIAL_USERS = [
  { id: 'u-super', account: '000000', name: '核心超级管理员', roleId: 'role-super', password: '999999', isSuper: true, isImmutable: true }
];

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(INITIAL_USERS, null, 2));
} else {
  // 维护逻辑：强制清理 admin 与旧角色关联，确保 000000 存在且密码正确
  let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  // 移除旧有 admin 账号
  users = users.filter(u => u.account !== 'admin' && u.id !== 'u-admin');

  // 检查或注入超级账号
  let superUser = users.find(u => u.id === 'u-super' || u.account === '000000');
  if (!superUser) {
    users.push(INITIAL_USERS[0]);
  } else {
    // 强制修正超级账号属性与角色挂载
    superUser.id = 'u-super';
    superUser.account = '000000';
    superUser.roleId = 'role-super';
    superUser.password = '999999';
    superUser.isSuper = true;
    superUser.isImmutable = true;
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// 初始化或读取核心配置
const getSystemConfig = () => {
  if (fs.existsSync(CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    // 自动补全授权元数据字段
    if (!config.sys_metadata) config.sys_metadata = null;
    if (!config.bound_macs) config.bound_macs = [];
    return config;
  }
  return {
    ip: '127.0.0.1',
    port: 3003,
    storagePath: STORAGE_ROOT,
    allowedShields: ["F4B1464C"],
    sys_metadata: null, // 隐形授权数据队列
    bound_macs: [], // 已绑定的物理网卡名单
    ota_standard_version: '1.3.0', // 新增：系统标准版本 (用于对比高亮)
    ota_upgrade_url: '', // 新增：全局升级包下载地址
    server_role: 'master', // 新增：服务器角色 (master/secondary)
    server_name: 'Matrix Master Server', // 新增：服务器易记名称
    master_ip: '' // 新增：若为从服务器，此处指向主服务器 IP
  };
};

// 授权信息实时解析函数
const parseLicense = (metadata) => {
  if (!metadata) return { isValid: false, reason: '未授权' };
  const MASTER_KEY = "MATRIX_MASTER_2026"; // 厂商持有的母密钥（需严密保管）

  try {
    // 密文格式为: SIGNATURE|BASE64_PAYLOAD
    // PAYLOAD 内容: PROJECT_NAME:EXPIRY:QUOTA:SECRET
    const [sig, payloadB64] = metadata.split('|');
    if (!sig || !payloadB64) return { isValid: false, reason: '授权格式不完整' };

    // 1. 签名校验 (确保是您的工具生成的)
    const expectedSig = crypto.createHmac('sha256', MASTER_KEY).update(payloadB64).digest('hex').substring(0, 16);
    if (sig !== expectedSig) return { isValid: false, reason: '数字签名非法（非官方授权）' };

    // 2. 数据解析
    const payload = Buffer.from(payloadB64, 'base64').toString();
    const [projectName, expiryStr, quotaStr, secret, isSuperStr] = payload.split(':');

    const expiry = new Date(expiryStr);
    const quota = parseInt(quotaStr);
    const isSuper = isSuperStr === 'true'; // 识别授权中的超级管理员标志

    if (expiry < new Date()) return { isValid: false, reason: '授权已过期', projectName, expiry, quota };
    return { isValid: true, projectName, expiry, quota, secret, isSuper };
  } catch (e) {
    return { isValid: false, reason: '数据队损毁或非法' };
  }
};

const saveSystemConfig = (config) => {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
};

// 配置CORS，允许来自http://localhost:5173的请求
const corsOptions = {
  origin: '*', // 允许所有origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-User-Info', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 预检请求的缓存时间（秒）
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// --- [v8.6.0] Secondary Server Proxy Logic ---
// 如果是从服务器，则将除了基础配置和鉴权以外的所有管理请求转发至主服务器
const proxyToMaster = (req, res, next) => {
  const config = getSystemConfig();
  if (config.server_role === 'secondary' && config.master_ip) {
    // 白名单：这些接口必须由本地从服务器处理，不能转发
    const whiteList = [
      '/api/system/config',
      '/api/auth/verify',
      '/api/auth/login',
      '/api/users',
      '/api/sys/license-status'
    ];

    const isWhiteListed = whiteList.some(p => req.path.startsWith(p));
    const isManagementApi = req.path.startsWith('/api/') || req.path.startsWith('/upload/');

    if (isManagementApi && !isWhiteListed) {
      const http = require('http');
      const port = config.port || 3003;
      const masterUrl = `http://${config.master_ip}:${port}${req.originalUrl}`;
      console.log(`[Proxy] Managed Redirect: ${req.method} ${req.path} -> Master (${config.master_ip})`);

      const connector = http.request(masterUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          host: config.master_ip // 关键：修正 Host 头以通过 Master 的跨域检查
        }
      }, (resp) => {
        res.writeHead(resp.statusCode, resp.headers);
        resp.pipe(res);
      });

      connector.on('error', (err) => {
        console.error('[Proxy Error]', err.message);
        res.status(502).json({ error: 'Master Server Unreachable', details: err.message });
      });

      req.pipe(connector);
      return;
    }
  }
  next();
};

app.use(proxyToMaster);

// --- 全局授权拦截中间件 ---
const licenseGuard = (req, res, next) => {
  // 排除登录、静态资源、授权救援接口、终端通信接口（终端有独立校验逻辑）
  const whiteList = [
    '/api/sys/license-rescue',
    '/api/sys/license-import', // 授权导入接口
    '/api/sys/license-status',
    '/api/system/config',
    '/api/users', // 登录需要拉取用户列表
    '/api/auth',  // 登录与验证通知
    '/api/terminals/heartbeat',
    '/api/terminals/snapshot',
    '/terminal.html'
  ];

  if (whiteList.some(p => req.path.startsWith(p)) || req.path === '/' || !req.path.startsWith('/api')) {
    return next();
  }

  const config = getSystemConfig();
  const license = parseLicense(config.sys_metadata);

  if (!license.isValid) {
    return res.status(402).json({
      error: 'License Required',
      reason: license.reason,
      expiry: license.expiry
    });
  }
  next();
};

app.use(licenseGuard);

// 从请求头获取用户信息
const getUserFromRequest = (req) => {
  try {
    const userInfoHeader = req.headers['x-user-info'];
    if (userInfoHeader) {
      try {
        // 尝试解码Base64编码的用户信息
        const decodedUserInfo = decodeURIComponent(escape(Buffer.from(userInfoHeader, 'base64').toString()));
        const userInfo = JSON.parse(decodedUserInfo);
        return {
          userAccount: userInfo.account || userInfo.userAccount,
          userName: userInfo.name || userInfo.userName
        };
      } catch (base64Error) {
        // 如果Base64解码失败，尝试直接解析
        try {
          const userInfo = JSON.parse(userInfoHeader);
          return {
            userAccount: userInfo.account || userInfo.userAccount,
            userName: userInfo.name || userInfo.userName
          };
        } catch (jsonError) {
          // 忽略所有解析错误
        }
      }
    }
  } catch (e) {
    // 忽略解析错误
  }
  return null;
};

// --- 核心工具：ID 归一化 (强制归一化以防止指令丢失) ---
const normalizeId = (id) => {
  if (!id) return '';
  let clean = id.toString().toUpperCase().trim();
  while (clean.startsWith('TERM-') || clean.startsWith('NODE-')) {
    clean = clean.replace(/^TERM-/, '').replace(/^NODE-/, '');
  }
  return clean;
};

// --- 日志记录功能 --- 
const logAction = (userAccount, userName, action, module, target, status, ip, details = {}) => {
  const logEntry = {
    id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    userAccount,
    userName,
    action,
    module,
    target,
    status,
    ip,
    details: typeof details === 'string' ? details : JSON.stringify(details)
  };

  // 使用 .log 后缀区分新版 JSONL 格式，并按日滚动
  const fileName = `${new Date().toISOString().split('T')[0]}.log`;
  const logFile = path.join(LOGS_DIR, fileName);

  try {
    // 采用追加模式 (Atomic Append)，彻底解决高并发下的文件锁与数据覆盖问题
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (e) {
    console.error('[LogAction] Failed to write log:', e);
  }

  return logEntry;
};

// 获取日志列表 (支持 limit 参数)
app.get('/api/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 2000;
    // 同时支持兼容旧版 .json 和新版 .log
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.log') || f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));

    let allLogs = [];
    for (const file of files) {
      try {
        const filePath = path.join(LOGS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf8');

        if (file.endsWith('.json')) {
          // 兼容旧版全量 JSON
          const logs = JSON.parse(content);
          allLogs = [...allLogs, ...logs];
        } else {
          // 解析新版 JSONL (逐行解析)
          const lines = content.trim().split('\n');
          // 最新日志在文件末尾，所以需要反转
          for (let i = lines.length - 1; i >= 0; i--) {
            if (!lines[i].trim()) continue;
            try {
              allLogs.push(JSON.parse(lines[i]));
            } catch (e) { }
            if (limit > 0 && allLogs.length >= limit) break;
          }
        }

        if (limit > 0 && allLogs.length >= limit) {
          allLogs = allLogs.slice(0, limit);
          break;
        }
      } catch (e) { }
    }

    // 二次排序确保跨文件边界的时间顺序
    allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(allLogs);
  } catch (e) {
    res.json([]);
  }
});

// 系统统计摘要接口 (大幅提升 Dashboard 加载速度)
app.get('/api/stats/summary', (req, res) => {
  try {
    const terminalCount = Object.keys(terminalHeartbeats).length;

    let taskCount = 0;
    if (fs.existsSync(TASKS_DIR)) {
      taskCount = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.json')).length;
    }

    let templateCount = 0;
    if (fs.existsSync(TEMPLATES_FILE)) {
      templateCount = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8')).length;
    }

    let assetSize = 0;
    const assets = fs.readdirSync(STORAGE_ROOT);
    assets.forEach(item => {
      const fullPath = path.join(STORAGE_ROOT, item);
      if (fs.statSync(fullPath).isFile() && !item.startsWith('.') && !item.startsWith('_') && !item.endsWith('.json')) {
        assetSize += fs.statSync(fullPath).size;
      }
    });

    // 仅读取最近一天的日志来统计风险
    let securityRisks = 0;
    const logFiles = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    if (logFiles.length > 0) {
      const latestLogs = JSON.parse(fs.readFileSync(path.join(LOGS_DIR, logFiles[0]), 'utf8'));
      securityRisks = latestLogs.filter(l => l.status === 'failure').length;
    }

    res.json({
      terminals: terminalCount,
      tasks: taskCount,
      templates: templateCount,
      assetsSizeMB: (assetSize / (1024 * 1024)).toFixed(2),
      securityRisks,
      uptime: process.uptime()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 登录通知API
app.post('/api/auth/login', (req, res) => {
  const { userAccount, userName, userId, roleId, isSuper } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');

  try {
    logAction(userAccount, userName, '用户登录', 'security', userId, 'success', clientIp, {
      roleId,
      isSuper,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: 'Login recorded successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 在线会话合法性校验
app.post('/api/auth/verify', (req, res) => {
  const { userId, account } = req.body;

  try {
    if (!fs.existsSync(USERS_FILE)) return res.json({ valid: false });
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    // 检查用户是否存在且关键信息匹配 (特别是对于已清理的 admin 账号会返回 false)
    const user = users.find(u => u.id === userId && u.account === account);

    if (user) {
      res.json({ valid: true, user: { id: user.id, account: user.account, name: user.name, roleId: user.roleId, isSuper: user.isSuper } });
    } else {
      res.json({ valid: false });
    }
  } catch (e) {
    res.json({ valid: false });
  }
});

// 清除日志
app.delete('/api/logs/clear', (req, res) => {
  try {
    const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      fs.unlinkSync(path.join(LOGS_DIR, file));
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 系统核心配置与物理映射 API ---

// 校验是否为本机请求
const checkIsLocal = (req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;

  // 放宽策略：允许内网 IP 段访问（10.*, 172.16-31.*, 192.168.*）
  const isLan = /^(127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(ip);
  return isLan;
};

app.get('/api/system/config', (req, res) => {
  const config = getSystemConfig();
  const isLocal = checkIsLocal(req);

  res.json({
    ...config,
    isLocal,
    ip: config.ip || '127.0.0.1',
    port: config.port || 3003,
    storagePath: path.resolve(config.storagePath || STORAGE_ROOT),
    ports: {
      frontend: 5174,
      backend: 3003,
      terminal: 3003
    },
    storageStructure: [
      { name: '素材存储根目录', path: '', id: 'root' },
      { name: '审计日志库', path: '_logs', id: 'logs' },
      { name: '终端快照库', path: '_snapshots', id: 'snapshots' },
      { name: '任务计划库', path: '_tasks', id: 'tasks' },
      { name: '临时交换区', path: '_temp', id: 'temp' },
      { name: '策略模板库', path: '_templates', id: 'templates' }
    ]
  });
});

// 保存核心配置
app.post('/api/system/config', (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const { ip, port, storagePath, ota_standard_version, ota_upgrade_url } = req.body;

  try {
    const config = getSystemConfig();
    config.ip = ip || config.ip;
    config.port = port || config.port;
    config.storagePath = storagePath || config.storagePath;
    config.ota_standard_version = ota_standard_version || config.ota_standard_version;
    config.ota_upgrade_url = ota_upgrade_url || config.ota_upgrade_url;

    // Add new fields for master/secondary server roles
    config.server_role = req.body.server_role || config.server_role;
    config.server_name = req.body.server_name || config.server_name;
    config.master_ip = req.body.master_ip || config.master_ip;

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    logAction('SYSTEM', 'Admin', '更新核心配置', 'system-settings', 'CONFIG', 'success', clientIp, {
      ota_standard_version,
      ota_upgrade_url,
      server_role: config.server_role,
      server_name: config.server_name,
      master_ip: config.master_ip
    });
    res.json({ success: true });
  } catch (err) {
    logAction('SYSTEM', 'Admin', '更新核心配置', 'system-settings', 'CONFIG', 'failure', clientIp, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// 授权文件导入接口 (v1.7)
app.post('/api/sys/license-import', multer().single('license'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未检测到授权文件' });

    const content = req.file.buffer.toString('utf8').trim();
    const license = parseLicense(content);

    if (!license.isValid) {
      return res.status(400).json({ error: `无效授权文件: ${license.reason}` });
    }

    // 写入物理配置
    const config = getSystemConfig();
    config.sys_metadata = content;
    saveSystemConfig(config);

    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
    logAction('SYSTEM', 'Core Engine', '导入授权文件', 'security', license.projectName, 'success', clientIp, {
      expiry: license.expiry,
      quota: license.quota
    });

    res.json({ success: true, message: '系统授权已物理对齐，核心链路已恢复' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/system/config', (req, res) => {
  if (!checkIsLocal(req)) {
    return res.status(403).json({ error: '安全策略：核心参数仅允许在服务器本机修改。' });
  }
  const incomingConfig = req.body;
  const existingConfig = getSystemConfig();

  // 合并策略：保护授权字段不被前端请求覆盖
  const mergedConfig = {
    ...existingConfig,
    ip: incomingConfig.ip ?? existingConfig.ip,
    port: incomingConfig.port ?? existingConfig.port,
    storagePath: incomingConfig.storagePath ?? existingConfig.storagePath,
    allowedShields: incomingConfig.allowedShields ?? existingConfig.allowedShields,
    // 授权相关字段保持原样，除非显式更新
    sys_metadata: existingConfig.sys_metadata,
    bound_macs: existingConfig.bound_macs
  };

  saveSystemConfig(mergedConfig);
  res.json({ success: true });
});

app.post('/api/system/open-folder', (req, res) => {
  if (!checkIsLocal(req)) {
    return res.status(403).json({ error: '安全策略：出于隐私保护，禁止远程访问服务器物理路径。' });
  }
  const { folderPath } = req.body;
  const targetPath = path.resolve(STORAGE_ROOT, folderPath);

  if (!targetPath.startsWith(STORAGE_ROOT)) {
    return res.status(400).json({ error: '非法路径访问' });
  }

  const { exec } = require('child_process');
  exec(`start "" "${targetPath}"`, (err) => {
    if (err) res.status(500).json({ error: '无法开启文件夹: ' + err.message });
    else res.json({ success: true });
  });
});

// --- 授权自检 API ---
app.get('/api/sys/license-status', (req, res) => {
  const config = getSystemConfig();
  const license = parseLicense(config.sys_metadata);

  // 获取当前已绑定的网卡数量（简单统计终端心跳包即可，此处简化为返回当前配置的状态）
  const boundCount = config.bound_macs ? config.bound_macs.length : 0;

  res.json({
    isValid: license.isValid,
    reason: license.reason,
    expiry: license.expiry,
    projectName: license.projectName,
    quota: license.quota,
    boundCount: boundCount,
    metadataHint: config.sys_metadata ? config.sys_metadata.substring(0, 16) + '...' : null
  });
});

// 授权救援接口
app.post('/api/sys/license-rescue', (req, res) => {
  const { metadata } = req.body;
  if (!metadata) return res.status(400).json({ error: 'Missing metadata' });

  const license = parseLicense(metadata);
  if (!license.isValid) return res.status(403).json({ error: license.reason });

  const config = getSystemConfig();
  config.sys_metadata = metadata;
  saveSystemConfig(config);

  res.json({ success: true, message: 'License updated successfully' });
});

// --- 物理指令队列 API ---
app.get('/api/terminals/commands/queue', (req, res) => {
  const { shieldId } = req.query;
  const config = getSystemConfig();

  // 基础盾鉴权
  if (config.allowedShields && !config.allowedShields.includes(shieldId)) {
    return res.status(403).json({ error: 'Shield mismatch' });
  }

  // 读取并清除针对该盾的指令
  const queueFile = path.join(CMD_QUEUE_DIR, `${shieldId}.json`);
  let commands = [];
  if (fs.existsSync(queueFile)) {
    commands = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    fs.unlinkSync(queueFile); // 取走即删除，保证指令消费一次
  }
  res.json({ commands });
});

// --- 授权配额预检查 API (v1.8) ---
// 供终端在 Setup 阶段预检测是否还能注册，防止盲目注册
app.get('/api/sys/check-quota', (req, res) => {
  const { mac } = req.query;
  const config = getSystemConfig();
  const license = parseLicense(config.sys_metadata);

  if (!license.isValid) {
    return res.status(403).json({
      error: 'License Invalid',
      reason: license.reason,
      status: 'locked'
    });
  }

  const normalizedMac = mac ? mac.toString().toUpperCase().trim() : '';
  const isAlreadyBound = config.bound_macs.includes(normalizedMac);
  const currentCount = config.bound_macs.length;

  if (!isAlreadyBound && currentCount >= license.quota) {
    return res.status(403).json({
      error: 'Quota Full',
      message: `授权名额已满 (当前: ${currentCount}, 限额: ${license.quota})`,
      quota: license.quota,
      bound: currentCount
    });
  }

  res.json({
    success: true,
    quota: license.quota,
    bound: currentCount,
    isAlreadyBound,
    projectName: license.projectName
  });
});

// --- 用户与角色管理 API ---
app.get('/api/users', (req, res) => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

      // 自动修复逻辑：适配旧版本的字段名 (username -> account)
      let needsRepair = false;
      users = users.map(u => {
        if (!u.account && u.username) {
          needsRepair = true;
          return { ...u, account: u.username, id: u.id || `u-${Date.now()}` };
        }
        return u;
      });

      if (needsRepair) {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
      }

      res.json(users);
    } else {
      const defaultUsers = [
        { id: 'u-super', account: '000000', name: '核心超级管理员', roleId: 'role-super', password: '999999', isSuper: true, isImmutable: true }
      ];
      fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
      res.json(defaultUsers);
    }
  } catch (e) {
    res.json([]);
  }
});

// 保存用户
app.post('/api/users/save', (req, res) => {
  const user = req.body;
  if (!user.id) return res.status(400).json({ error: 'Missing user ID' });

  // 核心保护：禁止通过 API 修改超级账号
  if (user.id === 'u-super' || user.account === '000000') {
    return res.status(403).json({ error: '安全锁定：核心超级管理员账号禁止外部修改' });
  }

  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const index = users.findIndex(u => u.id === user.id);

  if (index !== -1) {
    // 检查是否试图修改他人为超级权限（增强安全性）
    if (user.isSuper && !users[index].isSuper) {
      // 逻辑上只有超级管理员能授权，但此处简单屏蔽外部提权
    }
    users[index] = { ...users[index], ...user };
  } else {
    users.push(user);
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  res.json({ success: true });
});

// 删除用户
app.delete('/api/users/delete', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing ID' });

  // 核心保护：禁止删除超级账号
  if (id === 'u-super') {
    return res.status(403).json({ error: '安全锁定：核心超级管理员账号禁止注销' });
  }

  let users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  users = users.filter(u => u.id !== id);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  res.json({ success: true });
});

app.get('/api/roles', (req, res) => {
  try {
    if (fs.existsSync(ROLES_FILE)) {
      const roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));
      res.json(roles);
    } else {
      const defaultRoles = [{ id: 'role-super', name: '超级管理员组', permissions: ['dashboard', 'assets', 'templates', 'terminals', 'tasks', 'logs', 'users', 'system-settings'], isImmutable: true }];
      fs.writeFileSync(ROLES_FILE, JSON.stringify(defaultRoles, null, 2));
      res.json(defaultRoles);
    }
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/roles/save', (req, res) => {
  const newRole = req.body;
  if (newRole.id === 'role-super') {
    return res.status(403).json({ error: '安全锁定：核心超级权限组禁止外部修改' });
  }
  try {
    let roles = [];
    if (fs.existsSync(ROLES_FILE)) roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));
    const idx = roles.findIndex(r => r.id === newRole.id);
    if (idx !== -1) roles[idx] = newRole;
    else roles.push(newRole);
    fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/roles/delete', (req, res) => {
  const id = req.query.id;
  if (id === 'role-super') {
    return res.status(403).json({ error: '安全锁定：核心超级权限组禁止移除' });
  }
  try {
    if (fs.existsSync(ROLES_FILE)) {
      let roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));
      roles = roles.filter(r => r.id !== id);
      fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 优先尝试从 dist 目录提供前端静态产物 (React App)
app.use(express.static(path.join(__dirname, 'dist')));
// 兼容性：同时提供根目录文件支持 (如 terminal.html)
app.use(express.static(__dirname));

// 针对管理端根路径的显式映射，确保生产环境下访问 / 直接加载 React 首页
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Matrix DMS Engine is running. Please ensure the /dist directory exists for the management dashboard.');
  }
});

let terminalCommands = {};
let terminalHeartbeats = {};

// --- 终端心跳 API ---
// 终端定期上报心跳，服务端记录在线状态
app.post('/api/terminals/heartbeat', (req, res) => {
  const { terminalId, mac, version, ip: termIp, rotation, status } = req.body;
  if (!terminalId) return res.status(400).json({ error: 'Missing terminalId' });

  const nId = normalizeId(terminalId);
  terminalHeartbeats[nId] = {
    terminalId,
    normalizedId: nId,
    mac: mac || '',
    version: version || '',
    ip: termIp || (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', ''),
    rotation: rotation || 0,
    status: status || 'online',
    lastSeen: new Date().toISOString()
  };

  // 返回待执行的指令（如有）
  const pendingCmds = terminalCommands[nId] || [];
  if (pendingCmds.length > 0) {
    terminalCommands[nId] = []; // 取走即清空
  }

  res.json({ success: true, commands: pendingCmds });
});

// --- 终端快照上传 API ---
app.post('/api/terminals/snapshot', (req, res) => {
  const { terminalId, imageBase64 } = req.body;
  if (!terminalId || !imageBase64) return res.status(400).json({ error: 'Missing data' });

  try {
    const nId = normalizeId(terminalId);
    // 从 base64 data URL 提取纯数据
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const filePath = path.join(SNAPSHOTS_DIR, `${nId}.jpg`);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

    // 同步更新心跳中的最后截图时间
    if (terminalHeartbeats[nId]) {
      terminalHeartbeats[nId].lastSnapshot = new Date().toISOString();
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- 终端快照获取 API （供前端监控使用）---
app.get('/api/terminals/snapshot', (req, res) => {
  const { terminalId } = req.query;
  if (!terminalId) return res.status(400).json({ error: 'Missing terminalId' });

  const nId = normalizeId(terminalId);
  const filePath = path.join(SNAPSHOTS_DIR, `${nId}.jpg`);

  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-cache, no-store');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.status(404).json({ error: 'Snapshot not found' });
  }
});

// --- 终端在线状态查询 API ---
app.get('/api/terminals/status', (req, res) => {
  // 超过 60 秒未心跳的终端标记为 offline
  const now = Date.now();
  const result = {};
  for (const [id, info] of Object.entries(terminalHeartbeats)) {
    const lastSeen = new Date(info.lastSeen).getTime();
    result[id] = {
      ...info,
      online: (now - lastSeen) < 60000
    };
  }
  res.json(result);
});

// NOTE: 任务列表为高频轮询接口，移除自动审计日志以避免日志膨胀
app.get('/api/tasks', (req, res) => {
  try {
    const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'));
    const tasks = files.map(f => JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')));
    res.json(tasks);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/tasks/save', (req, res) => {
  const task = req.body;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const userInfo = getUserFromRequest(req);
  const userAccount = userInfo ? userInfo.userAccount : 'USER';
  const userName = userInfo ? userInfo.userName : 'Unknown User';

  if (!task || !task.id) {
    logAction(userAccount, userName, '保存任务', 'tasks', 'UNKNOWN', 'failure', clientIp, { error: 'Invalid task data' });
    return res.status(400).json({ error: 'Invalid task data' });
  }

  try {
    const taskPath = path.join(TASKS_DIR, `${task.id}.json`);
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));
    logAction(userAccount, userName, '保存任务', 'tasks', task.name || task.id, 'success', clientIp, { taskId: task.id });
    res.json({ success: true, path: taskPath });
  } catch (e) {
    logAction(userAccount, userName, '保存任务', 'tasks', task.name || task.id, 'failure', clientIp, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/tasks/delete', (req, res) => {
  const id = req.query.id;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const userInfo = getUserFromRequest(req);
  const userAccount = userInfo ? userInfo.userAccount : 'USER';
  const userName = userInfo ? userInfo.userName : 'Unknown User';

  try {
    const taskPath = path.join(TASKS_DIR, `${id}.json`);
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath);
      logAction(userAccount, userName, '删除任务', 'tasks', id, 'success', clientIp, { taskId: id });
      res.json({ success: true });
    } else {
      logAction(userAccount, userName, '删除任务', 'tasks', id, 'failure', clientIp, { error: 'Task not found' });
      res.status(404).json({ error: 'Task not found' });
    }
  } catch (e) {
    logAction(userAccount, userName, '删除任务', 'tasks', id, 'failure', clientIp, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// --- 模板同步 API ---
app.get('/api/templates', (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const userInfo = getUserFromRequest(req);
  const userAccount = userInfo ? userInfo.userAccount : 'SYSTEM';
  const userName = userInfo ? userInfo.userName : 'System Service';

  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const data = fs.readFileSync(TEMPLATES_FILE, 'utf8');
      const templates = JSON.parse(data);
      logAction(userAccount, userName, '获取模板列表', 'templates', 'ALL_TEMPLATES', 'success', clientIp);
      res.json(templates);
    } else {
      logAction(userAccount, userName, '获取模板列表', 'templates', 'ALL_TEMPLATES', 'success', clientIp);
      res.json([]);
    }
  } catch (e) {
    logAction(userAccount, userName, '获取模板列表', 'templates', 'ALL_TEMPLATES', 'failure', clientIp, { error: e.message });
    res.json([]);
  }
});

app.post('/api/templates/save', (req, res) => {
  const template = req.body;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const userInfo = getUserFromRequest(req);
  const userAccount = userInfo ? userInfo.userAccount : 'USER';
  const userName = userInfo ? userInfo.userName : 'Unknown User';

  if (!template || !template.id) {
    logAction(userAccount, userName, '保存模板', 'templates', 'UNKNOWN', 'failure', clientIp, { error: 'Invalid template data' });
    return res.status(400).json({ error: 'Invalid template data' });
  }

  try {
    const templatePath = path.join(TEMPLATES_DIR, `${template.id}.json`);
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
    let templates = [];
    if (fs.existsSync(TEMPLATES_FILE)) {
      templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
    }
    const idx = templates.findIndex(t => t.id === template.id);
    if (idx !== -1) templates[idx] = template;
    else templates.unshift(template);
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
    logAction(userAccount, userName, '保存模板', 'templates', template.name || template.id, 'success', clientIp, { templateId: template.id });
    res.json({ success: true, path: templatePath });
  } catch (e) {
    logAction(userAccount, userName, '保存模板', 'templates', template.name || template.id, 'failure', clientIp, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/templates/delete', (req, res) => {
  const id = req.query.id;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const userInfo = getUserFromRequest(req);
  const userAccount = userInfo ? userInfo.userAccount : 'USER';
  const userName = userInfo ? userInfo.userName : 'Unknown User';

  try {
    const templatePath = path.join(TEMPLATES_DIR, `${id}.json`);
    if (fs.existsSync(templatePath)) fs.unlinkSync(templatePath);
    if (fs.existsSync(TEMPLATES_FILE)) {
      let templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
      templates = templates.filter(t => t.id !== id);
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
    }
    logAction(userAccount, userName, '删除模板', 'templates', id, 'success', clientIp, { templateId: id });
    res.json({ success: true });
  } catch (e) {
    logAction(userAccount, userName, '删除模板', 'templates', id, 'failure', clientIp, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// --- 终端通信 API ---
app.post('/api/terminals/heartbeat', (req, res) => {
  let { terminalId, status, mac, hmac, nonce, logs } = req.body;
  terminalId = normalizeId(terminalId || mac); // 强制归一化
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');

  if (!terminalId) {
    return res.status(400).json({ error: 'Missing terminalId' });
  }

  try {
    const config = getSystemConfig();
    const license = parseLicense(config.sys_metadata);

    // 0. 对接终端审计日志
    if (Array.isArray(logs) && logs.length > 0) {
      logs.forEach(logLine => {
        logAction('TERMINAL', status?.name || 'Unknown', '终端运行日志', 'terminals', terminalId, 'info', clientIp, { message: logLine });
      });
    }

    // 1. 全局授权熔断

    // 1. 全局授权熔断
    if (!license.isValid) {
      return res.status(403).json({ error: 'License Inactive', reason: license.reason });
    }

    // 2. 自助报备与配额校验 (一机一码)
    if (mac) {
      if (!config.bound_macs.includes(mac)) {
        if (config.bound_macs.length >= license.quota) {
          return res.status(403).json({ error: 'Quota Exceeded', message: `终端配额已满 (${license.quota})` });
        }
        config.bound_macs.push(mac);
        saveSystemConfig(config);
        console.log(`[License] New terminal self-reported: ${mac} (${config.bound_macs.length}/${license.quota})`);
      }

      // 3. HMAC 安全握手校验
      if (hmac && nonce) {
        const expected = crypto.createHmac('sha256', license.secret)
          .update(nonce + mac)
          .digest('hex');
        if (hmac !== expected) {
          return res.status(401).json({ error: 'Security Mismatch', message: '硬件指纹校验失败' });
        }
      }
    }

    terminalHeartbeats[terminalId] = {
      lastSeen: new Date(),
      ip: clientIp === '::1' ? '127.0.0.1' : clientIp,
      status: status || {},
      businessName: status?.name || terminalHeartbeats[terminalId]?.businessName || '未命名终端',
      groupId: status?.groupId || terminalHeartbeats[terminalId]?.groupId || 'default',
      mac: mac || 'Unknown',
      version: req.body.version || 'Unknown',
      isRebooting: false // 收到心跳说明重启完成或正在运行，清除重启标记
    };

    const cmds = terminalCommands[terminalId] || [];
    if (cmds.length > 0) {
      terminalCommands[terminalId] = [];
    }

    // 为下次握手生成随机 Nonce
    const nextNonce = crypto.randomBytes(16).toString('hex');
    res.json({ success: true, serverTime: new Date(), commands: cmds, nonce: nextNonce });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/terminals/status', (req, res) => res.json(terminalHeartbeats));

// --- 终端列表与分组 API (供排程模块使用) ---
// NOTE: 从内存心跳数据中提取在线终端列表，避免前端依赖 localStorage
app.get('/api/terminals/list', (req, res) => {
  try {
    const list = Object.entries(terminalHeartbeats).map(([id, info]) => ({
      id,
      name: info.businessName || '未命名终端',
      ip: info.ip || 'Unknown',
      groupId: info.groupId || 'default',
      mac: info.mac || 'Unknown',
      lastSeen: info.lastSeen,
      version: info.version || 'Unknown',
      isOnline: (Date.now() - new Date(info.lastSeen).getTime()) < 120000 // 2分钟内有心跳视为在线
    }));
    res.json(list);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/terminals/groups', (req, res) => {
  try {
    // 从心跳数据中提取所有分组ID并去重
    const groupIds = new Set();
    Object.values(terminalHeartbeats).forEach(info => {
      groupIds.add(info.groupId || 'default');
    });
    const groups = Array.from(groupIds).map(gid => ({
      id: gid,
      name: gid === 'default' ? '默认分组' : gid
    }));
    // 如果没有任何终端在线，至少返回默认分组
    if (groups.length === 0) {
      groups.push({ id: 'default', name: '默认分组' });
    }
    res.json(groups);
  } catch (e) {
    res.json([{ id: 'default', name: '默认分组' }]);
  }
});

// 批量终端命令接口 (排程模块的缓存清理等批量操作)
app.post('/api/terminals/batch-command', (req, res) => {
  const { terminalIds, command, payload } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const userInfo = getUserFromRequest(req);
  const userAccount = userInfo ? userInfo.userAccount : 'USER';
  const userName = userInfo ? userInfo.userName : 'Unknown User';

  if (!Array.isArray(terminalIds) || terminalIds.length === 0) {
    return res.status(400).json({ error: 'Missing or empty terminalIds array' });
  }

  try {
    const results = [];
    for (const rawId of terminalIds) {
      const tid = normalizeId(rawId);
      if (!tid) continue;

      if (!terminalCommands[tid]) terminalCommands[tid] = [];
      const cmdId = `CMD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      terminalCommands[tid].push({ id: cmdId, command, payload, timestamp: new Date() });
      results.push({ terminalId: tid, cmdId, status: 'queued' });
    }

    logAction(userAccount, userName, '批量终端命令', 'terminals', `${terminalIds.length} 台终端`, 'success', clientIp, { command, count: terminalIds.length });
    res.json({ success: true, results });
  } catch (e) {
    logAction(userAccount, userName, '批量终端命令', 'terminals', 'BATCH', 'failure', clientIp, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// --- 授权管理与救援 API ---
app.post('/api/sys/license-rescue', (req, res) => {
  const { metadata } = req.body;
  const license = parseLicense(metadata);
  if (!license.isValid) {
    return res.status(400).json({ error: '无效授权数据', reason: license.reason });
  }

  const config = getSystemConfig();
  config.sys_metadata = metadata;
  // 注意：如果是延期包，secret 保持一致则原绑定 MAC 继续有效
  // 如果是全新替换包，厂商可变更 secret 强制重新绑定
  saveSystemConfig(config);

  res.json({ success: true, message: '授权已更新，系统热激活成功' });
});

app.get('/api/sys/license-status', (req, res) => {
  const config = getSystemConfig();
  const license = parseLicense(config.sys_metadata);
  res.json({
    ...license,
    boundCount: config.bound_macs.length,
    metadataHint: config.sys_metadata ? `0x${config.sys_metadata.substring(0, 8)}...` : 'NONE'
  });
});

app.get('/api/terminals/snapshot', (req, res) => {
  const { id } = req.query;
  const filePath = path.join(SNAPSHOTS_DIR, `${id}.jpg`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('No Snapshot');
  }
});

// 终端快照上传接口 - 接收 Base64 图片并保存
app.post('/api/terminals/snapshot', (req, res) => {
  try {
    const { terminalId, imageBase64 } = req.body;
    if (!terminalId || !imageBase64) {
      return res.status(400).json({ error: 'Missing terminalId or imageBase64' });
    }

    // 解析 Base64 数据
    const matches = imageBase64.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image format, expected JPEG base64' });
    }

    const imageBuffer = Buffer.from(matches[1], 'base64');
    const filePath = path.join(SNAPSHOTS_DIR, `${terminalId}.jpg`);
    fs.writeFileSync(filePath, imageBuffer);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/terminals/command', (req, res) => {
  let { terminalId, command, payload } = req.body;
  terminalId = normalizeId(terminalId); // 强制归一化
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const userInfo = getUserFromRequest(req);
  const userAccount = userInfo ? userInfo.userAccount : 'USER';
  const userName = userInfo ? userInfo.userName : 'Unknown User';

  if (!terminalId) {
    logAction(userAccount, userName, '发送终端命令', 'terminals', 'UNKNOWN', 'failure', clientIp, { error: 'Missing terminalId' });
    return res.status(400).json({ error: 'Missing terminalId' });
  }

  try {
    // 1. 同步下发至 Web 终端心跳队列 (确保网页端播放器更新)
    if (!terminalCommands[terminalId]) terminalCommands[terminalId] = [];
    const cmdId = `CMD-${Date.now()}`;
    const newCmd = { id: cmdId, command, payload, timestamp: new Date() };
    terminalCommands[terminalId].push(newCmd);

    // 2. 物理下发至 U 盘盾硬件队列 (确保硬件 Agent 切换信号)
    const targetShield = "F4B1464C"; // 演示用，实际可根据 terminalId 映射
    const queueFile = path.join(CMD_QUEUE_DIR, `${targetShield}.json`);
    let queue = [];
    if (fs.existsSync(queueFile)) {
      queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    }
    queue.push({ id: Date.now(), type: command, payload });
    fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

    // 3. 更新中间状态：标记为重启中
    if (command === 'REBOOT' || command === 'POWER_ON') {
      if (terminalHeartbeats[terminalId]) {
        terminalHeartbeats[terminalId].isRebooting = true;
      }
    }

    console.log(`[Server] Dual-Link Command Queued: ${terminalId} -> ${command}`);
    logAction(userAccount, userName, '发送终端命令', 'terminals', terminalId, 'success', clientIp, { command, payload, cmdId });
    res.json({ success: true, message: '指令已同步分发至 Web 与物理链路' });
  } catch (e) {
    logAction(userAccount, userName, '发送终端命令', 'terminals', terminalId, 'failure', clientIp, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/assets', (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');

  try {
    const allItems = fs.readdirSync(STORAGE_ROOT);
    const result = [];

    for (const item of allItems) {
      if (item.startsWith('.') ||
        item.startsWith('_') ||
        item.endsWith('.json')) continue; // 核心修复：过滤所有系统 JSON 配置文件

      const fullPath = path.join(STORAGE_ROOT, item);
      const stats = fs.statSync(fullPath);

      // 核心修复：只返回文件，过滤掉文件夹
      if (stats.isFile()) {
        result.push({
          name: item,
          size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          uploadTime: stats.mtime.toISOString()
        });
      }
    }
    logAction('SYSTEM', 'System Service', '获取资产列表', 'assets', 'ALL_ASSETS', 'success', clientIp);
    res.json(result);
  } catch (err) {
    logAction('SYSTEM', 'System Service', '获取资产列表', 'assets', 'ALL_ASSETS', 'failure', clientIp, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/assets/stream', (req, res) => {
  // 确保文件名被正确解码处理
  const fileName = req.query.filename ? decodeURIComponent(req.query.filename) : null;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');

  if (!fileName) {
    return res.status(400).send('Missing filename');
  }

  try {
    const filePath = path.join(STORAGE_ROOT, fileName);
    if (!fs.existsSync(filePath)) {
      logAction('SYSTEM', 'System Service', '资产流访问', 'assets', fileName, 'failure', clientIp, { error: 'File Not Found' });
      return res.status(404).send('File Not Found');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // 严谨的 MIME 类型设置，解决浏览器解码黑屏
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    // 统一跨域和缓存头
    const commonHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    };

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).set(commonHeaders).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
        return;
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });

      res.status(206).set({
        ...commonHeaders,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });

      file.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) res.status(500).send(err.message);
      });

      file.pipe(res);
      res.on('close', () => { if (!file.destroyed) file.destroy(); });
    } else {
      res.status(200).set({
        ...commonHeaders,
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      const file = fs.createReadStream(filePath);
      file.pipe(res);
      res.on('close', () => { if (!file.destroyed) file.destroy(); });
    }
    logAction('SYSTEM', 'System Service', '资产流访问', 'assets', fileName, 'success', clientIp, { mode: range ? 'partial' : 'full' });
  } catch (err) {
    logAction('SYSTEM', 'System Service', '资产流访问', 'assets', fileName || 'UNKNOWN', 'failure', clientIp, { error: err.message });
    if (!res.headersSent) res.status(500).send('Internal Server Error');
  }
});

// --- 分类持久化 API ---
app.get('/api/categories', (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  try {
    if (fs.existsSync(CATEGORIES_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
      // 强制注入“系统固件”分类，保证可见性
      if (data.categories && !data.categories.includes('系统固件')) {
        data.categories.push('系统固件');
      }
      logAction('SYSTEM', 'System Service', '获取分类配置', 'assets', 'CONFIG', 'success', clientIp);
      res.json(data);
    } else {
      logAction('SYSTEM', 'System Service', '获取分类配置', 'assets', 'CONFIG', 'fallback', clientIp);
      res.json({ categories: ['品牌宣传', '促销广告', '高清视频', '系统固件'], assetMap: {} });
    }
  } catch (err) {
    logAction('SYSTEM', 'System Service', '获取分类配置', 'assets', 'CONFIG', 'failure', clientIp, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  try {
    const { categories, assetMap } = req.body;
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify({ categories, assetMap }, null, 2));
    logAction('USER', 'Unknown User', '同步分类配置', 'assets', 'CONFIG', 'success', clientIp, { categoryCount: categories?.length });
    res.json({ success: true });
  } catch (err) {
    logAction('USER', 'Unknown User', '同步分类配置', 'assets', 'CONFIG', 'failure', clientIp, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.get('/terminal.html', (req, res) => {
  const terminalPath = path.resolve(__dirname, 'terminal.html');
  if (fs.existsSync(terminalPath)) res.sendFile(terminalPath);
  else res.status(404).json({ error: "terminal.html not found" });
});

// --- 文件上传 API ---
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileHash = req.query.fileHash;
    const dir = path.join(uploadDir, fileHash);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const chunkIndex = req.query.chunkIndex;
    cb(null, chunkIndex + '.part');
  }
});

const upload = multer({ storage });

// 检查文件是否已存在
app.get('/upload/check', (req, res) => {
  const { fileHash, fileName } = req.query;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const filePath = path.join(STORAGE_ROOT, fileName);

  try {
    if (fs.existsSync(filePath)) {
      logAction('USER', 'Unknown User', '检查文件', 'assets', fileName, 'success', clientIp, { fileHash, exists: true });
      return res.json({ exists: true });
    }

    const chunkDir = path.join(uploadDir, fileHash);
    const uploadedChunks = [];

    if (fs.existsSync(chunkDir)) {
      const files = fs.readdirSync(chunkDir);
      files.forEach(file => {
        if (file.endsWith('.part')) {
          uploadedChunks.push(parseInt(file.split('.')[0]));
        }
      });
    }

    logAction('USER', 'Unknown User', '检查文件', 'assets', fileName, 'success', clientIp, { fileHash, exists: false, chunks: uploadedChunks.length });
    res.json({ exists: false, uploadedChunks });
  } catch (err) {
    logAction('USER', 'Unknown User', '检查文件', 'assets', fileName, 'failure', clientIp, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// 上传文件分片
app.post('/upload/chunk', upload.single('file'), (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const fileHash = req.query.fileHash;
  const chunkIndex = req.query.chunkIndex;

  try {
    logAction('USER', 'Unknown User', '上传文件分片', 'assets', fileHash || 'UNKNOWN', 'success', clientIp, { chunkIndex });
    res.json({ success: true });
  } catch (err) {
    logAction('USER', 'Unknown User', '上传文件分片', 'assets', fileHash || 'UNKNOWN', 'failure', clientIp, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// 合并文件分片
app.post('/upload/merge', async (req, res) => {
  const { fileHash, fileName, category } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const chunkDir = path.join(uploadDir, fileHash);
  const destPath = path.join(STORAGE_ROOT, fileName);

  try {
    if (!fs.existsSync(chunkDir)) {
      logAction('USER', 'Unknown User', '合并文件分片', 'assets', fileName, 'failure', clientIp, { error: 'No chunks uploaded' });
      return res.status(400).json({ error: 'No chunks uploaded' });
    }

    const files = fs.readdirSync(chunkDir).sort((a, b) => parseInt(a.split('.')[0]) - parseInt(b.split('.')[0]));

    const writeStream = fs.createWriteStream(destPath);

    // 使用顺序写入保证分片正确
    for (const file of files) {
      const chunkPath = path.join(chunkDir, file);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
      fs.unlinkSync(chunkPath);
    }

    writeStream.end();

    // 等待文件合并彻底完成
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // 删除临时目录
    fs.rmdirSync(chunkDir);

    logAction('USER', 'Unknown User', '合并文件分片', 'assets', fileName, 'success', clientIp, { fileHash, category });
    res.json({ success: true, path: destPath });
  } catch (e) {
    logAction('USER', 'Unknown User', '合并文件分片', 'assets', fileName, 'failure', clientIp, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// 删除资产
app.delete('/api/assets/delete', (req, res) => {
  const fileName = req.query.filename;
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  const filePath = path.join(STORAGE_ROOT, fileName);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logAction('USER', 'Unknown User', '删除资产', 'assets', fileName, 'success', clientIp);
      res.json({ success: true });
    } else {
      logAction('USER', 'Unknown User', '删除资产', 'assets', fileName, 'failure', clientIp, { error: 'File not found' });
      res.status(404).json({ error: 'File not found' });
    }
  } catch (e) {
    const isLocked = e.code === 'EBUSY' || e.code === 'EPERM';
    const msg = isLocked ? '文件正在被占用，无法删除。请稍后重试。' : e.message;
    logAction('USER', 'Unknown User', '删除资产', 'assets', fileName, 'failure', clientIp, { error: e.code || e.message });
    res.status(500).json({ error: msg });
  }
});

// 核心资源分发与前端路由支持
const DIST_PATH = path.join(__dirname, 'dist');
app.use(express.static(DIST_PATH));

app.get('*', (req, res) => {
  // 忽略 API 请求
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API Endpoint not found' });

  const indexPath = path.join(DIST_PATH, 'index.html');
  const backupPath = path.resolve(__dirname, 'index.html');

  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else if (fs.existsSync(backupPath)) res.sendFile(backupPath);
  else res.status(404).sendFile(path.join(__dirname, 'terminal.html')); // 如果都没找到，尝试分发终端页
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MATRIX SERVER ACTIVE ON PORT ${PORT}`);
});