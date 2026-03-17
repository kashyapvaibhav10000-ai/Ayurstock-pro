'use client';

import React, { createContext, useContext } from 'react';
import { AuthUser, UserRole } from '@/types';

interface AuthContextType {
  user: AuthUser;
  isAdmin: boolean;
  isManager: boolean;
  isCashier: boolean;
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
  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'MANAGER';
  const isCashier = user.role === 'CASHIER';

  const hasRole = (roles: UserRole[]) => {
    return roles.includes(user.role);
  };

  const value = {
    user,
    isAdmin,
    isManager,
    isCashier,
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
