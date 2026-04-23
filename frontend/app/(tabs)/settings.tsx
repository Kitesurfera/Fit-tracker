import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, Alert, ScrollView, Linking, ActivityIndicator, KeyboardAvoidingView, Switch, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/api';
import { getWebPushSubscription, testNotification } from '../../src/notifications';

export default function SettingsScreen() {
  const { colors, themeMode, changeTheme } = useTheme();
  const { user, logout } = useAuth(); 
  const router = useRouter();

  const isAthlete = user?.role === 'athlete';

  // --- ESTADOS ---
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(!!user?.web_push_subscription || !!user?.push_token);
  const [loadingPush, setLoadingPush] = useState(false);

  const [measurements, setMeasurements] = useState({
    weight: '', shoulders: '', chest: '', arm: '', thigh: ''
  });
  const [savingMeasures, setSavingMeasures] = useState(false);
  const [timerSoundsEnabled, setTimerSoundsEnabled] = useState(true);

  // Cargar preferencias al entrar
  useEffect(() => {
    AsyncStorage.getItem('timer_sounds_enabled').then(val => {
      if (val === 'false') setTimerSoundsEnabled(false);
    });
  }, []);

  // --- FUNCIONES ---
  const toggleTimerSounds = async (value: boolean) => {
    setTimerSoundsEnabled(value);
    await AsyncStorage.setItem('timer_sounds_enabled', value ? 'true' : 'false');
  };

  const togglePush = async (value: boolean) => {
    if (loadingPush) return;
    setLoadingPush(true);
    
    try {
      if (value) {
        const subscription = await getWebPushSubscription();
        if (!subscription) throw new Error("Permiso denegado.");
        if (api.updateProfile) await api.updateProfile({ web_push_subscription: subscription }); 
        await testNotification();
        setPushEnabled(true);
      } else {
        if (api.updateProfile) await api.updateProfile({ web_push_subscription: null });
        setPushEnabled(false);
      }
    } catch (e) {
      console.error("Error con push:", e);
      setPushEnabled(false);
    } finally {
      setLoadingPush(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    setSavingProfile(true);
    try {
      if (api.updateProfile) await api.updateProfile({ name });
      if (Platform.OS === 'web') window.alert("Perfil actualizado.");
      else Alert.alert("¡Éxito!", "Perfil actualizado.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveMeasurements = async () => {
    const hasData = Object.values(measurements).some(val => val.trim() !== '');
    if (!hasData) return;
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
        if (m.val.trim() !== '' && api.createTest) {
          await api.createTest({ athlete_id: user?.id, test_type: 'medicion', test_name: m.key, value: parseFloat(m.val.replace(',','.')), unit: m.unit, date: today });
        }
      }
      setMeasurements({ weight: '', shoulders: '', chest: '', arm: '', thigh: '' });
      if (Platform.OS === 'web') window.alert("Mediciones guardadas.");
    } finally {
      setSavingMeasures(false);
    }
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: '¡Únete a Fit Tracker y entrena conmigo! Regístrate aquí: https://fit-tracker-azure-iota.vercel.app/',
        url: 'https://fit-tracker-azure-iota.vercel.app/', 
        title: 'Fit Tracker App'
      });
    } catch (error: any) {
      console.error('Error al compartir:', error.message);
    }
  };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Seguro que quieres cerrar sesión?')) { await logout(); router.replace('/'); }
    } else {
      Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Salir', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } }]);
    }
  };

  const renderInputBox = (label: string, iconName: any, value: string, onChange: (t: string) => void, placeholder: string) => (
    <View style={styles.measureCol}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
        <Ionicons name={iconName} size={16} color={colors.primary} />
        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <TextInput 
        style={[styles.measureInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]} 
        keyboardType="numeric" 
        value={value} 
        onChangeText={onChange} 
        placeholder={placeholder} 
        placeholderTextColor={colors.textSecondary} 
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ajustes</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* PERFIL */}
          <View style={styles.profileHeader}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || 'U'}</Text>
            </View>
            <View style={styles.profileTextWrapper}>
              <Text style={[styles.profileName, { color: colors.textPrimary }]}>{name || 'Usuario'}</Text>
              <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                {isAthlete ? 'DEPORTISTA' : 'ENTRENADOR'}
              </Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <TextInput 
                style={[styles.input, { color: colors.textPrimary }]} 
                value={name} 
                onChangeText={setName} 
                placeholder="Tu nombre completo" 
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            
            {name.trim() !== user?.name && (
              <TouchableOpacity style={[styles.saveProfileBtn, { backgroundColor: colors.primary }]} onPress={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveProfileBtnText}>Guardar Nombre</Text>}
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>APARIENCIA</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, paddingVertical: 12 }]}>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
              {['light', 'dark', 'system'].map((m: any) => (
                <TouchableOpacity key={m} style={[styles.themeBtn, themeMode === m && { backgroundColor: colors.primary + '15' }]} onPress={() => changeTheme?.(m)}>
                  <Ionicons name={m === 'light' ? 'sunny' : m === 'dark' ? 'moon' : 'phone-portrait'} size={24} color={themeMode === m ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.themeBtnText, { color: themeMode === m ? colors.primary : colors.textSecondary }]}>{m === 'light' ? 'Claro' : m === 'dark' ? 'Oscuro' : 'Auto'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>NOTIFICACIONES Y AUDIO</Text>
          <View style={[styles.cardList, { backgroundColor: colors.surface }]}>
            <View style={styles.settingRowAction}>
              <View style={styles.settingIconText}>
                <View style={[styles.iconBox, { backgroundColor: '#3B82F615' }]}><Ionicons name="notifications" size={20} color="#3B82F6" /></View>
                <View style={{ flex: 1 }}><Text style={[styles.settingText, { color: colors.textPrimary }]}>Avisos de la App</Text></View>
              </View>
              <Switch value={pushEnabled} onValueChange={togglePush} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF" />
            </View>

            {isAthlete && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.settingRowAction}>
                  <View style={styles.settingIconText}>
                    <View style={[styles.iconBox, { backgroundColor: '#10B98115' }]}><Ionicons name="volume-high" size={20} color="#10B981" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingText, { color: colors.textPrimary }]}>Pitidos de Entreno</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Avisos de 3, 2, 1, Trabajo y Descanso</Text>
                    </View>
                  </View>
                  <Switch value={timerSoundsEnabled} onValueChange={toggleTimerSounds} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF" />
                </View>
              </>
            )}
          </View>

          {isAthlete ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>ACTUALIZAR MEDICIONES</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <View style={styles.measureRow}>
                  {renderInputBox("Peso (kg)", "scale", measurements.weight, (t) => setMeasurements({...measurements, weight: t}), "Ej: 75")}
                  {renderInputBox("Hombros (cm)", "resize", measurements.shoulders, (t) => setMeasurements({...measurements, shoulders: t}), "Ej: 110")}
                </View>
                <View style={styles.measureRow}>
                  {renderInputBox("Pecho (cm)", "shirt", measurements.chest, (t) => setMeasurements({...measurements, chest: t}), "Ej: 98")}
                  {renderInputBox("Brazo (cm)", "fitness", measurements.arm, (t) => setMeasurements({...measurements, arm: t}), "Ej: 35")}
                </View>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 10 }]} onPress={handleSaveMeasurements} disabled={savingMeasures}>
                  {savingMeasures ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Guardar Mediciones</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>COMPARTIR APP</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 14, lineHeight: 22 }}>
                  Comparte este enlace con tus deportistas para que se registren fácilmente en tu equipo.
                </Text>
                <TouchableOpacity 
                  style={[styles.saveBtn, { backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', gap: 10 }]} 
                  onPress={handleShareApp}
                >
                  <Ionicons name="share-social" size={20} color="#FFF" />
                  <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Compartir Enlace</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>ZONA DE PELIGRO</Text>
          <View style={[styles.cardList, { backgroundColor: colors.surface, marginBottom: 40 }]}>
            <TouchableOpacity style={styles.settingRowAction} onPress={handleLogout}>
              <View style={[styles.iconBox, { backgroundColor: '#EF444415' }]}><Ionicons name="log-out" size={20} color="#EF4444" /></View>
              <Text style={[styles.settingText, { color: '#EF4444', marginLeft: 16, flex: 1 }]}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, paddingHorizontal: 10 },
  avatarCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  avatarText: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  profileTextWrapper: { marginLeft: 20, flex: 1 },
  profileName: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  roleText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 12, letterSpacing: 1.5, marginLeft: 12 },
  card: { borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardList: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  divider: { height: 1, marginLeft: 65, opacity: 0.3 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  input: { flex: 1, fontSize: 16, fontWeight: '600', paddingVertical: 12 },
  saveProfileBtn: { marginTop: 15, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveProfileBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  inputLabel: { fontSize: 12, fontWeight: '800' },
  measureInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontWeight: '600', marginBottom: 15 },
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontWeight: '800', fontSize: 15 },
  measureRow: { flexDirection: 'row', gap: 15 },
  measureCol: { flex: 1 },
  settingRowAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingIconText: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  iconBox: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  settingText: { fontSize: 15, fontWeight: '700' },
  themeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  themeBtnText: { fontSize: 11, fontWeight: '800', marginTop: 6, textTransform: 'uppercase' }
});
