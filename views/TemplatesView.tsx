import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Save, X, Type, Globe, Image as ImageIcon,
  Settings2, Layers, Trash2, Monitor, Sliders, Edit3, Grid, List,
  RefreshCw, Smartphone, MonitorDot, Eye, Maximize2, Palette,
  Layout, Target, Info, Activity, ChevronLeft, ChevronRight,
  CheckSquare, Square, Search, RefreshCcw, ArrowUp, ArrowDown,
  Maximize, MousePointer2, Clock, PlayCircle, Loader2, Filter,
  AlertTriangle, ShieldAlert, ShieldCheck, FileText, Cpu
} from 'lucide-react';

interface PlaylistItem {
  id: string;
  name: string;
  type: 'VID' | 'IMG';
  duration: { min: number; sec: number };
  thumb: string;
  order: number;
  useSystemDuration?: boolean;
}

interface Layer {
  id: string;
  name: string;
  type: 'media' | 'text' | 'web';
  x: number; y: number; w: number; h: number; z: number;
  opacity: number;
  config: {
    playlist?: PlaylistItem[];
    content?: string;
    size?: number;
    color?: string;
    bgColor?: string;
    bgOpacity?: number;
    speed?: number;
    variant?: 'static' | 'marquee' | 'fly';
    url?: string;
    zoom?: number;
    offsetX?: number;
    offsetY?: number;
    offsetUp?: number;
    offsetLeft?: number;
    refreshRate?: number;
  };
}

interface Template {
  id: string;
  name: string;
  resolution: string;
  orientation: 'landscape' | 'portrait';
  bgConfig: { type: 'color' | 'image'; value: string; opacity: number; };
  layers: Layer[];
  lastModified: string;
}

/** 媒体预览引擎 */
const MediaCyclePlayer: React.FC<{
  playlist: PlaylistItem[];
  isStatic?: boolean;
  commonStyles: React.CSSProperties;
  serverConfig: any;
}> = ({ playlist, isStatic, commonStyles, serverConfig }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = (playlist && playlist.length > 0) ? activeIdx % playlist.length : 0;

  const getDynamicUrl = (item: PlaylistItem) => {
    if (!item) return '';
    const safeIp = (serverConfig?.ip && serverConfig.ip !== '0.0.0.0') ? serverConfig.ip : '127.0.0.1';
    const port = serverConfig?.port || '3000';
    return `http://${safeIp}:${port}/api/assets/stream?filename=${encodeURIComponent(item.name)}`;
  };

  useEffect(() => {
    if (isStatic || !playlist || playlist.length <= 1) return;
    const currentItem = playlist[safeIdx];
    if (!currentItem) return;
    const durationMs = ((currentItem.duration.min * 60) + currentItem.duration.sec) * 1000;
    const timer = setTimeout(() => {
      setActiveIdx((prev) => (prev + 1) % playlist.length);
    }, Math.max(durationMs, 500));
    return () => clearTimeout(timer);
  }, [safeIdx, playlist, isStatic]);

  if (!playlist || playlist.length === 0) {
    return (
      <div style={commonStyles} className="bg-slate-800/20 flex flex-col items-center justify-center gap-2">
        <Monitor size={24} className="opacity-10 text-white" />
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">Wait_Media_Stream</span>
      </div>
    );
  }

  const currentItem = playlist[safeIdx];
  const activeUrl = getDynamicUrl(currentItem);

  return (
    <div style={commonStyles} className="relative overflow-hidden bg-black">
      {currentItem.type === 'VID' ? (
        <video key={activeUrl} src={activeUrl} autoPlay muted loop playsInline className="w-full h-full object-cover" />
      ) : (
        <img src={activeUrl} className="w-full h-full object-cover" alt="" />
      )}
    </div>
  );
};

/** 网页渲染器 - 虚拟坐标系对齐 */
const WebLayerRenderer: React.FC<{
  config: any;
  commonStyles: React.CSSProperties;
  lWidth: number;
  lHeight: number;
}> = ({ config, commonStyles, lWidth, lHeight }) => {
  if (!config.url || config.url === 'https://') {
    return <div style={commonStyles} className="bg-slate-800/10 flex items-center justify-center"><Globe size={24} className="opacity-20" /></div>;
  }

  // 这里的参数必须保持 1920 物理基准计算
  const zoom = Number(config.zoom) || 1;
  const offX = Number(config.offsetX) || 0;
  const offY = Number(config.offsetY) || 0;
  const offUp = Number(config.offsetUp) || 0;
  const offLeft = Number(config.offsetLeft) || 0;

  const totalOffX = offX - offLeft;
  const totalOffY = offY - offUp;

  const DESKTOP_W = 1920;
  // 计算缩放比：使 1920 窗口按比例缩小到图层宽度，并叠加密度缩放
  const scale = (lWidth / DESKTOP_W) * zoom;

  return (
    <div style={{ ...commonStyles, overflow: 'hidden', backgroundColor: '#000' }}>
      <div style={{
        width: `${DESKTOP_W}px`,
        height: `${(lHeight / lWidth) * DESKTOP_W}px`,
        transform: `scale(${scale}) translate(${totalOffX}px, ${totalOffY}px)`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
        position: 'absolute',
        left: 0,
        top: 0
      }}>
        <iframe
          src={config.url}
          scrolling="no"
          title="web-layer"
          className="w-full h-[4000px] border-none"
          style={{ opacity: 0.98 }}
          sandbox="allow-scripts allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
};

/** 核心 Canvas 渲染引擎 - 虚拟 1920x1080 渲染基准 */
const MatrixCanvas: React.FC<{
  template: Template;
  serverConfig: any;
  currentTime: Date;
  isPreview?: boolean;
  isCard?: boolean;
  onDragStart?: (e: React.MouseEvent, id: string) => void;
  onResizeStart?: (e: React.MouseEvent, id: string) => void;
  selectedId?: string | null;
  className?: string;
  style?: React.CSSProperties;
}> = ({ template, serverConfig, isPreview, isCard, onDragStart, onResizeStart, selectedId, className, style }) => {

  const isPortrait = template.orientation === 'portrait';
  const VIRTUAL_W = isPortrait ? 1080 : 1920;
  const VIRTUAL_H = isPortrait ? 1920 : 1080;

  const innerStyle: React.CSSProperties = {
    width: `${VIRTUAL_W}px`,
    height: `${VIRTUAL_H}px`,
    backgroundColor: template.bgConfig.type === 'color' ? template.bgConfig.value : '#000',
    backgroundImage: template.bgConfig.type === 'image' ? `url(${template.bgConfig.value})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: (template.bgConfig.opacity || 100) / 100,
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0
  };

  return (
    <div style={innerStyle} className={className}>
      {template.layers.sort((a, b) => a.z - b.z).map(l => {
        const bgOp = l.config.bgOpacity !== undefined ? l.config.bgOpacity : 0;
        const common: React.CSSProperties = {
          backgroundColor: l.type === 'text' ? (l.config.bgColor || 'transparent') : `rgba(0,0,0,${bgOp / 100})`,
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative'
        };

        if (l.type === 'text' && l.config.bgOpacity !== undefined) {
          common.backgroundColor = `${l.config.bgColor}${Math.round(l.config.bgOpacity * 2.55).toString(16).padStart(2, '0')}`;
        }

        const lW = VIRTUAL_W * (l.w / 100);
        const lH = VIRTUAL_H * (l.h / 100);

        return (
          <div
            key={l.id}
            onMouseDown={(e) => onDragStart?.(e, l.id)}
            className={`absolute flex items-center justify-center border transition-all ${selectedId === l.id ? 'border-sky-500 z-50 shadow-2xl bg-sky-500/5 ring-[12px] ring-sky-500/20' : 'border-white/5 hover:border-white/20'}`}
            style={{
              left: `${l.x}%`, top: `${l.y}%`, width: `${l.w}%`, height: `${l.h}%`, zIndex: l.z,
              opacity: l.opacity / 100,
              borderWidth: isCard ? '1px' : '4px'
            }}
          >
            {l.type === 'media' && <MediaCyclePlayer playlist={l.config.playlist || []} isStatic={isCard} commonStyles={common} serverConfig={serverConfig} />}
            {l.type === 'text' && (
              <div style={common}>
                <p className={`${isCard ? '' : (l.config.variant === 'marquee' ? 'animate-marquee' : (l.config.variant === 'fly' ? 'animate-fly' : ''))} inline-block font-black tracking-tight drop-shadow-2xl text-center px-4`} style={{ color: l.config.color || '#fff', fontSize: `${l.config.size || 24}px`, animationDuration: `${20 / (l.config.speed || 1)}s` }}>{l.config.content || 'Matrix Text'}</p>
              </div>
            )}
            {l.type === 'web' && <WebLayerRenderer config={l.config} commonStyles={common} lWidth={lW} lHeight={lH} />}

            {selectedId === l.id && onResizeStart && (
              <div onMouseDown={(e) => onResizeStart(e, l.id)} className="absolute -bottom-10 -right-10 w-20 h-20 bg-sky-600 rounded-3xl cursor-nwse-resize z-[60] shadow-2xl flex items-center justify-center text-white hover:scale-110 transition-transform"><Maximize2 size={40} strokeWidth={3} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const TemplatesView: React.FC<any> = ({ serverConfig, isDark, isSidebarCollapsed, textP, textS, cardBg }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [previewScale, setPreviewScale] = useState(1);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [pickerAssets, setPickerAssets] = useState<any[]>([]);
  const [pickerCategory, setPickerCategory] = useState('全部素材');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);

  const API_BASE = '';

  useEffect(() => {
    fetchTemplates();
    const savedCats = localStorage.getItem('dms_categories_list');
    if (savedCats) setAvailableCategories(JSON.parse(savedCats));
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) {
      const stored = localStorage.getItem('dms_templates');
      if (stored) setTemplates(JSON.parse(stored));
    }
  };

  const fetchPickerAssets = async () => {
    try {
      // 从服务器获取分类信息
      const catRes = await fetch(`${API_BASE}/api/categories`);
      let catMap: Record<string, string> = {};
      let serverCategories: string[] = [];
      if (catRes.ok) {
        const catData = await catRes.json();
        catMap = catData.assetMap || {};
        // 排除"系统固件"分类
        serverCategories = (catData.categories || []).filter((c: string) => c !== '系统固件');
        setAvailableCategories(serverCategories);
      }

      const res = await fetch(`${API_BASE}/api/assets`);
      if (res.ok) {
        const data = await res.json();
        const normalized = data.map((a: any) => {
          const ext = a.name.split('.').pop()?.toLowerCase() || '';
          const isVid = ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext);
          const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
          const isPdf = ext === 'pdf';
          const isTxt = ext === 'txt';
          const isExe = ext === 'exe';

          let type = 'IMG';
          if (isVid) type = 'VID';
          else if (isPdf) type = 'PDF';
          else if (isTxt) type = 'TXT';
          else if (isExe) type = 'EXE';

          return {
            ...a,
            type,
            category: catMap[a.name] || '未分类',
            thumb: `${API_BASE}/api/assets/stream?filename=${encodeURIComponent(a.name)}`
          };
        });
        // 过滤掉系统固件分类的素材
        setPickerAssets(normalized.filter((a: any) => a.category !== '系统固件'));
      }
    } catch (e) { }
  };

  // 动态计算编辑器的缩放比例
  useEffect(() => {
    if (isEditing && currentTemplate) {
      const updateScale = () => {
        if (!canvasAreaRef.current) return;
        const rect = canvasAreaRef.current.getBoundingClientRect();
        const tW = currentTemplate.orientation === 'portrait' ? 1080 : 1920;
        const tH = currentTemplate.orientation === 'portrait' ? 1920 : 1080;
        const s = Math.min((rect.width - 120) / tW, (rect.height - 120) / tH);
        setCanvasScale(s);
      };
      updateScale();
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }
  }, [isEditing, currentTemplate?.orientation]);

  // 动态计算预览器的缩放比例
  useEffect(() => {
    if (previewTemplate) {
      const updatePrevScale = () => {
        if (!previewAreaRef.current) return;
        const rect = previewAreaRef.current.getBoundingClientRect();
        const tW = previewTemplate.orientation === 'portrait' ? 1080 : 1920;
        const tH = previewTemplate.orientation === 'portrait' ? 1920 : 1080;
        const s = Math.min((rect.width - 80) / tW, (rect.height - 80) / tH);
        setPreviewScale(s);
      };
      updatePrevScale();
      window.addEventListener('resize', updatePrevScale);
      return () => window.removeEventListener('resize', updatePrevScale);
    }
  }, [previewTemplate]);

  const openEditor = (template?: Template) => {
    if (template) setCurrentTemplate(JSON.parse(JSON.stringify(template)));
    else setCurrentTemplate({
      id: `T-${Date.now()}`, name: '未命名矩阵布局', resolution: '1920x1080', orientation: 'landscape',
      bgConfig: { type: 'color', value: isDark ? '#020617' : '#f8fafc', opacity: 100 },
      layers: [], lastModified: new Date().toISOString()
    });
    setIsEditing(true);
    setSelectedLayerId(null);
  };

  const saveTemplate = async () => {
    if (!currentTemplate) return;
    const final = { ...currentTemplate, lastModified: new Date().toISOString() };
    try {
      await fetch(`${API_BASE}/api/templates/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(final)
      });
    } catch (e) { }
    const next = templates.some(t => t.id === final.id) ? templates.map(t => t.id === final.id ? final : t) : [final, ...templates];
    setTemplates(next);
    localStorage.setItem('dms_templates', JSON.stringify(next));
    setIsEditing(false);
  };

  const deleteTemplate = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/templates/delete?id=${id}`, { method: 'DELETE' });
    } catch (e) { }
    const next = templates.filter(t => t.id !== id);
    setTemplates(next);
    localStorage.setItem('dms_templates', JSON.stringify(next));
  };

  const batchDelete = async () => {
    const ids = Array.from(selectedIds) as string[];
    for (const id of ids) await deleteTemplate(id);
    setSelectedIds(new Set());
    setShowBatchDeleteConfirm(false);
  };

  const updateLayer = (id: string, updates: Partial<Layer>) => {
    if (!currentTemplate) return;
    setCurrentTemplate({
      ...currentTemplate,
      layers: currentTemplate.layers.map(l => l.id === id ? { ...l, ...updates, config: { ...l.config, ...(updates.config || {}) } } : l)
    });
  };

  const handleDragStart = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation(); setSelectedLayerId(layerId);
    const layer = currentTemplate?.layers.find(l => l.id === layerId);
    if (!layer) return;
    const isPortrait = currentTemplate?.orientation === 'portrait';
    const baseW = isPortrait ? 1080 : 1920;
    const baseH = isPortrait ? 1920 : 1080;
    const startX = e.clientX, startY = e.clientY, initialX = layer.x, initialY = layer.y;
    const onMove = (me: MouseEvent) => {
      const dx = ((me.clientX - startX) / (baseW * canvasScale)) * 100;
      const dy = ((me.clientY - startY) / (baseH * canvasScale)) * 100;
      updateLayer(layerId, {
        x: Math.max(0, Math.min(100 - layer.w, initialX + dx)),
        y: Math.max(0, Math.min(100 - layer.h, initialY + dy))
      });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const handleResizeStart = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    const layer = currentTemplate?.layers.find(l => l.id === layerId);
    if (!layer) return;
    const isPortrait = currentTemplate?.orientation === 'portrait';
    const baseW = isPortrait ? 1080 : 1920;
    const baseH = isPortrait ? 1920 : 1080;
    const startX = e.clientX, startY = e.clientY, startW = layer.w, startH = layer.h;
    const onMove = (me: MouseEvent) => {
      const dw = ((me.clientX - startX) / (baseW * canvasScale)) * 100;
      const dh = ((me.clientY - startY) / (baseH * canvasScale)) * 100;
      updateLayer(layerId, {
        w: Math.max(5, Math.min(100 - layer.x, startW + dw)),
        h: Math.max(5, Math.min(100 - layer.y, startH + dh))
      });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const selectedLayer = currentTemplate?.layers.find(l => l.id === selectedLayerId);
  const imageButtonStyle = `flex items-center justify-center transition-all active:scale-95 border ${isDark ? 'border-white/5 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10' : 'border-slate-100 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-200 shadow-sm'}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-40">
      {!isEditing ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button onClick={() => selectedIds.size === templates.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(templates.map(t => t.id)))} className={`${imageButtonStyle} h-11 px-6 rounded-full gap-3 text-[12px] font-bold`}>
                  {selectedIds.size === templates.length && templates.length > 0 ? <CheckSquare size={18} className="text-sky-500" /> : <Square size={18} />}
                  <span>全选</span>
                </button>
                <button onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 500); fetchTemplates(); }} className={`${imageButtonStyle} w-11 h-11 rounded-full ${isRefreshing ? 'animate-spin' : ''}`}><RefreshCcw size={18} /></button>
                <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className={`${imageButtonStyle} w-11 h-11 rounded-full`}>{viewMode === 'grid' ? <List size={18} /> : <Grid size={18} />}</button>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2"></div>
              <button onClick={() => openEditor()} className="h-11 px-8 bg-sky-600 hover:bg-sky-500 text-white rounded-full text-[12px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2 active:scale-95 transition-all"><Plus size={18} /> 新建矩阵模板</button>
            </div>
          </div>

          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8' : 'space-y-4'}>
            {templates.map(t => (
              <div key={t.id} className={`group relative rounded-[2.5rem] border overflow-hidden transition-all duration-500 ${cardBg} ${selectedIds.has(t.id) ? 'ring-4 ring-sky-500 border-transparent shadow-2xl' : 'hover:scale-[1.02] hover:shadow-2xl'}`}>
                <div className={`absolute top-5 left-5 z-20 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${selectedIds.has(t.id) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-black/20 border-white/20 text-transparent opacity-0 group-hover:opacity-100 hover:bg-black/40'}`} onClick={(e) => {
                  e.stopPropagation();
                  const next = new Set(selectedIds);
                  if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                  setSelectedIds(next);
                }}>
                  <CheckSquare size={14} />
                </div>
                <div className="aspect-[16/10] bg-black relative cursor-pointer flex items-center justify-center overflow-hidden" onClick={() => openEditor(t)}>
                  <div style={{ transform: `scale(${280 / 1920})`, transformOrigin: 'center' }}>
                    <MatrixCanvas template={t} serverConfig={serverConfig} currentTime={new Date()} isCard={true} />
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-4">
                    <button onClick={(e) => { e.stopPropagation(); setPreviewTemplate(t); }} className="w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-2xl hover:bg-sky-500 hover:text-white transition-all"><Eye size={18} /></button>
                    <button onClick={(e) => { e.stopPropagation(); openEditor(t); }} className="w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-2xl hover:bg-sky-500 hover:text-white transition-all"><Edit3 size={18} /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id); }} className="w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-2xl hover:bg-rose-500 hover:text-white transition-all"><Trash2 size={18} /></button>
                  </div>
                </div>
                <div className="p-5 px-7">
                  <h4 className={`text-[14px] font-black truncate ${textP}`}>{t.name}</h4>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] font-black text-sky-500 uppercase tracking-widest">{t.orientation}</span>
                    <span className="text-[9px] text-slate-500 font-mono">{new Date(t.lastModified).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] animate-in slide-in-from-bottom-12 duration-500">
              <div className="flex items-center gap-6 bg-slate-900/95 text-white px-8 py-4 rounded-full border border-white/10 backdrop-blur-2xl shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-3 border-r border-white/10 pr-6">
                  <div className="w-10 h-10 bg-sky-600 rounded-full flex items-center justify-center text-[16px] font-black text-white shadow-lg">{selectedIds.size}</div>
                  <div className="flex flex-col"><span className="text-[11px] font-black uppercase tracking-widest">已选中对象</span><span className="text-[8px] font-bold text-sky-400 uppercase tracking-widest">Selected Matrix</span></div>
                </div>
                <div className="flex gap-3">
                  <button onClick={batchDelete} className="h-11 px-6 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-black text-[11px] uppercase tracking-[0.15em] transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-rose-600/20"><Trash2 size={16} /> 物理销毁</button>
                  <button onClick={() => setSelectedIds(new Set())} className="h-11 px-6 bg-white/5 hover:bg-white/10 text-slate-400 rounded-full font-black text-[11px] uppercase tracking-widest border border-white/5 transition-all">取消选择</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* 编辑器视图 - 强制背景色与文字色以解决黑夜模式文字看不清问题 */
        <div className="fixed inset-0 z-[1000] bg-white dark:bg-[#020617] flex animate-in slide-in-from-right duration-700" style={{ left: isSidebarCollapsed ? '80px' : '288px', transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <div className="flex-1 bg-slate-50 dark:bg-black relative flex flex-col items-center justify-center p-8 lg:p-12 overflow-hidden">
            <div className="absolute top-8 left-8 flex items-center gap-6">
              <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 text-slate-400 hover:text-sky-600 transition-all font-black text-[13px] uppercase tracking-widest"><ChevronLeft size={20} /> 返回矩阵</button>
              <div className="h-6 w-px bg-slate-200 dark:bg-white/10"></div>
              <input value={currentTemplate?.name || ''} onChange={(e) => setCurrentTemplate({ ...currentTemplate!, name: e.target.value })} className={`bg-transparent text-xl font-black outline-none border-b border-transparent focus:border-sky-500/30 text-slate-900 dark:text-white`} placeholder="模板名称..." />
            </div>

            <div className="absolute top-8 right-8 flex items-center gap-3">
              <button onClick={() => setCurrentTemplate({ ...currentTemplate!, orientation: 'landscape' })} className={`h-10 px-5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${currentTemplate?.orientation === 'landscape' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white/5 text-slate-500 hover:bg-white/10 border border-white/5'}`}>横屏 16:9</button>
              <button onClick={() => setCurrentTemplate({ ...currentTemplate!, orientation: 'portrait' })} className={`h-10 px-5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${currentTemplate?.orientation === 'portrait' ? 'bg-sky-600 text-white shadow-lg' : 'bg-white/5 text-slate-500 hover:bg-white/10 border border-white/5'}`}>竖屏 9:16</button>
            </div>

            <div ref={canvasAreaRef} className="w-full h-full flex items-center justify-center">
              {/* 核心缩放适配器：保证 MatrixCanvas 内部物理坐标绝对对齐 */}
              <div style={{ transform: `scale(${canvasScale})`, transformOrigin: 'center' }} className="shadow-[0_40px_100px_rgba(0,0,0,0.5)] transition-transform duration-500 flex shrink-0">
                {currentTemplate && <MatrixCanvas template={currentTemplate} serverConfig={serverConfig} currentTime={new Date()} selectedId={selectedLayerId} onDragStart={handleDragStart} onResizeStart={handleResizeStart} />}
              </div>
            </div>

            <div className="absolute bottom-8 left-8 flex gap-4">
              {[
                { label: '媒体', type: 'media', icon: ImageIcon },
                { label: '飞字', type: 'text', icon: Type },
                { label: '网页', type: 'web', icon: Globe }
              ].map(t => (
                <button key={t.type} onClick={() => {
                  const l: any = { id: `L-${Date.now()}`, name: `新${t.label}层`, type: t.type, x: 25, y: 25, w: 50, h: 50, z: currentTemplate!.layers.length, opacity: 100, config: t.type === 'text' ? { color: '#ffffff', bgColor: '#000000', bgOpacity: 40, size: 48, content: 'Matrix New Layer', speed: 1, variant: 'marquee' } : (t.type === 'web' ? { url: 'https://', zoom: 1, offsetX: 0, offsetY: 0, offsetUp: 0, offsetLeft: 0, refreshRate: 60 } : { playlist: [] }), playlist: t.type === 'media' ? [] : undefined };
                  setCurrentTemplate({ ...currentTemplate!, layers: [...currentTemplate!.layers, l] }); setSelectedLayerId(l.id);
                }} className="h-12 px-6 bg-white/80 dark:bg-white/10 backdrop-blur-md rounded-full border border-slate-200 dark:border-white/10 flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-sky-500 transition-all shadow-xl"><t.icon size={18} /> {t.label}</button>
              ))}
            </div>
          </div>

          <div className="w-96 border-l border-slate-100 dark:border-white/5 flex flex-col bg-white dark:bg-slate-900/90 backdrop-blur-2xl">
            <div className="p-8 border-b border-slate-50 dark:border-white/5 flex justify-end items-center bg-slate-50/30 dark:bg-black/20">
              <button onClick={saveTemplate} className="h-10 px-8 bg-sky-600 hover:bg-sky-500 text-white rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center gap-3"><Save size={16} /> 固化保存</button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-10">
              {selectedLayer ? (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="flex justify-between items-center">
                    <h5 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.3em]">图层属性 Config</h5>
                    <button onClick={() => updateLayer(selectedLayerId!, { x: 0, y: 0, w: 100, h: 100 })} className="flex items-center gap-2 text-[9px] font-black text-sky-500 uppercase hover:text-sky-400 transition-colors"><Maximize size={12} /> 一键满屏</button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">层名称 Identifier</label>
                    <input value={selectedLayer.name} onChange={(e) => updateLayer(selectedLayerId!, { name: e.target.value })} className={`w-full h-12 px-5 rounded-2xl border outline-none font-black text-[13px] ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                  </div>

                  {selectedLayer.type === 'text' && (
                    <div className="space-y-6 p-6 rounded-[2rem] bg-rose-500/5 border border-rose-500/10">
                      <div className="flex items-center gap-3 mb-2 text-rose-500"><Palette size={18} /><span className="text-[10px] font-black uppercase">样式设定 Style</span></div>
                      <div className="space-y-2"><label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase">文字内容</label><textarea value={selectedLayer.config.content} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, content: e.target.value } })} className={`w-full h-24 p-4 rounded-xl border text-[12px] font-bold outline-none ${isDark ? 'bg-black/40 border-white/10 text-white' : 'bg-white border-slate-200'}`} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">文字颜色</label><input type="color" value={selectedLayer.config.color} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, color: e.target.value } })} className="w-full h-10 rounded-xl bg-transparent border-none p-0 cursor-pointer" /></div>
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">背景颜色</label><input type="color" value={selectedLayer.config.bgColor} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, bgColor: e.target.value } })} className="w-full h-10 rounded-xl bg-transparent border-none p-0 cursor-pointer" /></div>
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">大小 (PX)</label><input type="number" value={selectedLayer.config.size} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, size: parseInt(e.target.value) } })} className={`w-full h-10 px-3 rounded-xl border outline-none font-mono ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200'}`} /></div>
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">滚动速度</label><input type="number" step="0.5" value={selectedLayer.config.speed} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, speed: parseFloat(e.target.value) } })} className={`w-full h-10 px-3 rounded-xl border outline-none font-mono ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200'}`} /></div>
                      </div>
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase flex justify-between">背景透明度 <span>{selectedLayer.config.bgOpacity}%</span></label><input type="range" min="0" max="100" value={selectedLayer.config.bgOpacity} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, bgOpacity: parseInt(e.target.value) } })} className="w-full accent-rose-500" /></div>
                    </div>
                  )}

                  {selectedLayer.type === 'web' && (
                    <div className="space-y-6 p-6 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/10">
                      <div className="flex items-center gap-3 mb-2 text-emerald-500"><Globe size={18} /><span className="text-[10px] font-black uppercase">网页集成 Web Node</span></div>
                      <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">URL 路径</label><input value={selectedLayer.config.url} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, url: e.target.value } })} className={`w-full h-10 px-4 rounded-xl border text-[11px] font-bold outline-none ${isDark ? 'bg-black/40 border-white/10 text-white' : 'bg-white border-slate-200'}`} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">缩放比例</label><input type="number" step="0.01" value={selectedLayer.config.zoom} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, zoom: parseFloat(e.target.value) } })} className={`w-full h-10 px-3 rounded-xl border outline-none font-mono ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200'}`} /></div>
                        <div className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">刷新 (秒)</label><input type="number" value={selectedLayer.config.refreshRate} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, refreshRate: parseInt(e.target.value) } })} className={`w-full h-10 px-3 rounded-xl border outline-none font-mono ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200'}`} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {['offsetX', 'offsetY', 'offsetUp', 'offsetLeft'].map(k => (
                          <div key={k} className="space-y-1"><label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">{k}</label><input type="number" value={(selectedLayer.config as any)[k]} onChange={(e) => updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, [k]: parseInt(e.target.value) } })} className={`w-full h-10 px-3 rounded-xl border outline-none font-mono ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200'}`} /></div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedLayer.type === 'media' && (
                    <div className="space-y-4">
                      <button onClick={() => { fetchPickerAssets(); setShowAssetPicker(true); }} className="w-full h-14 bg-sky-600/10 hover:bg-sky-600/20 text-sky-600 rounded-2xl flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-widest transition-all shadow-sm border border-sky-600/20"><Plus size={18} /> 挂载素材资源</button>
                      <div className="space-y-3">
                        {(selectedLayer.config.playlist || []).sort((a, b) => a.order - b.order).map((p, i) => (
                          <div key={p.id} className="p-4 bg-black/20 border border-white/5 rounded-2xl flex items-center gap-4 group">
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-black shrink-0 border border-white/10">
                              {p.type === 'VID' ? (
                                <video src={p.thumb} autoPlay muted loop playsInline className="w-full h-full object-cover" />
                              ) : (
                                <img src={p.thumb} className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-white truncate">{p.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <input type="number" className={`w-8 h-6 bg-black/40 border border-white/10 rounded text-center text-[10px] text-sky-500 font-mono outline-none ${p.useSystemDuration ? 'opacity-50 pointer-events-none' : ''}`} value={p.duration.min} onChange={(e) => {
                                  const newList = [...(selectedLayer.config.playlist || [])];
                                  newList[i].duration.min = Math.max(0, parseInt(e.target.value) || 0);
                                  updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, playlist: newList } });
                                }} />
                                <span className="text-[9px] text-slate-600 font-black">分</span>
                                <input type="number" className={`w-8 h-6 bg-black/40 border border-white/10 rounded text-center text-[10px] text-sky-500 font-mono outline-none ${p.useSystemDuration ? 'opacity-50 pointer-events-none' : ''}`} value={p.duration.sec} onChange={(e) => {
                                  const newList = [...(selectedLayer.config.playlist || [])];
                                  newList[i].duration.sec = Math.max(0, parseInt(e.target.value) || 0);
                                  updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, playlist: newList } });
                                }} />
                                <span className="text-[9px] text-slate-600 font-black">秒</span>
                                {p.type === 'VID' && (
                                  <div className="flex items-center gap-2 ml-4">
                                    <input type="checkbox" checked={p.useSystemDuration || false} onChange={(e) => {
                                      const newList = [...(selectedLayer.config.playlist || [])];
                                      newList[i].useSystemDuration = e.target.checked;
                                      updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, playlist: newList } });
                                    }} className="w-4 h-4 text-sky-500 bg-black/40 border border-white/10 rounded focus:ring-sky-500 focus:ring-offset-0 focus:ring-offset-black/20" />
                                    <span className="text-[9px] text-slate-600 font-black">系统检测时长</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => {
                                if (i === 0) return;
                                const newList = [...(selectedLayer.config.playlist || [])];
                                [newList[i - 1], newList[i]] = [newList[i], newList[i - 1]];
                                newList.forEach((item, idx) => item.order = idx);
                                updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, playlist: newList } });
                              }} className="text-slate-500 hover:text-white"><ArrowUp size={14} /></button>
                              <button onClick={() => {
                                const newList = [...(selectedLayer.config.playlist || [])];
                                if (i === newList.length - 1) return;
                                [newList[i + 1], newList[i]] = [newList[i], newList[i + 1]];
                                newList.forEach((item, idx) => item.order = idx);
                                updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, playlist: newList } });
                              }} className="text-slate-500 hover:text-white"><ArrowDown size={14} /></button>
                              <button onClick={() => {
                                const newList = (selectedLayer.config.playlist || []).filter((_, idx) => idx !== i);
                                updateLayer(selectedLayerId!, { config: { ...selectedLayer.config, playlist: newList } });
                              }} className="text-rose-500"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-6 rounded-[2rem] bg-white/5 border border-white/5 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 text-sky-500"><Target size={18} /><span className="text-[10px] font-black uppercase">物理坐标 Matrix</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {['x', 'y', 'w', 'h'].map(k => (
                        <div key={k} className="space-y-1.5">
                          <label className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase">{k.toUpperCase()}轴 (%)</label>
                          <input type="number" value={Math.round((selectedLayer as any)[k])} onChange={(e) => updateLayer(selectedLayerId!, { [k]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} className={`w-full h-10 px-3 rounded-xl border outline-none font-mono text-[11px] ${isDark ? 'bg-black/40 border-white/10 text-sky-400' : 'bg-white border-slate-200'}`} />
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={() => {
                    setCurrentTemplate({ ...currentTemplate!, layers: currentTemplate!.layers.filter(l => l.id !== selectedLayerId) });
                    setSelectedLayerId(null);
                  }} className="w-full h-14 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/20 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3"><Trash2 size={18} /> 移除图层节点</button>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20 space-y-6">
                  <div className="w-20 h-20 bg-slate-500/10 rounded-3xl flex items-center justify-center"><MousePointer2 size={40} /></div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] dark:text-slate-400">Ready_To_Edit</p>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/40">
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2"><Layers size={14} /> 图层堆栈 Z-INDEX</h5>
                <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
                  {currentTemplate?.layers.sort((a, b) => b.z - a.z).map(l => (
                    <button key={l.id} onClick={() => setSelectedLayerId(l.id)} className={`w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between ${selectedLayerId === l.id ? 'bg-sky-600 border-sky-600 text-white shadow-xl' : 'bg-white/5 border-white/5 text-slate-500 dark:text-slate-400 hover:bg-white/10'}`}>
                      <span className="text-[11px] font-black truncate">{l.name}</span>
                      <span className="text-[9px] font-mono opacity-40">Z:{l.z}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 沉浸式预览 - 使用 transform: scale 实现 100% 精准度对齐 */}
      {previewTemplate && (
        <div className="fixed inset-0 z-[5000] bg-black/98 flex flex-col animate-in fade-in duration-500">
          <div className="absolute top-10 right-10 z-[5010] flex gap-4">
            <button
              onClick={() => setPreviewTemplate(null)}
              className="w-16 h-16 bg-white/10 hover:bg-rose-600 text-white rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-90 border border-white/10"
            >
              <X size={32} />
            </button>
          </div>

          <div ref={previewAreaRef} className="flex-1 flex items-center justify-center p-6 lg:p-12 overflow-hidden relative">
            {/* 核心渲染节点：通过 scale 适配当前视口，内部 MatrixCanvas 始终运行在 1920 基准 */}
            <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'center' }} className="shadow-[0_60px_150px_rgba(0,0,0,1)] rounded-xl overflow-hidden flex shrink-0">
              <MatrixCanvas
                template={previewTemplate}
                serverConfig={serverConfig}
                currentTime={new Date()}
                isPreview={true}
              />

              <div className="absolute inset-0 z-0 flex items-center justify-center opacity-10 pointer-events-none">
                <Loader2 size={80} className="animate-spin text-sky-500" />
              </div>
            </div>
          </div>

          <div className="h-24 bg-black/80 backdrop-blur-3xl border-t border-white/5 flex items-center justify-center gap-12 text-white/40 shrink-0">
            <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest"><MonitorDot size={18} /> {previewTemplate.resolution} {previewTemplate.orientation}</div>
            <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest"><Activity size={18} /> Sync: {new Date(previewTemplate.lastModified).toLocaleTimeString()}</div>
            <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-sky-500"><ShieldCheck size={18} /> Matrix Stream Verified</div>
          </div>
        </div>
      )}

      {/* 素材选择器 */}
      {showAssetPicker && (
        <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-2xl flex items-center justify-center p-8 animate-in fade-in duration-500">
          <div className={`w-full max-w-5xl h-[80vh] rounded-[3rem] border ${cardBg} shadow-2xl flex flex-col overflow-hidden`}>
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-sky-500/10 text-sky-500 rounded-2xl flex items-center justify-center border border-sky-500/10"><Filter size={28} /></div>
                <div><h3 className={`text-2xl font-black ${textP}`}>挂载素材资源</h3><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Select Physical Assets From Repository</p></div>
              </div>
              <button onClick={() => setShowAssetPicker(false)} className="w-12 h-12 rounded-full hover:bg-rose-500/20 text-slate-500 hover:text-rose-500 flex items-center justify-center border border-white/5 transition-all"><X size={24} /></button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="w-64 border-r border-white/5 p-6 overflow-y-auto no-scrollbar space-y-2 bg-white/5">
                <button onClick={() => setPickerCategory('全部素材')} className={`w-full h-12 px-6 rounded-full text-[11px] font-black uppercase tracking-widest text-left transition-all ${pickerCategory === '全部素材' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/10'}`}>全部素材</button>
                {availableCategories.map(c => (
                  <button key={c} onClick={() => setPickerCategory(c)} className={`w-full h-12 px-6 rounded-full text-[11px] font-black uppercase tracking-widest text-left transition-all ${pickerCategory === c ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/10'}`}>{c}</button>
                ))}
              </div>
              <div className="flex-1 p-8 overflow-y-auto no-scrollbar grid grid-cols-4 gap-6">
                {pickerAssets.filter(a => pickerCategory === '全部素材' ? true : a.category === pickerCategory).map(asset => (
                  <div key={asset.name} onClick={() => {
                    if (!selectedLayerId) return;
                    const currentPlaylist = selectedLayer?.config.playlist || [];
                    const newItem: PlaylistItem = {
                      id: `ITEM-${Date.now()}-${Math.random()}`,
                      name: asset.name,
                      type: asset.type,
                      duration: { min: 0, sec: 15 },
                      thumb: asset.thumb,
                      order: currentPlaylist.length,
                      useSystemDuration: false
                    };
                    updateLayer(selectedLayerId, { config: { ...selectedLayer?.config, playlist: [...currentPlaylist, newItem] } });
                    setShowAssetPicker(false);
                  }} className="group relative aspect-square rounded-[2rem] bg-black border border-white/10 overflow-hidden cursor-pointer hover:scale-[1.05] transition-all hover:shadow-2xl hover:border-sky-500/50">
                    {asset.type === 'VID' ? (
                      <video src={asset.thumb} autoPlay muted loop playsInline className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                    ) : asset.type === 'IMG' ? (
                      <img src={asset.thumb} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 opacity-60 group-hover:opacity-100 transition-opacity">
                        {asset.type === 'PDF' && <FileText size={48} className="text-rose-400" strokeWidth={1} />}
                        {asset.type === 'TXT' && <FileText size={48} className="text-sky-400" strokeWidth={1} />}
                        {asset.type === 'EXE' && <Cpu size={48} className="text-emerald-400" strokeWidth={1} />}
                        <span className="text-[10px] font-black mt-3 uppercase tracking-widest text-slate-400">{asset.type}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                    <div className="absolute bottom-4 left-4 right-4">
                      <p className="text-[10px] font-black text-white truncate uppercase tracking-widest">{asset.name}</p>
                      <p className="text-[8px] font-bold text-sky-500 uppercase mt-0.5">{asset.type} // {asset.size}</p>
                    </div>
                  </div>
                ))}

              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-150%); } }
        @keyframes flyIn { 0% { opacity: 0; transform: translateY(60px) scale(0.8); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-marquee { display: inline-block; animation: marquee linear infinite; will-change: transform; white-space: nowrap; }
        .animate-fly { animation: flyIn 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};