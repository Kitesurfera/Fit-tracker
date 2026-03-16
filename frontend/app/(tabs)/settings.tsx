import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, Alert, ScrollView, Linking, ActivityIndicator, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/api';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const isAthlete = user?.role === 'athlete';

  // --- ESTADOS ---
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [measurements, setMeasurements] = useState({
    weight: '', shoulders: '', chest: '', arm: '', thigh: ''
  });
  const [savingMeasures, setSavingMeasures] = useState(false);

  // --- FUNCIONES ---
  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    setSavingProfile(true);
    try {
      // Asegúrate de tener este método en tu archivo api.ts apuntando a PUT /api/profile
      if (api.updateProfile) {
        await api.updateProfile({ name });
      }
      if (Platform.OS === 'web') window.alert("Perfil actualizado correctamente.");
      else Alert.alert("¡Éxito!", "Perfil actualizado correctamente.");
    } catch (e) {
      if (Platform.OS === 'web') window.alert("Error al actualizar perfil.");
      else Alert.alert("Error", "No se pudo actualizar el perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveMeasurements = async () => {
    const hasData = Object.values(measurements).some(val => val.trim() !== '');
    if (!hasData) {
      if (Platform.OS === 'web') window.alert("Rellena al menos una medición.");
      else Alert.alert("Aviso", "Rellena al menos una medición.");
      return;
    }

    setSavingMeasures(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const measuresToSave = [
        { key: 'weight', name: 'peso', val: measurements.weight, unit: 'kg' },
        { key: 'shoulders', name: 'hombros', val: measurements.shoulders, unit: 'cm' },
        { key: 'chest', name: 'pecho', val: measurements.chest, unit: 'cm' },
        { key: 'arm', name: 'brazo', val: measurements.arm, unit: 'cm' },
        { key: 'thigh', name: 'muslo', val: measurements.thigh, unit: 'cm' }
      ];

      for (const m of measuresToSave) {
        if (m.val.trim() !== '') {
          const numericValue = parseFloat(m.val.replace(',', '.'));
          if (!isNaN(numericValue) && api.createTest) {
            await api.createTest({
              athlete_id: user?.id,
              test_type: 'medicion',
              test_name: m.key,
              custom_name: m.name,
              value: numericValue,
              unit: m.unit,
              date: today
            });
          }
        }
      }

      setMeasurements({ weight: '', shoulders: '', chest: '', arm: '', thigh: '' });
      if (Platform.OS === 'web') window.alert("Mediciones guardadas. Las verás en Analíticas.");
      else Alert.alert("¡Guardado!", "Mediciones registradas correctamente.");
    } catch (e) {
      if (Platform.OS === 'web') window.alert("Error guardando mediciones.");
      else Alert.alert("Error", "Hubo un problema al guardar.");
    } finally {
      setSavingMeasures(false);
    }
  };

  const handleSubscribeCalendar = () => {
    const backendIcsUrl = `webcal://fit-tracker-backend-rtx2.onrender.com/api/calendar/${user?.id}/entrenamientos.ics`;
    Linking.openURL(backendIcsUrl).catch((err) => {
      console.error("Error abriendo el calendario", err);
      if (Platform.OS === 'web') window.alert("No se pudo abrir la app de calendario.");
      else Alert.alert("Error", "No se pudo vincular con el calendario.");
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ajustes</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          
          {/* SECCIÓN PERFIL */}
          <Text style={styles.sectionTitle}>PERFIL</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Nombre de {isAthlete ? 'Deportista' : 'Entrenador'}</Text>
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]} 
              value={name}
              onChangeText={setName}
              placeholder="Tu nombre completo"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity 
              style={[styles.saveBtn, { backgroundColor: colors.primary }]} 
              onPress={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar Perfil</Text>}
            </TouchableOpacity>
          </View>

          {/* SECCIÓN MEDICIONES (SOLO ATLETAS) */}
          {isAthlete && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>MEDICIONES CORPORALES</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.measureRow}>
                  <View style={styles.measureCol}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Peso (kg)</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={measurements.weight} onChangeText={(t) => setMeasurements({...measurements, weight: t})} placeholder="Ej: 75.5" placeholderTextColor={colors.border} />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Hombros (cm)</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={measurements.shoulders} onChangeText={(t) => setMeasurements({...measurements, shoulders: t})} placeholder="Ej: 110" placeholderTextColor={colors.border} />
                  </View>
                </View>

                <View style={styles.measureRow}>
                  <View style={styles.measureCol}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Pecho (cm)</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={measurements.chest} onChangeText={(t) => setMeasurements({...measurements, chest: t})} placeholder="Ej: 98" placeholderTextColor={colors.border} />
                  </View>
                  <View style={styles.measureCol}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Brazo (cm)</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={measurements.arm} onChangeText={(t) => setMeasurements({...measurements, arm: t})} placeholder="Ej: 35" placeholderTextColor={colors.border} />
                  </View>
                </View>

                <View style={styles.measureRow}>
                  <View style={styles.measureCol}>
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Muslo (cm)</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={measurements.thigh} onChangeText={(t) => setMeasurements({...measurements, thigh: t})} placeholder="Ej: 60" placeholderTextColor={colors.border} />
                  </View>
                  <View style={styles.measureCol} /> {/* Espacio vacío para alinear */}
                </View>

                <TouchableOpacity 
                  style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 10 }]} 
                  onPress={handleSaveMeasurements}
                  disabled={savingMeasures}
                >
                  {savingMeasures ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Guardar Mediciones</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* SECCIÓN SISTEMA Y AVISOS */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>SISTEMA Y AVISOS</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0 }]}>
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

          {/* SECCIÓN CUENTA */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>CUENTA</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, padding: 0 }]}>
            <TouchableOpacity style={styles.settingRowAction} onPress={handleLogout}>
              <View style={styles.settingIconText}>
                <View style={[styles.iconBox, { backgroundColor: (colors.error || '#EF4444') + '15' }]}>
                  <Ionicons name="log-out" size={20} color={colors.error || '#EF4444'} />
                </View>
                <Text style={[styles.settingText, { color: colors.error || '#EF4444', fontWeight: '800' }]}>Cerrar Sesión</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />

        </ScrollView>
      </KeyboardAvoidingView>
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
  card: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 18 },
  
  inputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginLeft: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 15 },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  
  measureRow: { flexDirection: 'row', gap: 15 },
  measureCol: { flex: 1 },
  
  settingRowAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  settingIconText: { flexDirection: 'row', alignItems: 'center', gap: 15, flex: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  settingText: { fontSize: 15, fontWeight: '700' }
});
