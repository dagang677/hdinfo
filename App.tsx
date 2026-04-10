
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './views/DashboardView';
import { LoginView } from './views/LoginView';
import { TerminalClientView } from './views/TerminalClientView';
import { User } from './types';
import { Shield, Lock } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light'); // 默认设为白天模式
  const [uploadingCount, setUploadingCount] = useState(0);

  // 物理节点核心配置状态提升
  const [serverConfig, setServerConfig] = useState<any>({
    ip: '127.0.0.1',
    port: '3003',
    storagePath: '...',
    status: 'online',
    isLocal: false,
    ports: { frontend: 5174, backend: 3003, terminal: 3003 },
    storageStructure: []
  });

  const [isLicenseLocked, setIsLicenseLocked] = useState(false);
  const [hasDismissedLockOverlay, setHasDismissedLockOverlay] = useState(false);
  const [licenseReason, setLicenseReason] = useState('');

  // 获取系统核心配置与授权状态
  useEffect(() => {
    // 1. 获取基础配置
    fetch('/api/system/config')
      .then(res => res.json())
      .then(data => setServerConfig({ ...data, status: 'online' }))
      .catch(err => {
        console.error('Failed to fetch system config:', err);
        setServerConfig(prev => ({ ...prev, status: 'offline' }));
      });

    // 2. 授权自检逻辑封装
    const refreshLicenseStatus = () => {
      fetch('/api/sys/license-status')
        .then(res => res.json())
        .then(data => {
          if (data.isValid) {
            setIsLicenseLocked(false);
            setHasDismissedLockOverlay(false); // 重置遮罩状态
          } else {
            setIsLicenseLocked(true);
            setLicenseReason(data.reason || '系统尚未激活数字授权');
          }
        })
        .catch(console.error);
    };

    // 初始执行一次
    refreshLicenseStatus();

    // 监听全局授权锁死事件 (后端检测到异常时通过 WebSocket/Polling 派发)
    const handleLock = (e: any) => {
      setIsLicenseLocked(true);
      setLicenseReason(e.detail.reason);
    };

    // 监听手动激活同步事件 (前端导入成功时派发)
    const handleUpdate = () => {
      console.log('License update detected, refreshing status...');
      refreshLicenseStatus();
    };

    window.addEventListener('matrix:license_locked' as any, handleLock);
    window.addEventListener('matrix:license_updated' as any, handleUpdate);

    // 3. 在线会话校验 (防止 sessionStorage 残留旧账号如 admin)
    const savedUser = sessionStorage.getItem('matrix_current_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, account: user.account })
        })
          .then(res => res.json())
          .then(data => {
            if (!data.valid) {
              console.warn('Stale session detected, forcing logout.');
              sessionStorage.removeItem('matrix_current_user');
              setCurrentUser(null);
            }
          })
          .catch(err => console.error('Session verification failed:', err));
      } catch (e) {
        sessionStorage.removeItem('matrix_current_user');
        setCurrentUser(null);
      }
    }

    return () => {
      window.removeEventListener('matrix:license_locked' as any, handleLock);
      window.removeEventListener('matrix:license_updated' as any, handleUpdate);
    };
  }, []);

  // 全局登录用户状态 - 修改：不再默认注入超级管理员，若无缓存则为 null
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem('matrix_current_user');
    if (saved) return JSON.parse(saved);
    return null;
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.body.className = 'bg-[#0a0f1d] selection:bg-sky-500/30 overflow-hidden';
    } else {
      document.body.className = 'bg-[#f8fafc] selection:bg-sky-500/30 overflow-hidden';
    }
  }, [theme]);

  // 全局权限补全
  useEffect(() => {
    if (currentUser && !currentUser.permissions && !currentUser.isSuper) {
      fetch('/api/roles')
        .then(res => res.json())
        .then(roles => {
          const userRole = roles.find((r: any) => r.id === currentUser.roleId);
          if (userRole) {
            const updated = { ...currentUser, permissions: userRole.permissions };
            setCurrentUser(updated);
            sessionStorage.setItem('matrix_current_user', JSON.stringify(updated));
          }
        })
        .catch(console.error);
    }
  }, [currentUser]);

  // 处理登录成功
  const handleLogin = async (user: User) => {
    // 异步补充权限信息
    try {
      const rRes = await fetch('/api/roles');
      if (rRes.ok) {
        const roles = await rRes.json();
        const userRole = roles.find((r: any) => r.id === user.roleId);
        if (userRole) {
          user.permissions = userRole.permissions;
        }
      }
    } catch (e) {
      console.error('Failed to fetch role permissions during login');
    }

    setCurrentUser(user);
    sessionStorage.setItem('matrix_current_user', JSON.stringify(user));

    // 向后端发送登录通知
    fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userAccount: user.account,
        userName: user.name,
        userId: user.id,
        roleId: user.roleId,
        isSuper: user.isSuper
      })
    }).catch(error => {
      console.error('Error sending login notification:', error);
    });
  };

  // 监听用户信息变更（同步到 Header）
  const handleUserUpdate = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    sessionStorage.setItem('matrix_current_user', JSON.stringify(updatedUser));
  };

  const handleLogout = () => {
    // 物理断开逻辑
    sessionStorage.removeItem('matrix_current_user');
    setCurrentUser(null);
  };

  // 检查是否为终端模式
  const isTerminalMode = new URLSearchParams(window.location.search).has('mode') && new URLSearchParams(window.location.search).get('mode') === 'terminal';

  // 如果是终端模式，直接渲染终端客户端
  if (isTerminalMode) {
    return <TerminalClientView />;
  }

  // 如果没有用户登录，渲染登录页面
  if (!currentUser) {
    return (
      <LoginView
        theme={theme}
        onLogin={handleLogin}
        serverConfig={serverConfig}
      />
    );
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden transition-colors duration-500 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
      <Sidebar
        activeId={activeTab}
        onSelect={setActiveTab}
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
        theme={theme}
        currentUser={currentUser}
        isLocked={isLicenseLocked}
      />

      <div className={`flex flex-col flex-1 min-w-0 h-full relative z-10 transition-all duration-500 ${theme === 'dark' ? 'bg-[#0f172a]' : 'bg-[#f8fafc]'}`}>
        <Header
          theme={theme}
          onThemeToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          uploadingCount={uploadingCount}
          activeTab={activeTab}
          currentUser={currentUser}
          onLogout={handleLogout}
          serverConfig={serverConfig}
        />

        {isLicenseLocked && !hasDismissedLockOverlay && (
          <div className="fixed inset-0 z-[2000] bg-slate-950/90 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-700">
            <div className="w-full max-w-xl bg-slate-900 border border-white/5 p-12 rounded-[3.5rem] shadow-2xl text-center space-y-8">
              <div className="w-24 h-24 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center justify-center mx-auto animate-pulse">
                <span className="text-4xl text-rose-500"><Lock size={40} /></span>
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">系统物理链路已熔断</h3>
                <p className="text-slate-400 text-sm leading-relaxed px-4">
                  安全策略：由于数字授权效验失败，核心业务引擎已自动物理挂起。<br />
                  <span className="text-rose-400 font-bold mt-2 block italic text-[12px]">原因: {licenseReason || '数字授权已过期或配额不足'}</span>
                </p>
              </div>
              <div className="pt-4 space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-[10px] text-slate-500 uppercase font-bold tracking-widest text-left">
                  <p>1. 请确认您的物理盾证书 (.dat) 是否准确</p>
                  <p className="mt-1">2. 检查服务器物理网卡是否发生变更</p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab('users');
                    setHasDismissedLockOverlay(true);
                  }}
                  className="w-full h-16 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl hover:bg-sky-400 hover:text-white"
                >
                  前往授权救援中心
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
          <div className="p-8 max-w-[1600px] mx-auto pb-32">
            <DashboardView
              activeId={activeTab}
              theme={theme}
              isSidebarCollapsed={isCollapsed}
              onThemeChange={setTheme}
              onUploadCountChange={setUploadingCount}
              hideHeader={true}
              currentUser={currentUser}
              onUserUpdate={handleUserUpdate}
              serverConfig={serverConfig}
              setServerConfig={setServerConfig}
              isLicenseLocked={isLicenseLocked}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
