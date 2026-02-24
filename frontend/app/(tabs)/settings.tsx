import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  Switch, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  // Settings state
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

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Unit selector state
  const [showUnitModal, setShowUnitModal] = useState<'weight' | 'height' | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

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
    try {
      await api.updateSettings({ [key]: value });
    } catch (e) {
      console.log('Update setting error:', e);
      setSettings(settings); // revert
    }
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
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Completa todos los campos');
      return;
    }
    if (newPassword.length < 4) {
      setPasswordError('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden');
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Contraseña cambiada', 'Tu contraseña se ha actualizado correctamente');
    } catch (e: any) {
      setPasswordError(e.message || 'Error al cambiar contraseña');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesion', 'Estas seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  const SwitchRow = ({ icon, label, value, onValueChange, disabled }: any) => (
    <View style={[styles.settingItem, { borderBottomColor: colors.border }]}>
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceHighlight, true: colors.primary + '60' }}
        thumbColor={value ? colors.primary : colors.textSecondary}
        disabled={disabled}
      />
    </View>
  );

  const TapRow = ({ icon, label, value, onPress, danger }: any) => (
    <TouchableOpacity
      style={[styles.settingItem, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
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
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  );

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

          {/* Profile Section */}
          <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.profileAvatar, { backgroundColor: colors.primary + '20' }]}>
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
                    value={profileName}
                    onChangeText={setProfileName}
                    autoFocus
                  />
                  <TouchableOpacity
                    testID="save-name-btn"
                    onPress={handleSaveProfile}
                    style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                    disabled={saving}
                  >
                    {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                      <Ionicons name="checkmark" size={20} color="#FFF" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setEditingProfile(false); setProfileName(user?.name || ''); }}
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  testID="edit-profile-btn"
                  onPress={() => setEditingProfile(true)}
                  style={styles.nameRow}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.profileName, { color: colors.textPrimary }]}>{user?.name}</Text>
                  <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
              <View style={[styles.roleBadge, { backgroundColor: user?.role === 'trainer' ? colors.primary + '20' : colors.accent + '20' }]}>
                <Text style={[styles.roleText, { color: user?.role === 'trainer' ? colors.primary : colors.accent }]}>
                  {user?.role === 'trainer' ? 'ENTRENADOR' : 'DEPORTISTA'}
                </Text>
              </View>
            </View>
          </View>

          {/* Notifications */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>NOTIFICACIONES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SwitchRow
              icon="notifications-outline"
              label="Notificaciones"
              value={settings.notifications_enabled}
              onValueChange={(v: boolean) => updateSetting('notifications_enabled', v)}
            />
            <SwitchRow
              icon="barbell-outline"
              label="Entrenamientos"
              value={settings.notifications_workouts}
              onValueChange={(v: boolean) => updateSetting('notifications_workouts', v)}
              disabled={!settings.notifications_enabled}
            />
            <SwitchRow
              icon="analytics-outline"
              label="Tests fisicos"
              value={settings.notifications_tests}
              onValueChange={(v: boolean) => updateSetting('notifications_tests', v)}
              disabled={!settings.notifications_enabled}
            />
          </View>

          {/* Units */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>UNIDADES</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TapRow
              icon="speedometer-outline"
              label="Peso"
              value={settings.weight_unit === 'kg' ? 'Kilogramos (kg)' : 'Libras (lb)'}
              onPress={() => setShowUnitModal('weight')}
            />
            <TapRow
              icon="resize-outline"
              label="Altura"
              value={settings.height_unit === 'cm' ? 'Centimetros (cm)' : 'Pies (ft)'}
              onPress={() => setShowUnitModal('height')}
            />
          </View>

          {/* Appearance & Language */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>APARIENCIA</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TapRow
              icon="moon-outline"
              label="Tema"
              value={isDark ? 'Oscuro (sistema)' : 'Claro (sistema)'}
            />
            <TapRow
              icon="language-outline"
              label="Idioma"
              value={settings.language === 'es' ? 'Espanol' : 'English'}
              onPress={() => updateSetting('language', settings.language === 'es' ? 'en' : 'es')}
            />
          </View>

          {/* Security */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SEGURIDAD</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TapRow
              icon="lock-closed-outline"
              label="Cambiar contraseña"
              onPress={() => setShowPasswordModal(true)}
            />
          </View>

          {/* Info */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>INFORMACION</Text>
          <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TapRow icon="information-circle-outline" label="Version" value="1.0.0" />
          </View>

          {/* Logout */}
          <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 24 }]}>
            <TapRow icon="log-out-outline" label="Cerrar sesion" onPress={handleLogout} danger />
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Unit Selector Modal */}
      <Modal visible={showUnitModal !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUnitModal(null)}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {showUnitModal === 'weight' ? 'Unidad de peso' : 'Unidad de altura'}
            </Text>
            {showUnitModal === 'weight' ? (
              <>
                <TouchableOpacity
                  testID="unit-kg"
                  style={[styles.modalOption, settings.weight_unit === 'kg' && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => { updateSetting('weight_unit', 'kg'); setShowUnitModal(null); }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.textPrimary }]}>Kilogramos (kg)</Text>
                  {settings.weight_unit === 'kg' && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
                <TouchableOpacity
                  testID="unit-lb"
                  style={[styles.modalOption, settings.weight_unit === 'lb' && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => { updateSetting('weight_unit', 'lb'); setShowUnitModal(null); }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.textPrimary }]}>Libras (lb)</Text>
                  {settings.weight_unit === 'lb' && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  testID="unit-cm"
                  style={[styles.modalOption, settings.height_unit === 'cm' && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => { updateSetting('height_unit', 'cm'); setShowUnitModal(null); }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.textPrimary }]}>Centimetros (cm)</Text>
                  {settings.height_unit === 'cm' && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
                <TouchableOpacity
                  testID="unit-ft"
                  style={[styles.modalOption, settings.height_unit === 'ft' && { backgroundColor: colors.primary + '15' }]}
                  onPress={() => { updateSetting('height_unit', 'ft'); setShowUnitModal(null); }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.textPrimary }]}>Pies (ft)</Text>
                  {settings.height_unit === 'ft' && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Password Change Modal */}
      <Modal visible={showPasswordModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowPasswordModal(false); setPasswordError(''); }}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.passwordModal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Cambiar contraseña</Text>

            <View style={styles.passwordField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ACTUAL</Text>
              <TextInput
                testID="current-password-input"
                style={[styles.passwordInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder="Contraseña actual"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.passwordField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NUEVA</Text>
              <TextInput
                testID="new-password-input"
                style={[styles.passwordInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder="Nueva contraseña"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.passwordField}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CONFIRMAR</Text>
              <TextInput
                testID="confirm-password-input"
                style={[styles.passwordInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder="Confirmar contraseña"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {passwordError ? (
              <View style={[styles.errorBox, { backgroundColor: colors.error + '15' }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{passwordError}</Text>
              </View>
            ) : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => { setShowPasswordModal(false); setPasswordError(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              >
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="change-password-submit"
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Cambiar</Text>
                )}
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
  scrollContent: { padding: 16, paddingBottom: 32 },
  screenTitle: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 24,
  },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  profileAvatarText: { fontSize: 24, fontWeight: '700' },
  profileInfo: { marginLeft: 16, flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { fontSize: 18, fontWeight: '600' },
  profileEmail: { fontSize: 14, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 8 },
  roleText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  editNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, borderRadius: 8, padding: 10, fontSize: 16, borderWidth: 1.5 },
  saveBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  cancelBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  settingSection: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  settingItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 0.5,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 16 },
  settingValue: { fontSize: 14 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', maxWidth: 340, borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderRadius: 10, marginBottom: 8,
  },
  modalOptionText: { fontSize: 16 },
  passwordModal: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 24 },
  passwordField: { marginBottom: 16, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  passwordInput: { borderRadius: 8, padding: 14, fontSize: 16, borderWidth: 1 },
  errorBox: { borderRadius: 8, padding: 10, marginBottom: 12 },
  errorText: { fontSize: 13, textAlign: 'center' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});
