import { useColorScheme } from 'react-native';
import { useState, useEffect, createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const lightColors = {
  background: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceHighlight: '#E5E5EA',
  textPrimary: '#1C1C1E',
  textSecondary: '#8E8E93',
  primary: '#007AFF',
  accent: '#FF3B30',
  border: '#D1D1D6',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  chartGrid: '#E5E5EA',
};

const darkColors = {
  background: '#000000',
  surface: '#1C1C1E',
  surfaceHighlight: '#2C2C2E',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  primary: '#0A84FF',
  accent: '#FF453A',
  border: '#38383A',
  success: '#32D74B',
  warning: '#FF9F0A',
  error: '#FF453A',
  chartGrid: '#2C2C2E',
};

export type ThemeColors = typeof lightColors;
export type ThemeMode = 'system' | 'light' | 'dark';

let _globalThemeMode: ThemeMode = 'system';
let _globalListener: ((mode: ThemeMode) => void) | null = null;

export function useTheme() {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(_globalThemeMode);

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        _globalThemeMode = saved;
        setThemeMode(saved);
      }
    });
    _globalListener = setThemeMode;
    return () => { _globalListener = null; };
  }, []);

  const setMode = async (mode: ThemeMode) => {
    _globalThemeMode = mode;
    setThemeMode(mode);
    await AsyncStorage.setItem('theme_mode', mode);
  };

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;

  return { colors, isDark, themeMode, setThemeMode: setMode };
}
