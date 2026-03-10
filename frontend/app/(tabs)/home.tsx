import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import WellnessModal from '../../src/components/WellnessModal';

const ELITE_TIPS = [
  "La disciplina es hacer lo que debes, incluso cuando no quieres.",
  "Tu mayor competición eres tú misma ayer.",
  "El descanso es parte del entrenamiento, no una recompensa.",
  "La constancia vence al talento cuando el talento no se esfuerza.",
  "Pequeñas mejoras diarias crean resultados excepcionales."
];

const CYCLE_PHASES = [
  { id: 'menstrual', label: 'Menstrual', color: '#EF4444' },
  { id: 'folicular', label: 'Folicular', color: '#10B981' },
  { id: 'ovulatoria', label: 'Ovulatoria', color: '#F59E0B' },
  { id: 'lutea', label: 'Lútea', color: '#8B5CF6' }
];

export default function HomeScreen() {
  const { user, loading: authLoading } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [athletes, setAthletes] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [activeMicro, setActiveMicro] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showWellness, setShowWellness] = useState(false);
  const [tip] = useState(ELITE_TIPS[Math.floor(Math.random() * ELITE_TIPS.length)]);

  const [showAthleteModal, setShowAthleteModal] = useState(false);
  const [editingAthleteId, setEditingAthleteId] = useState<string | null>(null);
  // Añadimos 'sport' al estado del formulario
  const [athleteForm, setAthleteForm] = useState({ name: '', email: '', password: '', gender: 'Femenino', sport: '' });

  const isTrainer = user?.role === 'trainer';
  const firstName = user?.name?.split(' ')[0] || 'Atleta';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const isFemale = ['female', 'mujer', 'femenino'].includes(user?.gender?.toLowerCase() || '');

  const loadData = async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(data || []);
      } else {
        const [wData, sData, treeData] = await Promise.all([
          api.getWorkouts(),
          api.getSummary(),
          api.getPeriodizationTree(user.id)
        ]);
        setWorkouts(wData?.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()) || []);
        setSummary(sData);

        let foundMicro = null;
        if (treeData?.macros && Array.isArray(treeData.macros)) {
          treeData.macros.forEach((macro: any) => {
            const micros = macro.microciclos || macro.microcycles || [];
            micros.forEach((micro: any) => {
              const start = micro.fecha_inicio || micro.start_date;
              const end = micro.fecha_fin || micro.end_date;
              if (start && end && todayStr >= start && todayStr <= end) {
                foundMicro = { 
                  ...micro, 
                  macroNombre: macro.nombre || macro.name || 'Macro',
                  nombre: micro.nombre || micro.name || 'Micro',
                  tipo: micro.tipo || micro.type || 'BASE',
                  color: micro.color || colors.primary
                };
              }
            });
          });
        }
        setActiveMicro(foundMicro);
        return sData;
      }
    } catch (e) {
      console.log("Error cargando dashboard:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setUpdating(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        const sData = await loadData(true);
        if (!isTrainer && sData?.latest_wellness?.date !== todayStr) {
          setShowWellness(true);
        }
      };
      init();
    }, [])
  );

  const handleManualUpdate = () => {
    setUpdating(true);
    loadData();
  };

  const openNewAthlete = () => {
    setEditingAthleteId(null);
    setAthleteForm({ name: '', email: '', password: '', gender: 'Femenino', sport: '' });
    setShowAthleteModal(true);
  };

  const openEditAthlete = (athlete: any) => {
    setEditingAthleteId(athlete.id);
    setAthleteForm({ 
      name: athlete.name, 
      email: athlete.email, 
      password: '', 
      gender: athlete.gender || 'Femenino',
      sport: athlete.sport || '' // Cargamos el deporte si existe
    });
    setShowAthleteModal(true);
  };

  const handleSaveAthlete = async () => {
    if (!athleteForm.name || !athleteForm.email || (!editingAthleteId && !athleteForm.password)) {
      Alert.alert("Campos incompletos", "Rellena todos los datos obligatorios.");
      return;
    }
    try {
      if (editingAthleteId) {
        if (api.updateAthlete) await api.updateAthlete(editingAthleteId, athleteForm);
      } else {
        if (api.createAthlete) await api.createAthlete(athleteForm);
      }
      setShowAthleteModal(false);
      loadData();
    } catch (e) { 
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo guardar la información del deportista."); 
    }
  };

  const executeDelete = async (id: string) => {
    try {
      if (api.deleteAthlete) {
        await api.deleteAthlete(id);
        loadData();
      }
    } catch (e) {
      if (Platform.OS !== 'web') Alert.alert("Error", "No se pudo eliminar al deportista.");
    }
  };

  const handleDeleteAthlete = (id: string, name: string) => {
    if (Platform.OS === 'web') {
      const isConfirmed = window.confirm(`¿Seguro que quieres eliminar a ${name}?\nSe borrará todo su historial.`);
      if (isConfirmed) executeDelete(id);
    } else {
      Alert.alert("Eliminar", `¿Seguro que quieres borrar a ${name}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "ELIMINAR", style: "destructive", onPress: () => executeDelete(id) }
      ]);
    }
  };

  const handleQuickPhaseUpdate = async (phaseId: string) => {
    setSummary((prev: any) => ({
      ...prev,
      latest_wellness: {
        ...(prev?.latest_wellness || { fatigue: 3, stress: 3, sleep_quality: 3, soreness: 3, notes: '' }),
        cycle_phase: phaseId
      }
    }));
    try {
      const baseData = summary?.latest_wellness || {};
      const payload = {
         fatigue: baseData.fatigue || 3,
         stress: baseData.stress || 3,
         sleep_quality: baseData.sleep_quality || 3,
         soreness: baseData.soreness || 3,
         notes: baseData.notes || '',
         cycle_phase: phaseId
      };
      await api.postWellness(payload);
    } catch (e) {
      console.error("Error guardando fase en el servidor", e);
    }
  };

  if (authLoading || (!user && !isTrainer)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderTrainerView = () => (
    <FlatList
      data={athletes}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Panel Coach</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Gestionando a {athletes.length} atletas</Text>
            </View>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={openNewAthlete}>
              <Ionicons name="person-add" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.athleteCard, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.athleteInfoArea} onPress={() => router.push({ pathname: "/athlete-detail", params: { id: item.id, name: item.name } })}>
            <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
              <Text style={{color: colors.primary, fontWeight: '800'}}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
              {/* AQUÍ SE MUESTRA EL DEPORTE EN LUGAR DEL TEXTO GENÉRICO */}
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{item.sport || 'Deportista multidisciplinar'}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.athleteActionsArea}>
            <TouchableOpacity onPress={() => openEditAthlete(item)} style={styles.iconHitbox}><Ionicons name="pencil-outline" size={20} color={colors.textSecondary} /></TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteAthlete(item.id, item.name)} style={styles.iconHitbox}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>
          </View>
        </View>
      )}
    />
  );

  const renderAthleteView = () => {
    const currentPhase = summary?.latest_wellness?.cycle_phase;

    return (
      <FlatList
        data={workouts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.container}>
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
                <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Hola, {firstName} 💪</Text>
              </View>
              <TouchableOpacity onPress={handleManualUpdate} disabled={updating} style={styles.refreshBtn}>
                {updating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync" size={24} color={colors.primary} />}
              </TouchableOpacity>
            </View>

            <View style={[styles.tipCard, { backgroundColor: colors.surfaceHighlight }]}>
              <Ionicons name="bulb-outline" size={16} color={colors.primary} />
              <Text style={[styles.tipText, { color: colors.textPrimary }]}>{tip}</Text>
            </View>

            {isFemale && (
              <View style={{ marginBottom: 25 }}>
                <Text style={styles.sectionTitle}>TU CICLO ACTUAL</Text>
                <View style={styles.cycleChipsContainer}>
                  {CYCLE_PHASES.map(phase => {
                    const isActive = currentPhase === phase.id;
                    return (
                      <TouchableOpacity 
                        key={phase.id}
                        style={[
                          styles.dashboardPhaseChip, 
                          { borderColor: colors.border, backgroundColor: colors.surface },
                          isActive && { backgroundColor: phase.color, borderColor: phase.color }
                        ]}
                        onPress={() => handleQuickPhaseUpdate(phase.id)}
                      >
                        <Text style={{ color: isActive ? '#FFF' : colors.textSecondary, fontWeight: isActive ? '800' : '600', fontSize: 12 }}>
                          {phase.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={[styles.phaseCard, { backgroundColor: activeMicro?.color || colors.primary }]}>
              <View style={styles.phaseInfo}>
                <Text style={styles.phaseLabel}>PLANIFICACIÓN ACTUAL</Text>
                <Text style={styles.phaseName}>{activeMicro ? activeMicro.nombre : 'Periodización libre'}</Text>
                <Text style={styles.macroRef}>{activeMicro ? `Macro: ${activeMicro.macroNombre}` : 'Entrena con cabeza'}</Text>
              </View>
              <View style={styles.phaseBadge}><Text style={styles.phaseBadgeText}>{activeMicro?.tipo || 'BASE'}</Text></View>
            </View>

            <View style={styles.metricsGrid}>
              <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="flash-outline" size={22} color={colors.success || '#10B981'} />
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.latest_wellness?.fatigue || '-'}</Text>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>NIVEL FATIGA</Text>
              </View>
              <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
                <Ionicons name="ribbon-outline" size={22} color={colors.primary} />
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.completion_rate || '0'}%</Text>
                <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ADHERENCIA</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.fullBtn, { backgroundColor: colors.surface }]} onPress={() => setShowWellness(true)}>
              <Ionicons name="fitness-outline" size={22} color={colors.success || '#10B981'} />
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Actualizar Wellness de Hoy</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>SESIONES PROGRAMADAS</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.sessionCard, { backgroundColor: colors.surface, opacity: item.completed ? 0.7 : 1 }]} onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: item.id } })}>
            <View style={[styles.avatarCircle, { backgroundColor: item.completed ? (colors.success || '#10B981') + '15' : colors.primary + '15' }]}>
              <Ionicons name={item.completed ? "checkmark-done" : "barbell"} size={20} color={item.completed ? (colors.success || '#10B981') : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, textDecorationLine: item.completed ? 'line-through' : 'none' }]}>{item.title}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.date}</Text>
            </View>
            <Ionicons name="play" size={18} color={item.completed ? colors.border : colors.primary} />
          </TouchableOpacity>
        )}
      />
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {isTrainer ? renderTrainerView() : renderAthleteView()}
      <WellnessModal isVisible={showWellness} onClose={() => { setShowWellness(false); loadData(true); }} />
      <Modal visible={showAthleteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingAthleteId ? 'Editar Deportista' : 'Añadir Deportista'}</Text>
            
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre Completo" placeholderTextColor="#888" value={athleteForm.name} onChangeText={t => setAthleteForm({...athleteForm, name: t})} />
            
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Email" placeholderTextColor="#888" autoCapitalize="none" keyboardType="email-address" value={athleteForm.email} onChangeText={t => setAthleteForm({...athleteForm, email: t})} />
            
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder={editingAthleteId ? "Nueva Contraseña (Opcional)" : "Contraseña"} placeholderTextColor="#888" secureTextEntry value={athleteForm.password} onChangeText={t => setAthleteForm({...athleteForm, password: t})} />
            
            {/* NUEVO CAMPO: DEPORTE */}
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Deporte (Ej: Kitesurf freestyle)" placeholderTextColor="#888" value={athleteForm.sport} onChangeText={t => setAthleteForm({...athleteForm, sport: t})} />

            <View style={styles.genderRow}>
              {['Masculino', 'Femenino'].map(g => (
                <TouchableOpacity key={g} style={[styles.genderBtn, { borderColor: colors.border }, athleteForm.gender === g && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setAthleteForm({...athleteForm, gender: g})}>
                  <Text style={{ color: athleteForm.gender === g ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSaveAthlete}>
              <Text style={{ color: '#FFF', fontWeight: '800' }}>{editingAthleteId ? 'ACTUALIZAR PERFIL' : 'GUARDAR PERFIL'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setShowAthleteModal(false)} style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>Cerrar</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }, dateLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }, welcomeText: { fontSize: 26, fontWeight: '900', marginTop: 2 }, refreshBtn: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.02)' }, actionBtn: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' }, athleteCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden' }, athleteInfoArea: { flexDirection: 'row', alignItems: 'center', flex: 1, padding: 18 }, athleteActionsArea: { flexDirection: 'row', alignItems: 'center', paddingRight: 15, gap: 10 }, iconHitbox: { padding: 8 }, avatar: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, cardTitle: { fontSize: 16, fontWeight: '700' }, tipCard: { flexDirection: 'row', padding: 14, borderRadius: 16, marginBottom: 20, alignItems: 'center', gap: 10 }, tipText: { fontSize: 13, fontWeight: '600', flex: 1, fontStyle: 'italic' }, phaseCard: { flexDirection: 'row', padding: 20, borderRadius: 24, marginBottom: 25, alignItems: 'center' }, phaseInfo: { flex: 1 }, phaseLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, phaseName: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 2 }, macroRef: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 }, phaseBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }, phaseBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, metricsGrid: { flexDirection: 'row', gap: 15, marginBottom: 20 }, metricCard: { flex: 1, padding: 18, borderRadius: 22, alignItems: 'center' }, metricValue: { fontSize: 22, fontWeight: '900', marginTop: 5 }, metricLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 }, fullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, marginBottom: 30, gap: 12 }, actionText: { fontWeight: '800', fontSize: 15 }, sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1.5, textTransform: 'uppercase' }, sessionCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 22, marginHorizontal: 20, marginBottom: 12 }, avatarCircle: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 }, modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }, modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 40 }, modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 25, textAlign: 'center' }, input: { borderWidth: 1, padding: 16, borderRadius: 15, marginBottom: 15, fontSize: 16 }, genderRow: { flexDirection: 'row', gap: 10, marginBottom: 25 }, genderBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 }, submitBtn: { padding: 18, borderRadius: 18, alignItems: 'center', elevation: 2 }, cycleChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, dashboardPhaseChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 }
});
