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
import { useTheme, ThemeMode } from '../../src/hooks/useTheme';
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
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [showUnitModal, setShowUnitModal] = useState<'weight' | 'height' | null>(null);
  const [showThemeModal, setShowThemeModal] = useState(false);

  useEffect(() => {
    if (params.strava === 'success') {
      Alert.alert("¡Éxito!", "Tu Apple Watch se ha vinculado correctamente.");
      router.setParams({ strava: undefined });
    }
    loadSettings();
  }, [params.strava]);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      if (s) setSettings(s);
    } catch (e) {
      console.log('Load settings error:', e);
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

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setSaving(true);
    try {
      await api.updateProfile({ name: profileName.trim() });
      setEditingProfile(false);
      Alert.alert('Perfil actualizado', 'Tu nombre se ha actualizado correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo actualizar');
    } finally { setSaving(false); }
  };

  const handleConnectStrava = async () => {
    const clientID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
    const redirectURI = "https://fit-tracker-backend-rtx2.onrender.com/api/auth/strava/callback";
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!clientID || !token) {
        Alert.alert("Error", "Faltan credenciales de acceso.");
        return;
      }
      const url = `https://www.strava.com/oauth/authorize?client_id=${clientID}&response_type=code&redirect_uri=${encodeURIComponent(redirectURI)}&scope=read,activity:read_all&state=${token}`;
      window.location.href = url;
    } catch (e) {
      Alert.alert("Error", "No se pudo iniciar la conexión.");
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPasswordError('Completa todos los campos'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Las contraseñas no coinciden'); return; }
    setChangingPassword(true);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setShowPasswordModal(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Éxito', 'Contraseña actualizada');
    } catch (e: any) { setPasswordError(e.message || 'Error'); }
    finally { setChangingPassword(false); }
  };

  const handleLogout = async () => {
    const confirm = Platform.OS === 'web' ? window.confirm('¿Salir?') : true;
    if (confirm) { await logout(); router.replace('/'); }
  };

  // Componentes auxiliares de filas
  const ToggleRow = ({ icon, label, value, onToggle, disabled }: any) => (
    <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={() => !disabled && onToggle(!value)} activeOpacity={0.6}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons name={icon} size={20} color={disabled ? colors.textSecondary : colors.primary} />
        </View>
        <Text style={[styles.settingLabel, { color: disabled ? colors.textSecondary : colors.textPrimary }]}>{label}</Text>
      </View>
      <View style={[styles.toggleTrack, { backgroundColor: value && !disabled ? colors.primary : colors.surfaceHighlight }]}>
        <View style={[styles.toggleThumb, value && !disabled ? { transform: [{ translateX: 20 }] } : { transform: [{ translateX: 2 }] }]} />
      </View>
    </TouchableOpacity>
  );

  const TapRow = ({ icon, label, value, onPress, danger }: any) => (
    <TouchableOpacity style={[styles.settingItem, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.6}>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadSettings} tintColor={colors.primary} />}>
          
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Ajustes</Text>

          {/* PERFIL */}
          <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.profileAvatar, { backgroundColor: colors.primary + '15' }]}>
              <Text style={{ color: colors.primary, fontSize: 22, fontWeight: '700' }}>{user?.name?.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              {editingProfile ? (
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  <TextInput style={[styles.nameInput, { color: colors.textPrimary, borderColor: colors.primary }]} value={profileName} onChangeText={setProfileName} autoFocus />
                  <TouchableOpacity onPress={handleSaveProfile} style={styles.iconBtn}><Ionicons name="checkmark" size={20} color={colors.primary} /></TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setEditingProfile(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={[styles.profileName, { color: colors.textPrimary }]}>{user?.name}</Text>
                  <Ionicons name="pencil" size={14} color={colors.primary} />
                </TouchableOpacity>
              )}
              <Text style={{ color: colors.textSecondary }}>{user?.email}</Text>
            </View>
          </View>

          {/* INTEGRACIONES */}
          <Text style={styles.sectionTitle}>INTEGRACIONES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface, padding: 15 }]}>
            <TouchableOpacity style={styles.stravaBtn} onPress={handleConnectStrava}>
              <Ionicons name="flash" size={20} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '800' }}>CONECTAR CON STRAVA</Text>
            </TouchableOpacity>
          </View>

          {/* NOTIFICACIONES */}
          <Text style={styles.sectionTitle}>NOTIFICACIONES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <ToggleRow icon="notifications" label="Activar" value={settings.notifications_enabled} onToggle={(v: boolean) => updateSetting('notifications_enabled', v)} />
            <ToggleRow icon="barbell" label="Entrenos" value={settings.notifications_workouts} onToggle={(v: boolean) => updateSetting('notifications_workouts', v)} disabled={!settings.notifications_enabled} />
          </View>

          {/* UNIDADES Y APARIENCIA */}
          <Text style={styles.sectionTitle}>PREFERENCIAS</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <TapRow icon="moon" label="Tema" value={themeMode} onPress={() => setShowThemeModal(true)} />
            <TapRow icon="speedometer" label="Peso" value={settings.weight_unit} onPress={() => setShowUnitModal('weight')} />
            <TapRow icon="resize" label="Altura" value={settings.height_unit} onPress={() => setShowUnitModal('height')} />
          </View>

          {/* SEGURIDAD */}
          <Text style={styles.sectionTitle}>SEGURIDAD</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <TapRow icon="lock-closed" label="Cambiar Contraseña" onPress={() => setShowPasswordModal(true)} />
            <TapRow icon="log-out" label="Cerrar Sesión" onPress={handleLogout} danger />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODALES (Theme & Units) */}
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

      <Modal visible={showUnitModal !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowUnitModal(null)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Unidades</Text>
            {(showUnitModal === 'weight' ? ['kg', 'lb'] : ['cm', 'ft']).map(u => (
              <TouchableOpacity key={u} style={styles.modalOption} onPress={() => { updateSetting(showUnitModal === 'weight' ? 'weight_unit' : 'height_unit', u); setShowUnitModal(null); }}>
                <Text style={{ color: colors.textPrimary }}>{u.toUpperCase()}</Text>
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
  scrollContent: { padding: 20, paddingBottom: 50 },
  screenTitle: { fontSize: 28, fontWeight: '800', marginBottom: 25 },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 15, marginBottom: 20 },
  profileAvatar: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  profileName: { fontSize: 18, fontWeight: '700' },
  nameInput: { borderBottomWidth: 1, flex: 1, fontSize: 16 },
  iconBtn: { padding: 5 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 10, marginTop: 15, letterSpacing: 1 },
  settingSection: { borderRadius: 15, overflow: 'hidden', marginBottom: 15 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 0.5 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  valueRow: { flexDirection: 'row', alignItems: 'center' },
  toggleTrack: { width: 46, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  stravaBtn: { backgroundColor: '#FC6100', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 40 },
  modalContent: { borderRadius: 20, padding: 20 },
  modalOption: { padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  modalTitle: { fontWeight: '800', marginBottom: 15, textAlign: 'center' }
});
