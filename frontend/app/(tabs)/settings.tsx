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
  const [refreshing, setRefreshing] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  useEffect(() => { 
    loadSettings(); 
  }, []);

  const loadSettings = async () => {
    try {
      const s = await api.getSettings();
      if (s) setSettings(s);
    } catch (e) {
      console.log('Error cargando ajustes:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleConnectStrava = async () => {
    // 1. Usamos el ID de Vercel (EXPO_PUBLIC_...)
    const clientID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
    
    // 2. IMPORTANTE: La URL de Render donde Strava enviará los datos
    const redirectURI = "https://fit-tracker-backend-rtx2.onrender.com/api/auth/strava/callback";
    
    try {
      const token = await AsyncStorage.getItem('auth_token');
      
      if (!clientID || !token) {
        Alert.alert("Error de Configuración", "Falta el Client ID o la sesión activa.");
        return;
      }

      // Codificamos la URI para que Strava no se pierda
      const encodedURI = encodeURIComponent(redirectURI);
      const url = `https://www.strava.com/oauth/authorize?client_id=${clientID}&response_type=code&redirect_uri=${encodedURI}&scope=read,activity:read_all&state=${token}`;
      
      console.log("Redirigiendo a:", url);
      window.location.href = url;
    } catch (e) {
      Alert.alert("Error", "No se pudo conectar con Strava");
    }
  };

  const handleLogout = async () => {
    const proceed = Platform.OS === 'web' ? window.confirm('¿Salir?') : true;
    if (proceed) {
      await logout();
      router.replace('/');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadSettings} tintColor={colors.primary} />}
      >
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Ajustes</Text>

        {/* Perfil Mini */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{user?.name?.charAt(0)}</Text>
          </View>
          <View>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{user?.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{user?.email}</Text>
          </View>
        </View>

        {/* Sección Strava */}
        <Text style={styles.sectionTitle}>CONEXIÓN APPLE WATCH</Text>
        <TouchableOpacity 
          style={[styles.stravaBtn, { backgroundColor: '#FC6100' }]} 
          onPress={handleConnectStrava}
        >
          <Ionicons name="flash" size={20} color="#FFF" />
          <Text style={styles.stravaBtnText}>SINCRONIZAR CON STRAVA</Text>
        </TouchableOpacity>

        {/* Otros Ajustes */}
        <Text style={styles.sectionTitle}>APARIENCIA</Text>
        <TouchableOpacity style={[styles.item, { backgroundColor: colors.surface }]} onPress={() => setShowThemeModal(true)}>
          <Ionicons name="moon-outline" size={20} color={colors.primary} />
          <Text style={[styles.itemLabel, { color: colors.textPrimary }]}>Tema: {themeMode}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.item, { backgroundColor: colors.surface, marginTop: 40 }]} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={[styles.itemLabel, { color: colors.error }]}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal Tema */}
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
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 15, gap: 15, marginBottom: 30 },
  avatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 18, fontWeight: '700' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 10, marginTop: 20 },
  stravaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, gap: 10 },
  stravaBtnText: { color: '#FFF', fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, gap: 12 },
  itemLabel: { fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  modalContent: { borderRadius: 20, padding: 20 },
  modalOption: { padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#eee' }
});
