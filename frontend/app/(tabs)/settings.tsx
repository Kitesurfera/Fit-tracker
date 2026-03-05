import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme, ThemeMode } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
// --- ESTA ES LA LÍNEA QUE FALTABA ---
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, themeMode, setThemeMode } = useTheme();
  const router = useRouter();

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

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      setSettings(s);
    } catch (e) {
      console.log('Load settings error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadSettings();
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

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPasswordError('Completa todos los campos'); return; }
    if (newPassword.length < 4) { setPasswordError('Min. 4 caracteres'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Las contraseñas no coinciden'); return; }
    setChangingPassword(true);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setShowPasswordModal(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      Alert.alert('Contraseña cambiada', 'Tu contraseña se ha actualizado');
    } catch (e: any) { setPasswordError(e.message || 'Error'); }
    finally { setChangingPassword(false); }
  };
  
  // --- FUNCIÓN DE STRAVA CORREGIDA ---
  const handleConnectStrava = async () => {
    try {
      const clientID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
      if (!clientID) {
        alert("Error: No se encuentra el EXPO_PUBLIC_STRAVA_CLIENT_ID en Vercel.");
        return;
      }

      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        alert("Error: Inicia sesión de nuevo para conectar.");
        return;
      }

      const redirectURI = "https://fit-tracker-backend-rtx2.onrender.com/api/auth/strava/callback";
      const url = `https://www.strava.com/oauth/authorize?client_id=${clientID}&response_type=code&redirect_uri=${encodeURIComponent(redirectURI)}&scope=read,activity:read_all&state=${token}`;
      
      console.log("Redirigiendo a Strava...");
      window.location.href = url;
    } catch (error) {
      console.error("Error al conectar con Strava:", error);
      alert("Fallo al conectar con Strava.");
    }
  };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm('¿Estás seguro de que quieres salir?');
      if (confirm) {
        await logout();
        router.replace('/');
      }
    } else {
      Alert.alert('Cerrar sesión', '¿Estás seguro de que quieres salir?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: async () => { 
          await logout(); 
          router.replace('/'); 
        }},
      ]);
    }
  };

  const ToggleRow = ({ icon, label, value, onToggle, disabled }: any) => (
    <TouchableOpacity
      style={[styles.settingItem, { borderBottomColor: colors.border }]}
      onPress={() => !disabled && onToggle(!value)}
      activeOpacity={disabled ? 1 : 0.6}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons name={icon} size={20} color={disabled ? colors.textSecondary : colors.primary} />
        </View>
        <Text style={[styles.settingLabel, { color: disabled ? colors.textSecondary : colors.textPrimary }]}>{label}</Text>
      </View>
      <View style={[
        styles.toggleTrack,
        { backgroundColor: value && !disabled ? colors.primary : colors.surfaceHighlight },
      ]}>
        <View style={[
          styles.toggleThumb,
          { backgroundColor: '#FFFFFF' },
          value && !disabled ? { transform: [{ translateX: 20 }] } : { transform: [{ translateX: 2 }] },
        ]} />
      </View>
    </TouchableOpacity>
  );

  const TapRow = ({ icon, label, value, onPress, danger }: any) => (
    <TouchableOpacity
      style={[styles.settingItem, { borderBottomColor: colors.border }]}
      onPress={onPress} activeOpacity={onPress ? 0.6 : 1} disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: danger ? colors.error + '15' : colors.surfaceHighlight }]}>
          <Ionicons name={icon} size={20} color={danger ? colors.error : colors.primary} />
        </View>
        <Text style={[styles.settingLabel, { color: danger ? colors.error : colors.textPrimary }]}>{label}</Text>
      </View>
      {value ? (
        <View style={styles.valueRow}>
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text>
          {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
        </View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      ) : null}
    </TouchableOpacity>
  );

  const themeLabels: Record<ThemeMode, string> = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };
  const themeIcons: Record<ThemeMode, string> = { system: 'phone-portrait-outline', light: 'sunny-outline', dark: 'moon-outline' };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        >
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Ajustes</Text>

          {/* Profile Card */}
          <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.profileAvatar, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.profileAvatarText, { color: colors.primary }]}>
                {(editingProfile ? profileName : user?.name)?.charAt(0)?.toUpperCase()}
              </Text>
            </View>
            <div style={styles.profileInfo}>
              {editingProfile ? (
                <View style={styles.editNameRow}>
                  <TextInput
                    style={[styles.nameInput, { color: colors.textPrimary, borderColor: colors.primary, backgroundColor: colors.surfaceHighlight }]}
                    value={profileName} onChangeText={setProfileName} autoFocus
                  />
                  <TouchableOpacity onPress={handleSaveProfile}
                    style={[styles.iconBtn, { backgroundColor: colors.primary }]} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingProfile(false); setProfileName(user?.name || ''); }}
                    style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setEditingProfile(true)} style={styles.nameRow} activeOpacity={0.6}>
                  <Text style={[styles.profileName, { color: colors.textPrimary }]}>{user?.name}</Text>
                  <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              )}
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
              <View style={[styles.roleBadge, { backgroundColor: user?.role === 'trainer' ? colors.primary + '15' : colors.accent + '15' }]}>
                <Text style={[styles.roleText, { color: user?.role === 'trainer' ? colors.primary : colors.accent }]}>
                  {user?.role === 'trainer' ? 'ENTRENADOR' : 'DEPORTISTA'}
                </Text>
              </View>
            </div>
          </View>

          {/* Integraciones */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>INTEGRACIONES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface, padding: 14 }]}>
             <TouchableOpacity 
              style={{ backgroundColor: '#FC6100', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              onPress={handleConnectStrava}
            >
              <Ionicons name="flash" size={20} color="#FFF" style={{ marginRight: 10 }} />
              <Text style={{ color: '#FFF', fontWeight: '800' }}>CONECTAR CON STRAVA</Text>
            </TouchableOpacity>
          </View>

          {/* Notifications */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NOTIFICACIONES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <ToggleRow icon="notifications-outline" label="Notificaciones"
              value={settings.notifications_enabled}
              onToggle={(v: boolean) => updateSetting('notifications_enabled', v)} />
          </View>

          <View style={[styles.settingSection, { backgroundColor: colors.surface, marginTop: 24 }]}>
            <TapRow icon="log-out-outline" label="Cerrar sesión" onPress={handleLogout} danger />
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  screenTitle: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  profileCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, marginBottom: 28 },
  profileAvatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 22, fontWeight: '700' },
  profileInfo: { marginLeft: 14, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profileName: { fontSize: 17, fontWeight: '600' },
  profileEmail: { fontSize: 13, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 8 },
  roleText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameInput: { flex: 1, borderRadius: 8, padding: 10, fontSize: 16, borderWidth: 1.5 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 10 },
  settingSection: { borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 15 },
  settingValue: { fontSize: 14 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggleTrack: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center' },
  toggleThumb: { width: 24, height: 24, borderRadius: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
});
