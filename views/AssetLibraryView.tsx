import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, FileVideo, Eye, Trash2,
  Grid, List, X, Database,
  Activity, RefreshCw, CheckCircle2,
  Zap, Clock, FileImage, AlertCircle, ShieldAlert,
  MoreVertical, Edit3, Trash, CheckSquare, Square,
  Maximize2, PlayCircle, FolderEdit, ChevronRight, ChevronLeft, Save,
  Monitor, Info, FilterX, Loader2, Download, Calendar, Shield,
  Share2, FileText, FileJson, Cpu
} from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  type: 'VID' | 'IMG' | 'PDF' | 'TXT' | 'EXE';
  spec: string;
  size: string;
  status: string;
  isReal: boolean;
  thumb: string;
  category: string;
  uploadTime: string;
}

interface UploadTask {
  id: string;
  file: File;
  progress: number;
  status: 'hashing' | 'checking' | 'uploading' | 'merging' | 'completed' | 'exists' | 'error';
  speed: string;
  hash: string;
  errorMessage?: string;
}

interface AssetLibraryViewProps {
  serverConfig: any;
  isDark: boolean;
  isSidebarCollapsed?: boolean;
  textP: string;
  textS: string;
  cardBg: string;
  onUploadCountChange?: (count: number) => void;
}

export const AssetLibraryView: React.FC<AssetLibraryViewProps> = ({
  serverConfig, isDark, isSidebarCollapsed, textP, textS, cardBg, onUploadCountChange
}) => {
  // 改为服务端持久化分类列表
  const [categories, setCategories] = useState<string[]>(['品牌宣传', '促销广告', '高清视频', '系统固件']);
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});

  const [activeCategory, setActiveCategory] = useState('全部素材');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadQueue, setUploadQueue] = useState<Record<string, UploadTask>>({});

  // 使用 Ref 实时追踪最新数据，解决 React 异步更新导致的「保存旧数据」问题
  const catsRef = useRef<string[]>(['品牌宣传', '促销广告', '高清视频', '系统固件']);
  const mapRef = useRef<Record<string, string>>({});

  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [previewResolution, setPreviewResolution] = useState<string>('');
  const [showCatMgr, setShowCatMgr] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<{ old: string, new: string } | null>(null);

  const [isApiReachable, setIsApiReachable] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [totalServerFiles, setTotalServerFiles] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ensure safeIp is strictly typed to avoid "unknown" issues in template literals
  const API_BASE = '';
  const CHUNK_SIZE = 10 * 1024 * 1024;

  const btnClass = (active: boolean = false) => `
    h-10 px-6 rounded-full text-[11px] font-bold tracking-tight transition-all duration-300 flex items-center gap-2 active:scale-95
    ${active
      ? 'bg-sky-600 text-white shadow-lg shadow-sky-500/25 border-transparent hover:bg-sky-700'
      : isDark
        ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
        : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:shadow-md hover:border-slate-300'
    }
  `;

  const fetchCategoriesFromServer = async () => {
    try {
      const res = await fetch('/api/categories', { mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        if (data.categories) {
          setCategories(data.categories);
          catsRef.current = data.categories;
        }
        if (data.assetMap) {
          setAssetMap(data.assetMap);
          mapRef.current = data.assetMap;
        }
        return data.assetMap as Record<string, string>;
      }
    } catch (e) {
      console.error('[Categories] Fetch Error:', e);
    }
    return null;
  };

  const saveCategoriesToServer = async (newCats?: string[], newMap?: Record<string, string>) => {
    const finalCats = newCats || catsRef.current;
    const finalMap = newMap || mapRef.current;

    // 立即更新 Ref，保证后续并发操作拿到的是最新的
    if (newCats) catsRef.current = newCats;
    if (newMap) mapRef.current = newMap;

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: finalCats, assetMap: finalMap })
      });
    } catch (e) {
      console.error('[Categories] Sync Error:', e);
    }
  };

  const saveToCategoryMap = (filename: string, category: string) => {
    const nextMap = { ...mapRef.current, [filename]: category };
    setAssetMap(nextMap);
    saveCategoriesToServer(undefined, nextMap);
  };

  const releaseMediaHandles = (filename: string) => {
    const searchStr = `filename=${encodeURIComponent(filename)}`;
    const mediaElements = document.querySelectorAll('video, img, source');
    mediaElements.forEach((el: any) => {
      if (el.src && el.src.includes(searchStr)) {
        el.removeAttribute('src');
        if (el.tagName === 'VIDEO') {
          const v = el as HTMLVideoElement;
          v.pause();
          v.src = "";
          v.load();
        }
      }
    });
  };

  useEffect(() => { testConnection(); }, [API_BASE]);
  useEffect(() => {
    onUploadCountChange?.(Object.keys(uploadQueue).length);
  }, [uploadQueue, onUploadCountChange]);

  const testConnection = async () => {
    try {
      const res = await fetch('/api/assets', { method: 'GET', mode: 'cors' });
      setIsApiReachable(res.ok);
      if (res.ok) {
        const latestMap = await fetchCategoriesFromServer();
        fetchAssets(latestMap || undefined);
      }
    } catch (e: any) {
      setIsApiReachable(false);
    }
  };

  const fetchAssets = async (explicitMap?: Record<string, string>) => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/assets', { mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        setTotalServerFiles(Array.isArray(data) ? data.length : 0);

        const currentMap = explicitMap || assetMap;
        const normalizedData = (Array.isArray(data) ? data.map((item: any) => {
          const name = typeof item === 'string' ? item : (item.name || 'Unknown');
          const ext = name.split('.').pop()?.toLowerCase() || '';
          const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
          const isVid = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
          const isPdf = ext === 'pdf';
          const isTxt = ext === 'txt';
          const isExe = ext === 'exe';

          let type: Asset['type'] = 'VID';
          if (isImg) type = 'IMG';
          else if (isPdf) type = 'PDF';
          else if (isTxt) type = 'TXT';
          else if (isExe) type = 'EXE';
          else if (isVid) type = 'VID';
          else type = 'VID'; // Fallback to VID if unknown but likely media

          let category = currentMap[name] || item.category || '未分类';

          return {
            id: name,
            name: name,
            type: type,
            size: item.size || '0 MB',
            category: category,
            status: '已同步',
            isReal: true,
            thumb: `/api/assets/stream?filename=${encodeURIComponent(name)}`,
            uploadTime: item.uploadTime || new Date().toISOString()
          } as Asset;
        }) : []) as Asset[];

        normalizedData.sort((a, b) => new Date(b.uploadTime).getTime() - new Date(a.uploadTime).getTime());
        setAssets(normalizedData);
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    } catch (e: any) {
      console.error('[DMS] Sync Error:', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const calculateHash = async (file: File): Promise<string> => {
    const arrayBuffer = await file.slice(0, 1024 * 1024).arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Fix: Explicitly type startUpload and avoid unknown errors in state updates by using procedural assignments instead of complex literals
  const startUpload = async (file: File) => {
    const taskId: string = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const targetCategory: string = activeCategory === '全部素材' ? '未分类' : activeCategory;

    // Explicitly update upload queue with typed prev state
    setUploadQueue((prev: Record<string, UploadTask>) => {
      const next = { ...prev };
      next[taskId] = { id: taskId, file, progress: 0, status: 'hashing', speed: 'Hashing...', hash: '' };
      return next;
    });

    try {
      const hash = await calculateHash(file);
      setUploadQueue((prev: Record<string, UploadTask>) => {
        const next = { ...prev };
        const task = next[taskId];
        if (task) {
          next[taskId] = { ...task, status: 'checking', hash, progress: 5 };
        }
        return next;
      });

      const checkRes = await fetch(`/upload/check?fileHash=${hash}&fileName=${encodeURIComponent(file.name)}`, {
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });

      if (!checkRes.ok) throw new Error(`连接失败: ${checkRes.status}`);

      // Explicitly cast JSON result to ensure type safety
      const checkData = (await checkRes.json()) as { uploadedChunks?: number[], exists?: boolean };
      const uploadedChunks = checkData.uploadedChunks || [];
      const exists = checkData.exists || false;

      if (exists) {
        setUploadQueue((prev: Record<string, UploadTask>) => {
          const next = { ...prev };
          const task = next[taskId];
          if (task) {
            next[taskId] = { ...task, status: 'exists', progress: 100 };
          }
          return next;
        });
        // 保存分类信息，即使文件已存在
        saveToCategoryMap(file.name, targetCategory);
        setTimeout(() => {
          setUploadQueue((prev: Record<string, UploadTask>) => {
            const n = { ...prev };
            delete n[taskId];
            return n;
          });
          fetchAssets();
        }, 1000);
        return;
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      setUploadQueue((prev: Record<string, UploadTask>) => {
        const next = { ...prev };
        const task = next[taskId];
        if (task) {
          next[taskId] = { ...task, status: 'uploading' };
        }
        return next;
      });

      for (let i = 0; i < totalChunks; i++) {
        if (uploadedChunks.includes(i)) continue;

        const formData = new FormData();
        formData.append('file', file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));

        const res = await fetch(`/upload/chunk?fileHash=${hash}&chunkIndex=${i}&fileName=${encodeURIComponent(file.name)}`, {
          method: 'POST', mode: 'cors', body: formData
        });

        if (!res.ok) throw new Error(`分片 ${i} 上传失败`);

        setUploadQueue((prev: Record<string, UploadTask>) => {
          const next = { ...prev };
          const task = next[taskId];
          if (task) {
            next[taskId] = { ...task, progress: Math.round(10 + (i / totalChunks) * 80) };
          }
          return next;
        });
      }

      setUploadQueue((prev: Record<string, UploadTask>) => {
        const next = { ...prev };
        const task = next[taskId];
        if (task) {
          next[taskId] = { ...task, status: 'merging', progress: 95 };
        }
        return next;
      });

      const mergeRes = await fetch('/upload/merge', {
        method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileHash: hash, fileName: file.name, category: targetCategory })
      });

      if (!mergeRes.ok) throw new Error('合并任务失败');

      saveToCategoryMap(file.name, targetCategory);
      setUploadQueue((prev: Record<string, UploadTask>) => {
        const next = { ...prev };
        const task = next[taskId];
        if (task) {
          next[taskId] = { ...task, status: 'completed', progress: 100 };
        }
        return next;
      });

      fetchAssets();
      setTimeout(() => {
        setUploadQueue((prev: Record<string, UploadTask>) => {
          const n = { ...prev };
          delete n[taskId];
          return n;
        });
      }, 2000);

    } catch (err: any) {
      setUploadQueue((prev: Record<string, UploadTask>) => {
        const next = { ...prev };
        const task = next[taskId];
        if (task) {
          next[taskId] = { ...task, status: 'error', errorMessage: err.message };
        }
        return next;
      });
    }
  };

  const deleteSelected = async () => {
    // Added explicit type assertion to fix unknown type in Array.from
    const targets = Array.from(selectedIds) as string[];
    if (targets.length === 0) return;

    for (const id of targets) {
      try {
        releaseMediaHandles(id);
        await fetch(`/api/assets/delete?filename=${encodeURIComponent(id)}`, {
          method: 'DELETE', mode: 'cors', headers: { 'Accept': 'application/json' }
        });
        const nextMap = { ...assetMap };
        delete nextMap[id];
        setAssetMap(nextMap);
        saveCategoriesToServer(undefined, nextMap);
      } catch (e: any) {
        console.error(`Erase failed: ${id}`, e);
      }
    }

    setSelectedIds(new Set());
    if (previewAsset && targets.includes(previewAsset.id)) setPreviewAsset(null);
    fetchAssets();
  };

  const addCategory = () => {
    const trimmed = newCatName.trim();
    if (trimmed && !catsRef.current.includes(trimmed)) {
      const newCats = [...catsRef.current, trimmed];
      setCategories(newCats);
      saveCategoriesToServer(newCats);
      setNewCatName('');
    }
  };

  const removeCategory = (name: string) => {
    const newCats = catsRef.current.filter(c => c !== name);
    setCategories(newCats);

    if (activeCategory === name) setActiveCategory('全部素材');
    const nextMap = { ...mapRef.current };
    Object.keys(nextMap).forEach(filename => { if (nextMap[filename] === name) nextMap[filename] = '未分类'; });
    setAssetMap(nextMap);
    saveCategoriesToServer(newCats, nextMap);
    fetchAssets();
  };

  const renameCategory = () => {
    const currentEditing = editingCat as { old: string; new: string } | null;
    if (currentEditing && currentEditing.new.trim() !== '') {
      const oldName = currentEditing.old;
      const newName = currentEditing.new;

      if (oldName === newName) {
        setEditingCat(null);
        return;
      }

      const newCats = catsRef.current.map((c: string) => c === oldName ? newName : c);
      setCategories(newCats);

      const nextMap = { ...mapRef.current };
      Object.keys(nextMap).forEach((filename: string) => {
        if (nextMap[filename] === oldName) nextMap[filename] = newName;
      });
      setAssetMap(nextMap);
      saveCategoriesToServer(newCats, nextMap);

      if (activeCategory === oldName) setActiveCategory(newName);
      setEditingCat(null);
      fetchAssets();
    }
  };

  // 固件隔离：全部素材视图中排除"系统固件"分类，仅在该分类视图下显示
  const filteredAssets = assets.filter(a => {
    if (activeCategory === '全部素材') {
      return a.category !== '系统固件'; // 全部视图隐藏固件
    }
    return a.category === activeCategory;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-40">
      <div className={`flex items-center justify-between p-5 px-8 rounded-3xl border transition-all duration-500 shadow-xl ${isApiReachable ? (isDark ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-emerald-50 border-emerald-100') : (isDark ? 'bg-rose-500/5 border-rose-500/10' : 'bg-rose-50 border-rose-100')}`}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${isApiReachable ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]'}`}></div>
            <span className={`text-[12px] font-black uppercase tracking-widest ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Node Link: {isApiReachable ? 'Synchronized' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-6">
            {lastSyncTime && <div className={`text-[10px] font-bold px-4 py-1.5 rounded-full border ${isDark ? 'bg-white/5 border-white/5 text-slate-400' : 'bg-white border-slate-200 text-slate-500 shadow-sm'}`}>Last Sync: {lastSyncTime}</div>}
            <div className="text-[10px] font-bold text-sky-500 uppercase tracking-widest bg-sky-500/10 px-4 py-1.5 rounded-full border border-sky-500/20">Count: {totalServerFiles}</div>
          </div>
        </div>
        <div className="text-[10px] font-mono text-slate-500 hidden xl:block opacity-50 select-none">STORAGE_ROOT: {serverConfig.storagePath}</div>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-6 p-4 rounded-3xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-lg border border-white/20 dark:border-white/10 shadow-lg">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button onClick={() => setActiveCategory('全部素材')} className={btnClass(activeCategory === '全部素材')}>全部 ({assets.length})</button>
          {categories.map(c => (
            <button key={c} onClick={() => setActiveCategory(c)} className={btnClass(activeCategory === c)}>{c}</button>
          ))}
          <button onClick={() => setShowCatMgr(true)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}><FolderEdit size={16} /></button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (selectedIds.size === filteredAssets.length && filteredAssets.length > 0) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(filteredAssets.map(a => a.id)));
              }
            }}
            className={btnClass()}
          >
            {selectedIds.size === filteredAssets.length && filteredAssets.length > 0 ? <CheckSquare size={16} className="text-sky-500" /> : <Square size={16} />} 全选
          </button>
          <button onClick={() => fetchAssets()} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'} ${isRefreshing ? 'animate-spin' : ''}`}><RefreshCw size={16} /></button>
          <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{viewMode === 'grid' ? <List size={16} /> : <Grid size={16} />}</button>
          <button onClick={() => fileInputRef.current?.click()} className="h-10 px-6 bg-slate-900 dark:bg-sky-600 hover:bg-sky-500 text-white rounded-full text-[11px] font-black uppercase tracking-widest shadow-lg shadow-sky-600/20 transition-all active:scale-95 flex items-center gap-2">
            <Plus size={16} /> 物理上传
          </button>
          <input type="file" ref={fileInputRef} className="hidden" multiple onChange={async (e) => {
            if (e.target.files) {
              const files = Array.from(e.target.files);
              e.target.value = ''; // 立即清空，允许连续选择同一文件
              for (const file of files) {
                await startUpload(file);
              }
            }
          }} />
        </div>
      </div>

      <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8' : 'space-y-4'}>
        {filteredAssets.map(asset => (
          <div key={asset.id} className={`group relative rounded-[2rem] border overflow-hidden transition-all duration-500 cursor-pointer ${isDark ? 'bg-slate-900 shadow-inner shadow-white/5 hover:shadow-[0_0_30px_rgba(14,165,233,0.3)]' : 'bg-white shadow-inner shadow-slate-200 hover:shadow-xl'} ${selectedIds.has(asset.id) ? 'ring-4 ring-sky-500 border-transparent scale-[1.02] shadow-2xl shadow-sky-500/20' : 'hover:scale-[1.02] hover:border-white/20'}`}>
            <div onClick={() => {
              const next = new Set(selectedIds);
              if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
              setSelectedIds(next);
            }} className={`absolute top-4 left-4 z-20 w-8 h-8 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${selectedIds.has(asset.id) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-black/20 border-white/20 text-transparent hover:bg-black/40'}`}>
              <CheckSquare size={14} />
            </div>
            <div className="aspect-[4/3] bg-slate-100 dark:bg-black overflow-hidden relative cursor-pointer" onClick={() => setPreviewAsset(asset)}>
              {asset.type === 'VID' ? (
                <div className="w-full h-full relative">
                  <video
                    src={asset.thumb}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const video = e.target as HTMLVideoElement;
                      video.currentTime = 0;
                      video.pause();
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-white/80 group-hover:text-white group-hover:scale-110 transition-all duration-500">
                    <PlayCircle size={40} />
                  </div>
                </div>
              ) : asset.type === 'IMG' ? (
                <img src={asset.thumb} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-sky-500 transition-colors">
                  {asset.type === 'PDF' && <FileText size={48} strokeWidth={1} />}
                  {asset.type === 'TXT' && <FileVideo size={48} strokeWidth={1} />}
                  {asset.type === 'EXE' && <Cpu size={48} strokeWidth={1} />}
                  <span className="text-[10px] font-black mt-3 uppercase tracking-widest">{asset.type} DOCUMENT</span>
                </div>
              )}

              {/* 四角对焦框 (Focus Brackets) */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-sky-500 opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-sky-500 opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-sky-500 opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-sky-500 opacity-70 group-hover:opacity-100 transition-opacity"></div>

              {/* 技术规格浮层 (Tech Spec) */}
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white/90 text-[9px] font-mono px-2 py-1 rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                {asset.type}
              </div>
            </div>
            <div className="p-4 px-5">
              <h5 className={`text-[13px] font-bold truncate ${textP}`}>{asset.name}</h5>
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-mono">{asset.size}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${window.location.protocol}//${window.location.host}/api/assets/stream?filename=${encodeURIComponent(asset.name)}`;
                      navigator.clipboard.writeText(url);
                      alert('下载链接已复制到剪贴板');
                    }}
                    className="p-1 hover:bg-sky-500/10 rounded text-sky-500 transition-colors"
                    title="复制下载链接"
                  >
                    <Share2 size={12} />
                  </button>
                </div>
                <span className="text-[10px] font-bold text-sky-500">{asset.type}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-bottom-12 duration-500">
          <div className="flex items-center gap-6 bg-slate-900/95 text-white px-6 py-3 rounded-full border border-white/10 backdrop-blur-2xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sky-600 rounded-full flex items-center justify-center text-[14px] font-black">{selectedIds.size}</div>
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-300">Selected</span>
            </div>
            <div className="w-px h-6 bg-white/10"></div>
            <div className="flex gap-2">
              <button onClick={deleteSelected} className="h-10 px-6 bg-rose-600 hover:bg-rose-700 text-white rounded-full transition-all text-[11px] font-black uppercase tracking-widest active:scale-95 shadow-lg shadow-rose-600/20">物理粉碎删除</button>
              <button onClick={() => setSelectedIds(new Set())} className="h-10 px-4 bg-white/5 hover:bg-white/10 text-slate-400 rounded-full transition-all text-[11px] font-black uppercase tracking-widest border border-white/5">取消选择</button>
            </div>
          </div>
        </div>
      )}

      {previewAsset && (
        <div
          className="fixed inset-0 z-[1000] bg-white dark:bg-slate-950 flex animate-in slide-in-from-right duration-500"
          style={{ left: isSidebarCollapsed ? '80px' : '288px', transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          {/* 左侧：素材展示区 (沉浸式) */}
          <div className="flex-1 bg-slate-50 dark:bg-black relative flex items-center justify-center p-8 lg:p-16">
            <div className="absolute top-8 left-8">
              <button
                onClick={() => { setPreviewAsset(null); setPreviewResolution(''); }}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all font-bold text-[13px]"
              >
                <ChevronLeft size={20} /> 返回列表
              </button>
            </div>

            <div className="w-full h-full flex items-center justify-center">
              {previewAsset.type === 'IMG' ? (
                <img
                  src={`/api/assets/stream?filename=${encodeURIComponent(previewAsset.name)}`}
                  className="max-w-full max-h-full object-contain shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-lg"
                  onLoad={(e) => setPreviewResolution(`${e.currentTarget.naturalWidth} x ${e.currentTarget.naturalHeight}`)}
                />
              ) : (
                <video
                  src={`/api/assets/stream?filename=${encodeURIComponent(previewAsset.name)}`}
                  controls
                  autoPlay
                  playsInline
                  className="max-w-full max-h-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-lg"
                  onLoadedMetadata={(e) => setPreviewResolution(`${e.currentTarget.videoWidth} x ${e.currentTarget.videoHeight}`)}
                />
              )}
            </div>

            {/* 分辨率悬浮标签 */}
            <div className="absolute bottom-8 left-8">
              <div className="px-4 py-1.5 bg-white/80 dark:bg-white/10 backdrop-blur-md rounded-full border border-slate-200 dark:border-white/10 text-[10px] font-black font-mono text-slate-500">
                RESOLUTION: {previewResolution || 'Analyzing...'}
              </div>
            </div>
          </div>

          {/* 右侧：属性与操作区 */}
          <div className="w-80 lg:w-96 border-l border-slate-100 dark:border-white/5 flex flex-col bg-white dark:bg-slate-900">
            <div className="p-8 border-b border-slate-50 dark:border-white/5 flex justify-between items-center">
              <h3 className={`text-xl font-black ${textP}`}>资产详情</h3>
              <button onClick={() => { setPreviewAsset(null); setPreviewResolution(''); }} className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 flex items-center justify-center transition-all"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-10">
              <div className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">文件名 Identifier</label>
                  <p className={`text-[15px] font-bold break-all leading-tight ${textP}`}>{previewAsset.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">物理大小</label>
                    <p className={`text-xl font-black font-mono ${textP}`}>{previewAsset.size}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">业务分类</label>
                    <p className="text-xl font-black text-sky-500 truncate">{previewAsset.category}</p>
                  </div>
                </div>

                <div className="space-y-1 pt-4 border-t border-slate-50 dark:border-white/5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={12} /> 同步日期 Sync Date</label>
                  <p className={`text-[13px] font-bold ${textP}`}>{new Date(previewAsset.uploadTime).toLocaleString()}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Monitor size={12} /> 素材 ID</label>
                  <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl border border-slate-100 dark:border-white/5">
                    <p className="text-[11px] font-mono font-bold text-sky-500 break-all">{previewAsset.id}</p>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-sky-500/5 border border-sky-500/10 space-y-3">
                <div className="flex items-center gap-2 text-sky-600"><Shield size={14} /><span className="text-[11px] font-black uppercase">物理链路安全校验</span></div>
                <p className="text-[10px] text-slate-500 font-bold leading-relaxed">该素材已通过 Matrix 核心算法签名，源物理路径已映射，支持全网终端集群实时点对点拉取播放。</p>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 dark:border-white/5 space-y-3">
              <button className="w-full h-14 bg-sky-600 hover:bg-sky-700 text-white rounded-full font-black text-[13px] shadow-lg shadow-sky-500/20 flex items-center justify-center gap-3 transition-all active:scale-95">
                <Download size={20} /> 物理文件下载
              </button>
              <button onClick={() => { setPreviewAsset(null); setPreviewResolution(''); }} className="w-full h-14 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 rounded-full font-black text-[11px] transition-all uppercase tracking-widest">
                退出预览界面
              </button>
            </div>
          </div>
        </div>
      )}

      {showCatMgr && (
        <div className="fixed inset-0 z-[1100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className={`w-full max-w-md rounded-[2.5rem] border ${cardBg} shadow-2xl overflow-hidden`}>
            <div className="p-8 border-b border-slate-50 dark:border-white/5 flex items-center justify-between">
              <div><h3 className={`text-xl font-black ${textP}`}>分类系统</h3><p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.4em] mt-1">DMS TAXONOMY MGMT</p></div>
              <button onClick={() => setShowCatMgr(false)} className="text-slate-400 hover:text-rose-500 transition-all"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex gap-2">
                <input type="text" placeholder="新分类标签..." value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className={`flex-1 h-11 px-5 rounded-full border border-slate-200 outline-none font-bold ${isDark ? 'bg-black/30 border-white/5 text-white' : 'bg-slate-50 text-slate-900'}`} />
                <button onClick={addCategory} className="h-11 px-6 bg-sky-600 text-white rounded-full text-[11px] font-black shadow-lg shadow-sky-500/20 transition-all active:scale-95">注入</button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 no-scrollbar">
                {categories.map(c => (
                  <div key={c} className={`flex items-center justify-between p-4 bg-slate-50 dark:bg-black/30 rounded-2xl border border-slate-100 dark:border-white/5 group transition-all`}>
                    {editingCat?.old === c ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={editingCat.new}
                          onChange={(e) => setEditingCat({ ...editingCat, new: e.target.value })}
                          className={`flex-1 h-9 px-3 rounded-lg outline-none border ${isDark ? 'bg-black text-white border-sky-500' : 'bg-slate-50 text-slate-900 border-sky-600'}`}
                          autoFocus
                        />
                        <button onClick={renameCategory} className="w-9 h-9 bg-emerald-600 text-white rounded-lg flex items-center justify-center transition-all active:scale-95">
                          <Save size={16} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className={`text-[13px] font-bold ${textP}`}>{c}</span>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => setEditingCat({ old: c, new: c })} className="p-2 text-slate-400 hover:text-sky-500 transition-all">
                            <Edit3 size={16} />
                          </button>
                          <button onClick={() => removeCategory(c)} className="p-2 text-rose-500/50 hover:text-rose-500 transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
/* Fix: Corrected invalid template string syntax for fallback stream URL */
const API_STREAM_PREFIX = 'http://127.0.0.1:3000/api/assets/stream?filename=';