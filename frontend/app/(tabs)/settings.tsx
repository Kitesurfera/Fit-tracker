import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  ActivityIndicator, RefreshControl, Platform
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

  const [settings, setSettings] = useState({
    notifications_enabled: true,
    weight_unit: 'kg',
    height_unit: 'cm',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      if (s) setSettings(s);
    } catch (e) { console.log(e); }
    finally { setLoading(false); }
  };

  const handleLogout = async () => {
    const confirm = Platform.OS === 'web' ? window.confirm('¿Cerrar sesión?') : true;
    if (confirm) { await logout(); router.replace('/'); }
  };

  if (loading) return <View style={{flex:1, justifyContent:'center', backgroundColor:colors.background}}><ActivityIndicator size="large" color={colors.primary}/></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
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

        <Text style={styles.sectionTitle}>PREFERENCIAS</Text>
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.item} onPress={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}>
            <Ionicons name="moon" size={20} color={colors.primary} />
            <Text style={[styles.itemText, { color: colors.textPrimary }]}>Tema: {themeMode.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>CUENTA</Text>
        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: colors.error + '15' }]} onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={colors.error} />
          <Text style={{ color: colors.error, fontWeight: '700' }}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: 28, fontWeight: '800', marginBottom: 25 },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 20, marginBottom: 30, gap: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 10, marginTop: 15, letterSpacing: 1 },
  section: { borderRadius: 15, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 12 },
  itemText: { fontSize: 15, fontWeight: '500' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 15, gap: 10, marginTop: 20 }
});
