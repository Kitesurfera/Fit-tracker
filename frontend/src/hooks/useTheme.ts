import { useState, useEffect } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useTheme = () => {
  const systemColorScheme = useColorScheme(); // 'light' o 'dark'
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    const saved = await AsyncStorage.getItem('theme_preference');
    if (saved) setThemeMode(saved as any);
  };

  const updateTheme = async (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    await AsyncStorage.setItem('theme_preference', mode);
  };

  // El color real que se aplica
  const activeScheme = themeMode === 'system' ? systemColorScheme : themeMode;

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

  return { colors, themeMode, updateTheme, isDark: activeScheme === 'dark' };
};
