
import { LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  section?: string;
}

export interface StorageInfo {
  used: string;
  total: string;
  percentage: number;
}

export type Permission =
  | 'dashboard'
  | 'assets'
  | 'templates'
  | 'terminals'
  | 'tasks'
  | 'logs'
  | 'users'
  | 'system-settings';

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
}

export interface User {
  id: string;
  account: string;
  name: string;
  roleId: string;
  password: string;
  isSuper?: boolean;
  avatar?: string;
  permissions?: Permission[];
}
