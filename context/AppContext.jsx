import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getLocalPersonas, STATIC_DEMO } from '../lib/mockFallback';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((text, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  // 1. Initial hydration: Load personas and verify current session
  const fetchPersonasAndUser = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch all pre-seeded testing personas
      let personaList = [];
      try {
        const personasRes = await fetch('/api/auth/personas');
        if (personasRes.ok) {
          const personasData = await personasRes.json();
          personaList = personasData.personas || [];
        }
      } catch (e) {
        // Handled below with fallback
      }

      // If backend is unavailable (e.g. GitHub Pages static export), fallback to local mock personas
      if (!personaList || personaList.length === 0) {
        personaList = getLocalPersonas();
      }
      setPersonas(personaList);

      // Check for an existing verified HTTP-Only session cookie
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.authenticated && meData.user) {
            setCurrentUser(meData.user);
            localStorage.setItem('graveyard_active_user_id', meData.user.id);
            return;
          }
        }
      } catch (e) {
        // Handled below
      }

      // Static demo build only (no server): remember the chosen demo persona locally.
      const storedId = STATIC_DEMO && typeof window !== 'undefined' ? localStorage.getItem('graveyard_active_user_id') : null;
      if (storedId) {
        const existing = personaList.find(p => p.id === storedId);
        if (existing) {
          setCurrentUser(existing);
          return;
        }
      }

      // Guest / unauthenticated visitor by default
      setCurrentUser(null);
    } catch (err) {
      console.error('Error initializing authentication context:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonasAndUser();
  }, [fetchPersonasAndUser]);

  // 2. Standard Email/Password Login
  const login = async (email, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem('graveyard_active_user_id', data.user.id);
        addToast(`Authenticated as ${data.user.alias}`, 'success');
        return data.user;
      }
      const data = await res.json().catch(() => ({}));
      // The server answered (e.g. wrong password): never fake a login.
      throw Object.assign(new Error(data.error || 'Login failed'), { fromServer: true });
    } catch (err) {
      if (err.fromServer) throw err;
      if (!STATIC_DEMO) throw new Error('Could not reach the server. Check your connection and try again.');
      const allPersonas = personas.length > 0 ? personas : getLocalPersonas();
      const found = allPersonas.find(p => p.email.toLowerCase() === email.toLowerCase());
      if (found) {
        setCurrentUser(found);
        localStorage.setItem('graveyard_active_user_id', found.id);
        addToast(`Authenticated as ${found.alias} (Demo Mode)`, 'success');
        return found;
      }
      // Demo fallback user
      const demoUser = {
        id: `user-${Date.now()}`,
        email,
        alias: `Digger-${Math.floor(1000 + Math.random() * 9000)}`,
        credits: 500,
        reputation: 100,
        ghostStrikes: 0,
        banned: false
      };
      setCurrentUser(demoUser);
      localStorage.setItem('graveyard_active_user_id', demoUser.id);
      addToast(`Authenticated as ${demoUser.alias} (Demo Mode)`, 'success');
      return demoUser;
    }
  };

  // 3. Anonymous Account Registration
  const signup = async (email, password) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem('graveyard_active_user_id', data.user.id);
        addToast(`Account created! Assigned alias: ${data.user.alias} (+500 credits granted)`, 'success');
        return data.user;
      }
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.error || 'Signup failed'), { fromServer: true });
    } catch (err) {
      if (err.fromServer) throw err;
      if (!STATIC_DEMO) throw new Error('Could not reach the server. Check your connection and try again.');
      const newUser = {
        id: `user-${Date.now()}`,
        email,
        alias: `Digger-${Math.floor(1000 + Math.random() * 9000)}`,
        credits: 500,
        reputation: 100,
        ghostStrikes: 0,
        banned: false
      };
      setCurrentUser(newUser);
      localStorage.setItem('graveyard_active_user_id', newUser.id);
      addToast(`Account created! Assigned alias: ${newUser.alias} (+500 starter credits)`, 'success');
      return newUser;
    }
  };

  // 4. Secure Session Logout
  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout request error:', e);
    }
    setCurrentUser(null);
    localStorage.removeItem('graveyard_active_user_id');
    addToast('Logged out of session', 'info');
  };

  // 5. Seamless 1-Click Persona Switcher (Synchronizes Server Session Cookie or Local Demo)
  const switchPersona = async (userId) => {
    try {
      const res = await fetch('/api/auth/switch-persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem('graveyard_active_user_id', data.user.id);
        addToast(`Switched active persona to ${data.user.alias}`, 'success');
        return data.user;
      }
      const data = await res.json().catch(() => ({}));
      addToast(data.error || 'Could not switch persona', 'error');
      return null;
    } catch (err) {
      // Server unreachable (static demo build): handled in fallback below
    }

    if (!STATIC_DEMO) {
      addToast('Could not reach the server. Check your connection and try again.', 'error');
      return null;
    }
    const allPersonas = personas.length > 0 ? personas : getLocalPersonas();
    const target = allPersonas.find(p => p.id === userId);
    if (target) {
      setCurrentUser(target);
      localStorage.setItem('graveyard_active_user_id', target.id);
      addToast(`Switched active persona to ${target.alias}`, 'success');
      return target;
    }
  };

  // 6. Refresh user metrics (balance, reputation, strikes). If the server says the session is
  //    gone (signed out elsewhere, GitHub access revoked), drop the signed-in state here too.
  const refreshUser = useCallback(async () => {
    if (STATIC_DEMO) return;
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.authenticated && data.user) {
        setCurrentUser(data.user);
        return;
      }
      setCurrentUser(prev => {
        if (prev) addToast(data.message || 'You were signed out. Please sign in again.', 'info');
        return null;
      });
      localStorage.removeItem('graveyard_active_user_id');
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  }, [addToast]);

  // Re-check the session whenever the tab comes back into view.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshUser(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshUser]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        personas,
        loading,
        toasts,
        addToast,
        login,
        signup,
        logout,
        switchPersona,
        refreshUser
      }}
    >
      {children}
      {/* Toast Notification Container */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div
            key={t.id}
            className="toast-sketch"
            style={{
              borderLeftWidth: 4,
              borderLeftColor:
                t.type === 'error' ? 'var(--error)' : t.type === 'success' ? 'var(--success)' : 'var(--color-ink)'
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
