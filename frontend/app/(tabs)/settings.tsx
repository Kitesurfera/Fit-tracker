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
  const { user, logout } = useAuth();
  const { colors, themeMode, updateTheme } = useTheme();
  const router = useRouter();
  
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const handleUpdateProfile = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ name });
      setEditing(false);
      Alert.alert("Éxito", "Perfil actualizado.");
    } catch (e) {
      Alert.alert("Error", "No se pudo actualizar.");
    } finally {
      setSaving(false);
    }
  };

  // FIX DEFINITIVO PARA CERRAR SESIÓN
  const handleLogout = async () => {
    Alert.alert("Cerrar Sesión", "¿Seguro que quieres salir de Fit Tracker?", [
      { text: "Cancelar", style: "cancel" },
      { 
        text: "Cerrar Sesión", 
        style: "destructive", 
        onPress: async () => {
          try {
            // 1. Limpiamos storage
            await AsyncStorage.multiRemove(['auth_token', 'user_data']);
            // 2. Ejecutamos la función del contexto (que pone el user a null)
            await logout();
            // 3. Redirección forzada a la raíz
            router.replace('/'); 
          } catch (e) {
            console.error("Error al cerrar sesión:", e);
          }
        } 
      }
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ajustes</Text>

        {/* PERFIL */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.sectionLabel}>PERFIL DEL {user?.role?.toUpperCase()}</Text>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
              <Text style={{ color: colors.primary, fontSize: 24, fontWeight: '800' }}>{user?.name?.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              {editing ? (
                <View style={styles.editRow}>
                  <TextInput 
                    style={[styles.input, { color: colors.textPrimary, borderBottomColor: colors.primary }]} 
                    value={name} onChangeText={setName} autoFocus 
                  />
                  <TouchableOpacity onPress={handleUpdateProfile}>
                    {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="checkmark-circle" size={26} color={colors.success} />}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.nameRow} onPress={() => setEditing(true)}>
                  <Text style={[styles.nameText, { color: colors.textPrimary }]}>{user?.name}</Text>
                  <Ionicons name="pencil" size={14} color={colors.primary} style={{marginLeft: 8}} />
                </TouchableOpacity>
              )}
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* APARIENCIA (TEMA DEL SISTEMA) */}
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

        {/* CERRAR SESIÓN */}
        <TouchableOpacity 
          style={[styles.logoutBtn, { backgroundColor: colors.error + '10' }]} 
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <Text style={{ color: colors.error, fontWeight: '800', marginLeft: 10 }}>CERRAR SESIÓN</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Fit Tracker Pro v2.1 • Preparación Física</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 25 },
  title: { fontSize: 32, fontWeight: '900', marginBottom: 25 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1, marginBottom: 12, marginTop: 10 },
  card: { padding: 20, borderRadius: 24, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 1, marginBottom: 15 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameText: { fontSize: 20, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  input: { flex: 1, fontSize: 20, fontWeight: '800', borderBottomWidth: 1, marginRight: 10, padding: 0 },
  themeGrid: { flexDirection: 'row', gap: 10 },
  themeOption: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 15, borderWidth: 1 },
  themeLabel: { fontSize: 11, fontWeight: '700', marginTop: 8 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 20, marginTop: 20 },
  versionText: { textAlign: 'center', color: '#ccc', fontSize: 11, marginTop: 40 }
});
