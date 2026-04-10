
import React from 'react';
import {
  LayoutDashboard, FolderOpen, LayoutTemplate, Monitor,
  CalendarClock, FileText, Users, Settings,
  ChevronLeft, ChevronRight, Hexagon, Cpu, Lock
} from 'lucide-react';
import { NavItem } from '../types';

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '业务运营看板', section: 'CORE', icon: LayoutDashboard },
  { id: 'assets', label: '素材资源中心', section: 'CORE', icon: FolderOpen },
  { id: 'templates', label: '布局模板引擎', section: 'CORE', icon: LayoutTemplate },
  { id: 'terminals', label: '终端集群管理', section: 'OPS', icon: Monitor },
  { id: 'tasks', label: '播控排程中心', section: 'OPS', icon: CalendarClock },
  { id: 'logs', label: '审计与监控', section: 'SYSTEM', icon: FileText },
  { id: 'users', label: '组织权限架构', section: 'SYSTEM', icon: Users },
  { id: 'system-settings', label: '核心节点配置', section: 'SYSTEM', icon: Settings },
];

const PrecisionBrackets = ({ active }: { active?: boolean }) => (
  <div className={`absolute inset-0 pointer-events-none transition-all duration-500 ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-95 group-hover:opacity-30 group-hover:scale-100'}`}>
    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-sky-500 rounded-tl-md"></div>
    <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-sky-500 rounded-tr-md"></div>
    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-sky-500 rounded-bl-md"></div>
    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-sky-500 rounded-br-md"></div>
  </div>
);

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  theme: 'light' | 'dark';
  currentUser?: any;
  isLocked?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeId, onSelect, isCollapsed, onToggle, theme, currentUser, isLocked }) => {
  const isDark = theme === 'dark';

  return (
    <div className={`
      ${isCollapsed ? 'w-20' : 'w-72'} 
      ${isDark ? 'bg-[#050a18] border-white/5 shadow-2xl' : 'bg-white border-slate-200/60 shadow-[20px_0_60px_rgba(0,0,0,0.02)]'} 
      flex flex-col h-full flex-shrink-0 transition-all duration-500 ease-in-out z-50 border-r relative
    `}>
      {/* 品牌 Logo 区 - 实验室风格强化 */}
      <div className={`h-24 flex items-center ${isCollapsed ? 'justify-center' : 'px-8'} gap-4 shrink-0 border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-[#0F172A] border border-white/10 shadow-2xl flex items-center justify-center text-sky-500 group">
            <Hexagon size={24} fill="currentColor" className="animate-pulse" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900 shadow-sm"></div>
          </div>
        </div>
        {!isCollapsed && (
          <div className="flex flex-col animate-in fade-in slide-in-from-left-2 duration-500">
            <h1 className={`font-black text-[18px] tracking-tighter leading-none ${isDark ? 'text-white' : 'text-[#0F172A]'}`}>
              MATRIX <span className="text-sky-500">DMS</span>
            </h1>
            <span className="text-[8px] text-slate-400 font-black uppercase tracking-[0.4em] mt-2 opacity-60">
              Lab Console v1.6
            </span>
          </div>
        )}
      </div>

      {/* 导航列表 */}
      <nav className="flex-1 px-4 py-8 space-y-1.5 overflow-y-auto no-scrollbar">
        {NAV_ITEMS.filter(item => {
          if (!currentUser) return false;
          if (currentUser.isSuper) return true;
          // 检查权限列表
          return currentUser.permissions?.includes(item.id);
        }).map((item, index, filteredArray) => {
          const isActive = activeId === item.id;
          const showSection = !isCollapsed && (index === 0 || filteredArray[index - 1].section !== item.section);

          // 授权锁定时，除用户管理(救援入口)外全部禁用
          const isItemDisabled = isLocked && item.id !== 'users';

          return (
            <React.Fragment key={item.id}>
              {showSection && (
                <div className="px-5 mt-8 mb-3 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] opacity-40">
                  {item.section}
                </div>
              )}
              <button
                disabled={isItemDisabled}
                onClick={() => onSelect(item.id)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all group relative active:scale-95 ${isActive
                  ? 'bg-slate-900 shadow-xl border-white/5 text-white'
                  : isDark ? 'text-slate-500 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  } ${isCollapsed ? 'justify-center px-0' : ''} ${isItemDisabled ? 'opacity-20 cursor-not-allowed grayscale' : ''}`}
              >
                <PrecisionBrackets active={isActive} />
                <div className="relative">
                  <item.icon
                    size={19}
                    className={`shrink-0 transition-transform ${isActive ? 'text-sky-400 scale-110' : 'text-slate-400 group-hover:text-sky-500 group-hover:scale-110'}`}
                  />
                  {isItemDisabled && (
                    <div className="absolute -top-1 -right-1 text-rose-500"><Lock size={10} /></div>
                  )}
                </div>
                {!isCollapsed && (
                  <span className={`text-[13px] font-bold tracking-tight ${isActive ? 'text-white' : 'text-slate-500'}`}>
                    {item.label}
                  </span>
                )}
                {isActive && !isCollapsed && (
                  <div className="absolute right-4 w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_12px_rgba(14,165,233,1)]"></div>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* 底部功能区 */}
      <div className={`p-6 border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
        {!isCollapsed && (
          <div className="mb-4 px-4 py-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center gap-3">
            <Cpu size={14} className="text-slate-500" />
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Runtime Env</span>
              <span className="text-[10px] font-bold text-sky-500 mt-1 uppercase">WIN_X64_STABLE</span>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className={`w-full h-11 flex items-center justify-center rounded-xl text-slate-400 hover:bg-[#0F172A] hover:text-white transition-all border ${isDark ? 'border-white/5' : 'border-slate-200'}`}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <div className="flex items-center gap-2"><ChevronLeft size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Collapse Panel</span></div>}
        </button>
      </div>
    </div>
  );
};
