import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Switch, Alert, TextInput, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, themeMode, setThemeMode } = useTheme();
  const router = useRouter();
  
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  // Estados para preferencias
  const [units, setUnits] = useState({ weight: 'kg', height: 'cm' });

  const handleUpdateProfile = async () => {
    if (name === user?.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await api.updateProfile({ name });
      setEditing(false);
      Alert.alert("Éxito", "Perfil actualizado correctamente.");
    } catch (e) {
      Alert.alert("Error", "No se pudo actualizar el perfil.");
      setName(user?.name || '');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Cerrar Sesión", "¿Estás segura de que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: async () => {
          await logout();
          router.replace('/');
      }}
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ajustes</Text>

        {/* SECCIÓN PERFIL */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.sectionLabel}>MI CUENTA</Text>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
              <Text style={{ color: colors.primary, fontSize: 24, fontWeight: '800' }}>
                {user?.name?.charAt(0)}
              </Text>
            </View>
            
            <View style={{ flex: 1, marginLeft: 15 }}>
              {editing ? (
                <View style={styles.editInputRow}>
                  <TextInput 
                    style={[styles.input, { color: colors.textPrimary, borderBottomColor: colors.primary }]} 
                    value={name} 
                    onChangeText={setName} 
                    autoFocus
                  />
                  <TouchableOpacity onPress={handleUpdateProfile} disabled={saving}>
                    {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="checkmark-circle" size={24} color={colors.success} />}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.nameRow} onPress={() => setEditing(true)}>
                  <Text style={[styles.nameText, { color: colors.textPrimary }]}>{user?.name}</Text>
                  <Ionicons name="pencil-outline" size={14} color={colors.primary} style={{marginLeft: 5}} />
                </TouchableOpacity>
              )}
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{user?.email}</Text>
              <View style={[styles.roleBadge, { backgroundColor: colors.primary + '10' }]}>
                <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>
                  {user?.role?.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* PREFERENCIAS DE LA APP */}
        <Text style={styles.sectionHeader}>PREFERENCIAS</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="moon-outline" size={20} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>Modo Oscuro</Text>
            </View>
            <Switch 
              value={themeMode === 'dark'} 
              onValueChange={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
              trackColor={{ false: '#ddd', true: colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.row} onPress={() => setUnits({...units, weight: units.weight === 'kg' ? 'lb' : 'kg'})}>
            <View style={styles.rowLeft}>
              <Ionicons name="speedometer-outline" size={20} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>Unidad de peso</Text>
            </View>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{units.weight.toUpperCase()}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.row} onPress={() => setUnits({...units, height: units.height === 'cm' ? 'ft' : 'cm'})}>
            <View style={styles.rowLeft}>
              <Ionicons name="resize-outline" size={20} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>Unidad de altura</Text>
            </View>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{units.height.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        {/* ACCIONES CRÍTICAS */}
        <Text style={styles.sectionHeader}>SOPORTE</Text>
        <TouchableOpacity style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="help-buoy-outline" size={20} color={colors.primary} />
              <Text style={[styles.rowText, { color: colors.textPrimary }]}>Centro de ayuda</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#ccc" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.logoutBtn, { backgroundColor: colors.error + '10' }]} 
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={{ color: colors.error, fontWeight: '800', marginLeft: 10 }}>CERRAR SESIÓN</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Versión 2.0.4 - Built for Claudia</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 25, paddingBottom: 50 },
  title: { fontSize: 32, fontWeight: '900', marginBottom: 25 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1, marginBottom: 10, marginTop: 15 },
  card: { padding: 20, borderRadius: 24, marginBottom: 15, elevation: 1 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 1, marginBottom: 20 },
  
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameText: { fontSize: 20, fontWeight: '800' },
  editInputRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  input: { flex: 1, fontSize: 20, fontWeight: '800', padding: 0, borderBottomWidth: 1, marginRight: 10 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 8 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { fontSize: 16, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 15 },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, marginTop: 25 },
  versionText: { textAlign: 'center', color: '#ccc', fontSize: 12, marginTop: 30 }
});
