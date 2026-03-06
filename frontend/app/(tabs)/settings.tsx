import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Alert, TextInput, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const { user, logout, updateUser } = useAuth();
  const { colors, themeMode, updateTheme } = useTheme();
  const router = useRouter();
  
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  // Unidades de medida
  const [weightUnit, setWeightUnit] = useState('kg');
  const [heightUnit, setHeightUnit] = useState('cm');

  const handleUpdateProfile = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "El nombre no puede estar vacío.");
      return;
    }
    setSaving(true);
    try {
      await api.updateProfile({ name: name.trim() });
      if (updateUser) updateUser({ name: name.trim() });
      setEditing(false);
      Alert.alert("¡Hecho!", "Nombre de perfil actualizado.");
    } catch (e) {
      Alert.alert("Error", "No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Cerrar Sesión", "¿Segura que quieres salir de Fit Tracker?", [
      { text: "Cancelar", style: "cancel" },
      { 
        text: "Salir", 
        style: "destructive", 
        onPress: async () => {
          try {
            await AsyncStorage.multiRemove(['auth_token', 'user_data']);
            await logout();
            router.replace('/'); 
          } catch (e) {
            console.error("Error logout:", e);
          }
        } 
      }
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ajustes</Text>

        {/* SECCIÓN PERFIL */}
        <Text style={styles.sectionHeader}>MI CUENTA</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={{ color: colors.primary, fontSize: 24, fontWeight: '900' }}>
                {user?.name?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              {editing ? (
                <View style={styles.editRow}>
                  <TextInput 
                    style={[styles.input, { color: colors.textPrimary, borderBottomColor: colors.primary }]} 
                    value={name} 
                    onChangeText={setName} 
                    autoFocus 
                  />
                  <TouchableOpacity onPress={handleUpdateProfile} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="checkmark-circle" size={28} color={colors.success} />}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.nameRow} onPress={() => setEditing(true)}>
                  <Text style={[styles.nameText, { color: colors.textPrimary }]}>{user?.name}</Text>
                  <Ionicons name="pencil" size={14} color={colors.primary} style={{marginLeft: 8}} />
                </TouchableOpacity>
              )}
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{user?.email}</Text>
              <View style={[styles.roleBadge, { backgroundColor: colors.primary + '10' }]}>
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>
                  {user?.role || 'Deportista'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* SECCIÓN APARIENCIA */}
        <Text style={styles.sectionHeader}>APARIENCIA</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.themeGrid}>
            {[
              { id: 'light', label: 'Claro', icon: 'sunny' },
              { id: 'dark', label: 'Oscuro', icon: 'moon' },
              { id: 'system', label: 'Sistema', icon: 'settings-outline' }
            ].map((mode) => (
              <TouchableOpacity 
                key={mode.id}
                onPress={() => updateTheme(mode.id as any)}
                style={[
                  styles.themeOption, 
                  { borderColor: colors.border },
                  themeMode === mode.id && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
              >
                <Ionicons name={mode.icon as any} size={20} color={themeMode === mode.id ? '#FFF' : colors.textPrimary} />
                <Text style={[styles.themeLabel, { color: themeMode === mode.id ? '#FFF' : colors.textPrimary }]}>{mode.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SECCIÓN UNIDADES */}
        <Text style={styles.sectionHeader}>UNIDADES DE MEDIDA</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>Peso</Text>
            <View style={styles.unitToggle}>
              {['kg', 'lb'].map(u => (
                <TouchableOpacity 
                  key={u} 
                  onPress={() => setWeightUnit(u)}
                  style={[styles.unitBtn, weightUnit === u && { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: weightUnit === u ? '#FFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{u.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: colors.textPrimary }]}>Altura</Text>
            <View style={styles.unitToggle}>
              {['cm', 'ft'].map(u => (
                <TouchableOpacity 
                  key={u} 
                  onPress={() => setHeightUnit(u)}
                  style={[styles.unitBtn, heightUnit === u && { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: heightUnit === u ? '#FFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{u.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* CERRAR SESIÓN */}
        <TouchableOpacity 
          style={[styles.logoutBtn, { backgroundColor: colors.error + '10' }]} 
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <Text style={{ color: colors.error, fontWeight: '800', marginLeft: 10 }}>CERRAR SESIÓN</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Fit Tracker Pro v2.3 • Elite Performance</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 25, paddingBottom: 50 },
  title: { fontSize: 32, fontWeight: '900', marginBottom: 25 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1.5, marginBottom: 12, marginTop: 10, textTransform: 'uppercase' },
  card: { padding: 20, borderRadius: 24, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameText: { fontSize: 20, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  input: { flex: 1, fontSize: 20, fontWeight: '800', borderBottomWidth: 2, marginRight: 10, padding: 0 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  themeGrid: { flexDirection: 'row', gap: 10 },
  themeOption: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1 },
  themeLabel: { fontSize: 11, fontWeight: '700', marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowText: { fontSize: 15, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 15 },
  unitToggle: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 10, padding: 2 },
  unitBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 22, marginTop: 10 },
  versionText: { textAlign: 'center', color: '#ccc', fontSize: 11, marginTop: 40 }
});
