
import React, { useState, useEffect } from 'react';
import { Activity, FileVideo, Layout, Monitor, Clock, Shield, UserPlus, Settings, Smartphone } from 'lucide-react';
import { OverviewView } from './OverviewView';
import { AssetLibraryView } from './AssetLibraryView';
import { SystemSettingsView } from './SystemSettingsView';
import { TemplatesView } from './TemplatesView';
import { TerminalsView } from './TerminalsView';
import { TasksView } from './TasksView';
import { LogsView } from './LogsView';
import { UsersView } from './UsersView';
import { TerminalClientView } from './TerminalClientView';
import { User } from '../types';

interface DashboardViewProps {
  activeId: string;
  theme: 'light' | 'dark';
  isSidebarCollapsed?: boolean;
  onThemeChange?: (theme: 'light' | 'dark') => void;
  onUploadCountChange?: (count: number) => void;
  hideHeader?: boolean;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  serverConfig: any;
  setServerConfig: (config: any) => void;
  isLicenseLocked?: boolean;
}

const VIEW_META: Record<string, { badge: string; icon: any; color: string }> = {
  'dashboard': { badge: '实时监控', icon: Activity, color: 'text-sky-500' },
  'assets': { badge: '10MB/Chunk', icon: FileVideo, color: 'text-indigo-500' },
  'templates': { badge: 'Layout Engine', icon: Layout, color: 'text-rose-500' },
  'terminals': { badge: 'Edge Node', icon: Monitor, color: 'text-emerald-500' },
  'tasks': { badge: 'Cron Engine', icon: Clock, color: 'text-amber-500' },
  'logs': { badge: 'Security', icon: Shield, color: 'text-slate-500' },
  'users': { badge: '组织管理', icon: UserPlus, color: 'text-purple-500' },
  'system-settings': { badge: 'Core Config', icon: Settings, color: 'text-slate-400' },
  'simulator': { badge: 'Android Debug', icon: Smartphone, color: 'text-blue-500' },
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  activeId, theme, onUploadCountChange, hideHeader, isSidebarCollapsed, currentUser, onUserUpdate, serverConfig, setServerConfig, isLicenseLocked
}) => {
  const isDark = theme === 'dark';

  const textP = isDark ? 'text-slate-100' : 'text-slate-900';
  const textS = isDark ? 'text-slate-400' : 'text-slate-500';
  const cardBg = isDark ? 'bg-slate-900/40 border-white/5 backdrop-blur-md' : 'bg-white border-slate-100 shadow-sm';
  const inputBg = isDark ? 'bg-slate-800/50 border-white/10' : 'bg-slate-50 border-slate-200';

  const renderContent = () => {
    switch (activeId) {
      case 'dashboard': return <OverviewView isDark={isDark} textP={textP} textS={textS} cardBg={cardBg} />;
      case 'assets': return <AssetLibraryView serverConfig={serverConfig} isDark={isDark} isSidebarCollapsed={isSidebarCollapsed} textP={textP} textS={textS} cardBg={cardBg} onUploadCountChange={onUploadCountChange} />;
      case 'templates': return <TemplatesView serverConfig={serverConfig} isDark={isDark} textP={textP} textS={textS} cardBg={cardBg} isSidebarCollapsed={isSidebarCollapsed} />;
      case 'terminals': return <TerminalsView serverConfig={serverConfig} isDark={isDark} isSidebarCollapsed={isSidebarCollapsed} textP={textP} textS={textS} cardBg={cardBg} />;
      case 'tasks': return <TasksView serverConfig={serverConfig} isDark={isDark} textP={textP} textS={textS} cardBg={cardBg} />;
      case 'logs': return <LogsView isDark={isDark} textP={textP} textS={textS} cardBg={cardBg} />;
      case 'users': return <UsersView isDark={isDark} textP={textP} textS={textS} cardBg={cardBg} currentUser={currentUser} onUserUpdate={onUserUpdate} isLocked={isLicenseLocked} />;
      case 'system-settings': return <SystemSettingsView serverConfig={serverConfig} setServerConfig={setServerConfig} isDark={isDark} textP={textP} textS={textS} cardBg={cardBg} inputBg={inputBg} />;
      case 'simulator': return <TerminalClientView isEmbedded={true} />;
      default: return null;
    }
  };

  return (
    <div className="w-full flex flex-col">
      <div className="flex-1 min-h-0 pt-4">
        {renderContent()}
      </div>
    </div>
  );
};
