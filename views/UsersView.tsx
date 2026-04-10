
import React, { useState, useEffect, useRef } from 'react';
import {
  UserPlus, Users, ShieldCheck, Lock, Edit3, Trash2,
  Plus, X, Save, Shield, Key, User as UserIcon,
  CheckCircle2, AlertCircle, Eye, EyeOff, ShieldAlert,
  Fingerprint, LayoutDashboard, FolderOpen, LayoutTemplate,
  Monitor, CalendarClock, FileText, Settings, Info, Camera,
  Upload
} from 'lucide-react';
import { fetchWithUser } from '../utils/http';
import { User, Role, Permission } from '../types';

const PERMISSIONS_LIST: { id: Permission; label: string; icon: any }[] = [
  { id: 'dashboard', label: '业务运营看板', icon: LayoutDashboard },
  { id: 'assets', label: '素材资源中心', icon: FolderOpen },
  { id: 'templates', label: '布局模板引擎', icon: LayoutTemplate },
  { id: 'terminals', label: '终端集群管理', icon: Monitor },
  { id: 'tasks', label: '播控排程中心', icon: CalendarClock },
  { id: 'logs', label: '审计与监控', icon: FileText },
  { id: 'users', label: '组织权限架构', icon: Users },
  { id: 'system-settings', label: '核心节点配置', icon: Settings },
];

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=150&h=150";

interface UsersViewProps {
  isDark: boolean;
  textP: string;
  textS: string;
  cardBg: string;
  currentUser: User;
  onUserUpdate: (user: User) => void;
  isLocked?: boolean;
}

export const UsersView: React.FC<UsersViewProps> = ({
  isDark, textP, textS, cardBg, currentUser, onUserUpdate, isLocked
}) => {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // --- Data Persistence (Migrated to Backend API) ---
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'profile'>(isLocked ? 'profile' : 'users');
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<any>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const licenseInputRef = useRef<HTMLInputElement>(null);

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ old: '', new: '', confirm: '' });

  // 核心修复：从后端拉取数据
  const fetchData = async () => {
    try {
      const [uRes, rRes, lRes] = await Promise.all([
        fetchWithUser('/api/users'),
        fetchWithUser('/api/roles'),
        fetchWithUser('/api/sys/license-status')
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (rRes.ok) setRoles(await rRes.json());
      if (lRes.ok) setLicenseStatus(await lRes.json());
    } catch (e) {
      console.error('Failed to sync users/roles from server');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 授权状态变动监视
  useEffect(() => {
    if (isLocked) setActiveTab('profile');
  }, [isLocked]);

  const triggerFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSaveRole = async () => {
    if (!editingRole?.name) return triggerFeedback('请输入角色名称', 'error');
    if (!editingRole.permissions || editingRole.permissions.length === 0) return triggerFeedback('请至少选择一个权限', 'error');

    const roleToSave = editingRole.id ? editingRole as Role : {
      ...editingRole,
      id: `role-${Date.now()}`
    } as Role;

    try {
      const res = await fetchWithUser('/api/roles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleToSave)
      });
      if (res.ok) {
        triggerFeedback(editingRole.id ? '权限组更新成功' : '新权限组已创建');
        fetchData();
      } else {
        const errorData = await res.json();
        triggerFeedback(errorData.error || '保存失败', 'error');
      }
    } catch (e) {
      triggerFeedback('保存失败，请检查网络连接', 'error');
    }
    setShowRoleModal(false);
    setEditingRole(null);
  };

  const deleteRole = async (id: string) => {
    if (users.some(u => u.roleId === id)) {
      return triggerFeedback('该权限组仍有用户关联，无法删除', 'error');
    }
    try {
      const res = await fetchWithUser(`/api/roles/delete?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        triggerFeedback('权限组已移除');
        fetchData();
      }
    } catch (e) {
      triggerFeedback('删除失败', 'error');
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser?.account || !editingUser?.roleId) {
      return triggerFeedback('请填写账号和权限组', 'error');
    }

    if (editingUser.id && editingUser.account === '000000') {
      return triggerFeedback('超级管理员不可编辑', 'error');
    }

    const userToSave = editingUser.id ? editingUser as User : {
      ...editingUser,
      id: `user-${Date.now()}`,
      name: editingUser.name || `NodeUser_${editingUser.account}`,
      password: '123456'
    } as User;

    try {
      const res = await fetchWithUser('/api/users/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userToSave)
      });
      if (res.ok) {
        triggerFeedback(editingUser.id ? '用户信息已同步' : '新用户已加入集群，初始密码 123456');
        if (currentUser.id === userToSave.id) onUserUpdate(userToSave);
        fetchData();
      } else {
        const errData = await res.json();
        triggerFeedback(errData.error || '同步失败', 'error');
      }
    } catch (e) {
      triggerFeedback('保存失败，请检查网络连接', 'error');
    }
    setShowUserModal(false);
    setEditingUser(null);
  };

  const deleteUser = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (user?.isSuper || user?.account === '000000') {
      return triggerFeedback('超级管理员不可删除', 'error');
    }
    try {
      const res = await fetchWithUser(`/api/users/delete?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        triggerFeedback('用户权限已物理注销');
        fetchData();
      }
    } catch (e) {
      triggerFeedback('删除失败', 'error');
    }
  };

  const changePassword = () => {
    if (passwordForm.new !== passwordForm.confirm) return triggerFeedback('两次输入的密码不一致', 'error');
    if (passwordForm.new.length < 6) return triggerFeedback('密码长度至少6位', 'error');

    const updatedUser = { ...currentUser, password: passwordForm.new };
    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));
    onUserUpdate(updatedUser);

    setShowPasswordModal(false);
    setPasswordForm({ old: '', new: '', confirm: '' });
    triggerFeedback('密码更新成功，请牢记新凭证');
  };

  const handleImportLicenseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('license', file);

    try {
      const res = await fetchWithUser('/api/sys/license-import', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        triggerFeedback('授权文件已物理对齐，系统热激活成功');
        fetchData();
        setShowLicenseModal(false);
        // 关键：派发全局事件，通知 App 组件刷新锁定状态
        window.dispatchEvent(new CustomEvent('matrix:license_updated'));
      } else {
        const err = await res.json();
        triggerFeedback(err.error || '授权导入失败', 'error');
      }
    } catch (e) {
      triggerFeedback('网络连接失败', 'error');
    }
    // 清空 input 方便下次选择
    if (e.target) e.target.value = '';
  };

  // 处理头像本地选择上传
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        return triggerFeedback('头像文件不能超过 2MB', 'error');
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const updatedUser = { ...currentUser, avatar: base64 };
        // 更新本地列表
        setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));
        // 同步全局状态
        onUserUpdate(updatedUser);
        triggerFeedback('头像已物理更新');
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-32">
      {feedback && (
        <div className={`fixed top-32 left-1/2 -translate-x-1/2 z-[2000] px-8 py-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-500 shadow-2xl border ${feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} backdrop-blur-3xl`}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-[12px] font-black uppercase tracking-widest">{feedback.msg}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-end gap-6">
        <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
          {!isLocked && (
            <>
              <button onClick={() => setActiveTab('users')} className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>用户管理</button>
              <button onClick={() => setActiveTab('roles')} className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'roles' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>权限组设置</button>
            </>
          )}
          <button onClick={() => setActiveTab('profile')} className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'profile' ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>个人中心 {isLocked && "// 授权救援"}</button>
        </div>
      </div>

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className={`text-lg font-black ${textP}`}>全量用户矩阵 ({users.length})</h3>
            <button onClick={() => { setEditingUser({ roleId: roles[0]?.id }); setShowUserModal(true); }} className="h-11 px-6 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2 transition-all active:scale-95"><UserPlus size={18} /> 新建登录用户</button>
          </div>

          <div className={`rounded-[2.5rem] border overflow-hidden ${cardBg}`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">物理账号 (ID)</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">用户姓名</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">权限组别</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">节点状态</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">管理操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${user.isSuper ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-sky-500/10 border-sky-500/20 text-sky-500'}`}>
                          {user.isSuper ? <ShieldAlert size={20} /> : <Fingerprint size={20} />}
                        </div>
                        <span className={`text-[14px] font-black font-mono ${textP}`}>{user.account}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-[14px] font-bold text-slate-400">{user.name}</td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1 bg-white/5 rounded-lg border border-white/5 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                        {roles.find(r => r.id === user.roleId)?.name || '未分配'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Node Active</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      {!user.isSuper && user.account !== '000000' ? (
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => { setEditingUser(user); setShowUserModal(true); }} className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-sky-500 text-slate-500 hover:text-white transition-all"><Edit3 size={16} /></button>
                          <button onClick={() => deleteUser(user.id)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-rose-500 text-slate-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <div className="w-9 h-9 flex items-center justify-center text-amber-500/40 cursor-not-allowed" title="内核账号：禁止外部干预">
                            <ShieldAlert size={16} />
                          </div>
                          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest italic opacity-40 flex items-center">Immune Node</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className={`text-lg font-black ${textP}`}>权限控制组矩阵 ({roles.length})</h3>
            <button onClick={() => { setEditingRole({ permissions: [] }); setShowRoleModal(true); }} className="h-11 px-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl flex items-center gap-2 transition-all active:scale-95"><ShieldCheck size={18} /> 新建权限组</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {roles.map(role => (
              <div key={role.id} className={`p-8 rounded-[2.5rem] border transition-all duration-500 ${cardBg} hover:scale-[1.02] hover:shadow-2xl group relative`}>
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20">
                    <Shield size={28} />
                  </div>
                  <div className="flex gap-2">
                    {role.id !== 'role-admin' ? (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setEditingRole(role); setShowRoleModal(true); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-sky-500 text-slate-500 hover:text-white transition-all"><Edit3 size={18} /></button>
                        <button onClick={() => deleteRole(role.id)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-rose-500 text-slate-500 hover:text-white transition-all"><Trash2 size={18} /></button>
                      </div>
                    ) : (
                      <div className="w-10 h-10 flex items-center justify-center text-slate-600 bg-white/5 rounded-xl border border-white/5 cursor-not-allowed" title="系统内置角色：不可修改">
                        <Lock size={18} />
                      </div>
                    )}
                  </div>
                </div>

                <h4 className={`text-xl font-black mb-2 flex items-center gap-3 ${textP}`}>
                  {role.name}
                  {role.id === 'role-admin' && <span className="px-2 py-0.5 bg-sky-500/10 text-sky-500 text-[9px] rounded-full uppercase tracking-tighter">System Default</span>}
                </h4>
                <div className="flex flex-wrap gap-2 mb-8">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {role.id === 'role-admin' ? '全域物理授权核心' : `${role.permissions.length} 级物理授权项`}
                  </span>
                </div>

                <div className="space-y-3 pt-6 border-t border-white/5">
                  {PERMISSIONS_LIST.map(p => (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${role.permissions.includes(p.id) ? 'bg-emerald-500' : 'bg-white/5'}`}></div>
                      <span className={`text-[11px] font-bold tracking-tight ${role.permissions.includes(p.id) ? 'text-slate-300' : 'text-slate-600'}`}>{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="max-w-2xl mx-auto space-y-10 py-10">
          <div className={`p-10 rounded-[3rem] border ${cardBg} text-center space-y-8 relative overflow-hidden`}>
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <UserIcon size={200} />
            </div>

            <div
              className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-tr from-sky-500 to-indigo-600 p-[3px] mx-auto shadow-2xl relative z-10 group cursor-pointer"
              onClick={() => avatarInputRef.current?.click()}
            >
              <div className="w-full h-full rounded-[2.25rem] bg-slate-900 flex items-center justify-center overflow-hidden border border-white/10 relative">
                <img
                  src={currentUser.avatar || DEFAULT_AVATAR}
                  alt="Avatar"
                  className="w-full h-full object-cover transition-all group-hover:scale-110 group-hover:opacity-40"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-white">
                  <Camera size={24} className="mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-widest">更换头像</span>
                </div>
              </div>
              <input
                type="file"
                ref={avatarInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleAvatarFileChange}
              />
            </div>

            <div>
              <h3 className={`text-2xl font-black tracking-tight ${textP}`}>{currentUser.name || currentUser.account}</h3>
              <p className="text-[10px] font-black text-sky-500 uppercase tracking-[0.4em] mt-2">Node Admin // {currentUser.account}</p>
            </div>

            <div className="flex items-center justify-center gap-6">
              <div className="px-6 py-2 bg-white/5 rounded-full border border-white/5 flex items-center gap-3">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">授权等级: {roles.find(r => r.id === currentUser.roleId)?.name}</span>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5 space-y-4">
              <button onClick={() => setShowPasswordModal(true)} className="h-14 px-10 bg-white/5 hover:bg-white text-slate-400 hover:text-slate-900 rounded-2xl text-[12px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-3 mx-auto border border-white/5 shadow-xl"><Key size={18} /> 安全凭证修改</button>

              {currentUser.isSuper && (
                <div className="mt-10 pt-10 border-t border-white/5 space-y-6">
                  <div className="flex justify-between items-center px-2">
                    <h4 className="text-[11px] font-black text-slate-600 uppercase tracking-widest">系统节点通信哈希 (METADATA)</h4>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${licenseStatus?.isValid ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{licenseStatus?.isValid ? 'Authorized' : 'Unauthorized'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5 text-left group hover:bg-white/[0.04] transition-all">
                      <p className="text-[9px] text-slate-500 uppercase font-black mb-2 tracking-widest">同步密钥 (Sync Key)</p>
                      <p className="text-[14px] font-mono font-bold text-sky-600 truncate">{licenseStatus?.metadataHint || '0x00000000...'}</p>
                    </div>
                    <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5 text-left group hover:bg-white/[0.04] transition-all">
                      <p className="text-[9px] text-slate-500 uppercase font-black mb-2 tracking-widest">节点配额 (Quota)</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-white">{licenseStatus?.boundCount || 0}</span>
                        <span className="text-[10px] font-black text-slate-500 uppercase">/ {licenseStatus?.quota || '--'} NTDS</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowLicenseModal(true)}
                    className="w-full h-14 bg-sky-500/5 hover:bg-sky-500 hover:text-white border border-sky-500/10 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3"
                  >
                    <Upload size={18} /> 更新物理授权节点证书 (.dat)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Modals --- */}

      {showRoleModal && editingRole && (
        <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className={`w-full max-w-2xl rounded-[3rem] border ${cardBg} shadow-2xl overflow-hidden`}>
            <div className="p-10 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className={`text-2xl font-black ${textP}`}>配置权限控制组</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Define IAM Permission Matrix</p>
              </div>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-500 hover:text-rose-500 transition-all"><X size={28} /></button>
            </div>
            <div className="p-10 space-y-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">权限组名称 Group Identity</label>
                <input type="text" value={editingRole.name || ''} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} className={`w-full h-14 px-6 rounded-2xl border outline-none font-bold transition-all ${isDark ? 'bg-white/5 border-white/10 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200 shadow-inner'}`} placeholder="如: 运营总监 / 技术支持" />
              </div>
              <div className="space-y-6">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">功能授权清单 Feature Access Control</label>
                <div className="grid grid-cols-2 gap-4">
                  {PERMISSIONS_LIST.map(p => (
                    <button key={p.id} onClick={() => {
                      const perms = new Set(editingRole.permissions || []);
                      if (perms.has(p.id)) perms.delete(p.id); else perms.add(p.id);
                      setEditingRole({ ...editingRole, permissions: Array.from(perms) });
                    }} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${editingRole.permissions?.includes(p.id) ? 'bg-purple-500/10 border-purple-500/40 text-purple-400' : 'bg-white/5 border-white/5 text-slate-600 hover:border-white/10'}`}>
                      <p.icon size={18} />
                      <span className="text-[12px] font-black uppercase tracking-tight">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSaveRole} className="w-full h-16 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3"><Save size={20} /> 固化权限组配置</button>
            </div>
          </div>
        </div>
      )}

      {showUserModal && editingUser && (
        <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className={`w-full max-w-lg rounded-[3rem] border ${cardBg} shadow-2xl overflow-hidden`}>
            <div className="p-10 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className={`text-2xl font-black ${textP}`}>{editingUser.id ? '编辑登录节点' : '接入新登录用户'}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">User Credential Provisioning</p>
              </div>
              <button onClick={() => setShowUserModal(false)} className="text-slate-500 hover:text-rose-500 transition-all"><X size={28} /></button>
            </div>
            <div className="p-10 space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">物理账号标识 Account (ID)</label>
                <input type="text" disabled={!!editingUser.id} value={editingUser.account || ''} onChange={(e) => setEditingUser({ ...editingUser, account: e.target.value })} className={`w-full h-14 px-6 rounded-2xl border outline-none font-mono font-bold transition-all ${isDark ? 'bg-white/5 border-white/10 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200'} disabled:opacity-40`} placeholder="如: admin01" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">用户显示姓名 (可选)</label>
                <input type="text" value={editingUser.name || ''} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} className={`w-full h-14 px-6 rounded-2xl border outline-none font-bold transition-all ${isDark ? 'bg-white/5 border-white/10 text-white focus:border-sky-500' : 'bg-slate-50 border-slate-200'}`} placeholder="留空则自动生成" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">归属权限控制组 Role Cluster</label>
                <select
                  value={editingUser.roleId || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, roleId: e.target.value })}
                  className={`w-full h-14 px-6 rounded-2xl border outline-none font-bold transition-all ${isDark
                    ? 'bg-[#0f172a] border-white/10 text-slate-100 focus:border-sky-500'
                    : 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                    } cursor-pointer appearance-none`}
                >
                  <option value="" disabled className={isDark ? "bg-[#0f172a] text-slate-400" : "bg-white text-slate-400"}>请选择权限组</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id} className={isDark ? "bg-[#1e293b] text-slate-100" : "bg-white text-slate-900"}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              {!editingUser.id && (
                <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-2xl flex items-center gap-3">
                  <Info size={16} className="text-sky-500" />
                  <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">初始密码: 123456</span>
                </div>
              )}
              <button onClick={handleSaveUser} className="w-full h-16 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-3"><Save size={20} /> 物理写入用户信息</button>
            </div>
          </div>
        </div>
      )}

      {showLicenseModal && (
        <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className={`w-full max-w-lg rounded-[3.5rem] border ${cardBg} shadow-2xl overflow-hidden`}>
            <div className="p-10 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className={`text-2xl font-black ${textP}`}>更新物理授权队</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Submit Security Data Payload</p>
              </div>
              <button onClick={() => setShowLicenseModal(false)} className="text-slate-500 hover:text-rose-500 transition-all"><X size={28} /></button>
            </div>
            <div className="p-10 space-y-8">
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-sky-500/20 rounded-[2.5rem] bg-sky-500/5 group hover:border-sky-500/40 transition-all">
                  <div className="w-20 h-20 rounded-3xl bg-sky-500/10 flex items-center justify-center text-sky-500 mb-6 group-hover:scale-110 transition-transform">
                    <FileText size={32} />
                  </div>
                  <h4 className="text-[14px] font-black text-white uppercase tracking-widest mb-2">选择物理授权证书</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-8">Select License (.dat) File</p>

                  <input
                    type="file"
                    ref={licenseInputRef}
                    className="hidden"
                    accept=".dat"
                    onChange={handleImportLicenseFile}
                  />

                  <button
                    onClick={() => licenseInputRef.current?.click()}
                    className="h-14 px-10 bg-sky-500 hover:bg-sky-400 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center gap-3"
                  >
                    <Upload size={18} /> 立即导入 .dat 文件
                  </button>
                </div>

                <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-4">
                  <Info size={18} className="text-amber-500 mt-1 flex-shrink-0" />
                  <p className="text-[10px] font-bold text-amber-500/80 leading-relaxed uppercase">
                    安全说明：系统不支持直接对授权队密文进行编辑。请直接导入由授权工具生成的原始二进制 .dat 数据队文件。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 1.5rem center; background-size: 1.25rem; }
      `}</style>
    </div>
  );
};
