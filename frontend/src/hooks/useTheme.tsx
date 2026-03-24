import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeMode = 'light' | 'dark' | 'system';

// 1. Creamos el contexto (el "cerebro central")
const ThemeContext = createContext<any>(null);

// 2. Creamos el Proveedor que envolverá tu app
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemColorScheme = useColorScheme(); // 'light' o 'dark'
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  // Cargamos la preferencia guardada al abrir la app
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem('theme_preference');
        if (saved) setThemeMode(saved as ThemeMode);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, []);

  const updateTheme = async (mode: ThemeMode) => {
    setThemeMode(mode);
    await AsyncStorage.setItem('theme_preference', mode);
  };

  // El color real que se aplica
  const activeScheme = themeMode === 'system' ? systemColorScheme : themeMode;

  // Tus colores exactos
  const colors = {
    primary: '#2563eb', // Azul deportivo potente
    background: activeScheme === 'dark' ? '#0f172a' : '#f8fafc',
    surface: activeScheme === 'dark' ? '#1e293b' : '#ffffff',
    surfaceHighlight: activeScheme === 'dark' ? '#334155' : '#f1f5f9',
    textPrimary: activeScheme === 'dark' ? '#f8fafc' : '#0f172a',
    textSecondary: activeScheme === 'dark' ? '#94a3b8' : '#64748b',
    border: activeScheme === 'dark' ? '#334155' : '#e2e8f0',
    error: '#ef4444',
    success: '#10b981',
  };

  // Evita parpadeos de colores extraños mientras carga la memoria del teléfono
  if (!isLoaded) return null;

  return (
    <ThemeContext.Provider value={{ colors, themeMode, updateTheme, isDark: activeScheme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

// 3. Tu hook de siempre, pero ahora conectado al cerebro central
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe usarse dentro de un ThemeProvider');
  }
  return context;
};
