import React, { useState, useEffect } from 'react';
import {
  Database, Globe, Terminal, HardDrive, Link2,
  Save, ShieldCheck, Layers, ChevronRight,
  Code2, Copy, Check, Info, Server, Cpu,
  History, RotateCcw, Trash2, Clock,
  FolderOpen, Network, Monitor, Share2
} from 'lucide-react';

interface ConfigSnapshot {
  id: string;
  timestamp: string;
  config: any;
}

interface SystemSettingsViewProps {
  serverConfig: any;
  setServerConfig: (config: any) => void;
  isDark: boolean;
  textP: string;
  textS: string;
  cardBg: string;
  inputBg: string;
}

export const SystemSettingsView: React.FC<SystemSettingsViewProps> = ({ serverConfig, setServerConfig, isDark, textP, textS, cardBg, inputBg }) => {
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<ConfigSnapshot[]>(() => {
    const saved = localStorage.getItem('matrix_config_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [saving, setSaving] = useState(false);
  const [firmwareAssets, setFirmwareAssets] = useState<any[]>([]);
  const [loadingFirmware, setLoadingFirmware] = useState(false);

  useEffect(() => {
    const fetchFirmware = async () => {
      setLoadingFirmware(true);
      try {
        const [assetRes, catRes] = await Promise.all([
          fetch('/api/assets'),
          fetch('/api/categories')
        ]);
        if (assetRes.ok && catRes.ok) {
          const assets = await assetRes.json();
          const catData = await catRes.json();
          const map = catData.assetMap || {};
          const firmware = assets.filter((a: any) => map[a.name] === '系统固件');
          setFirmwareAssets(firmware);
        }
      } catch (err) {
        console.error('Failed to load firmware assets', err);
      } finally {
        setLoadingFirmware(false);
      }
    };
    fetchFirmware();
  }, []);

  const handleSaveConfig = async () => {
    if (!serverConfig.isLocal) {
      alert('安全锁定：当前非服务器环境，禁止修改核心物理参数。');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: serverConfig.ip,
          port: serverConfig.port,
          storagePath: serverConfig.storagePath,
          ota_standard_version: serverConfig.ota_standard_version,
          ota_upgrade_url: serverConfig.ota_upgrade_url,
          server_role: serverConfig.server_role,
          server_name: serverConfig.server_name
        })
      });

      if (!res.ok) throw new Error(await res.text());

      // 保存当前快照到历史
      const newSnapshot: ConfigSnapshot = {
        id: `SN-${Date.now()}`,
        timestamp: new Date().toISOString(),
        config: { ...serverConfig }
      };
      const updatedHistory = [newSnapshot, ...history].slice(0, 5);
      setHistory(updatedHistory);
      localStorage.setItem('matrix_config_history', JSON.stringify(updatedHistory));

      alert('物理节点配置已固化到服务器硬件冷库');
    } catch (err: any) {
      alert(`固化失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFolder = async (folderPath: string) => {
    try {
      const res = await fetch('/api/system/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath })
      });
      if (!res.ok) {
        const error = await res.json();
        alert(error.error || '开启失败');
      }
    } catch (err) {
      alert('无法开启物理目录，请检查连接');
    }
  };

  const rollbackConfig = (snapshot: ConfigSnapshot) => {
    if (confirm(`确定要回退到 ${new Date(snapshot.timestamp).toLocaleString()} 的配置吗？`)) {
      setServerConfig(snapshot.config);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('matrix_config_history');
  };

  const backendCode = `
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

const STORAGE_ROOT = '${(serverConfig.storagePath || "").replace(/\\/g, '/')}';
const TEMP_DIR = path.join(STORAGE_ROOT, '_temp');
const META_FILE = path.join(STORAGE_ROOT, 'metadata.json');

// 确保存储与缓存目录
[STORAGE_ROOT, TEMP_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 元数据辅助
const getMeta = () => fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, 'utf-8')) : {};
const saveMeta = (data) => fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));

const upload = multer({ dest: TEMP_DIR });

// 1. 获取物理资产列表
app.get('/api/assets', (req, res) => {
  try {
    const files = fs.readdirSync(STORAGE_ROOT).filter(f => f !== 'metadata.json' && f !== '_temp');
    const meta = getMeta();
    const result = files.map(file => {
      const stats = fs.statSync(path.join(STORAGE_ROOT, file));
      return {
        name: file,
        size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        uploadTime: stats.mtime.toISOString(),
        category: meta[file] ? meta[file].category : '未分类'
      };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. 预览与流服务
app.get('/api/assets/stream', (req, res) => {
  const filePath = path.join(STORAGE_ROOT, req.query.filename);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).send('Not Found');
});

// 3. 断点续传检查
app.get('/upload/check', (req, res) => {
  const { fileHash, fileName } = req.query;
  const filePath = path.join(STORAGE_ROOT, fileName);
  if (fs.existsSync(filePath)) return res.json({ exists: true });
  
  const chunkDir = path.join(TEMP_DIR, fileHash);
  let uploadedChunks = [];
  if (fs.existsSync(chunkDir)) {
    uploadedChunks = fs.readdirSync(chunkDir).map(name => parseInt(name));
  }
  res.json({ exists: false, uploadedChunks });
});

// 4. 接收分片
app.post('/upload/chunk', upload.single('file'), (req, res) => {
  const { fileHash, chunkIndex } = req.query;
  const chunkDir = path.join(TEMP_DIR, fileHash);
  if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });
  
  fs.renameSync(req.file.path, path.join(chunkDir, chunkIndex.toString()));
  res.json({ success: true });
});

// 5. 合并分片
app.post('/upload/merge', (req, res) => {
  const { fileHash, fileName, category } = req.body;
  const chunkDir = path.join(TEMP_DIR, fileHash);
  const targetPath = path.join(STORAGE_ROOT, fileName);
  
  if (!fs.existsSync(chunkDir)) return res.status(400).json({ error: 'Chunk dir not exists' });
  
  const chunks = fs.readdirSync(chunkDir).sort((a, b) => parseInt(a) - parseInt(b));
  const writeStream = fs.createWriteStream(targetPath);
  
  chunks.forEach(chunk => {
    const chunkPath = path.join(chunkDir, chunk);
    writeStream.write(fs.readFileSync(chunkPath));
    fs.unlinkSync(chunkPath);
  });
  
  writeStream.end();
  writeStream.on('finish', () => {
    fs.rmdirSync(chunkDir);
    const meta = getMeta();
    meta[fileName] = { category: category || '未分类', updated: new Date() };
    saveMeta(meta);
    res.json({ success: true });
  });
});

// 6. 物理删除
app.delete('/api/assets/delete', (req, res) => {
  const fileName = req.query.filename;
  const filePath = path.join(STORAGE_ROOT, fileName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      const meta = getMeta();
      delete meta[fileName];
      saveMeta(meta);
      res.json({ success: true });
    } else res.status(404).json({ error: 'File not exists' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(${serverConfig.port}, () => console.log('Matrix DMS API Active on :${serverConfig.port}'));
  `.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(backendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 max-w-6xl pb-32">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* 左侧配置表单 */}
        <div className={`xl:col-span-2 p-8 rounded-[2.5rem] border ${cardBg}`}>
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/5"><Database size={24} /></div>
            <div><h4 className={`text-lg font-black tracking-tight ${textP}`}>物理节点核心参数</h4><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-1">Node Engine Context</p></div>
            <div className="ml-auto flex items-center gap-3">
              <span className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${serverConfig.status === 'online' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${serverConfig.status === 'online' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-rose-500'}`}></div>
                {serverConfig.status === 'online' ? 'Service Online' : 'Node Disconnected'}
              </span>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2.5 ${textS} flex items-center gap-2`}>
                  监听 IP 地址
                  {!serverConfig.isLocal && <span title="已锁定"><ShieldCheck size={10} className="text-emerald-500" /></span>}
                </label>
                <div className="relative group">
                  <Globe size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-500 transition-colors" />
                  <input
                    type="text"
                    disabled={!serverConfig.isLocal}
                    value={serverConfig.ip}
                    onChange={(e) => setServerConfig({ ...serverConfig, ip: e.target.value })}
                    className={`w-full h-12 pl-11 pr-4 rounded-2xl border outline-none text-xs font-bold transition-all ${inputBg} ${textP} ${!serverConfig.isLocal ? 'opacity-50 cursor-not-allowed grayscale-[0.6]' : 'border-transparent focus:border-sky-500/30 focus:bg-sky-500/5'}`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2.5 ${textS} flex items-center gap-2`}>
                  监听端口 (HTTP)
                  {!serverConfig.isLocal && <span title="已锁定"><ShieldCheck size={10} className="text-emerald-500" /></span>}
                </label>
                <div className="relative group">
                  <Terminal size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-500 transition-colors" />
                  <input
                    type="text"
                    disabled={!serverConfig.isLocal}
                    value={serverConfig.port}
                    onChange={(e) => setServerConfig({ ...serverConfig, port: e.target.value })}
                    className={`w-full h-12 pl-11 pr-4 rounded-2xl border outline-none text-xs font-bold transition-all ${inputBg} ${textP} ${!serverConfig.isLocal ? 'opacity-50 cursor-not-allowed grayscale-[0.6]' : 'border-transparent focus:border-sky-500/30 focus:bg-sky-500/5'}`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2.5 ${textS} flex items-center gap-2`}>
                  服务器易记名称
                  {!serverConfig.isLocal && <span title="已锁定"><ShieldCheck size={10} className="text-emerald-500" /></span>}
                </label>
                <div className="relative group">
                  <Cpu size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-500 transition-colors" />
                  <input
                    type="text"
                    disabled={!serverConfig.isLocal}
                    value={serverConfig.server_name || ''}
                    placeholder="例如: 总部大厅主控台"
                    onChange={(e) => setServerConfig({ ...serverConfig, server_name: e.target.value })}
                    className={`w-full h-12 pl-11 pr-4 rounded-2xl border outline-none text-xs font-bold transition-all ${inputBg} ${textP} ${!serverConfig.isLocal ? 'opacity-50 cursor-not-allowed grayscale-[0.6]' : 'border-transparent focus:border-sky-500/30 focus:bg-sky-500/5'}`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2.5 ${textS} flex items-center gap-2`}>
                  集群管控角色
                  {!serverConfig.isLocal && <span title="已锁定"><ShieldCheck size={10} className="text-emerald-500" /></span>}
                </label>
                <div className="relative group">
                  <Layers size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-500 transition-colors" />
                  <select
                    disabled={!serverConfig.isLocal}
                    value={serverConfig.server_role || 'master'}
                    onChange={(e) => setServerConfig({ ...serverConfig, server_role: e.target.value })}
                    className={`w-full h-12 pl-11 pr-4 rounded-2xl border outline-none text-xs font-bold transition-all appearance-none ${inputBg} ${textP} ${!serverConfig.isLocal ? 'opacity-50 cursor-not-allowed grayscale-[0.6]' : 'border-transparent focus:border-sky-500/30 focus:bg-sky-500/5'}`}
                  >
                    <option value="master">Primary (主管控平台 / 占用授权)</option>
                    <option value="secondary">Secondary (次级节点 / 仅镜像)</option>
                  </select>
                </div>
              </div>
            </div>

            {serverConfig.server_role === 'secondary' && (
              <div className="animate-in slide-in-from-top-2 duration-500">
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2.5 ${textS} flex items-center gap-2 text-sky-500`}>
                  主服务器 (Master) IP 地址
                  <span className="bg-sky-500/10 px-2 py-0.5 rounded text-[8px]">REQUIRED FOR ASSETS</span>
                </label>
                <div className="relative group">
                  <Link2 size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500 group-focus-within:animate-pulse" />
                  <input
                    type="text"
                    disabled={!serverConfig.isLocal}
                    value={serverConfig.master_ip || ''}
                    placeholder="例如: 192.168.1.100"
                    onChange={(e) => setServerConfig({ ...serverConfig, master_ip: e.target.value })}
                    className={`w-full h-12 pl-11 pr-4 rounded-2xl border outline-none text-xs font-bold transition-all border-sky-500/20 focus:border-sky-500/50 ${inputBg} ${textP}`}
                  />
                  <p className="text-[9px] text-slate-500 mt-2 italic px-1">
                    * 模式说明：在次级节点模式下，所有素材上传、列表获取、文件流均会透传至此 IP 的主服务器。
                  </p>
                </div>
              </div>
            )}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2.5 ${textS} flex items-center gap-2`}>
                物理存储根路径 (Storage Root)
                {!serverConfig.isLocal && <span title="已锁定"><ShieldCheck size={10} className="text-emerald-500" /></span>}
              </label>
              <div className="relative group">
                <HardDrive size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-500 transition-colors" />
                <input
                  type="text"
                  disabled={!serverConfig.isLocal}
                  value={serverConfig.storagePath}
                  onChange={(e) => setServerConfig({ ...serverConfig, storagePath: e.target.value })}
                  className={`w-full h-12 pl-11 pr-4 rounded-2xl border outline-none text-xs font-bold transition-all ${inputBg} ${textP} ${!serverConfig.isLocal ? 'opacity-50 cursor-not-allowed grayscale-[0.6]' : 'border-transparent focus:border-sky-500/30 focus:bg-sky-500/5'}`}
                />
              </div>
            </div>

            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
              <ChevronRight size={14} className="rotate-90" />
            </div>
          </div>
        </div>
      </div>

      {serverConfig.ota_upgrade_url && (
        <div className="mt-2 text-[10px] font-mono text-emerald-500 flex items-center gap-2">
          <Link2 size={12} /> CURRENT_LINK: {serverConfig.ota_upgrade_url}
        </div>
      )}
      <p className="text-[10px] text-slate-400 font-medium leading-relaxed italic">
        * 注意：终端将自动下载此 [升级包] 并执行静默接力安装。建议包格式为 .exe (Windows)。
      </p>


      {
        !serverConfig.isLocal && (
          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-center gap-3">
            <ShieldCheck size={16} className="text-amber-500" />
            <p className="text-[10px] font-bold text-amber-500/80 uppercase tracking-tight">物理安全策略：当前为远程访问模式，核心参数已进入“不可读写”状态</p>
          </div>
        )
      }

      <button
        onClick={handleSaveConfig}
        disabled={!serverConfig.isLocal || saving}
        className={`h-14 w-full rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl mt-4 ${!serverConfig.isLocal ? 'bg-slate-700 text-slate-500 cursor-not-allowed grayscale' : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/20'
          }`}
      >
        {saving ? '正在同步硬件冷库...' : <><Save size={20} /> 固化配置并同步</>}
      </button>

      {/* 右侧状态看板 */}
      <div className="space-y-8">

        {/* 端口映射状态看板 */}
        <div className={`p-8 rounded-[2.5rem] border ${cardBg} flex flex-col`}>
          <div className="flex items-center gap-3 mb-8">
            <Network size={18} className="text-emerald-500" />
            <h4 className={`text-sm font-black uppercase tracking-widest ${textP}`}>网络拓扑端口看板</h4>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {[
              { label: '前端系统登录', port: serverConfig.ports?.frontend || 5174, icon: <Globe size={12} />, color: 'text-sky-500', bg: 'bg-sky-500/10' },
              { label: '后端服务网关', port: serverConfig.ports?.backend || 3003, icon: <Server size={12} />, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { label: '终端通信协议', port: serverConfig.ports?.terminal || 3003, icon: <Monitor size={12} />, color: 'text-purple-500', bg: 'bg-purple-500/10' }
            ].map(p => (
              <div key={p.label} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl ${p.bg} ${p.color} flex items-center justify-center`}>{p.icon}</div>
                  <div>
                    <p className={`text-[10px] font-black ${textP}`}>{p.label}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Active_Listen</p>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-lg bg-white/5 text-[11px] font-mono font-bold text-slate-400">:{p.port}</div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-6 border-t border-white/5 space-y-4">
            <div className="flex justify-between items-center px-1">
              <span className="text-[9px] font-black text-slate-500 uppercase">Traffic_Analysis</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => <div key={i} className={`w-1 h-3 rounded-full ${i < 4 ? 'bg-emerald-500/40' : 'bg-slate-700'}`}></div>)}
              </div>
            </div>
          </div>
        </div>

        {/* 物理存储分布映射 */}
        <div className={`p-8 rounded-[2.5rem] border ${cardBg}`}>
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/5"><HardDrive size={24} /></div>
            <div>
              <h4 className={`text-lg font-black tracking-tight ${textP}`}>Node Storage 物理映射</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Matrix_Storage 硬件级目录直达与状态解析</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {serverConfig.storageStructure?.map((dir: any) => (
              <div key={dir.id} className="group p-5 rounded-[2rem] bg-white/5 border border-white/5 hover:border-sky-500/30 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-sky-500 transition-colors">
                    {dir.id === 'root' ? <Share2 size={18} /> : <FolderOpen size={18} />}
                  </div>
                  {serverConfig.isLocal && (
                    <button
                      onClick={() => handleOpenFolder(dir.path)}
                      className="text-[9px] font-black uppercase bg-sky-500/10 text-sky-500 px-3 py-1.5 rounded-full hover:bg-sky-500 hover:text-white transition-all transform active:scale-90"
                    >
                      物理直达
                    </button>
                  )}
                </div>
                <h5 className={`text-xs font-black ${textP} mb-1`}>{dir.name}</h5>
                <p className="text-[9px] text-slate-500 font-mono truncate" title={serverConfig.storagePath + (dir.path ? '\\' + dir.path : '')}>
                  {serverConfig.storagePath}{dir.path ? '\\' + dir.path : ''}
                </p>
              </div>
            ))}
            {!serverConfig.storageStructure?.length && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-20">
                <Database size={40} className="mb-4" />
                <p className="text-[11px] font-black uppercase tracking-widest">Physical_Map_Initializing...</p>
              </div>
            )}
          </div>
        </div>

        <div className={`p-8 rounded-[2.5rem] border ${isDark ? 'border-sky-500/20 bg-sky-500/[0.02]' : 'border-sky-200 bg-sky-50/30'}`}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/20"><Code2 size={24} /></div>
              <div>
                <h4 className={`text-lg font-black tracking-tight ${textP}`}>物理元数据持久化 (核心后端代码)</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">此代码为生产级 Express 实现，支持断点续传、分片合并及 metadata.json 分类持久化</p>
              </div>
            </div>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
            >
              {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制代码</>}
            </button>
          </div>

          <div className={`relative rounded-3xl overflow-hidden border ${isDark ? 'border-white/5 bg-[#010409]' : 'border-slate-200 bg-slate-900'}`}>
            <pre className="p-6 text-[11px] font-mono leading-relaxed text-sky-400 overflow-x-auto no-scrollbar max-h-[500px]">
              <code>{backendCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
