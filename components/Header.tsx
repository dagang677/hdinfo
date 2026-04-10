
import React from 'react';
import { Sun, Moon, LogOut, Radio, ShieldCheck, Terminal as TerminalIcon, Network, Globe, Command } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  activeTab: string;
  currentUser: User;
  onLogout: () => void;
  serverConfig: {
    ip: string;
    port: string;
    status: string;
    server_name?: string;
    server_role?: string;
  };
  uploadingCount: number;
  isEditing?: boolean;
}

const VIEW_META: Record<string, { title: string; subtitle: string }> = {
  'dashboard': { title: '业务运营看板', subtitle: 'GLOBAL CLUSTER ANALYTICS' },
  'assets': { title: '素材资源中心', subtitle: 'PHYSICAL VAULT REPOSITORY' },
  'templates': { title: '布局模板引擎', subtitle: 'MATRIX UI COMPOSER' },
  'terminals': { title: '终端集群管理', subtitle: 'REMOTE NODE MONITORING' },
  'tasks': { title: '播控排程中心', subtitle: 'AUTOMATION SEQUENCER' },
  'logs': { title: '审计与监控', subtitle: 'AUDIT TRAIL LOGGING' },
  'users': { title: '组织权限架构', subtitle: 'IDENTITY ACCESS MANAGEMENT' },
  'system-settings': { title: '核心节点配置', subtitle: 'ENGINE CONTEXT CONFIG' },
};

export const Header: React.FC<HeaderProps> = ({ theme, onThemeToggle, activeTab, currentUser, onLogout, serverConfig, uploadingCount, isEditing }) => {
  const isDark = theme === 'dark';

  const displayTitle = (activeTab === 'tasks' && isEditing) ? '建立排程协议' : (VIEW_META[activeTab]?.title || 'MATRIX DMS');
  const displaySubtitle = (activeTab === 'tasks' && isEditing) ? 'NEW SEQUENCING PROTOCOL' : (VIEW_META[activeTab]?.subtitle || 'SYSTEM CONSOLE');

  return (
    <header className={`h-24 flex items-center justify-between px-10 border-b sticky top-0 z-[100] backdrop-blur-3xl transition-all ${isDark ? 'bg-[#050a18]/95 border-white/5 shadow-2xl' : 'bg-white/80 border-slate-200/60 shadow-[0_1px_40px_rgba(0,0,0,0.01)]'
      }`}>

      {/* 标题区 - 强化主副对比 */}
      <div className="flex flex-col animate-in slide-in-from-left-4 duration-700">
        <div className="flex items-center gap-3">
          <h2 className={`text-[28px] font-black tracking-tighter leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {displayTitle}
          </h2>
          <div className="h-1.5 w-1.5 rounded-full bg-sky-500 mt-1"></div>
        </div>
        <p className="text-[10px] text-sky-500 font-bold uppercase tracking-[0.5em] mt-3 opacity-100 italic">
          {displaySubtitle}
        </p>
      </div>

      {/* 功能控制区 - 功能胶囊合并 */}
      <div className="flex items-center gap-6">

        {/* 通信链路胶囊 - 合并 IP/Port/Status */}
        <div className={`hidden lg:flex items-center gap-6 px-6 py-3 rounded-2xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-100/50 border-slate-200/60 shadow-inner'}`}>
          <div className="flex items-center gap-3">
            <Radio size={14} className={serverConfig.server_role === 'master' ? 'text-sky-500' : 'text-slate-400'} />
            <div className="flex flex-col">
              <span className={`text-[11px] font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{serverConfig.server_name || 'MATRIX NODE'}</span>
              <span className="text-[8px] font-bold text-slate-500 leading-none mt-0.5">{serverConfig.ip}:{serverConfig.port}</span>
            </div>
          </div>
          <div className="w-px h-6 bg-slate-300 dark:bg-white/10"></div>
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${serverConfig.server_role === 'master' ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'}`}>
              {serverConfig.server_role === 'master' ? 'PRIMARY' : 'SECONDARY'}
            </span>
            <div className={`w-2 h-2 rounded-full ${serverConfig.status === 'online' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></div>
          </div>
        </div>

        {/* 主动作组 */}
        <div className="flex items-center gap-3">
          <button onClick={onThemeToggle} className={`w-11 h-11 flex items-center justify-center rounded-2xl border transition-all active:scale-90 ${isDark ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm'
            }`}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* 用户资料预览 - 合并用户与退出 */}
          <div className={`flex items-center gap-4 pl-4 border-l ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
            <div className="flex flex-col items-end">
              <span className={`text-[13px] font-black ${isDark ? 'text-white' : 'text-[#0F172A]'}`}>
                {currentUser.name}
              </span>
              <span className="text-[8px] font-black text-sky-500 uppercase tracking-widest mt-1">LV:ADMIN</span>
            </div>
            <div className="w-11 h-11 rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-lg shrink-0 group relative cursor-pointer">
              <img src={currentUser.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=60"} className="w-full h-full object-cover group-hover:scale-110 transition-transform" alt="" />
            </div>
            <button onClick={onLogout} className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50/10 transition-all active:scale-90">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
