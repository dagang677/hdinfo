
import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor, Plus, Search, Upload, FolderPlus, Volume2,
  RotateCcw, Power, Radio, ListMusic, Trash2, Edit3,
  GripVertical, X, Check, Save, Smartphone, Laptop,
  Cast, Wifi, WifiOff, VolumeX, RotateCw, Play, Pause,
  Type, Palette, Gauge, Layers, Clock, ArrowRight,
  Database, Layout, Calendar, ChevronRight, Loader2,
  Filter, CheckSquare, Square, Info, FileSpreadsheet,
  Eye, Maximize2, MonitorPlay, ArrowUp, ArrowDown, AlertCircle,
  ExternalLink, MousePointer2, PlayCircle as PlayIcon, Globe,
  Box, Radar, Scan, RefreshCw as RefreshIcon, Activity,
  Tag, Network, ShieldCheck, Activity as ActivityIcon, MonitorDot, Cpu,
  Target, Command, Share, HardDrive, Zap, ChevronUp, ChevronDown
} from 'lucide-react';

// ==================== 类型定义 ====================
interface ProgramItem {
  id: string;
  type: 'asset' | 'template' | 'task';
  assetType?: 'VID' | 'IMG';
  name: string;
  duration: { h: number; m: number; s: number };
  refId: string;
  category?: string;
  thumb?: string;
}

interface Terminal {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline';
  groupId: string;
  volume: number;
  rotation: 0 | 90 | 180 | 270;
  lastSeen: string;
  isRebooting?: boolean;
  version?: string; // 新增：终端版本号
  programList: ProgramItem[];
}

interface Group {
  id: string;
  name: string;
  order: number;
}

// --- ID 标准化工具 ---
const cleanTerminalId = (id: string) => {
  if (!id) return '';
  // 递归移除可能堆叠的前缀：TERM-, NODE-, TERM-NODE-
  let clean = id.toUpperCase();
  while (clean.startsWith('TERM-') || clean.startsWith('NODE-')) {
    clean = clean.replace(/^TERM-/, '').replace(/^NODE-/, '');
  }
  return clean;
};

const standardizeId = (id: string) => {
  const clean = cleanTerminalId(id);
  return clean ? `NODE-${clean}` : '';
};

// ==================== 装饰性角标组件 ====================
const LabBrackets: React.FC<{ color?: string }> = ({ color = "border-sky-500/20" }) => (
  <>
    <div className={`absolute top-0 left-0 w-2 h-2 border-t border-l ${color} rounded-tl-sm`}></div>
    <div className={`absolute top-0 right-0 w-2 h-2 border-t border-r ${color} rounded-tr-sm`}></div>
    <div className={`absolute bottom-0 left-0 w-2 h-2 border-b border-l ${color} rounded-bl-sm`}></div>
    <div className={`absolute bottom-0 right-0 w-2 h-2 border-b border-r ${color} rounded-br-sm`}></div>
  </>
);

// ==================== 智能媒体渲染器 (修复视频封面) ====================
const LabMediaPreview: React.FC<{ item: any; className?: string }> = ({ item, className = "" }) => {
  const isVideo = item.type === 'VID' || (item.name && item.name.match(/\.(mp4|webm|ogg|mov|mkv)$/i));
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isVideo && videoRef.current) {
      // 确保视频加载完成后再设置currentTime
      const loadVideo = async () => {
        try {
          await videoRef.current?.play();
          // 等待一小段时间让视频加载
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = 0.5; // 捕获 0.5s 处的画面作为封面
              videoRef.current.pause();
            }
          }, 100);
        } catch (error) {
          console.error('视频加载失败:', error);
        }
      };
      loadVideo();
    }
  }, [item.thumb, isVideo]);

  return (
    <div className={`relative w-full h-full bg-slate-900 overflow-hidden ${className}`}>
      <div className="w-full h-full flex items-center justify-center">
        {isVideo ? (
          <video
            ref={videoRef}
            src={item.thumb}
            className="max-w-full max-h-full object-contain opacity-70 group-hover:opacity-100 transition-opacity"
            muted
            playsInline
            autoPlay
            preload="metadata"
          />
        ) : (
          <img src={item.thumb} className="max-w-full max-h-full object-contain opacity-70 group-hover:opacity-100 transition-opacity" alt="" />
        )}
      </div>
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <PlayIcon size={24} className="text-white/40 group-hover:text-white/80 transition-all group-hover:scale-110" />
        </div>
      )}
    </div>
  );
};

const TemplatePreviewMini: React.FC<{ templateId: string; template?: any; allTemplates?: any[] }> = ({ templateId, template, allTemplates }) => {
  const [tpl, setTpl] = useState<any>(template);
  const API_BASE = '';

  useEffect(() => {
    if (template) {
      setTpl(template);
      return;
    }
    if (allTemplates) {
      const found = allTemplates.find((t: any) => t.id === templateId || t.name === templateId);
      if (found) {
        setTpl(found);
        return;
      }
    }
    const fetchTpl = async () => {
      try {
        const res = await fetch(`/api/templates`);
        if (res.ok) {
          const list = await res.json();
          const found = list.find((t: any) => t.id === templateId || t.name === templateId);
          if (found) setTpl(found);
        }
      } catch (e) { }
    };
    fetchTpl();
  }, [templateId, template, allTemplates]);

  if (!tpl) return <div className="w-full h-full bg-slate-100 flex items-center justify-center"><Layout size={14} className="text-slate-300" /></div>;

  const isPortrait = tpl.orientation === 'portrait';
  const aspectRatio = isPortrait ? '1080 / 1920' : '1920 / 1080';

  return (
    <div className="w-full h-full relative bg-slate-900/50 overflow-hidden flex items-center justify-center p-1 group/tpl-min">
      <div
        className="relative bg-slate-950 shadow-2xl border border-white/10 overflow-hidden transition-transform group-hover/tpl-min:scale-105"
        style={{
          aspectRatio,
          height: '100%',
          maxHeight: '100%',
          maxWidth: '100%',
          background: tpl.bgConfig?.value || '#0f172a'
        }}
      >
        {tpl.layers?.map((l: any) => {
          let layerContent = null;
          if (l.type === 'media') {
            const playlist = l.config?.playlist || [];
            if (playlist && playlist.length > 0) {
              const firstItem = playlist[0];
              const streamUrl = `${API_BASE}/api/assets/stream?filename=${encodeURIComponent(firstItem.name)}`;
              if (firstItem.type === 'VID') {
                layerContent = (
                  <div className="w-full h-full bg-black flex items-center justify-center relative">
                    <video
                      src={streamUrl}
                      className="w-full h-full object-cover opacity-60"
                      muted
                      onLoadedMetadata={(e) => {
                        (e.target as HTMLVideoElement).currentTime = 0.5;
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PlayIcon size={6} className="text-white/40" />
                    </div>
                  </div>
                );
              } else {
                layerContent = <img src={streamUrl} className="w-full h-full object-cover opacity-60" alt="" />;
              }
            }
          } else if (l.type === 'text') {
            layerContent = (
              <div className="w-full h-full p-[1px] overflow-hidden flex flex-col items-center justify-center bg-white/5">
                <span style={{ fontSize: '3px', color: l.config?.color || '#fff', lineHeight: 1 }} className="scale-[0.6] font-black opacity-80 truncate w-full text-center">
                  {l.config?.content || 'TXT'}
                </span>
                <span className="text-[2px] opacity-20 scale-[0.4] mt-[0.5px]">TEXT_NODE</span>
              </div>
            );
          } else if (l.type === 'web') {
            const webUrl = l.config?.url;
            layerContent = (
              <div className="w-full h-full bg-slate-800/40 relative overflow-hidden flex items-center justify-center">
                {webUrl && webUrl !== 'https://' ? (
                  <div className="w-[1920px] h-[1080px] origin-top-left scale-[0.05] pointer-events-none opacity-40">
                    <iframe src={webUrl} className="w-full h-full border-none" scrolling="no" />
                  </div>
                ) : (
                  <Globe size={8} className="text-sky-500/20" />
                )}
                <div className="absolute inset-0 bg-gradient-to-tr from-sky-500/5 to-transparent"></div>
              </div>
            );
          }

          return (
            <div
              key={l.id}
              className="absolute border border-white/30 rounded-[1px] overflow-hidden"
              style={{
                left: `${l.x}%`,
                top: `${l.y}%`,
                width: `${l.w}%`,
                height: `${l.h}%`,
                background: 'rgba(255,255,255,0.05)',
                zIndex: l.z || 0
              }}
            >
              {layerContent}
            </div>
          );
        })}
        {/* 指纹装饰 */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(45deg, #fff 1px, transparent 1px), linear-gradient(-45deg, #fff 1px, transparent 1px)', backgroundSize: '4px 4px' }}></div>
      </div>
    </div>
  );
};

const VirtualPlayer: React.FC<{ list: ProgramItem[], serverConfig: any, rotation?: number, terminalId?: string, terminalIp?: string, snapshotTicks?: number }> = ({ list, serverConfig, rotation = 0, terminalId, terminalIp, snapshotTicks = 0 }) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (list.length <= 1) return;
    const current = list[index];
    const totalSec = (current.duration.h * 3600 + current.duration.m * 60 + current.duration.s) || 10;
    const timer = setTimeout(() => setIndex((prev) => (prev + 1) % list.length), totalSec * 1000);
    return () => clearTimeout(timer);
  }, [index, list]);

  // 生成物理快照URL - 使用相对路径以兼容不同部署环境
  const getSnapshotUrl = () => {
    // 直接使用 terminalId，格式应为 NODE-XX
    return `/api/terminals/snapshot?terminalId=${terminalId || ''}&t=${snapshotTicks}`;
  };

  // 显示终端物理快照 (已集成信息看板，无需额外 UI 叠加)
  return (
    <div className="w-full h-full bg-black relative group/vplay overflow-hidden">
      <img
        src={getSnapshotUrl()}
        alt="终端监控画面"
        className="w-full h-full object-contain transition-transform duration-1000 group-hover:scale-105"
        onError={(e) => {
          // 当快照不存在时，显示默认的监控界面
          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=400&auto=format&fit=crop';
        }}
      />
      <div className="absolute top-3 left-3 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-sm text-[8px] text-white/60 font-mono uppercase tracking-tighter z-10">Matrix_Node_Stream</div>
    </div>
  );
};

// --- 抽取终端卡片为独立备忘组件以提高渲染性能 ---
const TerminalCard: React.FC<{
  terminal: Terminal;
  isSelected: boolean;
  isDark: boolean;
  snapshotTicks: number;
  serverConfig: any;
  onSelect: (id: string) => void;
}> = React.memo(({ terminal, isSelected, isDark, snapshotTicks, serverConfig, onSelect }) => {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const isOnline = terminal.status === 'online';
  const cardBase = isDark
    ? 'bg-slate-900/80 border-slate-800 hover:border-sky-600/50'
    : 'bg-white border-slate-200 hover:border-sky-300';
  const cardActive = isDark
    ? 'ring-2 ring-sky-500 border-sky-500 shadow-[0_0_20px_rgba(14,165,233,0.3)]'
    : 'ring-2 ring-sky-500 border-sky-500 shadow-lg';

  // 仅在可见时拼接 snapshotTicks 强制刷新
  const snapshotUrl = `/api/terminals/snapshot?terminalId=${terminal.id}${isVisible ? `&t=${snapshotTicks}` : ''}`;

  return (
    <div
      ref={cardRef}
      onClick={() => onSelect(terminal.id)}
      className={`relative rounded-2xl border overflow-hidden cursor-pointer transition-all duration-300 group ${cardBase} ${isSelected ? cardActive : ''}`}
    >
      <div className="aspect-video bg-black relative overflow-hidden">
        {isVisible ? (
          <img
            src={snapshotUrl}
            alt="监控"
            className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-opacity"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full bg-slate-800 flex items-center justify-center">
            <Loader2 size={24} className="text-white/10" />
          </div>
        )}
        {!isOnline && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
            <WifiOff size={24} className="text-slate-500" />
          </div>
        )}
        {terminal.isRebooting ? (
          <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-sky-500 animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.8)]"></div>
        ) : (
          <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-rose-500'}`}></div>
        )}
        {isSelected && (
          <div className="absolute top-2 left-2 w-6 h-6 bg-sky-500 rounded-lg flex items-center justify-center shadow-lg">
            <Check size={14} className="text-white" strokeWidth={3} />
          </div>
        )}
        {isOnline && isVisible && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[8px] text-emerald-400 font-mono font-bold flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> LIVE
          </div>
        )}
      </div>
      <div className={`p-3 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
        <h5 className={`text-[12px] font-black truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>{terminal.name}</h5>
        <div className="flex items-center justify-between mt-1.5">
          {terminal.isRebooting ? (
            <span className="text-[9px] font-black text-sky-500 animate-pulse tracking-tighter">REBOOTING...</span>
          ) : (
            <div className="flex flex-col">
              <p className={`text-[9px] font-mono leading-tight ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>{terminal.ip}</p>
              {terminal.version !== serverConfig.ota_standard_version && (
                <span className="text-[8px] font-bold text-amber-500 flex items-center gap-0.5 mt-0.5 animate-pulse">
                  <AlertCircle size={8} /> OUTDATED
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-white/5 ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>{terminal.version}</span>
            <span className={`text-[8px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{terminal.rotation}°</span>
            <span className={`text-[8px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{terminal.volume}%</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ==================== 主组件 ====================
export const TerminalsView: React.FC<any> = ({ serverConfig, isDark, isSidebarCollapsed, textP, textS, cardBg }) => {
  // 1. 持久化数据
  const [groups, setGroups] = useState<Group[]>(() => JSON.parse(localStorage.getItem('dms_terminal_groups') || '[{"id":"default","name":"默认分组","order":0}]'));
  const [terminals, setTerminals] = useState<Terminal[]>(() => {
    const raw = localStorage.getItem('dms_terminals');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      // 核心修复：加载时自动清理并标准化所有历史 ID
      return (parsed as Terminal[]).map(t => ({ ...t, id: standardizeId(t.id) }));
    } catch (e) {
      return [];
    }
  });

  // 2. 交互状态
  const [activeGroupId, setActiveGroupId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);

  // 3. 模态框
  const [showAddTerminal, setShowAddTerminal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGroupMgr, setShowGroupMgr] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showProgramList, setShowProgramList] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false); // 全屏监控模式
  const [snapshotTicks, setSnapshotTicks] = useState(0); // 用于强制刷新图片缓存

  // 4. 表单状态
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<{ id: string, name: string } | null>(null);
  const [newTerminal, setNewTerminal] = useState({ name: '', ip: '', id: '', groupId: 'default' });
  const [addTerminalMode, setAddTerminalMode] = useState<'manual' | 'auto'>('manual');
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredNodes, setDiscoveredNodes] = useState<any[]>([]);
  const [broadcastConfig, setBroadcastConfig] = useState({ text: '实验室公告：请注意终端物理状态', fontSize: 40, color: '#FFFFFF', bgColor: '#0EA5E9', bgOpacity: 90, speed: 5, duration: 30 });

  // 5. 资源选择
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [pickerCategory, setPickerCategory] = useState('全部素材');
  const [isAssetLoading, setIsAssetLoading] = useState(false);

  const API_BASE = '';

  useEffect(() => {
    localStorage.setItem('dms_terminal_groups', JSON.stringify(groups));
    localStorage.setItem('dms_terminals', JSON.stringify(terminals));
  }, [groups, terminals]);

  // 每5秒轮询一次快照版本（全局网格），当打开预览模态时提升到 2秒
  useEffect(() => {
    const interval = showPreviewModal ? 2000 : 10000;
    const timer = setInterval(() => setSnapshotTicks(t => t + 1), interval);
    return () => clearInterval(timer);
  }, [showPreviewModal]);

  // 核心修复：增加终端列表与服务端心跳数据的实时同步
  useEffect(() => {
    const syncStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/terminals/status`);
        if (res.ok) {
          const remoteData = await res.json();
          setTerminals(prev => prev.map(t => {
            const cleanId = cleanTerminalId(t.id);
            // 在 remoteData 中查找对应的 ID
            const entry = Object.entries(remoteData).find(([rid]) => cleanTerminalId(rid) === cleanId);
            const remoteNode = entry ? (entry[1] as any) : null;

            if (remoteNode) {
              const lastSeenDate = new Date(remoteNode.lastSeen);
              const diffSec = (new Date().getTime() - lastSeenDate.getTime()) / 1000;

              // 判断逻辑：心跳在60秒内 (容错率更高) 且 终端未上报业务离线状态 (isPowerOff 会上报 offline)
              const isActuallyOnline = diffSec < 60 && remoteNode.status?.state !== 'offline';

              return {
                ...t,
                name: remoteNode.businessName || t.name,
                groupId: remoteNode.groupId || t.groupId,
                ip: remoteNode.ip || t.ip,
                lastSeen: remoteNode.lastSeen,
                status: isActuallyOnline ? 'online' : 'offline',
                isRebooting: remoteNode.isRebooting || false,
                version: remoteNode.version || 'Unknown'
              };
            }
            return { ...t, status: 'offline' };
          }));
        }
      } catch (e) {
        console.warn('[Sync] Heartbeat sync failed');
      }
    };

    const timer = setInterval(syncStatus, 5000);
    syncStatus();
    return () => clearInterval(timer);
  }, []);

  const triggerFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ msg, type }); setTimeout(() => setFeedback(null), 3000);
  };

  const sendCmd = async (command: string, payload: any) => {
    for (const tid of Array.from(selectedIds)) {
      try {
        // 核心修复：必须提取原始物理 TID（去掉 NODE- 前缀），否则终端心跳无法匹配指令
        const realTid = cleanTerminalId(tid);
        // 获取终端的屏幕旋转信息
        const terminal = terminals.find(t => t.id === tid);
        const rotation = terminal?.rotation || 0;

        // 为不同命令添加屏幕旋转信息
        let cmdPayload = payload;
        if (command === 'SET_BROADCAST') {
          // 广播内容始终显示在屏幕最下方，无论横屏竖屏
          cmdPayload = payload ? { ...payload, rotation, position: 'bottom' } : null;
        } else if (command === 'PLAY_LIST') {
          // 修正：不要通过 {...payload, rotation} 破坏数组结构
          // 如果需要传递 rotation，作为单独的命令或确保 payload 保持数组
          cmdPayload = payload;
        } else if (command === 'SET_ROTATION') {
          // 旋转命令，直接发送旋转角度
          cmdPayload = payload;
        }

        await fetch(`${API_BASE}/api/terminals/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ terminalId: realTid, command, payload: cmdPayload })
        });
      } catch (e) {
        console.error(`Failed to send command to terminal:`, e);
      }
    }
  };

  const fetchResources = async () => {
    setIsAssetLoading(true);
    try {
      // 1. 获取最新素材列表
      const assetRes = await fetch(`${API_BASE}/api/assets`);
      // 2. 获取服务端保存的分类映射和分类列表
      const categoryRes = await fetch(`${API_BASE}/api/categories`);
      // 3. 获取服务端模板列表
      const templateRes = await fetch(`${API_BASE}/api/templates`);

      if (assetRes.ok && categoryRes.ok && templateRes.ok) {
        const assets = await assetRes.json();
        const categoryData = await categoryRes.json();
        const templates = await templateRes.json();

        const catMap = categoryData.assetMap || {};
        const categories = categoryData.categories || [];

        setAvailableAssets(assets.map((a: any) => ({
          ...a,
          type: a.name.match(/\.(mp4|webm|ogg|mov|mkv)$/i) ? 'VID' : 'IMG',
          category: catMap[a.name] || '未分类',
          thumb: `${API_BASE}/api/assets/stream?filename=${encodeURIComponent(a.name)}`
        })));

        setAvailableTemplates(templates);
        setAvailableCategories(categories);
      }
    } catch (e) {
      console.error('Failed to sync physical assets repository:', e);
    }
    setIsAssetLoading(false);
  };

  const handleDiscovery = async () => {
    setIsScanning(true);
    setDiscoveredNodes([]);
    try {
      await new Promise(r => setTimeout(r, 1200));
      const res = await fetch(`${API_BASE}/api/terminals/status`);
      if (res.ok) {
        const data = await res.json();
        // 统一使用清理后的 ID 进行比对
        const currentIds = new Set(terminals.map(t => cleanTerminalId(t.id)));
        const found = Object.keys(data)
          .filter(tid => !currentIds.has(cleanTerminalId(tid)))
          .map(tid => {
            const nodeData = data[tid];
            const fullId = standardizeId(tid);
            return {
              id: fullId, // 标准化后的 ID
              ip: nodeData.ip || '127.0.0.1',
              lastSeen: nodeData.lastSeen,
              status: 'online',
              businessName: nodeData.businessName || nodeData.status?.name || `物理节点-${cleanTerminalId(tid)}`
            };
          });
        setDiscoveredNodes(found);
      }
    } catch (e) {
      triggerFeedback('物理发现引擎连接失败', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // --- Fix: Added missing handleAddGroup and handleMoveGroup functions ---
  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name: newGroupName.trim(),
      order: groups.length
    };
    setGroups([...groups, newGroup]);
    setNewGroupName('');
  };

  const handleMoveGroup = (id: string, direction: 'up' | 'down') => {
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === groups.length - 1) return;

    const newGroups = [...groups];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]];

    const updated = newGroups.map((g, i) => ({ ...g, order: i }));
    setGroups(updated);
  };

  const filteredTerminals = activeGroupId === 'all' ? terminals : terminals.filter(t => t.groupId === activeGroupId);
  const selectedTerminals = terminals.filter(t => selectedIds.has(t.id));

  const labCardStyle = `relative p-6 rounded-2xl border bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-500 cursor-pointer group`;
  const activeLabCard = `ring-1 ring-sky-500 border-sky-200 shadow-[0_12px_30px_-10px_rgba(14,165,233,0.15)] scale-[1.02]`;

  return (
    <div className="flex h-full gap-8 animate-in fade-in duration-1000">
      {/* 极简实验室反馈 */}
      {feedback && (
        <div className={`fixed top-32 left-1/2 -translate-x-1/2 z-[5000] px-6 py-3 rounded-full flex items-center gap-3 animate-in slide-in-from-top-2 border ${feedback.type === 'success' ? 'bg-white text-sky-600 border-sky-100' : 'bg-white text-rose-600 border-rose-100'} shadow-xl backdrop-blur-md`}>
          <div className={`w-2 h-2 rounded-full ${feedback.type === 'success' ? 'bg-sky-500 animate-pulse' : 'bg-rose-500'}`}></div>
          <span className="text-[12px] font-bold tracking-tight">{feedback.msg}</span>
        </div>
      )}

      {/* 左侧：实验室分区 */}
      <div className="w-64 shrink-0 flex flex-col rounded-[2rem] bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div><h4 className="text-[15px] font-black text-slate-800">矩阵分区</h4><p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Lab Segments</p></div>
          <button onClick={() => setShowGroupMgr(true)} className="p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-full transition-all"><FolderPlus size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-1.5">
          <button onClick={() => setActiveGroupId('all')} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${activeGroupId === 'all' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:bg-white/50'}`}>
            <div className="flex items-center gap-3"><Monitor size={16} /><span className="text-[13px] font-bold">所有节点</span></div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${activeGroupId === 'all' ? 'bg-black/10' : 'bg-slate-100'}`}>{terminals.length}</span>
          </button>
          <div className="h-px bg-slate-100 my-4 mx-4"></div>
          {groups.map(g => (
            <button key={g.id} onClick={() => setActiveGroupId(g.id)} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${activeGroupId === g.id ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:bg-white/50'}`}>
              <div className="flex items-center gap-3"><Layers size={16} /><span className="text-[13px] font-bold">{g.name}</span></div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${activeGroupId === g.id ? 'bg-black/10' : 'bg-slate-100'}`}>{terminals.filter(t => t.groupId === g.id).length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 右侧：主矩阵 */}
      <div className="flex-1 flex flex-col gap-8">
        <div className="p-4 px-8 rounded-3xl bg-white/60 backdrop-blur-md border border-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-6">
            <button onClick={() => selectedIds.size === filteredTerminals.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(filteredTerminals.map(t => t.id)))} className="h-10 px-5 rounded-xl flex items-center gap-3 text-[12px] font-bold text-slate-500 hover:bg-white transition-all">
              {selectedIds.size === filteredTerminals.length && filteredTerminals.length > 0 ? <CheckSquare size={18} className="text-sky-500" /> : <Square size={18} />} 全选
            </button>
            <div className="relative"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" /><input type="text" placeholder="检索物理特征 / IP..." className="h-10 w-80 pl-12 pr-4 bg-white/50 rounded-xl border border-slate-100 outline-none text-[12px] font-medium focus:border-sky-300 focus:bg-white transition-all shadow-inner" /></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowImportModal(true)} className="w-10 h-10 rounded-xl flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-sky-500 transition-all"><FileSpreadsheet size={20} /></button>
            <button onClick={() => setShowAddTerminal(true)} className="h-11 px-6 bg-slate-900 hover:bg-sky-600 text-white rounded-xl text-[12px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2 transition-all"><Plus size={18} /> 接入实验节点</button>
          </div>
        </div>

        {/* 高密度监控网格 - 支持50路并发 */}
        <div
          className={`flex-1 overflow-y-auto no-scrollbar grid gap-3 pb-40 transition-colors duration-500 ${isDark ? 'bg-slate-950/50' : 'bg-slate-50/30'}`}
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          {filteredTerminals.map(t => (
            <TerminalCard
              key={t.id}
              terminal={t}
              isSelected={selectedIds.has(t.id)}
              isDark={isDark}
              snapshotTicks={snapshotTicks}
              serverConfig={serverConfig}
              onSelect={(id) => {
                const next = new Set(selectedIds);
                if (next.has(id)) next.delete(id); else next.add(id);
                setSelectedIds(next);
              }}
            />
          ))}
        </div>

        {/* 底部控制台 */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-12 left-[calc(50%+128px)] -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-12 duration-700">
            <div className="flex items-center gap-8 bg-slate-900/95 text-white px-10 py-5 rounded-[2.5rem] border border-white/10 backdrop-blur-2xl shadow-2xl relative">
              <div className="flex items-center gap-5 border-r border-white/10 pr-8">
                <div className="w-12 h-12 bg-sky-500 rounded-2xl flex items-center justify-center text-[20px] font-black shadow-xl"> {selectedIds.size} </div>
                <div><p className="text-[13px] font-black">受控节点</p><p className="text-[9px] font-bold text-sky-400 uppercase tracking-widest">Live Matrix</p></div>
              </div>
              <div className="flex items-center gap-6">
                <button onClick={() => setShowPreviewModal(true)} className="w-11 h-11 bg-white/5 hover:bg-sky-500 text-sky-400 hover:text-white rounded-xl transition-all flex items-center justify-center border border-white/5"><MonitorPlay size={20} /></button>
                <div className="flex items-center gap-4 bg-white/5 p-2 px-5 rounded-2xl border border-white/5">
                  <Volume2 size={18} className="text-sky-500" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    className="w-32 accent-sky-500 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setTerminals(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, volume: val } : t));
                      sendCmd('SET_VOLUME', val);
                      triggerFeedback('音量已同步至物理终端');
                    }}
                  />
                </div>
                <div className="flex gap-1.5 p-1.5 bg-white/5 rounded-2xl border border-white/5">
                  {[0, 90, 180, 270].map(angle => (
                    <button
                      key={angle}
                      onClick={() => {
                        setTerminals(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, rotation: angle as any } : t));
                        sendCmd('SET_ROTATION', angle);
                        triggerFeedback(`屏幕已旋转 ${angle}°`);
                      }}
                      className="w-10 h-10 hover:bg-sky-500 text-slate-400 hover:text-white rounded-xl text-[11px] font-black transition-all"
                    >
                      {angle}°
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // 开机定义：发送重启命令以恢复输出
                      sendCmd('REBOOT', null);
                      triggerFeedback('指令：终端正在冷启动恢复...');
                    }}
                    className="w-10 h-10 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl transition-all flex items-center justify-center border border-emerald-500/20"
                    title="开机 (触发重启恢复)"
                  >
                    <Power size={18} />
                  </button>
                  <button
                    onClick={() => {
                      // 重启定义：标准系统重启
                      const onlineTerminals = terminals.filter(t => selectedIds.has(t.id) && t.status === 'online');
                      if (onlineTerminals.length > 0) {
                        sendCmd('REBOOT', null);
                        triggerFeedback('指令：正在执行系统重启');
                      } else {
                        triggerFeedback('无在线终端需要重启', 'error');
                      }
                    }}
                    className="w-10 h-10 bg-sky-500/10 text-sky-400 hover:bg-sky-500 hover:text-white rounded-xl transition-all flex items-center justify-center border border-sky-500/20"
                    title="重启系统"
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button
                    onClick={() => {
                      // 关机定义：切换输出源（模拟关机）
                      sendCmd('POWER_OFF', null);
                      triggerFeedback('指令：隐藏终端输出并离线');
                    }}
                    className="w-10 h-10 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all flex items-center justify-center border border-rose-500/20"
                    title="关机 (切换信号源)"
                  >
                    <X size={20} />
                  </button>
                  <button
                    onClick={async () => {
                      // 从素材中心获取固件：查找"系统固件"分类中最新的 .exe 文件
                      try {
                        const catRes = await fetch('/api/categories');
                        if (!catRes.ok) throw new Error('无法连接素材中心');
                        const catData = await catRes.json();
                        const assetMap = catData.assetMap || {};

                        const assetsRes = await fetch('/api/assets');
                        if (!assetsRes.ok) throw new Error('无法获取素材列表');
                        const assets = await assetsRes.json();

                        // 筛选系统固件分类中的 .exe 文件
                        const firmwareList = assets.filter((a: any) => {
                          const name = a.name || '';
                          const cat = assetMap[name] || '';
                          return cat === '系统固件' && name.toLowerCase().endsWith('.exe');
                        });

                        if (firmwareList.length === 0) {
                          triggerFeedback('素材中心未找到系统固件，请先上传 .exe 文件到"系统固件"分类', 'error');
                          return;
                        }

                        // 按上传时间排序，取最新的固件
                        firmwareList.sort((a: any, b: any) =>
                          new Date(b.uploadTime || 0).getTime() - new Date(a.uploadTime || 0).getTime()
                        );
                        const latestFirmware = firmwareList[0];
                        const firmwareUrl = `/api/assets/stream?filename=${encodeURIComponent(latestFirmware.name)}`;

                        if (confirm(`确定要对选中的 ${selectedIds.size} 台终端下发 [系统升级] 指令吗？\n固件: ${latestFirmware.name}\n终端将重启以应用更新。`)) {
                          sendCmd('UPGRADE_APP', { url: firmwareUrl });
                          triggerFeedback(`指令：正在下发固件 ${latestFirmware.name}`);
                        }
                      } catch (e: any) {
                        triggerFeedback(e.message || '获取固件失败', 'error');
                      }
                    }}
                    className="w-10 h-10 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white rounded-xl transition-all flex items-center justify-center border border-amber-500/20"
                    title="远程在线升级"
                  >
                    <Zap size={18} />
                  </button>

                </div>
                <div className="w-px h-10 bg-white/10 mx-2"></div>
                <button onClick={() => setShowBroadcast(true)} className="h-12 px-6 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest flex items-center gap-3 transition-all"><Radio size={18} /> 广播</button>
                <button onClick={() => { setShowProgramList(true); fetchResources(); }} className="h-12 px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest flex items-center gap-3 transition-all"><ListMusic size={18} /> 插播</button>
                <button onClick={() => { setTerminals(terminals.filter(t => !selectedIds.has(t.id))); setSelectedIds(new Set()); triggerFeedback('物理注销完成'); }} className="w-12 h-12 bg-white/5 hover:bg-rose-600 text-white rounded-2xl transition-all flex items-center justify-center"><Trash2 size={20} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- 监控模态框 (双模态视觉体验) --- */}
      {
        showPreviewModal && (
          <div className={`fixed inset-0 z-[2000] flex flex-col animate-in fade-in duration-500 ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`} style={{ left: isFullscreenPreview ? '0' : (isSidebarCollapsed ? '80px' : '288px') }}>
            {/* 顶部栏 - 全屏时隐藏 */}
            {!isFullscreenPreview && (
              <div className={`p-8 border-b flex items-center justify-between ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${isDark ? 'bg-sky-500 text-white' : 'bg-sky-600 text-white'}`}><MonitorPlay size={28} /></div>
                  <div>
                    <h3 className={`text-2xl font-black italic tracking-tighter ${isDark ? 'text-white' : 'text-slate-800'}`}>
                      {selectedTerminals.length === 1 ? '物理节点沉浸式实时流' : '实验室集群实时态势感应'}
                    </h3>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.4em] mt-1 ${isDark ? 'text-sky-500' : 'text-sky-600'}`}>
                      {selectedTerminals.length === 1 ? `Target_Node: ${selectedTerminals[0].name}` : `Active_Cluster_Size: ${selectedTerminals.length} Nodes`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsFullscreenPreview(true)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border group shadow-lg ${isDark ? 'bg-white/5 hover:bg-sky-600 text-white border-white/10' : 'bg-white hover:bg-sky-500 text-slate-600 hover:text-white border-slate-200'}`} title="全屏监控"><Maximize2 size={20} /></button>
                  <button onClick={() => setShowPreviewModal(false)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border group shadow-xl active:scale-90 ${isDark ? 'bg-white/5 hover:bg-rose-600 text-white border-white/10' : 'bg-white hover:bg-rose-500 text-slate-600 hover:text-white border-slate-200'}`}><X size={28} className="group-hover:rotate-90 transition-transform duration-500" /></button>
                </div>
              </div>
            )}

            {/* 监控画面区域 */}
            <div className={`flex-1 overflow-hidden ${isFullscreenPreview ? 'p-0' : 'p-8'} ${selectedTerminals.length === 1 ? 'flex items-center justify-center' : ''}`} style={selectedTerminals.length > 1 && !isFullscreenPreview ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' } : {}}>
              {selectedTerminals.map(t => (
                <div key={t.id} className={`relative overflow-hidden shadow-2xl group/prev ${isDark ? 'border-white/10 bg-black' : 'border-slate-200 bg-slate-900'} ${isFullscreenPreview ? 'w-full h-full border-0 rounded-none' : `rounded-3xl border ${selectedTerminals.length === 1 ? 'w-full max-w-[1200px] aspect-video' : 'aspect-video'}`}`}>
                  <VirtualPlayer list={t.programList} serverConfig={serverConfig} rotation={t.rotation} terminalId={t.id} terminalIp={t.ip} snapshotTicks={snapshotTicks} />


                  {/* 控制按钮 */}
                  <div className={`absolute bottom-5 right-5 flex gap-2 transition-opacity ${isFullscreenPreview ? 'opacity-0 hover:opacity-100' : 'opacity-0 group-hover/prev:opacity-100'}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xl ${isDark ? 'bg-black/60 backdrop-blur-xl border border-white/10 text-sky-400' : 'bg-white/90 backdrop-blur-xl border border-slate-200 text-sky-600'}`}><Volume2 size={14} /></div>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xl ${isDark ? 'bg-black/60 backdrop-blur-xl border border-white/10 text-amber-400' : 'bg-white/90 backdrop-blur-xl border border-slate-200 text-amber-600'}`}><RotateCw size={14} /></div>
                  </div>
                </div>
              ))}
            </div>

            {/* 底部栏 - 全屏时隐藏，改为悬浮控制栏 */}
            {isFullscreenPreview ? (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2100] flex items-center gap-4 px-6 py-3 bg-black/80 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl opacity-0 hover:opacity-100 transition-opacity duration-300">
                <span className="text-white/60 text-[10px] font-mono">{selectedTerminals[0]?.name}</span>
                <div className="w-px h-4 bg-white/20"></div>
                <button onClick={() => setIsFullscreenPreview(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold transition-all">退出全屏</button>
                <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 bg-rose-500/80 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold transition-all">关闭</button>
              </div>
            ) : (
              <div className={`h-16 backdrop-blur-3xl border-t flex items-center justify-center gap-10 text-[10px] font-black uppercase tracking-widest ${isDark ? 'bg-black/40 border-white/5 text-white/40' : 'bg-white/80 border-slate-200 text-slate-400'}`}>
                <div className="flex items-center gap-2"><Activity size={14} className="text-emerald-500 animate-pulse" /> Matrix_Pulse_Synchronized</div>
                <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-sky-500" /> Node_Encryption_Active</div>
              </div>
            )}
          </div>
        )
      }

      {/* --- 素材选择器 (深度连接模板引擎) --- */}
      {
        showAssetPicker && (
          <div className="fixed inset-0 z-[3000] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-12 animate-in zoom-in-95 duration-500">
            <div className="w-full max-w-6xl h-[85vh] rounded-[3.5rem] bg-white border border-white shadow-2xl flex flex-col overflow-hidden">
              <div className="p-10 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center text-sky-500 border border-slate-100 shadow-inner"><Box size={32} /></div>
                  <div><h3 className="text-3xl font-black text-slate-800">实验室资源柜</h3><p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.4em] mt-1">Physical Asset Repository</p></div>
                </div>
                <button onClick={() => setShowAssetPicker(false)} className="text-slate-300 hover:text-rose-500 transition-all"><X size={32} /></button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="w-72 border-r border-slate-50 p-8 overflow-y-auto no-scrollbar space-y-2.5 bg-slate-50/50">
                  <button onClick={() => setPickerCategory('全部素材')} className={`w-full h-12 px-6 rounded-2xl text-[12px] font-black uppercase text-left transition-all ${pickerCategory === '全部素材' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-white'}`}>全量资源</button>
                  <button onClick={() => setPickerCategory('布局模板库')} className={`w-full h-12 px-6 rounded-2xl text-[12px] font-black uppercase text-left transition-all ${pickerCategory === '布局模板库' ? 'bg-rose-500 text-white shadow-xl' : 'text-slate-400 hover:bg-white'}`}>矩阵模板库</button>
                  <div className="h-px bg-slate-100 my-4 mx-2"></div>
                  {availableCategories.filter(cat => cat !== '系统固件').map(cat => (
                    <button key={cat} onClick={() => setPickerCategory(cat)} className={`w-full h-12 px-6 rounded-2xl text-[12px] font-black uppercase text-left transition-all ${pickerCategory === cat ? 'bg-sky-500 text-white shadow-xl' : 'text-slate-400 hover:bg-white'}`}>{cat}</button>
                  ))}
                </div>
                <div className="flex-1 p-10 overflow-y-auto no-scrollbar grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                  {isAssetLoading ? (
                    <div className="col-span-full h-full flex flex-col items-center justify-center gap-4"><Loader2 size={48} className="animate-spin text-sky-500" /><span className="text-[12px] font-black text-slate-300 uppercase tracking-[0.3em]">Synchronizing_Vault...</span></div>
                  ) : (
                    <>
                      {pickerCategory !== '布局模板库' ?
                        availableAssets
                          .filter(a => pickerCategory === '全部素材' ? true : a.category === pickerCategory)
                          .filter(a => a.category !== '系统固件' && !a.name?.toLowerCase().endsWith('.exe'))
                          .map(asset => (
                            <div key={asset.name} onClick={() => {
                              const newItem: ProgramItem = { id: `PROG-${Date.now()}`, type: 'asset', assetType: asset.type, name: asset.name, duration: { h: 0, m: 0, s: 15 }, refId: asset.name, thumb: asset.thumb, category: asset.category };
                              setTerminals(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, programList: [...t.programList, newItem] } : t));
                              setShowAssetPicker(false); triggerFeedback('物理资源已载入队列');
                            }} className="group relative aspect-[4/3] rounded-[1.5rem] bg-slate-900 border border-slate-100 overflow-hidden cursor-pointer hover:scale-[1.03] hover:border-sky-300 hover:shadow-2xl transition-all shadow-md">
                              <LabMediaPreview item={asset} />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-6">
                                <p className="text-[10px] font-bold text-white truncate leading-tight" title={asset.name}>{asset.name}</p>
                                <p className="text-[8px] font-bold text-white/50 mt-0.5 uppercase">{asset.type} // {asset.category || '未分类'}</p>
                              </div>
                            </div>
                          )) :
                        availableTemplates.map(tpl => (
                          <div key={tpl.id} onClick={() => {
                            const newItem: ProgramItem = { id: `PROG-${Date.now()}`, type: 'template', name: tpl.name, duration: { h: 0, m: 0, s: 15 }, refId: tpl.id, category: '矩阵模板' };
                            setTerminals(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, programList: [...t.programList, newItem] } : t));
                            setShowAssetPicker(false); triggerFeedback('布局指令已载入队列');
                          }} className="group relative aspect-[4/3] rounded-[2.5rem] bg-slate-950 border border-slate-100 overflow-hidden cursor-pointer hover:scale-[1.05] hover:border-rose-300 hover:shadow-2xl transition-all shadow-md flex items-center justify-center">
                            <div className="absolute inset-0 opacity-60 group-hover:opacity-100 transition-opacity">
                              <TemplatePreviewMini templateId={tpl.id} template={tpl} />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                            <div className="absolute bottom-6 left-6 right-6 text-center">
                              <p className="text-[12px] font-black text-white">{tpl.name}</p>
                              <p className="text-[9px] font-bold text-rose-500 mt-1 uppercase tracking-widest">Matrix_Template</p>
                            </div>
                          </div>
                        ))
                      }
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* 其余模态框保持逻辑完整 (分组、紧急广播、插播列表) ... */}
      {/* 分区管理 */}
      {
        showGroupMgr && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
            <div className={`w-full max-w-md rounded-[2.5rem] bg-white border border-white shadow-2xl overflow-hidden flex flex-col`}>
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div><h3 className="text-xl font-black text-slate-800">实验室分区管理</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Registry Groups</p></div>
                <button onClick={() => setShowGroupMgr(false)} className="text-slate-300 hover:text-rose-500 transition-all"><X size={24} /></button>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex gap-2">
                  <input type="text" placeholder="命名新实验分区..." value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="flex-1 h-12 px-5 rounded-xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-700 focus:border-sky-300 focus:bg-white transition-all shadow-inner" />
                  <button onClick={handleAddGroup} className="h-12 px-6 bg-slate-900 text-white rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95 shadow-xl">建立</button>
                </div>
                <div className="max-h-80 overflow-y-auto no-scrollbar space-y-2">
                  {groups.map((g, i) => (
                    <div key={g.id} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-sky-50/50 border border-slate-100 rounded-2xl group transition-all">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1 opacity-20 group-hover:opacity-100">
                          <button onClick={() => handleMoveGroup(g.id, 'up')} className="hover:text-sky-500"><ChevronUp size={14} /></button>
                          <button onClick={() => handleMoveGroup(g.id, 'down')} className="hover:text-sky-500"><ChevronDown size={14} /></button>
                        </div>
                        {editingGroup?.id === g.id ? (
                          <input autoFocus className="bg-transparent border-b border-sky-500 outline-none text-[14px] font-bold text-sky-600" value={editingGroup.name} onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })} onBlur={() => { setGroups(groups.map(rg => rg.id === editingGroup.id ? { ...rg, name: editingGroup.name } : rg)); setEditingGroup(null); }} />
                        ) : (
                          <span className="text-[14px] font-bold text-slate-700">{g.name}</span>
                        )}
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100">
                        <button onClick={() => setEditingGroup({ id: g.id, name: g.name })} className="p-2 text-slate-400 hover:text-sky-500"><Edit3 size={16} /></button>
                        <button onClick={() => g.id !== 'default' && setGroups(prev => prev.filter(gr => gr.id !== g.id))} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* 插播计划排程 */}
      {
        showProgramList && (
          <div className="fixed inset-0 z-[2000] bg-slate-950/80 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-500">
            <div className="w-full h-full max-w-6xl rounded-[4rem] bg-white border border-white shadow-2xl flex flex-col overflow-hidden">
              <div className="p-10 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-6"><div className="w-16 h-16 bg-sky-50 text-sky-500 rounded-[2.5rem] flex items-center justify-center shadow-inner"><ListMusic size={32} /></div><div><h3 className="text-3xl font-black text-slate-800">矩阵插播排程</h3><p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.4em] mt-1">Interstitials Sequencing Engine</p></div></div>
                <div className="flex items-center gap-4">
                  <button onClick={() => {
                    if (confirm('确定要清空当前全部排程吗？')) {
                      setTerminals(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, programList: [] } : t));
                      triggerFeedback('已清空全部排程');
                    }
                  }} className="h-12 px-6 bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white rounded-2xl text-[12px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all border border-rose-100"><Trash2 size={16} /> 清空排程</button>
                  <button onClick={() => { setShowAssetPicker(true); fetchResources(); }} className="h-12 px-8 bg-slate-900 hover:bg-sky-600 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest shadow-xl flex items-center gap-3 transition-all">+ 挂载物理资源</button>
                  <button onClick={() => setShowProgramList(false)} className="w-12 h-12 rounded-full hover:bg-rose-50 text-slate-300 hover:text-white transition-all flex items-center justify-center active:scale-90 border border-slate-100"><X size={24} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-12 no-scrollbar space-y-4">
                {selectedTerminals[0]?.programList.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-8 p-6 px-10 bg-slate-50 border border-slate-100 rounded-[2.5rem] hover:border-sky-200 hover:bg-white transition-all group animate-in slide-in-from-right-4">
                    <div className="text-2xl font-black text-slate-200 font-mono tracking-tighter">#{(idx + 1).toString().padStart(2, '0')}</div>
                    <div className="flex-1 flex items-center gap-6 min-w-0">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white border border-slate-200 shrink-0 shadow-inner">
                        {item.type === 'template' ? <TemplatePreviewMini templateId={item.refId} allTemplates={availableTemplates} /> : <LabMediaPreview item={{ ...item, thumb: item.thumb || `/api/assets/stream?filename=${encodeURIComponent(item.name || item.refId)}` }} />}
                      </div>
                      <div className="truncate flex-1">
                        <p className="text-[16px] font-black text-slate-800 truncate">{item.name}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black text-white uppercase ${item.type === 'template' ? 'bg-rose-500' : 'bg-sky-500'}`}>{item.type}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-white p-3 px-8 rounded-3xl border border-slate-100 shadow-inner">
                      {['h', 'm', 's'].map(unit => (
                        <div key={unit} className="flex items-center gap-1.5">
                          <input type="number" min="0" max={unit === 'h' ? 23 : 59} value={item.duration[unit as keyof typeof item.duration]} onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setTerminals(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, programList: t.programList.map((p, i) => i === idx ? { ...p, duration: { ...p.duration, [unit]: val } } : p) } : t));
                          }} className="w-10 bg-transparent text-center text-sky-600 font-mono font-black text-lg outline-none" /><span className="text-slate-300 text-[10px] font-black uppercase">{unit}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => {
                        setTerminals(prev => prev.map(t => {
                          if (!selectedIds.has(t.id)) return t;
                          const list = [...t.programList];
                          if (idx === 0) return t;
                          [list[idx], list[idx - 1]] = [list[idx - 1], list[idx]];
                          return { ...t, programList: list };
                        }));
                      }} className="p-3 bg-white text-slate-400 rounded-xl hover:text-sky-500 hover:shadow-md"><ArrowUp size={18} /></button>
                      <button onClick={() => {
                        setTerminals(prev => prev.map(t => {
                          if (!selectedIds.has(t.id)) return t;
                          const list = [...t.programList];
                          if (idx === list.length - 1) return t;
                          [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
                          return { ...t, programList: list };
                        }));
                      }} className="p-3 bg-white text-slate-400 rounded-xl hover:text-sky-500 hover:shadow-md"><ArrowDown size={18} /></button>
                      <button onClick={() => setTerminals(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, programList: t.programList.filter((_, i) => i !== idx) } : t))} className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all ml-4"><Trash2 size={18} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-12 border-t border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4 text-sky-500 text-[12px] font-black uppercase tracking-widest"><div className="w-3 h-3 bg-sky-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(14,165,233,0.5)]"></div> 指令包就绪 // 全物理链路就绪</div>
                <button onClick={() => { sendCmd('PLAY_LIST', selectedTerminals[0]?.programList); fetch(`${API_BASE}/api/tasks`).then(res => res.json()).then(tasks => { sendCmd('UPDATE_TASKS', tasks); }); setShowProgramList(false); triggerFeedback('指令同步至全网节点'); }} className="h-16 px-16 bg-slate-900 hover:bg-sky-600 text-white rounded-3xl font-black uppercase tracking-[0.3em] shadow-2xl active:scale-95 transition-all flex items-center gap-4"><Check size={24} /> 保存并执行物理下发</button>
              </div>
            </div>
          </div>
        )
      }

      {/* 紧急广播 */}
      {
        showBroadcast && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
            <div className="w-full max-w-xl rounded-[3rem] bg-white border border-white shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-amber-50/30">
                <div><h3 className="text-xl font-black text-slate-800">全网紧急广播</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Global Lab Alert System</p></div>
                <button onClick={() => setShowBroadcast(false)} className="text-slate-300 hover:text-rose-500 transition-all"><X size={24} /></button>
              </div>
              <div className="p-10 space-y-8">
                <textarea value={broadcastConfig.text} onChange={(e) => setBroadcastConfig({ ...broadcastConfig, text: e.target.value })} className="w-full h-32 p-6 rounded-3xl bg-slate-50 border border-slate-100 text-slate-800 font-bold outline-none focus:border-amber-400 transition-all shadow-inner" placeholder="输入广播消息..." />
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-5">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase flex justify-between mb-2">文字大小 <span>{broadcastConfig.fontSize}px</span></label><input type="range" min="12" max="150" value={broadcastConfig.fontSize} onChange={(e) => setBroadcastConfig({ ...broadcastConfig, fontSize: parseInt(e.target.value) })} className="w-full accent-amber-500" /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase flex justify-between mb-2">滚动速度 <span>{broadcastConfig.speed}</span></label><input type="range" min="1" max="20" value={broadcastConfig.speed} onChange={(e) => setBroadcastConfig({ ...broadcastConfig, speed: parseInt(e.target.value) })} className="w-full accent-amber-500" /></div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex gap-4"><div className="flex-1 space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">文字</label><input type="color" value={broadcastConfig.color} onChange={(e) => setBroadcastConfig({ ...broadcastConfig, color: e.target.value })} className="w-full h-10 rounded-lg bg-transparent border-none p-0 cursor-pointer" /></div><div className="flex-1 space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase">背景</label><input type="color" value={broadcastConfig.bgColor} onChange={(e) => setBroadcastConfig({ ...broadcastConfig, bgColor: e.target.value })} className="w-full h-10 rounded-lg bg-transparent border-none p-0 cursor-pointer" /></div></div>
                    <div><label className="text-[10px] font-black text-slate-500 uppercase flex justify-between mb-2">背景透明 <span>{broadcastConfig.bgOpacity}%</span></label><input type="range" min="0" max="100" value={broadcastConfig.bgOpacity} onChange={(e) => setBroadcastConfig({ ...broadcastConfig, bgOpacity: parseInt(e.target.value) })} className="w-full accent-amber-500" /></div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => { sendCmd('SET_BROADCAST', broadcastConfig); setShowBroadcast(false); triggerFeedback('广播指令已在物理链路透传'); }} className="flex-1 h-16 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-amber-500/30 flex items-center justify-center gap-3 transition-all"><Radio size={20} /> 启动紧急覆盖</button>
                  <button onClick={() => { sendCmd('SET_BROADCAST', null); setShowBroadcast(false); triggerFeedback('广播已物理中止'); }} className="h-16 px-8 bg-slate-100 hover:bg-slate-200 text-slate-400 rounded-2xl font-black uppercase tracking-widest transition-all">停止</button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* 接入终端 */}
      {
        showAddTerminal && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/40 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-500">
            <div className="w-full max-w-2xl rounded-[3rem] bg-white border border-white shadow-2xl overflow-hidden flex flex-col">
              <div className="p-10 border-b border-slate-50 flex items-center justify-between">
                <div className="flex gap-4">
                  <button onClick={() => setAddTerminalMode('manual')} className={`px-6 py-2.5 rounded-full text-[12px] font-black uppercase transition-all ${addTerminalMode === 'manual' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>手动录入</button>
                  <button onClick={() => { setAddTerminalMode('auto'); handleDiscovery(); }} className={`px-6 py-2.5 rounded-full text-[12px] font-black uppercase transition-all ${addTerminalMode === 'auto' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>全网扫描</button>
                </div>
                <button onClick={() => setShowAddTerminal(false)} className="text-slate-300 hover:text-rose-500 transition-all"><X size={28} /></button>
              </div>
              <div className="p-10">
                {addTerminalMode === 'manual' ? (
                  <div className="space-y-8 animate-in slide-in-from-bottom-4">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">IP 地址 (必填)</label><input type="text" placeholder="192.168.1.xxx" value={newTerminal.ip} onChange={(e) => setNewTerminal({ ...newTerminal, ip: e.target.value })} className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-mono font-bold text-slate-700 focus:border-sky-300 transition-all shadow-inner" /></div>
                      <div className="space-y-2"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">终端名称 (可选)</label><input type="text" placeholder="Node Alias" value={newTerminal.name} onChange={(e) => setNewTerminal({ ...newTerminal, name: e.target.value })} className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-700 focus:border-sky-300 transition-all shadow-inner" /></div>
                    </div>
                    <div className="space-y-2"><label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">所属实验分区</label><select value={newTerminal.groupId} onChange={(e) => setNewTerminal({ ...newTerminal, groupId: e.target.value })} className="w-full h-14 px-6 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-700 appearance-none cursor-pointer focus:border-sky-300 shadow-inner">{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">终端识别 ID (必填，仅允许字母数字)</label>
                      <div className="flex items-center gap-0">
                        <span className="h-14 px-4 bg-slate-200 border border-r-0 border-slate-100 rounded-l-2xl flex items-center font-mono font-bold text-slate-500">NODE-</span>
                        <input
                          type="text"
                          placeholder="01"
                          value={newTerminal.id}
                          onChange={(e) => {
                            // 只允许字母和数字
                            const sanitized = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                            setNewTerminal({ ...newTerminal, id: sanitized });
                          }}
                          className="flex-1 h-14 px-6 rounded-r-2xl bg-slate-50 border border-slate-100 outline-none font-mono font-bold text-sky-600 focus:border-sky-300 transition-all shadow-inner"
                        />
                      </div>
                      <p className="text-[9px] text-slate-400 ml-1">完整 ID 将为: NODE-{newTerminal.id || 'XX'}</p>
                    </div>
                    <button onClick={() => {
                      if (!newTerminal.ip || !newTerminal.id) return triggerFeedback('IP 和 ID 不能为空', 'error');
                      // 清理 ID：只保留字母数字，并移除可能已输入的 NODE- 前缀
                      let cleanId = newTerminal.id.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
                      cleanId = cleanId.replace(/^NODE-/i, ''); // 移除可能已输入的前缀
                      if (!cleanId || !/^[a-zA-Z0-9]+$/.test(cleanId)) return triggerFeedback('ID 只能包含字母和数字', 'error');
                      // 构造完整 ID：统一使用 NODE- 前缀
                      const fullId = standardizeId(newTerminal.id);
                      const term: Terminal = {
                        id: fullId,
                        name: newTerminal.name || `LAB-NODE-${newTerminal.ip.split('.').pop()}`,
                        ip: newTerminal.ip,
                        status: 'online',
                        groupId: newTerminal.groupId,
                        volume: 50,
                        rotation: 0,
                        lastSeen: new Date().toISOString(),
                        programList: []
                      };
                      setTerminals(prev => [...prev, term]); setShowAddTerminal(false); setNewTerminal({ name: '', ip: '', id: '', groupId: 'default' }); triggerFeedback(`节点 ${fullId} 已接入矩阵`);
                    }} className="w-full h-16 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-sky-500/30 active:scale-95 transition-all">确认接入物理矩阵</button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between"><div className="flex items-center gap-3 text-sky-500">{isScanning ? <Loader2 size={20} className="animate-spin" /> : <><Radar size={20} /><span className="text-[12px] font-black uppercase tracking-widest">{isScanning ? '正在探测未注册节点...' : `检索到 ${discoveredNodes.length} 个候选节点`}</span></>}</div></div>
                    <div className="h-80 overflow-y-auto no-scrollbar space-y-3">
                      {discoveredNodes.map(n => (
                        <div key={n.id} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-3xl group hover:border-sky-200 hover:bg-white transition-all"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-xl bg-white border border-slate-100 text-sky-500 flex items-center justify-center shadow-sm"><ActivityIcon size={24} /></div><div><p className="text-[15px] font-black text-slate-800">{n.businessName}</p><p className="text-[11px] font-mono text-slate-400">{n.ip}</p></div></div><button onClick={() => { const term: Terminal = { id: n.id, name: n.businessName, ip: n.ip, status: 'online' as const, groupId: 'default', volume: 50, rotation: 0 as const, lastSeen: new Date().toISOString(), programList: [] }; setTerminals(prev => [...prev, term]); setShowAddTerminal(false); triggerFeedback('节点已接入'); }} className="px-6 py-2.5 bg-sky-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg opacity-0 group-hover:opacity-100 transition-all">一键接入</button></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* 批量导入 */}
      {
        showImportModal && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
            <div className={`w-full max-w-md rounded-[2.5rem] bg-white border border-white shadow-2xl p-10 text-center`}>
              <div className="w-20 h-20 bg-sky-600/10 text-sky-600 rounded-[2.5rem] flex items-center justify-center mx-auto border border-sky-600/10 shadow-inner mb-8"><FileSpreadsheet size={40} /></div>
              <h3 className="text-2xl font-black text-slate-800 mb-3">批量同步节点</h3>
              <p className="text-[12px] text-slate-400 uppercase tracking-widest mb-10 leading-relaxed">请载入物理 CSV 档案<br />格式：每行 [IP, 终端名称]</p>
              <div className="relative mb-6 group">
                {/* --- Fix: Corrected type assignment for status, rotation, and programList in CSV import --- */}
                <input type="file" accept=".csv" onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const text = event.target?.result as string;
                    const lines = text.split('\n').filter(l => l.trim());
                    const newNodes: Terminal[] = lines.map((l, i) => {
                      const [ip, name] = l.split(',').map(s => s.trim());
                      if (!ip) return null;
                      // 使用 IP 最后一段作为默认 ID 后缀，确保格式统一
                      const idSuffix = ip.split('.').pop() || '00';
                      const fullId = standardizeId(idSuffix);
                      return {
                        id: fullId,
                        name: name || `Node-${ip}`,
                        ip: ip,
                        status: 'online' as 'online' | 'offline',
                        groupId: 'default',
                        volume: 50,
                        rotation: 0 as 0 | 90 | 180 | 270,
                        lastSeen: new Date().toISOString(),
                        programList: [] as ProgramItem[]
                      };
                    }).filter((n): n is Terminal => n !== null);
                    setTerminals(prev => [...prev, ...newNodes]); setShowImportModal(false); triggerFeedback(`解析并导入 ${newNodes.length} 个节点`);
                  };
                  reader.readAsText(file);
                }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                <div className="h-24 border-2 border-dashed border-slate-100 rounded-2xl flex items-center justify-center gap-3 text-slate-400 group-hover:border-sky-500 transition-all"><Upload size={20} /><span className="text-[11px] font-black uppercase">拖拽或点击载入</span></div>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors">取消</button>
            </div>
          </div>
        )
      }

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        input[type="range"] { -webkit-appearance: none; background: transparent; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%; background: #0EA5E9; cursor: pointer; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
      `}</style>
    </div >
  );
};
