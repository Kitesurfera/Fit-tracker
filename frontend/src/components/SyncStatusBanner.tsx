import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { syncManager } from '../offline';
import { useAuth } from '../context/AuthContext';

// En el navegador usamos los eventos estándar online/offline, que funcionan igual en Chrome y Safari
export function subscribeToConnection(onChange: (isOnline: boolean) => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const update = () => onChange(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }
  return NetInfo.addEventListener(state => onChange(state.isConnected !== false));
}

// Barra que solo aparece cuando no hay conexión o cuando quedan cambios por subir al servidor.
export default function SyncStatusBanner() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsubscribeNet = subscribeToConnection(setIsOnline);
    const unsubscribeSync = syncManager.subscribe(s => { setPendingCount(s.pendingCount); setSyncing(s.syncing); });
    syncManager.getPendingCount();
    return () => { unsubscribeNet(); unsubscribeSync(); };
  }, []);

  if (!user || (isOnline && pendingCount === 0)) return null;

  const pendingText = pendingCount === 1 ? '1 cambio pendiente de subir' : `${pendingCount} cambios pendientes de subir`;

  if (!isOnline) {
    return (
      <View style={[styles.bar, styles.offline, { paddingTop: insets.top + 8 }]} accessibilityRole="alert">
        <Ionicons name="cloud-offline-outline" size={18} color="#FFF" />
        <Text style={styles.text}>
          Sin conexión. Lo que guardes se quedará en este dispositivo y se subirá al volver la conexión.
          {pendingCount > 0 ? ` (${pendingText})` : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.bar, styles.pending, { paddingTop: insets.top + 8 }]} accessibilityRole="alert">
      <Ionicons name="cloud-upload-outline" size={18} color="#FFF" />
      <Text style={styles.text}>{pendingText}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => syncManager.syncPendingActions()}
        disabled={syncing}
        accessibilityRole="button"
        accessibilityLabel="Subir ahora los cambios pendientes"
      >
        {syncing ? <ActivityIndicator size="small" color="#1D4ED8" /> : <Text style={styles.buttonText}>Subir ahora</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  offline: { backgroundColor: '#B45309' },
  pending: { backgroundColor: '#1D4ED8' },
  text: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1 },
  button: { backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 96, alignItems: 'center' },
  buttonText: { color: '#1D4ED8', fontWeight: '800', fontSize: 14 },
});
