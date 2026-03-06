import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  email: string;
  name: string;
  role: 'trainer' | 'athlete';
  gender?: string;
  is_injured?: boolean;
  injury_notes?: string;
  equipment?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void; // Mejora para actualizar perfil sin re-loguear
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredData();
  }, []);

  // CARGA OPTIMISTA: Lee del disco y luego valida
  const loadStoredData = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('auth_token');
      const savedUser = await AsyncStorage.getItem('user_data');

      if (savedToken && savedUser) {
        // Seteamos lo que tenemos en memoria para que la app arranque ya
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        
        // Validamos el token en segundo plano (silenciosamente)
        validateToken(savedToken);
      }
    } catch (e) {
      console.log('Error cargando datos locales:', e);
    } finally {
      // Importante: quitamos el loading para que no se quede la rueda girando
      setLoading(false);
    }
  };

  const validateToken = async (t: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${t}` },
      });
      if (!res.ok) {
        // Si el token expiró, limpiamos y mandamos al login
        logout();
      } else {
        const freshUserData = await res.json();
        setUser(freshUserData);
        await AsyncStorage.setItem('user_data', JSON.stringify(freshUserData));
      }
    } catch (e) {
      console.log('Error validando sesión (posiblemente offline):', e);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Error al iniciar sesión');
    }

    const data = await res.json();
    
    // Guardamos TODO antes de actualizar el estado
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('user_data', JSON.stringify(data.user));
    
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role: 'trainer' }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Error en el registro');
    }

    const data = await res.json();
    
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('user_data', JSON.stringify(data.user));
    
    setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(['auth_token', 'user_data']);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
    setToken(null);
    setUser(null);
  };

  // Función extra para que los cambios en Settings se vean al instante
  const updateUser = (data: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...data };
      setUser(updated);
      AsyncStorage.setItem('user_data', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
