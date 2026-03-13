import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Alert, TextInput, ActivityIndicator, Platform, Modal, Dimensions 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

const { width } = Dimensions.get('window');

type MeasurementType = 'weight' | 'biceps' | 'waist' | 'quadriceps' | 'shoulders' | 'calf';

const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  weight: 'Peso (kg)',
  biceps: 'Bíceps (cm)',
  waist: 'Cintura (cm)',
  quadriceps: 'Cuádriceps (cm)',
  shoulders: 'Hombros (cm)',
  calf: 'Gemelos (cm)'
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function SettingsScreen() {
  const { user, logout, updateUser, loading: authLoading } = useAuth();
  const { colors, themeMode, updateTheme } = useTheme();
  const router = useRouter();
  
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const [showMeasureModal, setShowMeasureModal] = useState(false);
  const [measureType, setMeasureType] = useState<MeasurementType>('weight');
  const [measureValue, setMeasureValue] = useState('');
  const [measureHistory, setMeasureHistory] = useState<any[]>([]);
  const [activeChartType, setActiveChartType] = useState<MeasurementType>('weight');

  useEffect(() => {
    // CONDICIÓN: Solo cargamos el historial si es deportista
    if (user?.role === 'athlete') {
      const fetchMeasures = async () => {
        try {
          const data = await api.getTests({ athlete_id: user?.id, test_name: 'body_measure' });
          setMeasureHistory(data || []);
        } catch (e) { console.log(e); }
      };
      fetchMeasures();
    }
  }, [user?.id, user?.role]);

  const handleUpdateProfile = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.updateProfile({ name: name.trim() });
      if (updateUser) updateUser({ name: name.trim() });
      setEditing(false);
    } catch (e) { Alert.alert("Error", "No se pudo actualizar."); }
    finally { setSaving(false); }
  };

  const handleEnableNotifications = async () => {
    if (!Device.isDevice) {
      Alert.alert("Aviso", "Usa un dispositivo físico para recibir notificaciones.");
      return;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert("Permiso denegado", "No podemos enviarte alertas sin tu permiso.");
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        vapidPublicKey: 'BM8HDyMsj3MIuLej219I7bvqRCr9OeW8uUM62CbcYduF4IO3J8IWK1U_k1KFXajbqEeuUGPrWAMJ008BmLDQoVg'
      });

      const pushToken = tokenData.data;
      await api.updateProfile({ push_token: pushToken });
      
      Alert.alert("¡Listos!", "Notificaciones activadas.");

    } catch (error) {
      console.log("Error al activar notificaciones:", error);
      Alert.alert("Error", "Hubo un problema de conexión.");
    }
  };

  const saveMeasurement = async () => {
    if (!measureValue) return;
    setSaving(true);
    try {
      const payload = {
        athlete_id: user?.id,
        test_name: 'body_measure',
        custom_name: measureType,
        value: parseFloat(measureValue),
        unit: measureType === 'weight' ? 'kg' : 'cm',
        date: new Date().toISOString().split('T')[0],
      };
      const created = await api.createTest(payload);
      setMeasureHistory([created, ...measureHistory]);
      setShowMeasureModal(false);
      setMeasureValue('');
    } catch (e) { Alert.alert("Error", "No se pudo guardar la medida."); }
    finally { setSaving(false); }
  };

  const renderMiniChart = (type: MeasurementType) => {
    const data = measureHistory
      .filter(m => m.custom_name === type)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (data.length < 2) {
      return (
        <View style={styles.emptyChart}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Registra al menos 2 medidas para ver evolución.</Text>
        </View>
      );
    }

    const values = data.map(d => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    return (
      <View style={styles.miniChartContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.barsArea}>
            {data.map((d, i) => (
              <View key={i} style={styles.barCol}>
                <View style={[styles.bar, { height: `${((d.value - min) / range) * 60 + 20}%`, backgroundColor: colors.primary }]} />
                <Text style={[styles.barText, { color: colors.textPrimary }]}>{d.value}</Text>
                <Text style={[styles.barDate, { color: colors.textSecondary }]}>{d.date.split('-').slice(1).join('/')}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  const handleConfirmLogout = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm("¿Segura que quieres salir?")) { await logout(); router.replace('/'); }
    } else {
      Alert.alert("Fit Tracker", "¿Cerrar sesión?", [
        { text: "No" },
        { text: "Sí", style: "destructive", onPress: async () => { await logout(); router.replace('/'); } }
      ]);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Ajustes</Text>

        <Text style={styles.sectionHeader}>MI PERFIL</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
              <Text style={{ color: colors.primary, fontSize: 24, fontWeight: '900' }}>{user?.name?.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              {editing ? (
                <View style={styles.editRow}>
                  <TextInput style={[styles.input, { color: colors.textPrimary, borderBottomColor: colors.primary }]} value={name} onChangeText={setName} />
                  <TouchableOpacity onPress={handleUpdateProfile}><Ionicons name="checkmark-circle" size={28} color={colors.success} /></TouchableOpacity>
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

        {/* --- NOTIFICACIONES DINÁMICAS --- */}
        <Text style={styles.sectionHeader}>NOTIFICACIONES</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, paddingVertical: 15 }]}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            onPress={handleEnableNotifications}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.iconWrapper, { backgroundColor: colors.primary + '20' }]}>
                <Ionicons name="notifications" size={20} color={colors.primary} />
              </View>
              <Text style={{ marginLeft: 15, fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>
                {user?.role === 'trainer' ? 'Activar alertas de deportistas' : 'Activar alertas de sesión'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* --- MEDIDAS (SOLO DEPORTISTAS) --- */}
        {user?.role === 'athlete' && (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <Text style={styles.sectionHeader}>MEDIDAS Y EVOLUCIÓN</Text>
              <TouchableOpacity onPress={() => setShowMeasureModal(true)} style={[styles.addMeasureBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={16} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>AÑADIR</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                {Object.keys(MEASUREMENT_LABELS).map((type) => (
                  <TouchableOpacity 
                    key={type} 
                    onPress={() => setActiveChartType(type as MeasurementType)}
                    style={[styles.typeChip, activeChartType === type && { backgroundColor: colors.primary }]}
                  >
                    <Text style={{ color: activeChartType === type ? '#FFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                      {MEASUREMENT_LABELS[type as MeasurementType].split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {renderMiniChart(activeChartType)}
            </View>
          </>
        )}

        <Text style={styles.sectionHeader}>APARIENCIA</Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.themeGrid}>
            {['light', 'dark', 'system'].map((m) => (
              <TouchableOpacity key={m} onPress={() => updateTheme(m as any)} style={[styles.themeOption, { borderColor: colors.border }, themeMode === m && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <Ionicons name={m === 'light' ? 'sunny' : m === 'dark' ? 'moon' : 'settings-outline'} size={20} color={themeMode === m ? '#FFF' : colors.textPrimary} />
                <Text style={[styles.themeLabel, { color: themeMode === m ? '#FFF' : colors.textPrimary }]}>{m.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: colors.error + '10' }]} onPress={handleConfirmLogout}>
          <Ionicons name="log-out-outline" size={22} color={colors.error} />
          <Text style={{ color: colors.error, fontWeight: '800', marginLeft: 10 }}>CERRAR SESIÓN</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL REGISTRO MEDIDAS (SOLO DEPORTISTAS) */}
      {user?.role === 'athlete' && (
        <Modal visible={showMeasureModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Registrar Medida</Text>
              
              <Text style={styles.label}>¿QUÉ VAS A MEDIR?</Text>
              <View style={styles.gridOptions}>
                {Object.keys(MEASUREMENT_LABELS).map((type) => (
                  <TouchableOpacity 
                    key={type} 
                    onPress={() => setMeasureType(type as MeasurementType)}
                    style={[styles.optionBtn, { borderColor: colors.border }, measureType === type && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  >
                    <Text style={{ color: measureType === type ? '#FFF' : colors.textPrimary, fontSize: 12 }}>{MEASUREMENT_LABELS[type as MeasurementType].split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput 
                style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder={`Valor en ${measureType === 'weight' ? 'kg' : 'cm'}`}
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={measureValue}
                onChangeText={setMeasureValue}
              />

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveMeasurement}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>GUARDAR MEDIDA</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowMeasureModal(false)}><Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 15 }}>Cancelar</Text></TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 25, paddingBottom: 50 },
  title: { fontSize: 32, fontWeight: '900', marginBottom: 25 },
  sectionHeader: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1.5, marginBottom: 12, marginTop: 10, textTransform: 'uppercase' },
  card: { padding: 20, borderRadius: 24, marginBottom: 20 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameText: { fontSize: 20, fontWeight: '800' },
  editRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  input: { flex: 1, fontSize: 20, fontWeight: '800', borderBottomWidth: 2, marginRight: 10 },
  themeGrid: { flexDirection: 'row', gap: 10 },
  themeOption: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1 },
  themeLabel: { fontSize: 10, fontWeight: '700', marginTop: 8 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 22, marginTop: 10 },
  iconWrapper: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  
  // Estilos Medidas
  addMeasureBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, gap: 4 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginRight: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  miniChartContainer: { height: 120, marginTop: 10 },
  barsArea: { flexDirection: 'row', alignItems: 'flex-end', gap: 15, paddingBottom: 20 },
  barCol: { alignItems: 'center', width: 40 },
  bar: { width: 12, borderRadius: 6, marginBottom: 5 },
  barText: { fontSize: 10, fontWeight: '800' },
  barDate: { fontSize: 8, opacity: 0.5 },
  emptyChart: { height: 100, justifyContent: 'center', alignItems: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 25 },
  modalCard: { padding: 25, borderRadius: 25 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 20 },
  label: { fontSize: 10, fontWeight: '800', color: '#888', marginBottom: 10 },
  gridOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  modalInput: { padding: 16, borderRadius: 12, borderWidth: 1, fontSize: 18, marginBottom: 20 },
  saveBtn: { padding: 18, borderRadius: 15, alignItems: 'center' }
});
