import { useState, useEffect, useCallback } from 'react';
import axios, { AxiosInstance } from 'axios';
import { AuthUser } from '@/types';

/**
 * Custom hook for API calls with automatic token injection
 */
export function useApi(): AxiosInstance {
  const [axiosInstance] = useState(() => {
    const instance = axios.create();

    // Add token to all requests
    instance.interceptors.request.use((config) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle token expiration
    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired, redirect to login
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );

    return instance;
  });

  return axiosInstance;
}

/**
 * Custom hook for current user info
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return { user, loading, logout };
}

/**
 * Custom hook for medicine search with debouncing
 */
export function useMedicineSearch(query: string, limit = 10) {
  const api = useApi();
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setMedicines([]);
      return;
    }

    setLoading(true);
    setError(null);

    const timeout = setTimeout(async () => {
      try {
        const response = await api.get('/api/medicines/search', {
          params: { query, limit },
        });

        if (response.data.success) {
          setMedicines(response.data.data);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeout);
  }, [query, limit, api]);

  return { medicines, loading, error };
}

/**
 * Custom hook for pagination
 */
export function usePagination(initialPage = 1, initialPageSize = 20) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const offset = (page - 1) * pageSize;

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    offset,
    goToFirstPage: () => setPage(1),
    goToNextPage: () => setPage((p) => p + 1),
    goToPreviousPage: () => setPage((p) => Math.max(1, p - 1)),
  };
}

/**
 * Custom hook for loading state management
 */
export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async <T extends (...args: any[]) => Promise<any>>(fn: T, ...args: any[]) => {
      try {
        setLoading(true);
        setError(null);
        const result = await fn(...args);
        return result;
      } catch (err: any) {
        const errorMessage = err.response?.data?.error || err.message;
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { loading, error, execute, clearError: () => setError(null) };
}

/**
 * Custom hook for session timeout (15 minutes)
 */
export function useSessionTimeout(timeoutMs = 15 * 60 * 1000) {
  const { logout } = useAuth();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let lastActivity = Date.now();

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      lastActivity = Date.now();

      timeoutId = setTimeout(() => {
        logout();
      }, timeoutMs);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    events.forEach((event) => {
      document.addEventListener(event, resetTimeout);
    });

    resetTimeout();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        document.removeEventListener(event, resetTimeout);
      });
    };
  }, [logout, timeoutMs]);
}
