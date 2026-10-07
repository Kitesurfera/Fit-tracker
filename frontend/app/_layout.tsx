import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/hooks/useTheme';
import { StatusBar } from 'expo-status-bar';
import { syncManager } from '../src/offline'; // <-- Importar el syncManager
import { TrainerProvider } from '../src/context/TrainerContext';
import SyncStatusBanner, { subscribeToConnection } from '../src/components/SyncStatusBanner';
import { installWebAlert } from '../src/utils/webAlert';
import { registerServiceWorker } from '../src/utils/registerServiceWorker';

installWebAlert();

export default function RootLayout() {

  useEffect(() => {
    // 1. Intentar sincronizar al abrir la app
    syncManager.syncPendingActions();
    registerServiceWorker();

    // 2. Escuchar cambios de conexión (ej. sales de un túnel, vuelve el WiFi)
    const unsubscribe = subscribeToConnection(isOnline => {
      if (isOnline) {
        syncManager.syncPendingActions();
      }
    });

    return () => unsubscribe();
  }, []);


  return (
    <TrainerProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <View style={{ flex: 1 }}>
            <SyncStatusBanner />
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
          </View>
        </AuthProvider>
      </ThemeProvider>
    </TrainerProvider>
  );
}
