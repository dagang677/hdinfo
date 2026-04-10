
import React, { useState, useEffect } from 'react';
import { Zap, Shield, User as UserIcon, Lock, ChevronRight, Fingerprint, Activity, Server, History, CheckCircle2 } from 'lucide-react';
import { User } from '../types';

interface LoginViewProps {
  theme: 'light' | 'dark';
  onLogin: (user: User) => void;
  serverConfig: any;
}

interface RecentLogin {
  account: string;
  name: string;
  avatar?: string;
  password?: string; // 只有勾选记住密码才存储
  roleId: string;
}

export const LoginView: React.FC<LoginViewProps> = ({ theme, onLogin, serverConfig }) => {
  const isDark = theme === 'dark';
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [recentLogins, setRecentLogins] = useState<RecentLogin[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('matrix_recent_logins');
    if (saved) {
      setRecentLogins(JSON.parse(saved));
    }
  }, []);

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 从后端获取全量用户列表进行匹配
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('无法连接到用户鉴权服务器');

      const users: User[] = await res.json();
      const foundUser = users.find(u => u.account === account && u.password === password);

      if (foundUser) {
        // 更新最近登录列表
        const newRecent: RecentLogin = {
          account: foundUser.account,
          name: foundUser.name,
          avatar: foundUser.avatar,
          roleId: foundUser.roleId,
          password: remember ? foundUser.password : undefined
        };

        const updatedRecent = [
          newRecent,
          ...recentLogins.filter(r => r.account !== foundUser.account)
        ].slice(0, 2);

        setRecentLogins(updatedRecent);
        localStorage.setItem('matrix_recent_logins', JSON.stringify(updatedRecent));

        onLogin(foundUser);
      } else {
        setError('物理凭证校验失败：账号或密码错误');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(`故障：${err.message}`);
      setIsLoading(false);
    }
  };

  const selectRecent = async (recent: RecentLogin) => {
    setAccount(recent.account);
    if (recent.password) {
      setPassword(recent.password);
      setRemember(true);
      // 如果有密码，自动尝试登录
      setIsLoading(true);
      try {
        const res = await fetch('/api/users');
        if (res.ok) {
          const users: User[] = await res.json();
          const foundUser = users.find(u => u.account === recent.account && u.password === recent.password);
          if (foundUser) onLogin(foundUser);
          else {
            setError('凭证失效，请重新输入');
            setIsLoading(false);
          }
        }
      } catch (e) {
        setError('免密登录失败，请手动连接');
        setIsLoading(false);
      }
    } else {
      setPassword('');
      setRemember(false);
    }
  };

  return (
    <div className={`h-screen w-screen flex items-center justify-center p-6 transition-colors duration-700 ${isDark ? 'bg-[#020617]' : 'bg-slate-50'}`}>
      {/* 背景动态光影 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-500/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="w-full max-w-[1100px] flex flex-col md:flex-row gap-8 relative z-10 animate-in fade-in zoom-in-95 duration-1000">

        {/* 左侧：品牌与态势 */}
        <div className="hidden md:flex flex-col justify-between p-12 w-[450px]">
          <div>
            <div className="flex items-center gap-4 mb-10">
              <div className="w-16 h-16 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-[0_0_30px_rgba(14,165,233,0.4)]">
                <Zap size={32} fill="currentColor" />
              </div>
              <div>
                <h1 className={`text-4xl font-black tracking-tighter italic ${isDark ? 'text-white' : 'text-slate-900'}`}>MATRIX <span className="text-sky-500">DMS</span></h1>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] mt-2">Core Console Entry // V1.5.2</p>
              </div>
            </div>

            <div className="space-y-8 mt-20">
              <div className="flex items-start gap-5">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 shrink-0"><Server size={20} /></div>
                <div>
                  <h4 className={`text-sm font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>物理节点同步</h4>
                  <p className="text-[11px] text-slate-500 font-bold mt-1 leading-relaxed">正在监听: {serverConfig.ip}:{serverConfig.port}<br />加密协议: AES-256 GCM 工业级加密</p>
                </div>
              </div>
              <div className="flex items-start gap-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0"><Fingerprint size={20} /></div>
                <div>
                  <h4 className={`text-sm font-black ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>身份行为审计</h4>
                  <p className="text-[11px] text-slate-500 font-bold mt-1 leading-relaxed">每一项物理操作都将被精准固化至分布式审计日志中，确保链路可追溯性。</p>
                </div>
              </div>

              {/* 最近登录用户 - 免填入口 */}
              {recentLogins.length > 0 && (
                <div className="animate-in slide-in-from-top-4 duration-500">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><History size={12} /> 最近成功连接节点</p>
                  <div className="space-y-4">
                    {recentLogins.map((recent) => (
                      <button
                        key={recent.account}
                        onClick={() => selectRecent(recent)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border transition-all hover:scale-[1.02] text-left group ${isDark ? 'bg-white/5 border-white/5 hover:border-sky-500/50' : 'bg-slate-50 border-slate-100 hover:border-sky-500/30 shadow-sm'}`}
                      >
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-sky-500/10 border border-white/10 shrink-0">
                          {recent.avatar ? (
                            <img src={recent.avatar} className="w-full h-full object-cover" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-sky-500"><UserIcon size={24} /></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-[13px] font-black truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{recent.name}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">@{recent.account}</span>
                            {recent.password && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 opacity-40 grayscale group hover:grayscale-0 hover:opacity-100 transition-all duration-700">
            <Activity size={24} className="text-sky-500 animate-pulse" />
            <div className="h-px flex-1 bg-gradient-to-r from-sky-500/50 to-transparent"></div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">System Signal Optimized</span>
          </div>

          {/* [v8.6.1] 允许在客户端入口重新调起配置引导 (仅限本地 Electron 环境) */}
          <div className="mt-4 flex justify-start">
            <button
              onClick={() => {
                try {
                  const ipc = (window as any).require ? (window as any).require('electron').ipcRenderer : (window as any).electron?.ipcRenderer;
                  if (ipc) ipc.send('open-setup');
                } catch (e) { console.warn('Not in Electron environment'); }
              }}
              className={`text-[9px] font-black uppercase tracking-widest p-2 rounded-lg border transition-all ${isDark ? 'text-slate-600 border-white/5 hover:text-sky-500 hover:border-sky-500/30' : 'text-slate-400 border-slate-200 hover:text-sky-600 hover:border-sky-500/20'}`}
            >
              / 节点初始化配置
            </button>
          </div>
        </div>

        {/* 右侧：登录面板 */}
        <div className={`flex-1 rounded-[3.5rem] border p-12 lg:p-16 flex flex-col justify-center transition-all duration-700 ${isDark ? 'bg-slate-900/40 border-white/5 backdrop-blur-3xl' : 'bg-white border-slate-200 shadow-2xl shadow-slate-200'}`}>
          <div className="mb-12">
            <h2 className={`text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>信息发布平台登录</h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">Platform Login Interface</p>
          </div>



          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">鉴权账号 Account ID</label>
              <div className="relative group">
                <UserIcon size={18} className={`absolute left-5 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-slate-600 group-focus-within:text-sky-500' : 'text-slate-400 group-focus-within:text-sky-600'}`} />
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className={`w-full h-16 pl-14 pr-6 rounded-2xl border outline-none font-bold text-[14px] transition-all ${isDark ? 'bg-black/40 border-white/10 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600 shadow-inner'}`}
                  placeholder="请输入物理账号标识..."
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">访问凭证 Access Token</label>
              <div className="relative group">
                <Lock size={18} className={`absolute left-5 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-slate-600 group-focus-within:text-sky-500' : 'text-slate-400 group-focus-within:text-sky-600'}`} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full h-16 pl-14 pr-6 rounded-2xl border outline-none font-bold text-[14px] transition-all ${isDark ? 'bg-black/40 border-white/10 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600 shadow-inner'}`}
                  placeholder="请输入 6 位以上密码..."
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${remember ? 'bg-sky-500 border-sky-500 text-white' : isDark ? 'bg-black/40 border-white/10 group-hover:border-sky-500/50' : 'bg-white border-slate-200 group-hover:border-sky-500/50'}`}>
                  <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} className="hidden" />
                  {remember && <CheckCircle2 size={14} strokeWidth={3} />}
                </div>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-hover:text-sky-500 transition-colors">记住加密凭证</span>
              </label>
              <button type="button" className="text-[11px] font-black text-slate-500 uppercase tracking-widest hover:text-sky-500 transition-colors">忘记密码?</button>
            </div>

            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-500 animate-in shake duration-500">
                <Shield className="shrink-0" size={18} />
                <span className="text-[11px] font-black uppercase tracking-widest">{error}</span>
              </div>
            )}

            <button
              disabled={isLoading}
              className={`w-full h-16 mt-4 bg-sky-600 hover:bg-sky-500 text-white rounded-[1.5rem] font-black uppercase tracking-[0.3em] shadow-[0_20px_40px_rgba(14,165,233,0.3)] transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  登录连接中...
                </>
              ) : (
                <>
                  <Shield size={20} /> 登录连接 <ChevronRight size={20} />
                </>
              )}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-between opacity-30">
            <div className="flex gap-4">
              <div className="w-2 h-2 rounded-full bg-sky-500"></div>
              <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            </div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">Matrix Terminal Secured</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};
