import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Switch, TouchableOpacity, 
  Alert, Platform, ActivityIndicator, ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../src/hooks/useTheme';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/api';

// Configuramos cómo se comportan las notificaciones cuando la app está abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [loadingToggle, setLoadingToggle] = useState(false);
  const [isTrainer] = useState(user?.role === 'trainer');

  // Cargar el estado guardado al abrir la pantalla
  useEffect(() => {
    const loadSettings = async () => {
      const saved = await AsyncStorage.getItem('session_alerts');
      if (saved !== null) {
        setAlertsEnabled(JSON.parse(saved));
      }
    };
    loadSettings();
  }, []);

  const scheduleWorkoutAlerts = async () => {
    try {
      // 1. Limpiamos notificaciones anteriores para no duplicar
      await Notifications.cancelAllScheduledNotificationsAsync();

      // 2. Obtenemos las sesiones
      const workouts = await api.getWorkouts();
      const pendingWorkouts = workouts.filter((w: any) => !w.completed);

      // 3. Programamos una alerta a las 9:00 AM para cada sesión pendiente
      pendingWorkouts.forEach(async (wk: any) => {
        if (!wk.date) return;
        
        const [year, month, day] = wk.date.split('-');
        const wkDate = new Date(Number(year), Number(month) - 1, Number(day));
        wkDate.setHours(9, 0, 0, 0); // Aviso a las 09:00 AM

        // Solo programamos si la fecha es futura o es hoy
        if (wkDate.getTime() >= Date.now()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '¡Día de entrenamiento! 🏄‍♀️',
              body: `Tienes programada la sesión: ${wk.title}. ¡A por todas!`,
              sound: true,
            },
            trigger: wkDate,
          });
        }
      });
    } catch (error) {
      console.log("Error programando alertas:", error);
    }
  };

  const toggleAlerts = async (value: boolean) => {
    setLoadingToggle(true);
    try {
      if (value) {
        // Pedir permiso al usuario
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permiso denegado', 
            'Ve a los ajustes de tu teléfono para permitir las notificaciones de la app.'
          );
          setAlertsEnabled(false);
          await AsyncStorage.setItem('session_alerts', JSON.stringify(false));
          setLoadingToggle(false);
          return;
        }

        // Si da permiso, activamos y programamos
        setAlertsEnabled(true);
        await AsyncStorage.setItem('session_alerts', JSON.stringify(true));
        await scheduleWorkoutAlerts();
        
        if (Platform.OS !== 'web') {
          Alert.alert('¡Alertas activadas!', 'Te avisaremos a las 9:00 AM los días que tengas sesión.');
        }
      } else {
        // Si apaga el switch, cancelamos todo
        setAlertsEnabled(false);
        await AsyncStorage.setItem('session_alerts', JSON.stringify(false));
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (e) {
      console.log(e);
      Alert.alert('Error', 'No se pudieron configurar las alertas.');
    } finally {
      setLoadingToggle(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: async () => {
          await Notifications.cancelAllScheduledNotificationsAsync(); // Limpiar al salir
          logout();
      }}
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ajustes</Text>
        <View style={{ width: 40 }} /> {/* Espaciador para centrar el título */}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        <Text style={styles.sectionTitle}>NOTIFICACIONES</Text>
        
        <View style={[styles.settingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.settingRow}>
            <View style={styles.settingIconText}>
              <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name="notifications" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.settingText, { color: colors.textPrimary }]}>Alertas de sesión</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>Aviso a las 9:00 AM los días de entreno</Text>
              </View>
            </View>
            
            {loadingToggle ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 10 }} />
            ) : (
              <Switch
                value={alertsEnabled}
                onValueChange={toggleAlerts}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={Platform.OS === 'ios' ? '#FFF' : alertsEnabled ? '#FFF' : '#F4F3F4'}
              />
            )}
          </View>
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
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  settingRowAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  settingIconText: { flexDirection: 'row', alignItems: 'center', gap: 15, flex: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  settingText: { fontSize: 15, fontWeight: '700' },
  divider: { height: 1, marginLeft: 70, opacity: 0.5 }
});
