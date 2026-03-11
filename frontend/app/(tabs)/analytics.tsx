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

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isTrainer = user?.role === 'trainer';

  const [activeTab, setActiveTab] = useState<'summary' | 'progress'>('summary');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (isTrainer) {
        const aths = await api.getAthletes().catch(() => []);
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
      const [sum, ts] = await Promise.all([
        api.getSummary(athleteId).catch(() => null),
        api.getTests({ athlete_id: athleteId }).catch(() => []),
      ]);
      setSummary(sum);
      // Ordenamos por fecha descendente
      setTestHistory(Array.isArray(ts) ? ts.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []);
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

  const renderTestCard = (test: any, index: number) => {
    const valL = parseFloat(test.value_left);
    const valR = parseFloat(test.value_right);
    const hasSides = !isNaN(valL) && !isNaN(valR) && (valL !== 0 || valR !== 0);
    
    let asymmetry = 0;
    if (hasSides) {
      const maxVal = Math.max(valL, valR);
      asymmetry = maxVal > 0 ? Math.abs(((valL - valR) / maxVal) * 100) : 0;
    }

    const testName = test.test_name === 'custom' ? test.custom_name : (TEST_TRANSLATIONS[test.test_name] || test.test_name || 'Test');
    const badgeColor = CATEGORY_COLORS[test.test_type?.toUpperCase()] || colors.primary;

    return (
      <View key={index} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.testHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.testName, { color: colors.textPrimary }]}>{testName}</Text>
            <Text style={[styles.testDate, { color: colors.textSecondary }]}>{test.date}</Text>
          </View>
          {hasSides && (
            <View style={[styles.asymBadge, { backgroundColor: asymmetry > 15 ? colors.error : colors.primary + '20' }]}>
              <Text style={{ color: asymmetry > 15 ? '#FFF' : colors.primary, fontSize: 10, fontWeight: '900' }}>
                {asymmetry.toFixed(1)}% ASIM.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.testValuesRow}>
          {hasSides ? (
            <>
              <View style={[styles.valueBox, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                <Text style={[styles.testValue, { color: '#3B82F6' }]}>{valL}</Text>
                <Text style={styles.sideLabel}>IZQUIERDA ({test.unit})</Text>
              </View>
              <View style={styles.valueBox}>
                <Text style={[styles.testValue, { color: '#EF4444' }]}>{valR}</Text>
                <Text style={styles.sideLabel}>DERECHA ({test.unit})</Text>
              </View>
            </>
          ) : (
            <View style={styles.valueBox}>
              <Text style={[styles.testValue, { color: colors.textPrimary }]}>{test.value} <Text style={{fontSize: 14}}>{test.unit}</Text></Text>
              <Text style={styles.sideLabel}>RESULTADO GLOBAL</Text>
            </View>
          )}
        </View>
        {test.notes ? <Text style={[styles.testNotes, { color: colors.textSecondary }]}>{test.notes}</Text> : null}
      </View>
    );
  };

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

        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>HISTORIAL DE TESTS</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : testHistory.length > 0 ? (
          testHistory.map(renderTestCard)
        ) : (
          <View style={styles.emptyBox}><Text style={{ color: colors.textSecondary }}>No hay tests registrados.</Text></View>
        )}
      </ScrollView>

      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Atleta</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {athletes.map(a => (
                <TouchableOpacity key={a.id} style={styles.athleteItem} onPress={() => handleSelectAthlete(a)}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.closeBtn}><Text style={{ color: '#FFF', fontWeight: '800' }}>CERRAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, scrollContent: { padding: 20 },
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
  testValue: { fontSize: 28, fontWeight: '900' },
  sideLabel: { fontSize: 9, fontWeight: '800', marginTop: 4, color: '#888' },
  testNotes: { fontSize: 12, fontStyle: 'italic', marginTop: 15, opacity: 0.7 },
  emptyBox: { padding: 40, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  closeBtn: { marginTop: 20, backgroundColor: '#000', padding: 15, borderRadius: 12, alignItems: 'center' }
});
