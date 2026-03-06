import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator,
  Alert, Modal, TextInput, Platform, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

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

const CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'strength', label: 'Fuerza' },
  { key: 'plyometrics', label: 'Pliometría' },
  { key: 'max_force', label: 'F. Máxima' },
];

export default function TestsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  
  const [tests, setTests] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAthlete, setSelectedAthlete] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [editTest, setEditTest] = useState<any>(null);
  const [editValue, setEditValue] = useState('');
  const [editLeft, setEditLeft] = useState('');
  const [editRight, setEditRight] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const params: any = {};
      if (selectedCategory !== 'all') params.test_type = selectedCategory;
      if (selectedAthlete) params.athlete_id = selectedAthlete;
      
      const [ts, ath] = await Promise.all([
        api.getTests(params).catch(() => []), 
        user?.role === 'trainer' ? api.getAthletes().catch(() => []) : Promise.resolve([]),
      ]);
      
      setTests(Array.isArray(ts) ? ts : []);
      setAthletes(Array.isArray(ath) ? ath : []);
      
    } catch (e) {
      console.log("Error cargando tests:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { 
    setLoading(true);
    loadData(); 
  }, [selectedCategory, selectedAthlete]);

  const onRefresh = () => { 
    setRefreshing(true); 
    loadData(); 
  };

  const deleteTest = (testId: string, testName: string) => {
    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Eliminar "${testName}"?`);
      if (confirm) {
        api.deleteTest(testId)
          .then(() => setTests(prev => prev.filter(t => t.id !== testId)))
          .catch(e => console.log(e));
      }
    } else {
      Alert.alert('Eliminar test', `¿Eliminar "${testName}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              await api.deleteTest(testId);
              setTests(prev => prev.filter(t => t.id !== testId));
            } catch (e) { console.log(e); }
          }
        },
      ]);
    }
  };

  const openEditModal = (test: any) => {
    setEditTest(test);
    setEditValue(String(test.value ?? ''));
    setEditLeft(String(test.value_left ?? ''));
    setEditRight(String(test.value_right ?? ''));
    setEditUnit(test.unit || '');
    setEditNotes(test.notes || '');
  };

  const handleSaveEdit = async () => {
    if (!editTest) return;
    setSaving(true);
    try {
      const updateData: any = { unit: editUnit, notes: editNotes };
      if (editTest.value_left != null || editTest.value_right != null) {
        updateData.value = parseFloat(editValue) || 0;
        updateData.value_left = parseFloat(editLeft) || 0;
        updateData.value_right = parseFloat(editRight) || 0;
      } else {
        updateData.value = parseFloat(editValue) || 0;
      }
      const updated = await api.updateTest(editTest.id, updateData);
      setTests(prev => prev.map(t => t.id === editTest.id ? { ...t, ...updated } : t));
      setEditTest(null);
    } catch (e: any) {
      if (Platform.OS === 'web') {
          window.alert(e.message || 'No se pudo actualizar');
      } else {
          Alert.alert('Error', e.message || 'No se pudo actualizar');
      }
    } finally {
      setSaving(false);
    }
  };

  const isBilateral = editTest?.value_left != null || editTest?.value_right != null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          testID="tests-list"
          data={tests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <View style={styles.headerRow}>
                <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Tests Físicos</Text>
                <View style={styles.headerActions}>
                  <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={styles.refreshBtn}>
                    {refreshing ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="sync-outline" size={24} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    testID="add-test-btn" 
                    style={[styles.addBtn, { backgroundColor: colors.primary }]} 
                    onPress={() => router.push('/add-test')} 
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={22} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.filterRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.filterChip,
                      { borderColor: colors.border },
                      selectedCategory === cat.key && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setSelectedCategory(cat.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.filterText,
                      { color: colors.textSecondary },
                      selectedCategory === cat.key && { color: '#FFF' },
                    ]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {user?.role === 'trainer' && Array.isArray(athletes) && athletes.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.athleteFilter}>
                  {[{ id: null, name: 'Todos' }, ...athletes].map((item, index) => (
                    <TouchableOpacity
                      key={item.id || `all-${index}`}
                      style={[
                        styles.athleteChip,
                        { backgroundColor: colors.surfaceHighlight },
                        selectedAthlete === item.id && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setSelectedAthlete(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.athleteChipText,
                        { color: colors.textPrimary },
                        selectedAthlete === item.id && { color: '#FFF' },
                      ]}>{item.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.testHeader}>
                <View style={[styles.typeBadge, {
                  backgroundColor: item.test_type === 'strength' ? colors.primary + '20'
                    : item.test_type === 'max_force' ? '#E65100' + '20'
                    : colors.accent + '20'
                }]}>
                  <Text style={[styles.typeBadgeText, {
                    color: item.test_type === 'strength' ? colors.primary
                      : item.test_type === 'max_force' ? '#E65100'
                      : colors.accent
                  }]}>
                    {item.test_type === 'strength' ? 'FUERZA' : item.test_type === 'max_force' ? 'F. MAX' : 'PLIO'}
                  </Text>
                </View>
                <View style={styles.testActions}>
                  <TouchableOpacity testID={`edit-test-${item.id}`} onPress={() => openEditModal(item)} activeOpacity={0.7}>
                    <Ionicons name="create-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity testID={`delete-test-${item.id}`}
                    onPress={() => deleteTest(item.id, item.test_name === 'custom' ? item.custom_name : (TEST_LABELS[item.test_name] || item.test_name))}
                    activeOpacity={0.7}
                    style={{ marginLeft: 10 }}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.testName, { color: colors.textPrimary }]}>
                {item.test_name === 'custom' ? item.custom_name : (TEST_LABELS[item.test_name] || item.test_name)}
              </Text>
              
              {item.value_left != null || item.value_right != null ? (
                <View style={styles.bilateralValues}>
                  <View style={styles.bilateralSide}>
                    <View style={[styles.sideBadge, { backgroundColor: '#1565C0' + '18' }]}>
                      <Text style={[styles.sideBadgeText, { color: '#1565C0' }]}>IZQ</Text>
                    </View>
                    <Text style={[styles.testValue, { color: colors.textPrimary, fontSize: 26 }]}>{item.value_left ?? '-'}</Text>
                    <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
                  </View>
                  <View style={[styles.bilateralDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.bilateralSide}>
                    <View style={[styles.sideBadge, { backgroundColor: '#C62828' + '18' }]}>
                      <Text style={[styles.sideBadgeText, { color: '#C62828' }]}>DER</Text>
                    </View>
                    <Text style={[styles.testValue, { color: colors.textPrimary, fontSize: 26 }]}>{item.value_right ?? '-'}</Text>
                    <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.testValueRow}>
                  <Text style={[styles.testValue, { color: colors.textPrimary }]}>{item.value}</Text>
                  <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
                </View>
              )}
              
              <Text style={[styles.testDate, { color: colors.textSecondary }]}>{item.date}</Text>
              {item.notes ? <Text style={[styles.testNotes, { color: colors.textSecondary }]}>{item.notes}</Text> : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="analytics-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No hay tests registrados</Text>
            </View>
          }
        />
      )}

      {/* MODAL DE EDICIÓN */}
      <Modal visible={!!editTest} transparent animationType="fade" onRequestClose={() => setEditTest(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Editar test</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              {editTest?.test_name === 'custom' ? editTest?.custom_name : (TEST_LABELS[editTest?.test_name] || editTest?.test_name)}
            </Text>

            {isBilateral ? (
              <View style={styles.modalRow}>
                <View style={[styles.modalField, { flex: 1 }]}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>IZQ</Text>
                  <TextInput
                    testID="edit-test-left"
                    style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    value={editLeft} onChangeText={setEditLeft} keyboardType="numeric" placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.modalField, { flex: 1 }]}>
                  <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>DER</Text>
                  <TextInput
                    testID="edit-test-right"
                    style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    value={editRight} onChangeText={setEditRight} keyboardType="numeric" placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>VALOR</Text>
                <TextInput
                  testID="edit-test-value"
                  style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  value={editValue} onChangeText={setEditValue} keyboardType="numeric" placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            )}

            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>UNIDAD</Text>
              <TextInput
                testID="edit-test-unit"
                style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={editUnit} onChangeText={setEditUnit} placeholder="kg, cm, N..."
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>NOTAS</Text>
              <TextInput
                testID="edit-test-notes"
                style={[styles.modalInput, styles.modalTextArea, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={editNotes} onChangeText={setEditNotes} placeholder="Notas opcionales..."
                placeholderTextColor={colors.textSecondary} multiline
              />
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]}
                onPress={() => setEditTest(null)} activeOpacity={0.7}>
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="save-edit-test-btn"
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveEdit} disabled={saving} activeOpacity={0.7}>
                {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  screenTitle: { fontSize: 26, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  refreshBtn: { padding: 5 },
  addBtn: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  
  filterRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 20 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '700' },
  
  athleteFilter: { paddingHorizontal: 20, paddingTop: 15, gap: 10, paddingBottom: 10 },
  athleteChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  athleteChipText: { fontSize: 13, fontWeight: '600' },
  
  listContent: { paddingBottom: 40 },
  testCard: { borderRadius: 20, padding: 20, marginHorizontal: 20, marginBottom: 15, borderWidth: 1, elevation: 1 },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  typeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  testName: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  
  testValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 5 },
  testValue: { fontSize: 36, fontWeight: '900' },
  testUnit: { fontSize: 18, fontWeight: '600' },
  
  bilateralValues: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  bilateralSide: { flex: 1, alignItems: 'center', gap: 5 },
  sideBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  sideBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  bilateralDivider: { width: 1, height: 50, marginHorizontal: 10 },
  
  testDate: { fontSize: 13, marginTop: 5, fontWeight: '600' },
  testNotes: { fontSize: 13, marginTop: 8, fontStyle: 'italic', lineHeight: 18 },
  
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 15 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  testActions: { flexDirection: 'row', alignItems: 'center' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 25 },
  modalCard: { width: '100%', borderRadius: 25, padding: 25, gap: 15 },
  modalTitle: { fontSize: 22, fontWeight: '900' },
  modalSub: { fontSize: 14, fontWeight: '600', marginBottom: 5 },
  modalField: { gap: 8 },
  modalRow: { flexDirection: 'row', gap: 15 },
  modalLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  modalInput: { borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1 },
  modalTextArea: { minHeight: 80, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 10 },
  modalBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '800' },
});
