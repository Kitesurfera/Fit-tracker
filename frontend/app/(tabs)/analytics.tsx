import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import { useAuth } from '../../src/context/AuthContext';

const { width } = Dimensions.get('window');

const TEST_TRANSLATIONS: Record<string, string> = {
  squat_rm: 'Sentadilla RM',
  bench_rm: 'Press Banca RM',
  deadlift_rm: 'Peso Muerto RM',
  cmj: 'Salto CMJ',
  sj: 'Salto SJ',
  dj: 'Drop Jump (DJ)',
  hamstring: 'Isquiotibiales',
  calf: 'Gemelos',
  quadriceps: 'Cuádriceps',
  tibialis: 'Tibial'
};

const CATEGORY_COLORS: Record<string, string> = {
  'FUERZA MÁXIMA': '#EF4444', 
  'PLIOMETRÍA': '#F59E0B',    
  'FUERZA': '#10B981',        
};

// --- UTILIDADES DE PROCESAMIENTO ---
const detectSide = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('izq') || lower.includes('left')) return 'left';
  if (lower.includes('der') || lower.includes('right')) return 'right';
  return 'bilateral';
};

const getBaseTestName = (name: string) => {
  return name.replace(/(\(|\s*-?\s*)(izq|der|left|right|izquierda|derecha)(\)|\s*$)/i, '').trim();
};

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isTrainer = user?.role === 'trainer';

  const [activeTab, setActiveTab] = useState<'summary' | 'progress'>('summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (isTrainer) {
        const aths = await api.getAthletes();
        setAthletes(aths);
        if (aths.length > 0) handleSelectAthlete(aths[0]);
      } else {
        loadAthleteData(user?.id);
      }
    };
    init();
  }, [isTrainer]);

  const loadAthleteData = async (athleteId: string | undefined) => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const [sum, ts, wk] = await Promise.all([
        api.getSummary(athleteId).catch(() => null),
        api.getTests({ athlete_id: athleteId }).catch(() => []),
        api.getWorkouts({ athlete_id: athleteId }).catch(() => [])
      ]);
      setSummary(sum);
      setTestHistory(ts);
      setWorkoutHistory(wk.filter((w:any) => w.completed));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSelectAthlete = (athlete: any) => {
    setSelectedAthlete(athlete);
    setShowPicker(false);
    loadAthleteData(athlete.id);
  };

  // --- LÓGICA DE AGRUPACIÓN DE TESTS (IZQ / DER) ---
  const getGroupedTests = () => {
    if (!testHistory.length) return [];
    
    const groups: Record<string, any> = {};

    testHistory.forEach(t => {
      const date = t.date;
      const baseName = getBaseTestName(t.name || t.test_type || '');
      const side = detectSide(t.name || t.test_type || '');
      const key = `${date}_${baseName}`;

      if (!groups[key]) {
        groups[key] = { 
          date, 
          baseName, 
          left: null, 
          right: null, 
          bi: null, 
          unit: t.unit,
          category: t.category || t.test_type 
        };
      }

      if (side === 'left') groups[key].left = t;
      else if (side === 'right') groups[key].right = t;
      else groups[key].bi = t;
    });

    return Object.values(groups).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const renderTestCard = (group: any, index: number) => {
    const hasBoth = group.left && group.right;
    let asymmetry = 0;
    if (hasBoth) {
      const vL = parseFloat(group.left.value);
      const vR = parseFloat(group.right.value);
      asymmetry = Math.abs(((vL - vR) / Math.max(vL, vR)) * 100);
    }

    const badgeColor = CATEGORY_COLORS[group.category?.toUpperCase()] || colors.primary;

    return (
      <View key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.testHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.testName, { color: colors.textPrimary }]}>
              {TEST_TRANSLATIONS[group.baseName.toLowerCase()] || group.baseName}
            </Text>
            <Text style={[styles.testDate, { color: colors.textSecondary }]}>{group.date}</Text>
          </View>
          {hasBoth && (
            <View style={[styles.asymBadge, { backgroundColor: asymmetry > 15 ? '#EF4444' : colors.surfaceHighlight }]}>
              <Text style={{ color: asymmetry > 15 ? '#FFF' : colors.textSecondary, fontSize: 10, fontWeight: '800' }}>
                {asymmetry.toFixed(1)}% ASIM.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.testValuesRow}>
          {group.bi ? (
            <View style={styles.valueBox}>
              <Text style={[styles.testValue, { color: colors.textPrimary }]}>{group.bi.value} <Text style={styles.unitText}>{group.unit}</Text></Text>
              <Text style={styles.sideLabel}>BILATERAL</Text>
            </View>
          ) : (
            <>
              <View style={[styles.valueBox, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                <Text style={[styles.testValue, { color: '#3B82F6' }]}>{group.left?.value || '-'}</Text>
                <Text style={styles.sideLabel}>IZQUIERDA</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={[styles.testValue, { color: '#EF4444' }]}>{group.right?.value || '-'}</Text>
                <Text style={styles.sideLabel}>DERECHA</Text>
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  const groupedTests = getGroupedTests();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {isTrainer ? (selectedAthlete?.name || 'Rendimiento') : 'Mi Rendimiento'}
          </Text>
          {isTrainer && (
            <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.pickerBtn}>
              <Ionicons name="people" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>RESULTADOS DE TESTS</Text>
        {groupedTests.length > 0 ? (
          groupedTests.map(renderTestCard)
        ) : (
          <View style={styles.emptyBox}><Text style={{ color: colors.textSecondary }}>No hay tests registrados.</Text></View>
        )}
      </ScrollView>

      {/* MODAL PICKER ATLETA */}
      <Modal visible={showPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Atleta</Text>
            {athletes.map(a => (
              <TouchableOpacity key={a.id} style={styles.athleteItem} onPress={() => handleSelectAthlete(a)}>
                <Text style={{ color: colors.textPrimary }}>{a.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowPicker(false)} style={{ marginTop: 20 }}><Text style={{ color: colors.primary, textAlign: 'center' }}>Cerrar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 24, fontWeight: '900' },
  pickerBtn: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)' },
  sectionTitle: { fontSize: 12, fontWeight: '800', marginBottom: 15, letterSpacing: 1 },
  testCard: { padding: 18, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  testName: { fontSize: 17, fontWeight: '800' },
  testDate: { fontSize: 12, marginTop: 2 },
  asymBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  testValuesRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingTop: 10 },
  valueBox: { flex: 1, alignItems: 'center' },
  testValue: { fontSize: 22, fontWeight: '900' },
  unitText: { fontSize: 12, fontWeight: '600' },
  sideLabel: { fontSize: 9, fontWeight: '800', marginTop: 4, color: '#888' },
  emptyBox: { padding: 40, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { padding: 25, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20 },
  athleteItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }
});
