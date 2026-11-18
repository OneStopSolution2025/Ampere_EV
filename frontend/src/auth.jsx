import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadBusiness = useCallback(async () => {
    try { setBusiness(await api('/settings')); } catch { /* ignore */ }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ab_token');
    setUser(null);
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    const token = localStorage.getItem('ab_token');
    if (!token) { setLoading(false); return () => window.removeEventListener('auth:logout', onLogout); }
    api('/auth/me')
      .then((u) => { setUser(u); return loadBusiness(); })
      .catch(() => localStorage.removeItem('ab_token'))
      .finally(() => setLoading(false));
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [loadBusiness]);

  const login = async (email, password) => {
    const { token, user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    localStorage.setItem('ab_token', token);
    setUser(u);
    loadBusiness();
    return u;
  };

  return (
    <AuthContext.Provider value={{ user, business, setBusiness, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
