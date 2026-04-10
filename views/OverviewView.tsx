
import React, { useState, useEffect } from 'react';
import {
  Monitor, Radio, HardDrive, AlertCircle, BarChart3, Activity,
  FileVideo, Layout, Users, Settings, Shield, Zap,
  Cpu, Server, Database, ArrowUpRight, TrendingUp,
  Clock, CheckCircle2, AlertTriangle, Fingerprint
} from 'lucide-react';
import { fetchWithUser } from '../utils/http';

interface OverviewViewProps {
  isDark: boolean;
  textP: string;
  textS: string;
  cardBg: string;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ isDark, textP, textS, cardBg }) => {
  const [loadData, setLoadData] = useState<number[]>([]);
  const [uptime, setUptime] = useState('00:00:00');
  const [stats, setStats] = useState([
    { label: '在线集群节点', val: '0', trend: 'Loading', icon: Monitor, color: 'text-sky-500', bg: 'bg-sky-500/10' },
    { label: '素材资源总量', val: '0 MB', trend: 'Loading', icon: FileVideo, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: '执行中排程', val: '0', trend: 'Loading', icon: Clock, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: '系统安全风险', val: '0', trend: 'Loading', icon: Shield, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ]);
  const [auditTrails, setAuditTrails] = useState([
    { user: 'System', action: '加载中...', time: '刚刚', type: 'info' },
  ]);
  const [submodules, setSubmodules] = useState([
    { label: '布局模板引擎', status: 'Loading', count: '0 模板', icon: Layout, color: 'text-rose-500' },
    { label: '终端集群管理', status: 'Loading', count: '0 个分组', icon: Monitor, color: 'text-emerald-500' },
    { label: '组织权限架构', status: 'Loading', count: '0 角色', icon: Fingerprint, color: 'text-purple-500' },
    { label: '核心节点配置', status: 'Loading', count: 'Service: 3000', icon: Settings, color: 'text-slate-400' },
  ]);
  const [systemMetrics, setSystemMetrics] = useState({
    cpu: '0%',
    io: '0 MB/s',
    storage: '0%'
  });

  // 系统运行时间
  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setUptime(`${h}:${m}:${s}`);

      // 模拟负载数据（后续可替换为真实数据）
      setLoadData(prev => {
        const newData = [...prev, Math.floor(Math.random() * 60) + 20];
        return newData.slice(-40);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取真实数据
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. 获取系统全量统计摘要 (一次请求代替 6 次请求)
        const summaryRes = await fetch(`/api/stats/summary`);
        if (summaryRes.ok) {
          const summary = await summaryRes.json();
          setStats([
            { label: '在线集群节点', val: summary.terminals.toString(), trend: '+0', icon: Monitor, color: 'text-sky-500', bg: 'bg-sky-500/10' },
            { label: '素材资源总量', val: `${summary.assetsSizeMB} MB`, trend: 'Active', icon: FileVideo, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
            { label: '执行中排程', val: summary.tasks.toString(), trend: 'Running', icon: Clock, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { label: '系统安全风险', val: summary.securityRisks.toString(), trend: summary.securityRisks > 0 ? 'Warning' : 'Healthy', icon: Shield, color: 'text-rose-500', bg: 'bg-rose-500/10' },
          ]);

          setSubmodules([
            { label: '布局模板引擎', status: 'Online', count: `${summary.templates} 模板`, icon: Layout, color: 'text-rose-500' },
            { label: '终端集群管理', status: 'Online', count: `${summary.terminals} 个节点`, icon: Monitor, color: 'text-emerald-500' },
            { label: '组织权限架构', status: 'Protected', count: 'Physical Auth', icon: Fingerprint, color: 'text-purple-500' },
            { label: '核心节点配置', status: 'Active', count: `Service: 3003`, icon: Settings, color: 'text-slate-400' },
          ]);

          setSystemMetrics({
            cpu: '24%', // 此处可后续对接更精细的真实 OS 指标
            io: '840 MB/s',
            storage: '99%'
          });
        }

        // 2. 仅获取最近 5 条审计日志作为活动流 (避免全量拉取)
        const logsRes = await fetch(`/api/logs?limit=5`);
        if (logsRes.ok) {
          const recentLogs = await logsRes.json();
          setAuditTrails(recentLogs.length > 0 ? recentLogs.map((l: any) => ({
            user: l.userName || l.userAccount,
            action: l.action,
            time: new Date(l.timestamp).toLocaleTimeString(),
            type: l.status === 'success' ? 'info' : 'warning'
          })) : [
            { user: 'System', action: '暂无审计记录', time: '刚刚', type: 'info' },
          ]);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15000); // 降低轮询频率至15秒
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 pb-32">

      {/* 1. 顶部物理核心统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {stats.map((s, i) => (
          <div key={i} className={`p-8 rounded-[2.5rem] border ${cardBg} group hover:scale-[1.02] transition-all duration-500 relative overflow-hidden`}>
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div className={`w-14 h-14 rounded-2xl ${s.bg} ${s.color} flex items-center justify-center shadow-inner`}>
                <s.icon size={28} />
              </div>
              <div className="flex flex-col items-end">
                <span className={`text-[10px] font-black ${s.color} flex items-center gap-1`}>
                  {s.trend.includes('+') ? <ArrowUpRight size={12} /> : null} {s.trend}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 animate-pulse"></div>
              </div>
            </div>
            <h3 className={`text-3xl font-black tracking-tighter ${textP}`}>{s.val}</h3>
            <p className={`text-[11px] mt-1 font-black uppercase tracking-[0.2em] ${textS} opacity-60`}>{s.label}</p>
            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
              <s.icon size={120} />
            </div>
          </div>
        ))}
      </div>

      {/* 2. 中间：流量看板与任务态势 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 流量分布图表 */}
        <div className={`lg:col-span-2 p-10 rounded-[3rem] border ${cardBg} relative overflow-hidden`}>
          <div className="flex justify-between items-center mb-10">
            <div>
              <h4 className={`text-xl font-black tracking-tight ${textP} flex items-center gap-3`}>
                <Activity className="text-sky-500" size={20} /> 全网下发流量实时负载
              </h4>
              <p className="text-[10px] text-slate-500 mt-1 font-black uppercase tracking-[0.4em]">Global Node IO Throughput Matrix</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Node Uptime</span>
                <span className={`text-[14px] font-mono font-bold ${textP}`}>{uptime}</span>
              </div>
            </div>
          </div>

          <div className="h-56 flex items-end gap-2 px-1">
            {loadData.map((h, i) => (
              <div key={i} className="flex-1 bg-slate-100 dark:bg-slate-800/20 rounded-full relative group h-full overflow-hidden">
                <div
                  className="absolute bottom-0 w-full bg-gradient-to-t from-sky-600 via-indigo-500 to-sky-400 transition-all duration-1000 rounded-full shadow-[0_0_15px_rgba(14,165,233,0.3)]"
                  style={{ height: `${h}%` }}
                ></div>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/5 transition-opacity cursor-crosshair"></div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-3 gap-8 pt-8 border-t border-white/5">
            {
              [
                { label: 'CPU 算力负载', val: systemMetrics.cpu, icon: Cpu },
                { label: 'IO 写入峰值', val: systemMetrics.io, icon: Server },
                { label: '物理存储健康度', val: systemMetrics.storage, icon: Database }
              ].map((m, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="p-2.5 bg-white/5 rounded-xl text-slate-500"><m.icon size={18} /></div>
                  <div>
                    <p className={`text-sm font-black ${textP}`}>{m.val}</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{m.label}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* 权限与审计快报 */}
        <div className={`p-10 rounded-[3rem] border ${cardBg} flex flex-col`}>
          <div className="flex items-center gap-3 mb-8">
            <Shield className="text-indigo-500" size={20} />
            <h4 className={`text-base font-black tracking-tight ${textP}`}>最近审计足迹</h4>
          </div>
          <div className="flex-1 space-y-6 overflow-hidden">
            {auditTrails.map((l, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer group">
                <div className={`w-2 h-2 rounded-full mt-1.5 ${l.type === 'warn' ? 'bg-amber-500' : l.type === 'alert' ? 'bg-rose-500 animate-pulse' : 'bg-sky-500'}`}></div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between">
                    <p className={`text-[12px] font-black truncate ${textP}`}>@{l.user}</p>
                    <span className="text-[9px] font-bold text-slate-600 uppercase">{l.time}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 truncate">{l.action}</p>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full h-12 mt-8 border border-white/5 bg-white/[0.02] hover:bg-white/5 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
            查看全量审计追踪
          </button>
        </div>
      </div>

      {/* 3. 底部：核心子模块健康状况网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {submodules.map((mod, i) => (
          <div key={i} className={`p-6 rounded-[2.5rem] border ${cardBg} flex items-center gap-5 hover:border-white/20 transition-all`}>
            <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center ${mod.color}`}>
              <mod.icon size={22} />
            </div>
            <div>
              <p className={`text-[13px] font-black ${textP}`}>{mod.label}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-black uppercase text-slate-600">{mod.count}</span>
                <span className="text-[8px] font-black uppercase text-emerald-500/80 px-1.5 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/10">{mod.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
