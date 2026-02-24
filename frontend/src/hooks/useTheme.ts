import { useColorScheme } from 'react-native';

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

export function useTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  return { colors, isDark };
}
