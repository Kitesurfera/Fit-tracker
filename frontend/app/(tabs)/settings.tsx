import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Cerrar sesion', 'Estas seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  const SettingItem = ({ icon, label, value, onPress, danger }: any) => (
    <TouchableOpacity
      style={[styles.settingItem, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={styles.settingLeft}>
        <View style={[styles.settingIcon, { backgroundColor: danger ? colors.error + '15' : colors.surfaceHighlight }]}>
          <Ionicons name={icon} size={20} color={danger ? colors.error : colors.primary} />
        </View>
        <Text style={[styles.settingLabel, { color: danger ? colors.error : colors.textPrimary }]}>{label}</Text>
      </View>
      {value ? (
        <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Ajustes</Text>

        {/* Profile Section */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.profileAvatarText, { color: colors.primary }]}>
              {user?.name?.charAt(0)?.toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.textPrimary }]}>{user?.name}</Text>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email}</Text>
            <View style={[styles.roleBadge, { backgroundColor: user?.role === 'trainer' ? colors.primary + '20' : colors.accent + '20' }]}>
              <Text style={[styles.roleText, { color: user?.role === 'trainer' ? colors.primary : colors.accent }]}>
                {user?.role === 'trainer' ? 'ENTRENADOR' : 'DEPORTISTA'}
              </Text>
            </View>
          </View>
        </View>

        {/* General */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>GENERAL</Text>
        <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingItem icon="moon-outline" label="Tema" value={isDark ? 'Oscuro (sistema)' : 'Claro (sistema)'} />
          <SettingItem icon="language-outline" label="Idioma" value="Espanol" />
          <SettingItem icon="notifications-outline" label="Notificaciones" value="Activas" />
        </View>

        {/* About */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>INFORMACION</Text>
        <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingItem icon="information-circle-outline" label="Version" value="1.0.0" />
          <SettingItem icon="shield-checkmark-outline" label="Privacidad" />
          <SettingItem icon="document-text-outline" label="Terminos de uso" />
        </View>

        {/* Danger Zone */}
        <View style={[styles.settingSection, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 24 }]}>
          <SettingItem icon="log-out-outline" label="Cerrar sesion" onPress={handleLogout} danger />
        </View>
      </ScrollView>
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
  profileName: { fontSize: 18, fontWeight: '600' },
  profileEmail: { fontSize: 14, marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 8 },
  roleText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  settingSection: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  settingItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 0.5,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 16 },
  settingValue: { fontSize: 14 },
});
