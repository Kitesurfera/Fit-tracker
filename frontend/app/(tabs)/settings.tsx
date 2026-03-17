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

  const renderInputBox = (
    label: string, 
    iconName: keyof typeof Ionicons.glyphMap, 
    value: string, 
    onChange: (t: string) => void, 
    placeholder: string
  ) => (
    <View style={styles.measureCol}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 }}>
        <Ionicons name={iconName} size={14} color={colors.textSecondary} />
        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <TextInput 
        style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} 
        keyboardType="numeric" 
        value={value} 
        onChangeText={onChange} 
        placeholder={placeholder} 
        placeholderTextColor={colors.border} 
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ajustes</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* AVATAR Y PERFIL */}
          <View style={styles.profileHeader}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="person" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>
              {isAthlete ? 'PERFIL DE DEPORTISTA' : 'PERFIL DE ENTRENADOR'}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Nombre Completo</Text>
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} 
              value={name}
              onChangeText={setName}
              placeholder="Tu nombre completo"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity 
              style={[styles.saveBtn, { backgroundColor: name.trim() !== user?.name ? colors.primary : colors.surfaceHighlight }]} 
              onPress={handleSaveProfile}
              disabled={savingProfile || name.trim() === user?.name}
            >
              {savingProfile ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.saveBtnText, { color: name.trim() !== user?.name ? '#FFF' : colors.textSecondary }]}>Actualizar Perfil</Text>}
            </TouchableOpacity>
          </View>

          {/* SECCIÓN MEDICIONES (SOLO ATLETAS) */}
          {isAthlete && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>ACTUALIZAR MEDICIONES</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                
                <View style={styles.measureRow}>
                  {renderInputBox("Peso (kg)", "scale-outline", measurements.weight, (t) => setMeasurements({...measurements, weight: t}), "Ej: 75.5")}
                  {renderInputBox("Hombros (cm)", "resize-outline", measurements.shoulders, (t) => setMeasurements({...measurements, shoulders: t}), "Ej: 110")}
                </View>

                <View style={styles.measureRow}>
                  {renderInputBox("Pecho (cm)", "shirt-outline", measurements.chest, (t) => setMeasurements({...measurements, chest: t}), "Ej: 98")}
                  {renderInputBox("Brazo (cm)", "fitness-outline", measurements.arm, (t) => setMeasurements({...measurements, arm: t}), "Ej: 35")}
                </View>

                <View style={styles.measureRow}>
                  {renderInputBox("Muslo (cm)", "walk-outline", measurements.thigh, (t) => setMeasurements({...measurements, thigh: t}), "Ej: 60")}
                  <View style={styles.measureCol} /> {/* Espacio vacío para alinear */}
                </View>

                <TouchableOpacity 
                  style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 15 }]} 
                  onPress={handleSaveMeasurements}
                  disabled={savingMeasures}
                >
                  {savingMeasures ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Guardar Mediciones</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* SECCIÓN SISTEMA Y AVISOS */}
          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>INTEGRACIONES</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.settingRowAction} onPress={handleSubscribeCalendar} activeOpacity={0.7}>
              <View style={styles.settingIconText}>
                <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="calendar-outline" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: colors.textPrimary }]}>Sincronizar Calendario</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Se actualiza con tus nuevas sesiones</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* SECCIÓN CUENTA */}
          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>CUENTA</Text>
          <View style={[styles.listCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity style={styles.settingRowAction} onPress={handleLogout} activeOpacity={0.7}>
              <View style={styles.settingIconText}>
                <View style={[styles.iconBox, { backgroundColor: (colors.error || '#EF4444') + '15' }]}>
                  <Ionicons name="log-out-outline" size={22} color={colors.error || '#EF4444'} />
                </View>
                <Text style={[styles.settingText, { color: colors.error || '#EF4444' }]}>Cerrar Sesión</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: 60 }} />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  
  profileHeader: { alignItems: 'center', marginBottom: 25 },
  avatarCircle: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  roleText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#888', marginBottom: 12, letterSpacing: 1, marginLeft: 8 },
  card: { borderRadius: 24, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2 },
  listCard: { borderRadius: 20, overflow: 'hidden' },
  
  inputLabel: { fontSize: 13, fontWeight: '700' },
  input: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 15 },
  
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontWeight: '800', fontSize: 15 },
  
  measureRow: { flexDirection: 'row', gap: 15 },
  measureCol: { flex: 1 },
  
  settingRowAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  settingIconText: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  iconBox: { width: 46, height: 46, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  settingText: { fontSize: 16, fontWeight: '700' }
});
