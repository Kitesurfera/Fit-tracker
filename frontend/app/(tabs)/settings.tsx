import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  Platform, Alert, ScrollView, Linking 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/context/AuthContext';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleSubscribeCalendar = () => {
    // Aquí necesitas la URL real de tu backend que devuelva el .ics
    // El protocolo webcal:// fuerza a iOS/Android a abrir la app de calendario
    // Asegúrate de pasar el ID del usuario para que el backend sepa de quién son los entrenos
    const backendIcsUrl = `webcal://api.tudominio.com/calendar/${user?.id}/freestyle.ics`;
    
    Linking.openURL(backendIcsUrl).catch((err) => {
      console.error("Error abriendo el calendario", err);
      if (Platform.OS === 'web') {
        window.alert("No se pudo abrir la app de calendario.");
      } else {
        Alert.alert("Error", "No se pudo vincular con el calendario.");
      }
    });
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmLogout = window.confirm('¿Seguro que quieres cerrar sesión?');
      if (confirmLogout) logout();
    } else {
      Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: logout }
      ]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ajustes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <Text style={styles.sectionTitle}>SISTEMA Y AVISOS</Text>
        
        <View style={[styles.settingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.settingRowAction} onPress={handleSubscribeCalendar}>
            <View style={styles.settingIconText}>
              <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.settingText, { color: colors.textPrimary }]}>Suscribirse al Calendario</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>Se actualiza solo cuando hay nuevas sesiones</Text>
              </View>
            </View>
            <Ionicons name="link-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>CUENTA</Text>
        
        <View style={[styles.settingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.settingRowAction} onPress={() => router.push('/profile')}>
            <View style={styles.settingIconText}>
              <View style={[styles.iconBox, { backgroundColor: colors.textSecondary + '15' }]}>
                <Ionicons name="person" size={20} color={colors.textSecondary} />
              </View>
              <Text style={[styles.settingText, { color: colors.textPrimary }]}>Editar Perfil</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.border} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={styles.settingRowAction} onPress={handleLogout}>
            <View style={styles.settingIconText}>
              <View style={[styles.iconBox, { backgroundColor: (colors.error || '#EF4444') + '15' }]}>
                <Ionicons name="log-out" size={20} color={colors.error || '#EF4444'} />
              </View>
              <Text style={[styles.settingText, { color: colors.error || '#EF4444', fontWeight: '800' }]}>Cerrar Sesión</Text>
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  content: { padding: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 10, letterSpacing: 1.5, marginLeft: 10 },
  settingCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 20 },
  settingRowAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  settingIconText: { flexDirection: 'row', alignItems: 'center', gap: 15, flex: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  settingText: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, marginLeft: 70, opacity: 0.5 }
});
