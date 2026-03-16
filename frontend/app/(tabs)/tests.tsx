import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator,
  Alert, Modal, TextInput, Platform, ScrollView, KeyboardAvoidingView, Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isDesktop = SCREEN_WIDTH > 768;
const MAX_WIDTH = 1000;

const TEST_LABELS: Record<string, string> = {
  squat_rm: 'Sentadilla RM',
  bench_rm: 'Press Banca RM',
  deadlift_rm: 'Peso Muerto RM',
  cmj: 'CMJ',
  sj: 'SJ',
  dj: 'DJ',
  hamstring: 'Isquiotibiales',
  calf: 'Gemelo',
  quadriceps: 'Cuadriceps',
  tibialis: 'Tibial',
  custom: 'Personalizado',
};

const INITIAL_CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'strength', label: 'Fuerza' },
  { key: 'plyometrics', label: 'Pliometría' },
  { key: 'max_force', label: 'F. Máxima' },
];

export default function TestsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const isTrainer = user?.role === 'trainer';
  
  const [tests, setTests] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dynamicCategories, setDynamicCategories] = useState(INITIAL_CATEGORIES);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editTest, setEditTest] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: 'strength',
    isBilateral: false,
    unit: '',
    value: '',
    valueLeft: '',
    valueRight: '',
    notes: ''
  });

  const loadData = async () => {
    try {
      const params: any = {};
      if (selectedCategory !== 'all') params.test_type = selectedCategory;
      if (selectedAthlete) params.athlete_id = selectedAthlete;
      if (!isTrainer && user?.id) params.athlete_id = user.id;

      const ts = await api.getTests(params);
      let ath = isTrainer ? await api.getAthletes() : [];

      setTests(Array.isArray(ts) ? ts : (ts?.data || []));
      setAthletes(Array.isArray(ath) ? ath : (ath?.data || []));
    } catch (e) {
      console.log("Error cargando tests:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedCategory, selectedAthlete]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const deleteTest = (testId: string, testName: string) => {
    const performDelete = async () => {
      try {
        await api.deleteTest(testId);
        setTests(prev => prev.filter(t => t.id !== testId));
      } catch (e) { console.log(e); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`¿Seguro que quieres eliminar "${testName}"?`)) performDelete();
    } else {
      Alert.alert('Eliminar', `¿Seguro que quieres eliminar "${testName}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const openEditModal = (test: any) => {
    setEditTest(test);
    setFormData({
      name: test.custom_name || test.test_name,
      category: test.test_type || 'strength',
      isBilateral: test.value_left != null || test.value_right != null,
      unit: test.unit || '',
      value: String(test.value ?? ''),
      valueLeft: String(test.value_left ?? ''),
      valueRight: String(test.value_right ?? ''),
      notes: test.notes || ''
    });
    setShowCustomModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return Alert.alert("Error", "El nombre es obligatorio.");
    setSaving(true);
    try {
      const payload: any = {
        unit: formData.unit.trim(),
        notes: formData.notes.trim(),
        test_type: formData.category,
        value: formData.isBilateral ? 0 : parseFloat(formData.value.replace(',', '.') || '0'),
        value_left: formData.isBilateral ? parseFloat(formData.valueLeft.replace(',', '.') || '0') : null,
        value_right: formData.isBilateral ? parseFloat(formData.valueRight.replace(',', '.') || '0') : null,
      };

      if (editTest) {
        const updated = await api.updateTest(editTest.id, payload);
        setTests(prev => prev.map(t => t.id === editTest.id ? { ...t, ...updated } : t));
      } else {
        payload.athlete_id = isTrainer ? selectedAthlete : user?.id;
        payload.test_name = 'custom';
        payload.custom_name = formData.name.trim();
        payload.date = new Date().toISOString().split('T')[0];
        const created = await api.createTest(payload);
        setTests([created, ...tests]);
      }
      setShowCustomModal(false);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el test.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.contentWrapper}>
        <FlatList
          data={tests}
          keyExtractor={(item) => item.id}
          key={isDesktop ? 'desktop-grid' : 'mobile-list'}
          numColumns={isDesktop ? 2 : 1}
          columnWrapperStyle={isDesktop ? { gap: 20 } : null}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ marginBottom: 20 }}>
              <View style={styles.headerRow}>
                <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Tests Físicos</Text>
                <View style={styles.headerActions}>
                  <TouchableOpacity onPress={onRefresh} style={styles.refreshIcon}>
                    {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync-outline" size={24} color={colors.primary} />}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]} 
                    onPress={() => {
                      setEditTest(null);
                      setFormData({ name: '', category: 'strength', isBilateral: false, unit: '', value: '', valueLeft: '', valueRight: '', notes: '' });
                      setShowCustomModal(true);
                    }}
                  >
                    <Ionicons name="add" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {dynamicCategories.map(cat => (
                  <TouchableOpacity 
                    key={cat.key} 
                    style={[styles.filterChip, { borderColor: colors.border }, selectedCategory === cat.key && { backgroundColor: colors.primary, borderColor: colors.primary }]} 
                    onPress={() => setSelectedCategory(cat.key)}
                  >
                    <Text style={[styles.filterText, { color: colors.textSecondary }, selectedCategory === cat.key && { color: '#FFF' }]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border, flex: isDesktop ? 0.5 : 1 }]}>
              <View style={styles.testHeader}>
                <View style={[styles.typeBadge, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={[styles.typeBadgeText, { color: colors.primary }]}>{item.test_type?.toUpperCase()}</Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => openEditModal(item)}><Ionicons name="create-outline" size={20} color={colors.primary} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteTest(item.id, item.custom_name || item.test_name)}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.testName, { color: colors.textPrimary }]}>{item.custom_name || TEST_LABELS[item.test_name] || item.test_name}</Text>
              
              {item.value_left != null || item.value_right != null ? (
                <View style={styles.bilateralRow}>
                  <View style={styles.sideValue}><Text style={[styles.valNum, { color: colors.textPrimary }]}>{item.value_left}</Text><Text style={styles.sideLabel}>IZQ ({item.unit})</Text></View>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.sideValue}><Text style={[styles.valNum, { color: colors.textPrimary }]}>{item.value_right}</Text><Text style={styles.sideLabel}>DER ({item.unit})</Text></View>
                </View>
              ) : (
                <View style={styles.valueRow}>
                  <Text style={[styles.valNum, { color: colors.textPrimary }]}>{item.value}</Text>
                  <Text style={[styles.unitText, { color: colors.textSecondary }]}>{item.unit}</Text>
                </View>
              )}
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{item.date}</Text>
            </View>
          )}
        />
      </View>

      {/* MODAL NUEVO/EDITAR */}
      <Modal visible={showCustomModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editTest ? 'Editar Test' : 'Nuevo Test'}</Text>
              <TextInput 
                style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                placeholder="Nombre del test" 
                placeholderTextColor={colors.textSecondary}
                value={formData.name} 
                onChangeText={(t) => setFormData({...formData, name: t})} 
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowCustomModal(false)}><Text style={{color: colors.textPrimary}}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{color: '#FFF', fontWeight: '700'}}>Guardar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentWrapper: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  screenTitle: { fontSize: 26, fontWeight: '900' },
  headerActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  refreshIcon: { padding: 5 },
  actionBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  filterRow: { paddingHorizontal: 20, paddingTop: 15, gap: 10 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '700' },
  listContent: { paddingBottom: 40, paddingHorizontal: 20 },
  testCard: { borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1 },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  cardActions: { flexDirection: 'row', gap: 15 },
  testName: { fontSize: 18, fontWeight: '800', marginBottom: 15 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bilateralRow: { flexDirection: 'row', alignItems: 'center' },
  sideValue: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 40, marginHorizontal: 10, opacity: 0.3 },
  valNum: { fontSize: 32, fontWeight: '900' },
  unitText: { fontSize: 16, fontWeight: '600' },
  sideLabel: { fontSize: 10, fontWeight: '700', color: '#888', marginTop: 4 },
  dateText: { fontSize: 12, marginTop: 15, opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalKeyboard: { width: '100%', maxWidth: 450, padding: 20 },
  modalCard: { padding: 25, borderRadius: 25, borderWidth: 1 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  modalInput: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 20, fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' }
});
