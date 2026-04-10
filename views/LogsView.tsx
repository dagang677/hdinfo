
import React, { useState, useEffect } from 'react';
import {
  Shield, Terminal, Search, Calendar, Filter,
  Download, Eye, ShieldCheck, ShieldAlert,
  User, Activity, Database, Clock, ArrowRight,
  ChevronDown, X, Info, FileText, HardDrive,
  Cpu, Lock, Fingerprint, RefreshCw
} from 'lucide-react';
import { fetchWithUser } from '../utils/http';

interface LogEntry {
  id: string;
  timestamp: string;
  userAccount: string;
  userName: string;
  action: string;
  module: 'assets' | 'templates' | 'terminals' | 'tasks' | 'system' | 'security';
  target: string;
  status: 'success' | 'failure';
  ip: string;
  details: string;
}

interface LogsViewProps {
  isDark: boolean;
  textP: string;
  textS: string;
  cardBg: string;
}

const MODULE_MAP = {
  assets: { label: '素材资源', color: 'text-sky-500', bg: 'bg-sky-500/10' },
  templates: { label: '布局模板', color: 'text-rose-500', bg: 'bg-rose-500/10' },
  terminals: { label: '终端集群', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  tasks: { label: '播控排程', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  system: { label: '核心配置', color: 'text-slate-500', bg: 'bg-slate-500/10' },
  security: { label: '身份鉴权', color: 'text-amber-500', bg: 'bg-amber-500/10' },
};

export const LogsView: React.FC<LogsViewProps> = ({ isDark, textP, textS, cardBg }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showDetail, setShowDetail] = useState<LogEntry | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageSize, setPageSize] = useState(20); // 初始显示20条

  const fetchLogs = async () => {
    console.log('Starting to fetch logs...');
    setIsRefreshing(true);
    try {
      const response = await fetchWithUser('/api/logs');
      console.log('Logs response status:', response.status);
      console.log('Logs response headers:', response.headers);

      if (response.ok) {
        const data = await response.json();
        console.log('Fetched logs data:', data);
        console.log('Number of logs:', data.length);
        setLogs(data);
        setFilteredLogs(data);
      } else {
        console.error('Failed to fetch logs:', response.statusText);
        const errorText = await response.text();
        console.error('Error response text:', errorText);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 从真实API获取日志数据
  useEffect(() => {
    console.log('useEffect: Calling fetchLogs...');
    fetchLogs();

    // 每30秒自动刷新一次日志
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, []);

  // 过滤逻辑
  useEffect(() => {
    let result = logs;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(l =>
        l.userAccount.toLowerCase().includes(term) ||
        l.action.toLowerCase().includes(term) ||
        l.target.toLowerCase().includes(term)
      );
    }

    if (selectedModule !== 'all') {
      result = result.filter(l => l.module === selectedModule);
    }

    if (selectedStatus !== 'all') {
      result = result.filter(l => l.status === selectedStatus);
    }

    if (dateRange.start) {
      result = result.filter(l => new Date(l.timestamp) >= new Date(dateRange.start));
    }

    if (dateRange.end) {
      result = result.filter(l => new Date(l.timestamp) <= new Date(dateRange.end));
    }

    setFilteredLogs(result);
  }, [searchTerm, selectedModule, selectedStatus, dateRange, logs]);

  const exportToCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = "ID,Timestamp,User,Action,Module,Target,Status,IP\n";
      const rows = filteredLogs.map(l =>
        `${l.id},${l.timestamp},${l.userAccount},${l.action},${l.module},${l.target},${l.status},${l.ip}`
      ).join("\n");

      const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `Matrix_Audit_Log_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsExporting(false);
    }, 1000);
  };

  // 敏感信息脱敏处理
  const maskIp = (ip: string) => {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.***.***`;
    }
    return ip;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-40">

      {/* 顶部统计面板 - 使用 Memo 优化避免重复计算 */}
      {(() => {
        const failureCount = logs.filter(l => l.status === 'failure').length;
        const uniqueUsers = new Set(logs.map(l => l.userAccount)).size;

        return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: '物理审计总量', val: logs.length, icon: Database, color: 'text-sky-500' },
              { label: '安全预警次数', val: failureCount, icon: ShieldAlert, color: 'text-rose-500' },
              { label: '活动节点用户', val: uniqueUsers, icon: User, color: 'text-emerald-500' },
              { label: '审计磁盘可用空间', val: '256 / 512 GB', icon: HardDrive, color: 'text-indigo-500' },
            ].map((s, i) => (
              <div key={i} className={`p-6 rounded-3xl border ${cardBg} transition-all hover:scale-[1.02]`}>
                <div className="flex justify-between items-center mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${s.color}`}>
                    <s.icon size={20} />
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></div>
                </div>
                <p className={`text-2xl font-black ${textP}`}>{s.val}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* 检索与过滤器 */}
      <div className={`p-8 rounded-[2.5rem] border ${cardBg} shadow-2xl space-y-8`}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center border border-sky-500/10"><Terminal size={24} /></div>
            <div>
              <h3 className={`text-xl font-black ${textP}`}>物理行为检索</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Matrix Audit Traversal Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchLogs} className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-slate-500 hover:text-sky-500 transition-all ${isRefreshing ? 'animate-spin' : ''}`}><RefreshCw size={20} /></button>
            <button onClick={exportToCSV} disabled={isExporting} className="h-12 px-8 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-sky-600/20 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50">
              {isExporting ? <RefreshCw size={18} className="animate-spin" /> : <Download size={18} />}
              导出物理固化日志
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="relative group">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-500 transition-colors" />
            <input
              type="text"
              placeholder="搜索账号/行为/对象..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-12 pl-12 pr-6 rounded-2xl border outline-none text-[12px] font-bold transition-all ${isDark ? 'bg-[#1e293b] text-white border-white/10 focus:border-sky-500/40 shadow-inner' : 'bg-slate-50 text-slate-900 border-slate-200 shadow-inner'}`}
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className={`flex-1 h-12 px-4 rounded-2xl border outline-none text-[12px] font-black uppercase tracking-widest cursor-pointer appearance-none transition-all ${isDark
                  ? 'bg-[#1e293b] border-white/10 text-slate-100 focus:border-sky-500 shadow-xl'
                  : 'bg-white border-slate-200 text-slate-900 focus:border-sky-500 shadow-sm'
                }`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
            >
              <option value="all" className={isDark ? "bg-[#1e293b] text-white" : "bg-white text-slate-900"}>全模块行为</option>
              {Object.entries(MODULE_MAP).map(([key, val]) => (
                <option key={key} value={key} className={isDark ? "bg-[#1e293b] text-white" : "bg-white text-slate-900"}>
                  {val.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className={`flex-1 h-12 px-4 rounded-2xl border outline-none text-[12px] font-bold transition-all ${isDark ? 'bg-[#1e293b] text-white border-white/10 focus:border-sky-500/40' : 'bg-slate-50 text-slate-900 border-slate-200'}`}
            />
            <ArrowRight size={14} className="text-slate-700" />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className={`flex-1 h-12 px-4 rounded-2xl border outline-none text-[12px] font-bold transition-all ${isDark ? 'bg-[#1e293b] text-white border-white/10 focus:border-sky-500/40' : 'bg-slate-50 text-slate-900 border-slate-200'}`}
            />
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={`flex-1 h-12 px-4 rounded-2xl border outline-none text-[12px] font-black uppercase tracking-widest cursor-pointer appearance-none transition-all ${isDark
                  ? 'bg-[#1e293b] border-white/10 text-slate-100 focus:border-sky-500 shadow-xl'
                  : 'bg-white border-slate-200 text-slate-900 focus:border-sky-500 shadow-sm'
                }`}
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
            >
              <option value="all" className={isDark ? "bg-[#1e293b] text-white" : "bg-white text-slate-900"}>全部执行状态</option>
              <option value="success" className={isDark ? "bg-[#1e293b] text-white" : "bg-white text-slate-900"}>SUCCESS (正常)</option>
              <option value="failure" className={isDark ? "bg-[#1e293b] text-white" : "bg-white text-slate-900"}>FAILURE (异常)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 日志数据表 */}
      <div className={`rounded-[2.5rem] border overflow-hidden ${cardBg} shadow-2xl`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">时间戳 (Physical)</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">物理账号</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">行为模块</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">执行行为</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">操作对象</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">结果</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">管理</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredLogs.slice(0, pageSize).map(log => (
              <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-8 py-5">
                  <div className="flex flex-col">
                    <span className={`text-[13px] font-bold ${textP}`}>{new Date(log.timestamp).toLocaleDateString()}</span>
                    <span className="text-[10px] font-mono text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-500">
                      <User size={14} />
                    </div>
                    <div className="flex flex-col leading-none">
                      <span className={`text-[13px] font-black ${textP}`}>{log.userName}</span>
                      <span className="text-[9px] font-bold text-slate-600 mt-1">@{log.userAccount}</span>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${MODULE_MAP[log.module].bg} ${MODULE_MAP[log.module].color}`}>
                    {MODULE_MAP[log.module].label}
                  </span>
                </td>
                <td className={`px-8 py-5 text-[13px] font-black ${textP}`}>{log.action}</td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2">
                    <Activity size={12} className="text-sky-500 opacity-50" />
                    <span className="text-[11px] font-mono font-bold text-slate-500">{log.target}</span>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${log.status === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {log.status === 'success' ? 'OK' : 'DENIED'}
                    </span>
                  </div>
                </td>
                <td className="px-8 py-5 text-right">
                  <button onClick={() => setShowDetail(log)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-sky-500 text-slate-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"><Eye size={16} /></button>
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center opacity-20">
                    <Filter size={48} className="mb-4" />
                    <p className="text-xl font-black italic tracking-[0.5em]">NULL_AUDIT_TRAVERSAL</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {filteredLogs.length > pageSize && (
          <div className="p-8 border-t border-white/5 text-center">
            <button
              onClick={() => setPageSize(prev => prev + 50)}
              className="px-10 py-4 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all border border-white/5"
            >
              加载更多物理轨迹 (Remaining: {filteredLogs.length - pageSize})
            </button>
          </div>
        )}
      </div>

      {/* 物理详情弹窗（脱敏预览） */}
      {showDetail && (
        <div className="fixed inset-0 z-[2000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className={`w-full max-w-2xl rounded-[3rem] border ${cardBg} shadow-2xl overflow-hidden`}>
            <div className="p-10 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner ${showDetail.status === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10' : 'bg-rose-500/10 text-rose-500 border-rose-500/10'}`}>
                  {showDetail.status === 'success' ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
                </div>
                <div>
                  <h3 className={`text-2xl font-black ${textP}`}>物理审计快照详情</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Audit Traceback Node: {showDetail.id}</p>
                </div>
              </div>
              <button onClick={() => setShowDetail(null)} className="text-slate-500 hover:text-rose-500 transition-all"><X size={28} /></button>
            </div>

            <div className="p-10 space-y-8">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Clock size={12} /> 操作时间</p>
                  <p className={`text-[15px] font-bold ${textP}`}>{new Date(showDetail.timestamp).toLocaleString()}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Lock size={12} /> 发起节点 IP</p>
                  <p className={`text-[15px] font-mono font-bold text-sky-500`}>{maskIp(showDetail.ip)}</p>
                </div>
              </div>

              <div className="space-y-3 p-6 rounded-2xl bg-white/[0.03] border border-white/5">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2"><FileText size={14} /> 原始数据载荷 Raw Payload</p>
                  <div className="px-3 py-1 bg-white/5 rounded text-[8px] font-black text-slate-500 uppercase">脱敏已启用</div>
                </div>
                <pre className={`text-[12px] font-mono p-4 rounded-xl bg-black/40 overflow-x-auto text-sky-400 leading-relaxed`}>
                  <code>{JSON.stringify(JSON.parse(showDetail.details), null, 2)}</code>
                </pre>
              </div>

              <div className="flex items-center gap-4 p-5 bg-sky-500/5 border border-sky-500/10 rounded-2xl">
                <div className="p-2.5 bg-sky-500/10 text-sky-500 rounded-xl"><Info size={20} /></div>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                  此审计记录已通过固件级签名验证，物理节点指纹：{showDetail.userAccount}_NODE_SIG_VERIFIED
                </p>
              </div>

              <button onClick={() => setShowDetail(null)} className="w-full h-16 bg-white/5 hover:bg-white text-slate-400 hover:text-slate-900 rounded-2xl font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 border border-white/5 shadow-xl"><Shield size={20} /> 确认并归档视察</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        ::-webkit-calendar-picker-indicator {
          filter: ${isDark ? 'invert(1)' : 'invert(0.5) sepia(1) saturate(5) hue-rotate(175deg)'};
          cursor: pointer;
        }
        select option {
          background-color: ${isDark ? '#1e293b' : '#ffffff'};
          color: ${isDark ? '#f8fafc' : '#0f172a'};
          padding: 10px;
        }
      `}</style>
    </div>
  );
};
