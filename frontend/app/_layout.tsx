import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/hooks/useTheme';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import { syncManager } from '../src/offline'; // <-- Importar el syncManager

export default function RootLayout() {

  useEffect(() => {
    // 1. Intentar sincronizar al abrir la app
    syncManager.syncPendingActions();

    // 2. Escuchar cambios de conexión (ej. sales de un túnel, vuelve el WiFi)
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        syncManager.syncPendingActions();
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add-workout" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-test" options={{ presentation: 'modal' }} />
          <Stack.Screen name="athlete-detail" options={{ presentation: 'card' }} />
          <Stack.Screen name="add-athlete" options={{ presentation: 'modal' }} />
          <Stack.Screen name="training-mode" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="edit-workout" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}
