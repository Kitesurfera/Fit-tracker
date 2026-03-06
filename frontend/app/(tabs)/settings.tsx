import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, themeMode, setThemeMode } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();

  const [settings, setSettings] = useState({
    notifications_enabled: true,
    notifications_workouts: true,
    notifications_tests: true,
    weight_unit: 'kg',
    height_unit: 'cm',
    language: 'es',
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState<'weight' | 'height' | null>(null);

  useEffect(() => {
    if (params.strava === 'success') {
      Alert.alert("¡Conectado!", "Tus entrenamientos del Apple Watch ahora se sincronizarán.");
      router.setParams({ strava: undefined });
    }
    loadSettings();
  }, [params.strava]);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      if (s) setSettings(s);
    } catch (e) {
      console.log('Error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateSetting = async (key: string, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try { await api.updateSettings({ [key]: value }); } catch (e) { setSettings(settings); }
  };

  const handleConnectStrava = async () => {
    const clientID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
    const redirectURI = "https://fit-tracker-backend-rtx2.onrender.com/api/auth/strava/callback";
    const scope = "read,activity:read_all"; // PERMISO CRÍTICO PARA EL PULSO
    
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!clientID || !token) {
        Alert.alert("Error", "Falta configuración de cliente o sesión.");
        return;
      }
      const url = `https://www.strava.com/oauth/authorize?client_id=${clientID}&response_type=code&redirect_uri=${encodeURIComponent(redirectURI)}&scope=${scope}&state=${token}`;
      
      if (Platform.OS === 'web') {
        window.location.href = url;
      } else {
        // Para móvil nativo usarías Linking o WebBrowser, pero aquí mantenemos el flujo web PWA
        window.location.href = url;
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo iniciar la conexión con Strava.");
    }
  };

  const handleLogout = async () => {
    const confirm = Platform.OS === 'web' ? window.confirm('¿Cerrar sesión?') : true;
    if (confirm) {
      await logout();
      router.replace('/');
    }
  };

  const TapRow = ({ icon, label, value, onPress, danger }: any) => (
    <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onPress}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: danger ? colors.error + '15' : colors.surfaceHighlight }]}>
          <Ionicons name={icon} size={20} color={danger ? colors.error : colors.primary} />
        </View>
        <Text style={[styles.settingLabel, { color: danger ? colors.error : colors.textPrimary }]}>{label}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={{ color: colors.textSecondary, marginRight: 5 }}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );

  if (loading) return <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadSettings} tintColor={colors.primary} />}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Ajustes</Text>

        <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
            <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '700' }}>{user?.name?.charAt(0)}</Text>
          </View>
          <View>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{user?.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{user?.email}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>DISPOSITIVOS Y SALUD</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.stravaBtn} onPress={handleConnectStrava}>
            <Ionicons name="flash" size={20} color="#FFF" />
            <Text style={styles.stravaText}>SINCRONIZAR APPLE WATCH (STRAVA)</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>PREFERENCIAS</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TapRow icon="moon" label="Tema" value={themeMode} onPress={() => setShowThemeModal(true)} />
          <TapRow icon="speedometer" label="Unidad de Peso" value={settings.weight_unit} onPress={() => setShowUnitModal('weight')} />
          <TapRow icon="resize" label="Unidad de Altura" value={settings.height_unit} onPress={() => setShowUnitModal('height')} />
        </View>

        <Text style={styles.sectionTitle}>SESIÓN</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TapRow icon="log-out" label="Cerrar Sesión" onPress={handleLogout} danger />
        </View>
      </ScrollView>

      {/* Modales de selección */}
      <Modal visible={showThemeModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowThemeModal(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            {['light', 'dark', 'system'].map((m) => (
              <TouchableOpacity key={m} style={styles.modalOption} onPress={() => { setThemeMode(m as any); setShowThemeModal(false); }}>
                <Text style={{ color: colors.textPrimary, textTransform: 'capitalize' }}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  screenTitle: { fontSize: 28, fontWeight: '800', marginBottom: 25 },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 20, marginBottom: 30, gap: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 10, marginTop: 15, letterSpacing: 1 },
  section: { borderRadius: 15, overflow: 'hidden', marginBottom: 15 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 0.5 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  valueRow: { flexDirection: 'row', alignItems: 'center' },
  stravaBtn: { backgroundColor: '#FC6100', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  stravaText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 },
  modalContent: { borderRadius: 20, padding: 20 },
  modalOption: { padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' }
});
