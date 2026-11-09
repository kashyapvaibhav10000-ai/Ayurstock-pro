'use client';

import React, { createContext, useContext, useEffect } from 'react';
import axios from 'axios';
import { AuthUser, UserRole } from '@/types';

interface AuthContextType {
  user: AuthUser;
  isAdmin: boolean;
  isManager: boolean;
  isCashier: boolean;
  isSuperAdmin: boolean;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ 
  children, 
  user 
}: { 
  children: React.ReactNode; 
  user: AuthUser;
}) {
  // Session watch: if an admin logs this user out (or deactivates them), the
  // check returns 401 and the global axios handler sends them to /login.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void axios.get('/api/auth/session').catch(() => {});
    };
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'MANAGER';
  const isCashier = user.role === 'CASHIER';
  const isSuperAdmin = Boolean(user.isSuperAdmin);

  const hasRole = (roles: UserRole[]) => {
    return roles.includes(user.role);
  };

  const value = {
    user,
    isAdmin,
    isManager,
    isCashier,
    isSuperAdmin,
    hasRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
