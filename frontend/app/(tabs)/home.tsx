import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router'; // Añadido useFocusEffect
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

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [athletes, setAthletes] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeMicro, setActiveMicro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showWellness, setShowWellness] = useState(false);
  const [tip] = useState(ELITE_TIPS[Math.floor(Math.random() * ELITE_TIPS.length)]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newAthlete, setNewAthlete] = useState({ name: '', email: '', password: '', gender: 'Femenino' });

  const isTrainer = user?.role === 'trainer';
  const firstName = user?.name?.split(' ')[0] || 'Usuario';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  // --- FUNCIÓN DE CARGA ---
  const loadData = async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(data);
      } else {
        const [wData, sData, treeData] = await Promise.all([
          api.getWorkouts(),
          api.getSummary(),
          api.getPeriodizationTree(user.id)
        ]);
        setWorkouts(wData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setSummary(sData);

        let foundMicro = null;
        if (treeData && Array.isArray(treeData)) {
          treeData.forEach(macro => {
            macro.microciclos?.forEach(micro => {
              if (todayStr >= micro.fecha_inicio && todayStr <= micro.fecha_fin) {
                foundMicro = { ...micro, macroNombre: macro.nombre };
              }
            });
          });
        }
        setActiveMicro(foundMicro);
      }
    } catch (e) {
      console.log("Error cargando dashboard:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setUpdating(false);
    }
  };

  // --- AUTO-REFRESCO AL ENTRAR (Mejora solicitada) ---
  useFocusEffect(
    useCallback(() => {
      loadData(true); // Carga silenciosa para no molestar con el spinner
    }, [])
  );

  const handleManualUpdate = () => {
    setUpdating(true);
    loadData();
  };

  const handleAddAthlete = async () => {
    if (!newAthlete.name || !newAthlete.email || !newAthlete.password) {
      Alert.alert("Campos incompletos", "Por favor, rellena todos los datos.");
      return;
    }
    try {
      await api.createAthlete(newAthlete);
      setShowAddModal(false);
      loadData();
      Alert.alert("Éxito", "Deportista añadido correctamente.");
    } catch (e) { Alert.alert("Error", "No se pudo añadir al deportista."); }
  };

  // --- VISTA ENTRENADOR ---
  const TrainerView = () => (
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
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAddModal(true)}>
              <Ionicons name="person-add" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity 
          style={[styles.athleteCard, { backgroundColor: colors.surface }]} 
          onPress={() => router.push({ pathname: "/athlete-detail", params: { id: item.id, name: item.name } })}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
            <Text style={{color: colors.primary, fontWeight: '800'}}>{item.name.charAt(0)}</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Registrado el {new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.border} />
        </TouchableOpacity>
      )}
    />
  );

  // --- VISTA DEPORTISTA (Claudia) ---
  const AthleteView = () => (
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

          {/* SORPRESA: Tip de Élite */}
          <View style={[styles.tipCard, { backgroundColor: colors.surfaceHighlight }]}>
            <Ionicons name="bulb-outline" size={16} color={colors.primary} />
            <Text style={[styles.tipText, { color: colors.textPrimary }]}>{tip}</Text>
          </View>

          <View style={[styles.phaseCard, { backgroundColor: activeMicro?.color || colors.primary }]}>
            <View style={styles.phaseInfo}>
              <Text style={styles.phaseLabel}>PLANIFICACIÓN ACTUAL</Text>
              <Text style={styles.phaseName}>{activeMicro ? activeMicro.nombre : 'Sin fase asignada'}</Text>
              <Text style={styles.macroRef}>{activeMicro ? `Macro: ${activeMicro.macroNombre}` : 'Consulta con tu entrenador'}</Text>
            </View>
            <View style={styles.phaseBadge}><Text style={styles.phaseBadgeText}>{activeMicro?.tipo || 'BASE'}</Text></View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="pulse" size={22} color={colors.success} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.latest_wellness?.hr_rest || '--'}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>HR REPOSO</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="ribbon-outline" size={22} color={colors.primary} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.completion_rate || '0'}%</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ADHERENCIA</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.fullBtn, { backgroundColor: colors.surface }]} onPress={() => setShowWellness(true)}>
            <Ionicons name="fitness-outline" size={22} color={colors.success} />
            <Text style={[styles.actionText, { color: colors.textPrimary }]}>Registrar Wellness</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>SESIONES PROGRAMADAS</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={[styles.sessionCard, { backgroundColor: colors.surface, opacity: item.completed ? 0.7 : 1 }]} onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: item.id } })}>
          <View style={[styles.avatarCircle, { backgroundColor: item.completed ? colors.success + '15' : colors.primary + '15' }]}>
            <Ionicons name={item.completed ? "checkmark-done" : "barbell"} size={20} color={item.completed ? colors.success : colors.primary} />
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

  if (loading && !refreshing) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {isTrainer ? <TrainerView /> : <AthleteView />}
      
      <WellnessModal isVisible={showWellness} onClose={() => { setShowWellness(false); loadData(true); }} />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Añadir Deportista</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre" placeholderTextColor="#888" onChangeText={t => setNewAthlete({...newAthlete, name: t})} />
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Email" placeholderTextColor="#888" autoCapitalize="none" onChangeText={t => setNewAthlete({...newAthlete, email: t})} />
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Contraseña Provisional" placeholderTextColor="#888" secureTextEntry onChangeText={t => setNewAthlete({...newAthlete, password: t})} />
            <View style={styles.genderRow}>
              {['Masculino', 'Femenino'].map(g => (
                <TouchableOpacity key={g} style={[styles.genderBtn, { borderColor: colors.border }, newAthlete.gender === g && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setNewAthlete({...newAthlete, gender: g})}>
                  <Text style={{ color: newAthlete.gender === g ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleAddAthlete}>
              <Text style={{ color: '#FFF', fontWeight: '800' }}>GUARDAR PERFIL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAddModal(false)} style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  dateLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  welcomeText: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  refreshBtn: { padding: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.02)' },
  actionBtn: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  athleteCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginHorizontal: 20, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  
  tipCard: { flexDirection: 'row', padding: 14, borderRadius: 16, marginHorizontal: 0, marginBottom: 20, alignItems: 'center', gap: 10 },
  tipText: { fontSize: 13, fontWeight: '600', flex: 1, fontStyle: 'italic' },

  phaseCard: { flexDirection: 'row', padding: 20, borderRadius: 24, marginBottom: 25, alignItems: 'center' },
  phaseInfo: { flex: 1 },
  phaseLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  phaseName: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 2 },
  macroRef: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
  phaseBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  phaseBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  metricsGrid: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  metricCard: { flex: 1, padding: 18, borderRadius: 22, alignItems: 'center', elevation: 1 },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 5 },
  metricLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },

  fullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, marginBottom: 30, gap: 12 },
  actionText: { fontWeight: '800', fontSize: 15 },
  
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1.5, textTransform: 'uppercase' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 22, marginHorizontal: 20, marginBottom: 12 },
  avatarCircle: { width: 46, height: 46, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 25 },
  modalContent: { borderRadius: 30, padding: 25 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 25, textAlign: 'center' },
  input: { borderWidth: 1, padding: 16, borderRadius: 15, marginBottom: 15, fontSize: 16 },
  genderRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  genderBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  submitBtn: { padding: 18, borderRadius: 18, alignItems: 'center', elevation: 2 }
});
