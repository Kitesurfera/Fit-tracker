import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme, ThemeMode } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
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

  const handleLogout = () => {
    Alert.alert('Cerrar sesion', 'Estas seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  // --- Notification toggle using simple TouchableOpacity instead of Switch ---
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Ajustes</Text>

          {/* Profile */}
          <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.profileAvatar, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.profileAvatarText, { color: colors.primary }]}>
                {(editingProfile ? profileName : user?.name)?.charAt(0)?.toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              {editingProfile ? (
                <View style={styles.editNameRow}>
                  <TextInput
                    testID="edit-name-input"
                    style={[styles.nameInput, { color: colors.textPrimary, borderColor: colors.primary, backgroundColor: colors.surfaceHighlight }]}
                    value={profileName} onChangeText={setProfileName} autoFocus
                  />
                  <TouchableOpacity testID="save-name-btn" onPress={handleSaveProfile}
                    style={[styles.iconBtn, { backgroundColor: colors.primary }]} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingProfile(false); setProfileName(user?.name || ''); }}
                    style={[styles.iconBtn, { backgroundColor: colors.surfaceHighlight }]}>
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity testID="edit-profile-btn" onPress={() => setEditingProfile(true)} style={styles.nameRow} activeOpacity={0.6}>
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
            </View>
          </View>

          {/* Notifications */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NOTIFICACIONES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <ToggleRow icon="notifications-outline" label="Notificaciones"
              value={settings.notifications_enabled}
              onToggle={(v: boolean) => updateSetting('notifications_enabled', v)} />
            <ToggleRow icon="barbell-outline" label="Entrenamientos"
              value={settings.notifications_workouts}
              onToggle={(v: boolean) => updateSetting('notifications_workouts', v)}
              disabled={!settings.notifications_enabled} />
            <ToggleRow icon="analytics-outline" label="Tests fisicos"
              value={settings.notifications_tests}
              onToggle={(v: boolean) => updateSetting('notifications_tests', v)}
              disabled={!settings.notifications_enabled} />
          </View>

          {/* Appearance */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APARIENCIA</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <TapRow icon="moon-outline" label="Tema" value={themeLabels[themeMode]} onPress={() => setShowThemeModal(true)} />
            <TapRow icon="language-outline" label="Idioma"
              value={settings.language === 'es' ? 'Espanol' : 'English'}
              onPress={() => updateSetting('language', settings.language === 'es' ? 'en' : 'es')} />
          </View>

          {/* Units */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>UNIDADES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <TapRow icon="speedometer-outline" label="Peso"
              value={settings.weight_unit === 'kg' ? 'Kilogramos (kg)' : 'Libras (lb)'}
              onPress={() => setShowUnitModal('weight')} />
            <TapRow icon="resize-outline" label="Altura"
              value={settings.height_unit === 'cm' ? 'Centimetros (cm)' : 'Pies (ft)'}
              onPress={() => setShowUnitModal('height')} />
          </View>

          {/* Security */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SEGURIDAD</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <TapRow icon="lock-closed-outline" label="Cambiar contraseña" onPress={() => setShowPasswordModal(true)} />
          </View>

          {/* Info */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>INFORMACION</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface }]}>
            <TapRow icon="information-circle-outline" label="Version" value="1.0.0" />
          </View>

          {/* Logout */}
          <View style={[styles.settingSection, { backgroundColor: colors.surface, marginTop: 24 }]}>
            <TapRow icon="log-out-outline" label="Cerrar sesion" onPress={handleLogout} danger />
          </View>
          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Theme Modal */}
      <Modal visible={showThemeModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowThemeModal(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar tema</Text>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                testID={`theme-${mode}`}
                style={[styles.modalOption, themeMode === mode && { backgroundColor: colors.primary + '12' }]}
                onPress={() => { setThemeMode(mode); setShowThemeModal(false); }}
                activeOpacity={0.6}
              >
                <Ionicons name={themeIcons[mode] as any} size={20} color={themeMode === mode ? colors.primary : colors.textSecondary} />
                <Text style={[styles.modalOptionText, { color: colors.textPrimary }, themeMode === mode && { color: colors.primary, fontWeight: '600' }]}>
                  {themeLabels[mode]}
                </Text>
                {themeMode === mode && <Ionicons name="checkmark" size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit Modal */}
      <Modal visible={showUnitModal !== null} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowUnitModal(null)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {showUnitModal === 'weight' ? 'Unidad de peso' : 'Unidad de altura'}
            </Text>
            {(showUnitModal === 'weight' ? [
              { key: 'kg', label: 'Kilogramos (kg)' }, { key: 'lb', label: 'Libras (lb)' },
            ] : [
              { key: 'cm', label: 'Centimetros (cm)' }, { key: 'ft', label: 'Pies (ft)' },
            ]).map(opt => {
              const settingKey = showUnitModal === 'weight' ? 'weight_unit' : 'height_unit';
              const isSelected = (settings as any)[settingKey] === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key} testID={`unit-${opt.key}`}
                  style={[styles.modalOption, isSelected && { backgroundColor: colors.primary + '12' }]}
                  onPress={() => { updateSetting(settingKey, opt.key); setShowUnitModal(null); }}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.modalOptionText, { color: colors.textPrimary }, isSelected && { color: colors.primary, fontWeight: '600' }]}>{opt.label}</Text>
                  {isSelected && <Ionicons name="checkmark" size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Password Modal */}
      <Modal visible={showPasswordModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowPasswordModal(false); setPasswordError(''); }}>
          <TouchableOpacity activeOpacity={1} style={[styles.passwordModal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Cambiar contraseña</Text>
            {[
              { label: 'ACTUAL', value: currentPassword, setter: setCurrentPassword, testID: 'current-password-input', placeholder: 'Contraseña actual' },
              { label: 'NUEVA', value: newPassword, setter: setNewPassword, testID: 'new-password-input', placeholder: 'Nueva contraseña' },
              { label: 'CONFIRMAR', value: confirmPassword, setter: setConfirmPassword, testID: 'confirm-password-input', placeholder: 'Confirmar contraseña' },
            ].map(f => (
              <View key={f.testID} style={styles.passwordField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                <TextInput testID={f.testID}
                  style={[styles.passwordInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  value={f.value} onChangeText={f.setter} secureTextEntry placeholder={f.placeholder} placeholderTextColor={colors.textSecondary} />
              </View>
            ))}
            {passwordError ? (
              <View style={[styles.errorBox, { backgroundColor: colors.error + '12' }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{passwordError}</Text>
              </View>
            ) : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]}
                onPress={() => { setShowPasswordModal(false); setPasswordError(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}>
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="change-password-submit" style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Cambiar</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  settingSection: { borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 0.5 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 15 },
  settingValue: { fontSize: 14 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Custom toggle (replaces Switch to avoid animation glitch)
  toggleTrack: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center' },
  toggleThumb: { width: 24, height: 24, borderRadius: 12 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 340, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 16 },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, marginBottom: 4 },
  modalOptionText: { fontSize: 16 },
  passwordModal: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 24 },
  passwordField: { marginBottom: 14, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  passwordInput: { borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1 },
  errorBox: { borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { fontSize: 13, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});
