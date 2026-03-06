import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import WellnessModal from '../../src/components/WellnessModal';

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
  const [showWellness, setShowWellness] = useState(false);

  // Estados para añadir deportista
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAthlete, setNewAthlete] = useState({ 
    name: '', email: '', password: '', gender: 'Femenino' 
  });

  const isTrainer = user?.role === 'trainer';
  const firstName = user?.name?.split(' ')[0] || 'Usuario';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
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
    }
  };

  const handleAddAthlete = async () => {
    if (!newAthlete.name || !newAthlete.email || !newAthlete.password) {
      Alert.alert("Error", "Rellena todos los campos obligatorios.");
      return;
    }
    try {
      await api.createAthlete(newAthlete);
      setShowAddModal(false);
      setNewAthlete({ name: '', email: '', password: '', gender: 'Femenino' });
      loadData();
      Alert.alert("Éxito", "Deportista registrado.");
    } catch (e) {
      Alert.alert("Error", "No se pudo registrar al deportista.");
    }
  };

  const confirmDelete = (athlete: any) => {
    Alert.alert("Eliminar", `¿Borrar a ${athlete.name}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
          try {
            await api.deleteAthlete(athlete.id);
            loadData();
          } catch (e) { Alert.alert("Error", "No se pudo eliminar."); }
      }}
    ]);
  };

  const TrainerView = () => (
    <View style={{ flex: 1 }}>
      <FlatList
        data={athletes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); loadData();}} />}
        ListHeaderComponent={
          <View style={styles.container}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
            <View style={styles.headerRow}>
              <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Mis Atletas</Text>
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAddModal(true)}>
                <Ionicons name="person-add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.athleteCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity 
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              onPress={() => router.push({ pathname: "/athlete-detail", params: { id: item.id, name: item.name } })}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{item.name.charAt(0)}</Text>
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.gender}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );

  const AthleteView = () => (
    <FlatList
      data={workouts}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); loadData();}} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
          <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Hola, {firstName} 💪</Text>

          <View style={[styles.phaseCard, { backgroundColor: activeMicro?.color || colors.primary }]}>
            <View style={styles.phaseInfo}>
              <Text style={styles.phaseLabel}>MICROCICLO ACTUAL</Text>
              <Text style={styles.phaseName}>{activeMicro ? activeMicro.nombre : 'Sin fase activa'}</Text>
              <Text style={styles.macroRef}>{activeMicro ? `Macro: ${activeMicro.macroNombre}` : 'Planificación abierta'}</Text>
            </View>
            <View style={styles.phaseBadge}><Text style={styles.phaseBadgeText}>{activeMicro?.tipo || 'BASE'}</Text></View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="pulse" size={22} color={colors.success} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.latest_wellness?.hr_rest || '--'}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>PULSO REPOSO</Text>
            </View>
            <View style={[styles.metricCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="ribbon-outline" size={22} color={colors.primary} />
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{summary?.completion_rate || '0'}%</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>ADHERENCIA</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.fullActionBtn, { backgroundColor: colors.surface }]} onPress={() => setShowWellness(true)}>
            <Ionicons name="add-circle" size={22} color={colors.success} />
            <Text style={[styles.actionText, { color: colors.textPrimary }]}>Registrar Wellness</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>SESIONES PROGRAMADAS</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: colors.surface, opacity: item.completed ? 0.7 : 1 }]}
          onPress={() => router.push({ pathname: '/training-mode', params: { workoutId: item.id } })}
        >
          <View style={[styles.avatarCircle, { backgroundColor: item.completed ? colors.success + '15' : colors.primary + '15' }]}>
            <Ionicons name={item.completed ? "checkmark" : "barbell"} size={20} color={item.completed ? colors.success : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary, textDecorationLine: item.completed ? 'line-through' : 'none' }]}>{item.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.date}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.border} />
        </TouchableOpacity>
      )}
    />
  );

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {isTrainer ? <TrainerView /> : <AthleteView />}
      
      <WellnessModal isVisible={showWellness} onClose={() => { setShowWellness(false); loadData(); }} />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Nuevo Deportista</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre" placeholderTextColor="#888" onChangeText={t => setNewAthlete({...newAthlete, name: t})} />
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Email" placeholderTextColor="#888" autoCapitalize="none" onChangeText={t => setNewAthlete({...newAthlete, email: t})} />
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Contraseña" placeholderTextColor="#888" secureTextEntry onChangeText={t => setNewAthlete({...newAthlete, password: t})} />
            <View style={styles.genderRow}>
              {['Masculino', 'Femenino'].map(g => (
                <TouchableOpacity key={g} style={[styles.genderBtn, { borderColor: colors.border }, newAthlete.gender === g && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setNewAthlete({...newAthlete, gender: g})}>
                  <Text style={{ color: newAthlete.gender === g ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleAddAthlete}>
              <Text style={{ color: '#FFF', fontWeight: '800' }}>CREAR CUENTA</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAddModal(false)} style={{ marginTop: 15, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>Cancelar</Text>
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 },
  dateLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  welcomeText: { fontSize: 28, fontWeight: '900' },
  addBtn: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  athleteCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginHorizontal: 20, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  phaseCard: { flexDirection: 'row', padding: 20, borderRadius: 24, marginBottom: 20, alignItems: 'center', marginTop: 15 },
  phaseInfo: { flex: 1 },
  phaseLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  phaseName: { color: '#FFF', fontSize: 20, fontWeight: '900', marginTop: 2 },
  macroRef: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
  phaseBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  phaseBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  metricsGrid: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  metricCard: { flex: 1, padding: 18, borderRadius: 22, alignItems: 'center' },
  metricValue: { fontSize: 22, fontWeight: '900', marginTop: 5 },
  metricLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  fullActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 20, marginBottom: 25, gap: 10 },
  actionText: { fontWeight: '700', fontSize: 15 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 15, letterSpacing: 1 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, marginHorizontal: 20, marginBottom: 10 },
  avatarCircle: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 25 },
  modalContent: { borderRadius: 30, padding: 25 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, padding: 15, borderRadius: 15, marginBottom: 15 },
  genderRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  genderBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  submitBtn: { padding: 18, borderRadius: 18, alignItems: 'center' }
});
