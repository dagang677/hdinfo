
import React, { useState, useEffect } from 'react';
import {
   Clock, Plus, Trash2, Edit3, X, Check,
   Database, Layout, Radio, CalendarClock,
   Laptop, Target, RefreshCcw,
   CheckSquare, Square, PlayCircle as PlayIcon,
   Monitor, Info, AlertTriangle, ShieldCheck,
   Calendar, Layers, Zap, Power, Volume2,
   ChevronRight, Box, Filter, Loader2, Search,
   Activity, Eye, MousePointer2, Settings2,
   Thermometer, Shield, Grid, List, FileText, Cpu
} from 'lucide-react';

interface TaskPlan {
   id: string;
   name: string;
   type: 'asset' | 'template' | 'broadcast' | 'power' | 'cache';
   content: any;
   frequency: 'once' | 'daily' | 'weekly';
   selectedDays: number[];
   startTime: string;
   endTime: string;
   status: 'active' | 'idle';
   targets: string[];
}

interface TasksViewProps {
   serverConfig: any;
   isDark: boolean;
   textP: string;
   textS: string;
   cardBg: string;
}

interface Terminal {
   id: string;
   name: string;
   ip: string;
   groupId: string;
   mac?: string;
   isOnline?: boolean;
}

interface TerminalGroup {
   id: string;
   name: string;
}

// 精密对焦角标组件
const FocusBrackets = ({ active }: { active?: boolean }) => (
   <div className={`absolute inset-0 pointer-events-none transition-all duration-500 ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-95 group-hover:opacity-60 group-hover:scale-100'}`}>
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-sky-500 rounded-tl-sm"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-sky-500 rounded-tr-sm"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-sky-500 rounded-bl-sm"></div>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-sky-500 rounded-br-sm"></div>
   </div>
);

// 简化版 MatrixCanvas 仅用于预览布局
const MatrixCanvas: React.FC<{ template: any, isCard?: boolean }> = ({ template, isCard }) => {
   if (!template) return <div className="w-full h-full bg-slate-900/50 flex items-center justify-center"><Layout size={24} className="text-white/10" /></div>;

   const isPortrait = template.orientation === 'portrait';
   const VIRTUAL_W = isPortrait ? 1080 : 1920;
   const VIRTUAL_H = isPortrait ? 1920 : 1080;
   return (
      <div style={{
         width: `${VIRTUAL_W}px`, height: `${VIRTUAL_H}px`,
         backgroundColor: template.bgConfig?.type === 'color' ? template.bgConfig.value : '#000',
         position: 'relative', overflow: 'hidden'
      }}>
         {template.layers?.sort((a: any, b: any) => a.z - b.z).map((l: any) => (
            <div key={l.id} className="absolute border border-white/20 bg-sky-500/20 flex items-center justify-center" style={{ left: `${l.x}%`, top: `${l.y}%`, width: `${l.w}%`, height: `${l.h}%`, zIndex: l.z }}>
               <span style={{ fontSize: `${Math.max(12, (l.w + l.h) * 2)}px` }} className="text-white/40 font-black uppercase">{l.type}</span>
            </div>
         ))}
      </div>
   );
};

export const TasksView: React.FC<TasksViewProps> = ({ serverConfig, isDark, textP, textS, cardBg }) => {
   const [plans, setPlans] = useState<TaskPlan[]>([]);
   const [isEditing, setIsEditing] = useState(false);
   const [currentPlan, setCurrentPlan] = useState<Partial<TaskPlan> | null>(null);
   const [feedback, setFeedback] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);
   const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
   const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
   const [isRefreshing, setIsRefreshing] = useState(false);

   // 资源连接状态
   const [availableAssets, setAvailableAssets] = useState<any[]>([]);
   const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
   const [categories, setCategories] = useState<string[]>([]);
   const [groups, setGroups] = useState<TerminalGroup[]>([]);
   const [terminals, setTerminals] = useState<Terminal[]>([]);

   // 资源拾取器状态
   const [showResourcePicker, setShowResourcePicker] = useState<'asset' | 'template' | null>(null);
   const [pickerCategory, setPickerCategory] = useState('全部素材');
   const [pickerSearch, setPickerSearch] = useState('');

   const API_BASE = '';

   useEffect(() => {
      fetchTasks();
      fetchResources();
      fetchTerminals();
   }, []);

   const fetchTasks = async () => {
      try {
         const res = await fetch(`${API_BASE}/api/tasks`);
         if (res.ok) setPlans(await res.json());
      } catch (e) { console.warn('[DMS] 物理链路不可达'); }
   };

   // NOTE: 从后端心跳数据加载终端列表与分组，替代旧版 localStorage 方案
   const fetchTerminals = async () => {
      try {
         const [termRes, groupRes] = await Promise.all([
            fetch(`${API_BASE}/api/terminals/list`),
            fetch(`${API_BASE}/api/terminals/groups`)
         ]);
         if (termRes.ok) setTerminals(await termRes.json());
         if (groupRes.ok) setGroups(await groupRes.json());
      } catch (e) { console.warn('[DMS] 终端数据加载失败'); }
   };

   const fetchResources = async () => {
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
            const categoriesList = categoryData.categories || [];

            setAvailableAssets(assets.map((a: any) => ({
               ...a,
               type: a.name.match(/\.(mp4|webm|ogg|mov|mkv)$/i) ? 'VID' : 'IMG',
               category: catMap[a.name] || '未分类',
               thumb: `${API_BASE}/api/assets/stream?filename=${encodeURIComponent(a.name)}`
            })));

            setAvailableTemplates(templates);
            setCategories(categoriesList);
         }
      } catch (e) {
         console.error('Failed to sync scheduling resources:', e);
      }
   };

   const savePlan = async () => {
      if (!currentPlan?.name) return triggerFeedback('请输入排程名称', 'error');
      if (!currentPlan.targets?.length) return triggerFeedback('请选择下发终端', 'error');
      if (currentPlan.type === 'asset' && !currentPlan.content?.asset) return triggerFeedback('请挂载物理素材', 'error');
      if (currentPlan.type === 'template' && !currentPlan.content?.templateId) return triggerFeedback('请选择布局模板', 'error');
      if (currentPlan.type === 'broadcast' && !currentPlan.content?.broadcast?.text) return triggerFeedback('请输入广播文字', 'error');
      if (currentPlan.type === 'power' && !currentPlan.content?.powerAction) return triggerFeedback('请选择电源指令', 'error');

      const payload = {
         ...currentPlan,
         id: currentPlan.id || `TASK-${Date.now()}`,
         status: 'active',
         timestamp: new Date().toISOString()
      };

      try {
         const res = await fetch(`${API_BASE}/api/tasks/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
         });
         if (res.ok) {
            fetchTasks();
            setIsEditing(false);
            triggerFeedback('同步成功：全网指令已固化');
         } else {
            triggerFeedback('物理下发失败 (Server 404/500)', 'error');
         }
      } catch (e) { triggerFeedback('链路握手失败', 'error'); }
   };

   const deletePlan = async (id: string) => {
      try {
         const res = await fetch(`${API_BASE}/api/tasks/delete?id=${id}`, { method: 'DELETE' });
         if (res.ok) { fetchTasks(); triggerFeedback('指令已物理销毁'); }
      } catch (e) { }
   };

   const triggerFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
      setFeedback({ msg, type });
      setTimeout(() => setFeedback(null), 3500);
   };

   // NOTE: 批量清理缓存使用专用批量命令接口而非单终端接口
   const bulkClearCache = async () => {
      const targets = Array.from(selectedTasks);
      if (targets.length === 0) return triggerFeedback('请先选择目标任务', 'error');

      if (confirm(`确定要对选中的 ${targets.length} 个任务执行缓存清理吗？`)) {
         try {
            // 收集所有选中任务的目标终端
            const allTerminalIds = new Set<string>();
            plans.filter(p => targets.includes(p.id)).forEach(p => p.targets?.forEach(t => allTerminalIds.add(t)));
            if (allTerminalIds.size === 0) return triggerFeedback('选中任务无关联终端', 'error');

            const res = await fetch(`${API_BASE}/api/terminals/batch-command`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                  terminalIds: Array.from(allTerminalIds),
                  command: 'CLEAR_CACHE',
                  payload: {}
               })
            });
            if (res.ok) {
               triggerFeedback(`指令已透传至 ${allTerminalIds.size} 台终端`);
               setSelectedTasks(new Set());
            }
         } catch (e) {
            triggerFeedback('链路握手失败', 'error');
         }
      }
   };

   const weekDays = ['一', '二', '三', '四', '五', '六', '日'];

   return (
      <div className="space-y-8 animate-in fade-in duration-700 pb-40">
         {/* 实验室反馈 */}
         {feedback && (
            <div className={`fixed top-32 left-1/2 -translate-x-1/2 z-[3000] px-8 py-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-4 duration-500 shadow-2xl border ${feedback.type === 'success' ? 'bg-white text-emerald-600 border-emerald-100' : 'bg-white text-rose-600 border-rose-100'} backdrop-blur-3xl`}>
               <div className={`w-2 h-2 rounded-full ${feedback.type === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
               <span className="text-[12px] font-black uppercase tracking-widest">{feedback.msg}</span>
            </div>
         )}

         {/* 顶部面板 */}
         <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-3">
                  <button onClick={() => selectedTasks.size === plans.length ? setSelectedTasks(new Set()) : setSelectedTasks(new Set(plans.map(p => p.id)))} className={`flex items-center gap-3 text-[12px] font-bold ${selectedTasks.size === plans.length ? 'text-sky-500' : 'text-slate-400'} transition-all`}>
                     {selectedTasks.size === plans.length ? <CheckSquare size={18} className="text-sky-500" /> : <Square size={18} />}
                     <span>全选</span>
                  </button>
                  <button onClick={() => { setIsRefreshing(true); setTimeout(() => setIsRefreshing(false), 500); fetchTasks(); }} className={`flex items-center gap-3 text-[12px] font-bold ${isRefreshing ? 'animate-spin' : ''}`}><RefreshCcw size={18} /></button>
                  <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} className={`flex items-center gap-3 text-[12px] font-bold`}>{viewMode === 'grid' ? <List size={18} /> : <Grid size={18} />}</button>
               </div>
               <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2"></div>
               <button onClick={() => {
                  setCurrentPlan({
                     name: '', type: 'asset', frequency: 'daily', targets: [],
                     startTime: '09:00', endTime: '18:00', selectedDays: [0, 1, 2, 3, 4],
                     content: { broadcast: { text: '紧急消息...', bgColor: '#0ea5e9', color: '#ffffff', speed: 5, bgOpacity: 90, fontSize: 40 } }
                  });
                  setIsEditing(true);
               }} className="h-11 px-8 bg-sky-600 hover:bg-sky-500 text-white rounded-full text-[12px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2 active:scale-95 transition-all"><Plus size={18} /> 建立矩阵排程</button>
            </div>
         </div>

         {/* 列表显示 */}
         {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
               {plans.map(p => (
                  <div key={p.id} className={`group relative p-8 rounded-[3rem] border transition-all duration-500 ${cardBg} bg-white shadow-inner shadow-slate-100 ${selectedTasks.has(p.id) ? 'ring-4 ring-sky-500 border-transparent shadow-2xl' : 'hover:scale-[1.02] hover:shadow-2xl'}`}>
                     {/* 选择复选框 */}
                     <div className={`absolute top-5 right-5 z-20 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${selectedTasks.has(p.id) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-black/20 border-white/20 text-transparent opacity-0 group-hover:opacity-100 hover:bg-black/40'}`} onClick={(e) => {
                        e.stopPropagation();
                        const next = new Set(selectedTasks);
                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                        setSelectedTasks(next);
                     }}>
                        <CheckSquare size={14} />
                     </div>

                     <FocusBrackets />
                     <div className="flex justify-between items-start mb-6 relative z-10">
                        <div className="flex items-center gap-4">
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner ${p.type === 'power' ? 'bg-amber-500/10 text-amber-500 border-amber-500/10' : 'bg-sky-50 text-sky-500 border-slate-100'}`}>
                              {p.type === 'broadcast' ? <Radio size={28} /> : p.type === 'template' ? <Layout size={28} /> : p.type === 'power' ? <Zap size={28} /> : <Database size={28} />}
                           </div>
                           <div>
                              <h4 className={`text-[17px] font-black truncate max-w-[120px] ${textP} italic`}>{p.name}</h4>
                              <p className="text-[9px] font-black uppercase opacity-60 tracking-widest">{p.type}</p>
                           </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                           <button onClick={() => { setIsEditing(true); setCurrentPlan(p); }} className="w-9 h-9 rounded-lg bg-slate-50 text-slate-400 hover:bg-sky-500 hover:text-white transition-all flex items-center justify-center shadow-sm"><Edit3 size={16} /></button>
                           <button onClick={() => deletePlan(p.id)} className="w-9 h-9 rounded-lg bg-slate-50 text-slate-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                        </div>
                     </div>

                     {/* 智能排程预览区 */}
                     <div className="w-full aspect-video bg-slate-900 rounded-[1.5rem] mb-6 overflow-hidden relative border border-slate-100 shadow-inner group-hover:shadow-lg transition-all">
                        {p.type === 'template' && p.content?.templateId ? (
                           <div className="w-full h-full flex items-center justify-center overflow-hidden">
                              <div style={{ transform: 'scale(0.12)', transformOrigin: 'center' }}>
                                 <MatrixCanvas template={availableTemplates.find(t => t.id === p.content.templateId || t.name === p.content.templateId)} />
                              </div>
                           </div>
                        ) : p.type === 'asset' && p.content?.asset ? (
                           <div className="w-full h-full relative">
                              {p.content.asset.match(/\.(mp4|webm|ogg|mov|mkv)$/i) ? (
                                 <video src={`${API_BASE}/api/assets/stream?filename=${encodeURIComponent(p.content.asset)}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" muted onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 0.5; }} />
                              ) : p.content.asset.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ? (
                                 <img src={`${API_BASE}/api/assets/stream?filename=${encodeURIComponent(p.content.asset)}`} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="" />
                              ) : (
                                 <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-500">
                                    {p.content.asset.endsWith('.pdf') && <FileText size={32} />}
                                    {p.content.asset.endsWith('.txt') && <FileText size={32} />}
                                    {p.content.asset.endsWith('.exe') && <Cpu size={32} />}
                                    <span className="text-[8px] font-black mt-2 uppercase tracking-widest">{p.content.asset.split('.').pop()}</span>
                                 </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center">
                                 <div className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-white/40 text-[8px] font-black uppercase tracking-widest">{p.content.asset.split('.').pop()}</div>
                              </div>
                           </div>
                        ) : p.type === 'power' ? (
                           <div className="w-full h-full bg-gradient-to-br from-amber-500/20 to-rose-500/20 flex flex-col items-center justify-center gap-2">
                              <Power size={32} className="text-amber-500/40" />
                              <span className="text-[9px] font-black text-amber-500/40 uppercase tracking-[0.2em]">Hardware_Trigger</span>
                           </div>
                        ) : (
                           <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                              <Info size={24} className="text-slate-200" />
                           </div>
                        )}
                        <div className="absolute top-3 left-3 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                     </div>
                     <div className="pt-6 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 relative z-10">
                        <span className="flex items-center gap-2"><Clock size={14} /> {p.startTime} {p.type !== 'power' ? `- ${p.endTime}` : ''}</span>
                        <span className="px-3 py-1 bg-slate-50 rounded-full border border-slate-100 text-[9px] uppercase tracking-widest">{p.targets.length} 节点</span>
                     </div>
                  </div>
               ))}
            </div>
         ) : (
            /* 列表视图 */
            <div className="space-y-4">
               {plans.map(p => (
                  <div key={p.id} className={`group relative p-6 rounded-[2rem] border transition-all duration-500 ${cardBg} bg-white shadow-inner shadow-slate-100 ${selectedTasks.has(p.id) ? 'ring-4 ring-sky-500 border-transparent shadow-2xl' : 'hover:shadow-xl'}`}>
                     {/* 选择复选框 */}
                     <div className={`absolute top-6 right-6 z-20 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${selectedTasks.has(p.id) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-black/20 border-white/20 text-transparent opacity-0 group-hover:opacity-100 hover:bg-black/40'}`} onClick={(e) => {
                        e.stopPropagation();
                        const next = new Set(selectedTasks);
                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                        setSelectedTasks(next);
                     }}>
                        <CheckSquare size={14} />
                     </div>

                     <div className="flex items-center gap-6">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${p.type === 'power' ? 'bg-amber-500/10 text-amber-500 border-amber-500/10' : 'bg-sky-50 text-sky-500 border-slate-100'}`}>
                           {p.type === 'broadcast' ? <Radio size={24} /> : p.type === 'template' ? <Layout size={24} /> : p.type === 'power' ? <Zap size={24} /> : <Database size={24} />}
                        </div>

                        <div className="flex-1 min-w-0">
                           <h4 className={`text-[16px] font-black mb-1 truncate ${textP} italic`}>{p.name}</h4>
                           <div className="flex items-center gap-4 mb-2">
                              <div className="flex items-center gap-2 opacity-60">
                                 <div className="w-1 h-1 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"></div>
                                 <span className="text-[9px] font-black uppercase tracking-widest">{p.type} // {p.frequency}</span>
                              </div>
                              <span className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                                 <Clock size={12} /> {p.startTime} {p.type !== 'power' ? `- ${p.endTime}` : ''}
                              </span>
                              <span className="px-2 py-1 bg-slate-50 rounded-full border border-slate-100 text-[9px] uppercase tracking-widest">{p.targets.length} 节点</span>
                           </div>
                        </div>

                        <div className="flex gap-2">
                           <button onClick={() => { setIsEditing(true); setCurrentPlan(p); }} className="w-9 h-9 rounded-lg bg-slate-50 text-slate-400 hover:bg-sky-500 hover:text-white transition-all flex items-center justify-center shadow-sm"><Edit3 size={16} /></button>
                           <button onClick={() => deletePlan(p.id)} className="w-9 h-9 rounded-lg bg-slate-50 text-slate-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-sm"><Trash2 size={16} /></button>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         )}



         {/* 空状态引导 */}
         {plans.length === 0 && !isEditing && (
            <div className="flex flex-col items-center justify-center py-32 text-center">
               <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center mb-6 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-100'}`}>
                  <CalendarClock size={40} className="text-slate-300" />
               </div>
               <h3 className={`text-2xl font-black mb-3 ${textP}`}>暂无排程计划</h3>
               <p className={`text-[13px] max-w-sm ${textS}`}>点击上方「建立矩阵排程」按钮创建您的第一个自动化任务排程。</p>
            </div>
         )}
         {/* 沉浸式编辑器 */}
         {isEditing && (
            <div className="fixed inset-0 z-[1000] bg-slate-950/20 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-500">
               <div className={`w-full max-w-7xl rounded-[3.5rem] border shadow-2xl flex flex-col overflow-hidden h-[92vh] ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-100'}`}>

                  {/* 编辑器页眉 */}
                  <div className={`p-10 border-b flex items-center justify-between relative ${isDark ? 'border-white/10 bg-slate-900' : 'border-slate-100 bg-white'}`}>
                     <div className="flex items-center gap-8">
                        <div className="w-16 h-16 bg-slate-50 border border-slate-100 text-sky-500 rounded-[1.8rem] flex items-center justify-center shadow-inner transition-transform hover:rotate-12 hover:scale-105"><CalendarClock size={36} /></div>
                        <div>
                           <h3 className="text-3xl font-black text-slate-900 tracking-tighter italic">配置物理排程指令</h3>
                           <p className="text-[10px] text-sky-500 font-bold uppercase tracking-[0.4em] mt-2">Laboratory Protocol: {currentPlan?.id || 'NEW_PROTOCOL'}</p>
                        </div>
                     </div>
                     <button onClick={() => setIsEditing(false)} className="w-14 h-14 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-all flex items-center justify-center active:scale-90 border border-slate-100 shadow-sm"><X size={28} /></button>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                     {/* 左侧配置区 */}
                     <div className="flex-1 p-16 space-y-12 overflow-y-auto no-scrollbar">

                        <div className="grid grid-cols-2 gap-12">
                           <div className="space-y-4">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Target size={14} className="text-sky-500" /> 计划识别标识</label>
                              <input value={currentPlan?.name || ''} onChange={(e) => setCurrentPlan({ ...currentPlan!, name: e.target.value })} className={`w-full h-18 px-8 rounded-3xl border text-xl font-black outline-none focus:border-sky-400 transition-all shadow-inner ${isDark ? 'bg-slate-800 border-white/10 text-white' : 'bg-slate-50 border-slate-100 focus:bg-white'}`} placeholder="输入名称..." />
                           </div>
                           <div className="space-y-4">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Layers size={14} className="text-sky-500" /> 指令物理类型</label>
                              <div className="grid grid-cols-4 gap-3">
                                 {[
                                    { id: 'asset', label: '素材', icon: Database },
                                    { id: 'template', label: '矩阵', icon: Layout },
                                    { id: 'broadcast', label: '广播', icon: Radio },
                                    { id: 'power', label: '电源', icon: Zap },
                                    { id: 'cache', label: '清理', icon: Trash2 }
                                 ].map(t => (
                                    <button key={t.id} onClick={() => setCurrentPlan({ ...currentPlan!, type: t.id as any })} className={`flex flex-col items-center justify-center gap-2 h-20 rounded-2xl border transition-all active:scale-95 ${currentPlan?.type === t.id ? 'bg-sky-600 border-sky-600 text-white shadow-xl' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-white'}`}>
                                       <t.icon size={22} />
                                       <span className="text-[10px] font-black">{t.label}</span>
                                    </button>
                                 ))}
                              </div>
                           </div>
                        </div>

                        {/* 类型细节编辑器 */}
                        <div className="p-10 rounded-[2.5rem] bg-slate-50/50 border border-slate-100 space-y-8 shadow-inner">
                           {currentPlan?.type === 'asset' && (
                              <div className="space-y-6">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">挂载物理素材</label>
                                 <button onClick={() => setShowResourcePicker('asset')} className="w-full h-48 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-sky-300 hover:bg-white transition-all group overflow-hidden">
                                    {currentPlan.content?.asset ? (
                                       <div className="w-full h-full relative">
                                          {currentPlan.content.asset.match(/\.(mp4|webm|ogg|mov|mkv)$/i) ? (
                                             <video src={`${API_BASE}/api/assets/stream?filename=${encodeURIComponent(currentPlan.content.asset)}`} className="w-full h-full object-cover" muted onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 0; }} />
                                          ) : (
                                             <img src={`${API_BASE}/api/assets/stream?filename=${encodeURIComponent(currentPlan.content.asset)}`} className="w-full h-full object-cover" />
                                          )}
                                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-all flex items-center justify-center">
                                             <div className="py-2 px-6 bg-white/90 backdrop-blur-md rounded-full shadow-2xl flex items-center gap-3">
                                                <span className="text-slate-800 font-black text-[13px] uppercase truncate max-w-[200px]">{currentPlan.content.asset}</span>
                                                <div className="w-px h-4 bg-slate-200"></div>
                                                <Edit3 size={14} className="text-sky-600" />
                                             </div>
                                          </div>
                                       </div>
                                    ) : (
                                       <><Box size={36} className="group-hover:scale-110 transition-transform" /> <span className="font-black text-[11px] uppercase tracking-widest">Pick_Physical_Media</span></>
                                    )}
                                 </button>
                              </div>
                           )}

                           {currentPlan?.type === 'template' && (
                              <div className="space-y-6">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">选择布局模板</label>
                                 <button onClick={() => setShowResourcePicker('template')} className="w-full h-48 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-sky-300 hover:bg-white transition-all overflow-hidden group">
                                    {currentPlan.content?.templateId ? (
                                       <div className="w-full h-full flex items-center justify-center bg-black relative">
                                          {(() => {
                                             const tpl = availableTemplates.find(t => t.id === currentPlan.content.templateId);
                                             return tpl ? (
                                                <div style={{ transform: 'scale(0.2)', transformOrigin: 'center' }}>
                                                   <MatrixCanvas template={tpl} />
                                                </div>
                                             ) : <div className="flex items-center gap-4 text-white"><Layout size={28} /><span className="text-xl font-black italic">{currentPlan.content.templateName || 'MATRIX_TEMPLATE'}</span></div>;
                                          })()}
                                          <div className="absolute bottom-4 left-6 py-1 px-3 bg-sky-600/80 backdrop-blur-md rounded-full text-white text-[10px] font-black uppercase tracking-widest">{currentPlan.content.templateName}</div>
                                       </div>
                                    ) : (
                                       <><Layout size={36} /> <span className="font-black text-[11px] uppercase tracking-widest">Select_Matrix_Template</span></>
                                    )}
                                 </button>
                              </div>
                           )}

                           {currentPlan?.type === 'broadcast' && (
                              <div className="space-y-8 animate-in slide-in-from-top-4">
                                 <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">广播文字内容</label><textarea value={currentPlan.content?.broadcast?.text} onChange={(e) => setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, broadcast: { ...currentPlan!.content.broadcast, text: e.target.value } } })} className="w-full h-24 p-6 rounded-3xl bg-white border border-slate-100 outline-none font-bold shadow-inner" /></div>
                                 <div className="grid grid-cols-4 gap-6">
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">背景色</label><input type="color" value={currentPlan.content?.broadcast?.bgColor} onChange={(e) => setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, broadcast: { ...currentPlan!.content.broadcast, bgColor: e.target.value } } })} className="w-full h-12 rounded-xl bg-white p-1 border-none cursor-pointer" /></div>
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">文字色</label><input type="color" value={currentPlan.content?.broadcast?.color} onChange={(e) => setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, broadcast: { ...currentPlan!.content.broadcast, color: e.target.value } } })} className="w-full h-12 rounded-xl bg-white p-1 border-none cursor-pointer" /></div>
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">字号: {currentPlan.content?.broadcast?.fontSize}px</label><input type="range" min="20" max="150" value={currentPlan.content?.broadcast?.fontSize} onChange={(e) => setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, broadcast: { ...currentPlan!.content.broadcast, fontSize: parseInt(e.target.value) } } })} className="w-full accent-sky-500" /></div>
                                    <div className="space-y-1"><label className="text-[8px] font-black text-slate-400 uppercase">速度: {currentPlan.content?.broadcast?.speed}</label><input type="range" min="1" max="15" value={currentPlan.content?.broadcast?.speed} onChange={(e) => setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, broadcast: { ...currentPlan!.content.broadcast, speed: parseInt(e.target.value) } } })} className="w-full accent-sky-500" /></div>
                                 </div>
                                 <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase flex justify-between">背景透明度 <span>{currentPlan.content?.broadcast?.bgOpacity}%</span></label><input type="range" min="0" max="100" value={currentPlan.content?.broadcast?.bgOpacity} onChange={(e) => setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, broadcast: { ...currentPlan!.content.broadcast, bgOpacity: parseInt(e.target.value) } } })} className="w-full accent-sky-500" /></div>
                              </div>
                           )}

                           {currentPlan?.type === 'power' && (
                              <div className="space-y-8 animate-in slide-in-from-top-4">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">电源管理指令</label>
                                 <div className="flex gap-4">
                                    {['开机', '关机', '重启'].map(cmd => (
                                       <button key={cmd} onClick={() => setCurrentPlan({ ...currentPlan!, content: { powerAction: cmd } })} className={`flex-1 h-16 rounded-[1.5rem] border font-black text-[13px] uppercase transition-all active:scale-95 ${currentPlan.content?.powerAction === cmd ? 'bg-amber-500 border-amber-500 text-white shadow-xl shadow-amber-500/20' : 'bg-white border-slate-100 text-slate-400 hover:border-amber-200'}`}>{cmd}</button>
                                    ))}
                                 </div>
                                 <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-3xl flex gap-4 items-center">
                                    <Info size={24} className="text-amber-500 shrink-0" />
                                    <span className="text-[11px] font-black text-slate-500 uppercase leading-relaxed tracking-wider">电源指令为脉冲指令：系统将在设定的时间点触发单次下发，不具备持续占用权。结束时间已锁定。</span>
                                 </div>
                              </div>
                           )}

                           {currentPlan?.type === 'cache' && (
                              <div className="space-y-8 animate-in slide-in-from-top-4">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">缓存清理指令</label>
                                 <div className={`p-8 rounded-3xl border flex gap-4 items-center ${isDark ? 'bg-sky-500/5 border-sky-500/10' : 'bg-sky-50 border-sky-100'}`}>
                                    <Trash2 size={28} className="text-sky-500 shrink-0" />
                                    <div>
                                       <p className={`text-[13px] font-black ${textP}`}>清理终端本地缓存</p>
                                       <p className="text-[11px] text-slate-500 mt-1">提交后将向所有关联终端下发缓存清理指令，非当前播放的缓存文件将被清除。</p>
                                    </div>
                                 </div>
                              </div>
                           )}
                        </div>

                        {/* 周期与时间 */}
                        <div className="grid grid-cols-2 gap-12">
                           <div className="space-y-6">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Calendar size={14} /> 执行周期逻辑</label>
                              <div className="flex bg-slate-50 p-2 rounded-2xl border border-slate-100 shadow-inner">
                                 {['once', 'daily', 'weekly'].map(f => (
                                    <button key={f} onClick={() => setCurrentPlan({ ...currentPlan!, frequency: f as any })} className={`flex-1 h-12 rounded-xl text-[11px] font-black uppercase transition-all ${currentPlan?.frequency === f ? 'bg-white shadow-md text-sky-600 border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                                       {f === 'once' ? '执行一次' : f === 'daily' ? '每日重复' : '每周特定'}
                                    </button>
                                 ))}
                              </div>
                              {currentPlan?.frequency === 'weekly' && (
                                 <div className="flex justify-between gap-2 animate-in slide-in-from-top-2">
                                    {weekDays.map((d, i) => (
                                       <button key={d} onClick={() => {
                                          const days = new Set(currentPlan.selectedDays || []);
                                          if (days.has(i)) days.delete(i); else days.add(i);
                                          setCurrentPlan({ ...currentPlan!, selectedDays: Array.from(days) });
                                       }} className={`flex-1 h-10 rounded-xl border text-[11px] font-black transition-all ${currentPlan.selectedDays?.includes(i) ? 'bg-sky-500 border-sky-500 text-white' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>{d}</button>
                                    ))}
                                 </div>
                              )}
                           </div>
                           <div className="space-y-6">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Clock size={14} /> 时间窗口</label>
                              <div className="flex items-center gap-4">
                                 <div className="flex-1 space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase ml-1">开始执行</p>
                                    <input type="time" value={currentPlan?.startTime} onChange={(e) => setCurrentPlan({ ...currentPlan!, startTime: e.target.value })} className="w-full h-14 px-6 bg-slate-50 border border-slate-100 rounded-2xl font-mono font-black text-sky-600 outline-none focus:bg-white transition-all shadow-inner" />
                                 </div>
                                 <div className="flex-1 space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase ml-1">执行结束</p>
                                    <input type="time" disabled={currentPlan?.type === 'power' || currentPlan?.type === 'cache'} value={currentPlan?.endTime} onChange={(e) => setCurrentPlan({ ...currentPlan!, endTime: e.target.value })} className={`w-full h-14 px-6 bg-slate-50 border border-slate-100 rounded-2xl font-mono font-black text-sky-600 outline-none focus:bg-white transition-all shadow-inner ${currentPlan?.type === 'power' || currentPlan?.type === 'cache' ? 'opacity-20 grayscale pointer-events-none' : ''}`} />
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* 右侧集群选择 */}
                     <div className={`w-[450px] p-12 flex flex-col border-l shadow-inner ${isDark ? 'bg-slate-800/50 border-white/10' : 'bg-slate-50/50 border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-8">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2 text-sky-600"><Monitor size={18} /> 集群分发节点</label>
                           <button onClick={() => setCurrentPlan({ ...currentPlan!, targets: terminals.map(t => t.id) })} className="text-[10px] font-black text-sky-600 hover:text-sky-500 uppercase tracking-widest underline decoration-2 underline-offset-4 active:scale-90 transition-all">全网透传</button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-8 no-scrollbar pr-2">
                           {groups.map(group => {
                              const groupTerms = terminals.filter(t => t.groupId === group.id);
                              if (groupTerms.length === 0) return null;
                              const isAllSelected = groupTerms.every(t => currentPlan?.targets?.includes(t.id));

                              return (
                                 <div key={group.id} className="space-y-3">
                                    <div className="flex items-center justify-between px-4">
                                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{group.name}</span>
                                       <button onClick={() => {
                                          const nextTargets = new Set(currentPlan?.targets || []);
                                          if (isAllSelected) groupTerms.forEach(t => nextTargets.delete(t.id));
                                          else groupTerms.forEach(t => nextTargets.add(t.id));
                                          setCurrentPlan({ ...currentPlan!, targets: Array.from(nextTargets) });
                                       }} className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${isAllSelected ? 'bg-sky-500 border-sky-500 text-white' : 'bg-white border-slate-200'}`}><CheckSquare size={14} /></button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                       {groupTerms.map(term => (
                                          <button key={term.id} onClick={() => {
                                             const next = new Set(currentPlan?.targets || []);
                                             if (next.has(term.id)) next.delete(term.id); else next.add(term.id);
                                             setCurrentPlan({ ...currentPlan!, targets: Array.from(next) });
                                          }} className={`w-full p-5 rounded-2xl border transition-all flex items-center justify-between active:scale-[0.98] ${currentPlan?.targets?.includes(term.id) ? 'bg-white border-sky-500 text-sky-600 shadow-lg' : 'bg-white/60 border-slate-100 text-slate-400 hover:bg-white hover:border-sky-100'}`}>
                                             <div className="flex items-center gap-4 text-left"><Laptop size={18} /> <div><span className="text-[13px] font-black block">{term.name}</span><span className="text-[9px] font-mono opacity-60">{term.ip}</span></div></div>
                                             {currentPlan?.targets?.includes(term.id) && <CheckSquare size={18} className="text-sky-500" />}
                                          </button>
                                       ))}
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                     </div>
                  </div>

                  {/* 编辑器页脚 */}
                  <div className={`p-10 border-t flex items-center justify-between shadow-2xl relative z-20 ${isDark ? 'border-white/10 bg-slate-900' : 'border-slate-100 bg-white'}`}>
                     <div className="flex items-center gap-5 text-emerald-500 text-[11px] font-black uppercase tracking-widest group">
                        <div className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
                        物理协议已准备就绪 // 链路: {serverConfig.ip || '127.0.0.1'}
                     </div>
                     <div className="flex gap-4">
                        <button onClick={() => setIsEditing(false)} className="h-16 px-10 rounded-2xl border border-slate-200 text-slate-400 font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95">放弃更改</button>
                        <button onClick={savePlan} className="h-16 px-24 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-black uppercase tracking-[0.3em] transition-all active:scale-95 shadow-[0_20px_50px_-10px_rgba(14,165,233,0.5)] flex items-center gap-4 group">
                           <ShieldCheck size={28} className="group-hover:scale-110 transition-transform" /> 提交并全网发布
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* 批量操作界面 */}
         {selectedTasks.size > 0 && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[500] animate-in slide-in-from-bottom-12 duration-500">
               <div className="flex items-center gap-6 bg-slate-900/95 text-white px-8 py-4 rounded-full border border-white/10 backdrop-blur-2xl shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center gap-3 border-r border-white/10 pr-6">
                     <div className="w-10 h-10 bg-sky-600 rounded-full flex items-center justify-center text-[16px] font-black text-white shadow-lg">{selectedTasks.size}</div>
                     <div className="flex flex-col"><span className="text-[11px] font-black uppercase tracking-widest">已选中对象</span><span className="text-[8px] font-bold text-sky-400 uppercase tracking-widest">Selected Tasks</span></div>
                  </div>
                  <div className="flex gap-3">
                     <button onClick={async () => {
                        const ids = Array.from(selectedTasks) as string[];
                        for (const id of ids) await deletePlan(id);
                        setSelectedTasks(new Set());
                     }} className="h-11 px-6 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-black text-[11px] uppercase tracking-[0.15em] transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-rose-600/20"><Trash2 size={16} /> 物理销毁</button>
                     <button onClick={() => setSelectedTasks(new Set())} className="h-11 px-6 bg-white/5 hover:bg-white/10 text-slate-400 rounded-full font-black text-[11px] uppercase tracking-widest border border-white/5 transition-all">取消选择</button>
                  </div>
               </div>
            </div>
         )}

         {/* 资源拾取器 */}
         {showResourcePicker && (
            <div className="fixed inset-0 z-[5000] bg-slate-950/80 backdrop-blur-2xl flex items-center justify-center p-12 animate-in fade-in duration-500">
               <div className={`w-full max-w-5xl h-[85vh] rounded-[4rem] bg-white border border-white shadow-2xl flex flex-col overflow-hidden`}>
                  <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                     <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-sky-500 border border-slate-100 shadow-inner"><Filter size={32} /></div>
                        <div><h3 className="text-3xl font-black text-slate-800">矩阵资源拾取库</h3><p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.4em] mt-1">Laboratory Resource Vault</p></div>
                     </div>
                     <button onClick={() => setShowResourcePicker(null)} className="w-14 h-14 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-all flex items-center justify-center border border-slate-100 active:scale-90"><X size={32} /></button>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                     {showResourcePicker === 'asset' && (
                        <div className="w-72 border-r border-slate-100 p-8 overflow-y-auto no-scrollbar space-y-2.5 bg-slate-50/30">
                           <div className="relative mb-4">
                              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                              <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="搜索素材..." className="w-full h-10 pl-10 pr-4 rounded-xl bg-white border border-slate-100 text-[12px] font-bold outline-none focus:border-sky-400" />
                           </div>
                           <button onClick={() => setPickerCategory('全部素材')} className={`w-full h-12 px-6 rounded-2xl text-[12px] font-black uppercase text-left transition-all ${pickerCategory === '全部素材' ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-white'}`}>所有库资源</button>
                           <div className="h-px bg-slate-200 my-4 mx-2"></div>
                           {categories.map(cat => (
                              <button key={cat} onClick={() => setPickerCategory(cat)} className={`w-full h-12 px-6 rounded-2xl text-[12px] font-black uppercase text-left transition-all ${pickerCategory === cat ? 'bg-sky-500 text-white shadow-xl' : 'text-slate-400 hover:bg-white'}`}>{cat}</button>
                           ))}
                        </div>
                     )}
                     <div className={`flex-1 p-10 overflow-y-auto no-scrollbar grid ${showResourcePicker === 'asset' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3 lg:grid-cols-5'} gap-8`}>
                        {showResourcePicker === 'asset' ?
                           availableAssets
                              .filter(a => a.category !== '系统固件') // 排除固件
                              .filter(a => pickerCategory === '全部素材' ? true : a.category === pickerCategory)
                              .filter(a => !pickerSearch || a.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                              .map(asset => {
                                 const ext = asset.name.split('.').pop()?.toLowerCase() || '';
                                 const isVid = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
                                 const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);

                                 return (
                                    <div key={asset.name} onClick={() => { setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, asset: asset.name } }); setShowResourcePicker(null); }} className="group relative aspect-square rounded-[2.5rem] bg-white border border-slate-100 overflow-hidden cursor-pointer hover:scale-[1.05] hover:border-sky-300 hover:shadow-2xl transition-all shadow-md">
                                       <div className="w-full h-full bg-slate-900 relative">
                                          {isVid ? (
                                             <video src={asset.thumb} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" muted onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 0; }} />
                                          ) : isImg ? (
                                             <img src={asset.thumb} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                          ) : (
                                             <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-slate-500 group-hover:text-sky-500 transition-colors">
                                                {ext === 'pdf' && <FileText size={48} strokeWidth={1} />}
                                                {ext === 'txt' && <FileText size={48} strokeWidth={1} />}
                                                {ext === 'exe' && <Cpu size={48} strokeWidth={1} />}
                                                <span className="text-[10px] font-black mt-3 uppercase tracking-widest">{ext} FILE</span>
                                             </div>
                                          )}
                                          <FocusBrackets active={false} />
                                          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white/90 text-[8px] font-mono px-2 py-1 rounded-md border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                                             SPEC_{ext.toUpperCase()}
                                          </div>
                                       </div>
                                       <div className="absolute bottom-6 left-6 right-6">
                                          <p className="text-[12px] font-black text-white truncate drop-shadow-lg uppercase tracking-widest">{asset.name}</p>
                                       </div>
                                    </div>
                                 );
                              }) :
                           availableTemplates.map(tpl => (
                              <div key={tpl.id} onClick={() => { setCurrentPlan({ ...currentPlan!, content: { ...currentPlan!.content, templateId: tpl.id, templateName: tpl.name } }); setShowResourcePicker(null); }} className="group relative aspect-square rounded-[2.5rem] bg-black border border-slate-100 overflow-hidden cursor-pointer hover:scale-[1.05] hover:border-sky-300 hover:shadow-2xl transition-all shadow-md flex flex-col items-center justify-center">
                                 <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                                    <div style={{ transform: 'scale(0.18)', transformOrigin: 'center' }}>
                                       <MatrixCanvas template={tpl} />
                                    </div>
                                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-all"></div>
                                    <div className="absolute top-4 left-6 py-1 px-3 bg-white/10 backdrop-blur-md rounded-full text-white/40 text-[8px] font-black uppercase tracking-widest border border-white/5">LAYOUT_PROFILE</div>
                                 </div>
                                 <div className="absolute bottom-6 left-8 right-8 text-left">
                                    <p className="text-[13px] font-black text-white truncate drop-shadow-lg uppercase tracking-widest">{tpl.name}</p>
                                    <p className="text-[8px] font-bold text-sky-400/80 uppercase mt-0.5 tracking-widest">{tpl.resolution} // {tpl.orientation}</p>
                                 </div>
                              </div>
                           ))
                        }
                     </div>
                  </div>
               </div>
            </div>
         )}

         <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(14, 165, 233, 0.1); border-radius: 10px; }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.5) sepia(1) saturate(5) hue-rotate(175deg); cursor: pointer; }
      `}</style>
      </div>
   );
};
