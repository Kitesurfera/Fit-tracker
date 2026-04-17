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

const TEST_TRANSLATIONS: Record<string, string> = {
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
  
  // <-- ESTADO PARA EL SELECTOR DE DEPORTISTAS -->
  const [showPicker, setShowPicker] = useState(false);
  
  const [editTest, setEditTest] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: 'strength',
    isBilateral: false,
    unit: 'kg',
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
      const rawTests = Array.isArray(ts) ? ts : (ts?.data || []);
      const filteredTests = rawTests.filter(t => t.test_type !== 'medicion');

      setTests(filteredTests);
    } catch (e) {
      console.log("Error cargando tests:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const initTrainer = async () => {
      if (isTrainer && athletes.length === 0) {
        const ath = await api.getAthletes();
        const athList = Array.isArray(ath) ? ath : (ath?.data || []);
        setAthletes(athList);
        if (athList.length > 0 && !selectedAthlete) {
          setSelectedAthlete(athList[0].id);
          return; // El cambio de estado relanzará el useEffect
        }
      }
      loadData();
    };
    initTrainer();
  }, [selectedCategory, selectedAthlete]);

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
      name: test.custom_name || TEST_TRANSLATIONS[test.test_name] || test.test_name,
      category: test.test_type || 'strength',
      isBilateral: test.value_left != null || test.value_right != null,
      unit: test.unit || 'kg',
      value: String(test.value ?? ''),
      valueLeft: String(test.value_left ?? ''),
      valueRight: String(test.value_right ?? ''),
      notes: test.notes || ''
    });
    setShowCustomModal(true);
  };

  const handleSaveCategory = () => {
    if (!newCategoryName.trim()) return;
    const newKey = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_');
    
    if (!dynamicCategories.find(c => c.key === newKey)) {
      setDynamicCategories([...dynamicCategories, { key: newKey, label: newCategoryName.trim() }]);
    }
    
    setNewCategoryName('');
    setShowCategoryModal(false);
    setSelectedCategory(newKey);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return Alert.alert("Error", "El nombre es obligatorio.");
    if (!formData.isBilateral && !formData.value) return Alert.alert("Error", "Añade un valor al test.");
    if (formData.isBilateral && (!formData.valueLeft || !formData.valueRight)) return Alert.alert("Error", "Añade valores para ambos lados.");
    if (isTrainer && !selectedAthlete) return Alert.alert("Atención", "Selecciona primero un deportista.");

    setSaving(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const inputName = formData.name.trim();

      const payload: any = {
        unit: formData.unit.trim(),
        notes: formData.notes.trim(),
        test_type: formData.category,
        value: formData.isBilateral ? null : parseFloat(String(formData.value).replace(',', '.') || '0'),
        value_left: formData.isBilateral ? parseFloat(String(formData.valueLeft).replace(',', '.') || '0') : null,
        value_right: formData.isBilateral ? parseFloat(String(formData.valueRight).replace(',', '.') || '0') : null,
        date: todayStr,
        test_name: 'custom', 
        custom_name: inputName,
        athlete_id: isTrainer ? selectedAthlete : user?.id
      };

      if (editTest && editTest.id) {
        await api.updateTest(editTest.id, payload);
      } else {
        await api.createTest(payload);
      }

      await loadData();
      setShowCustomModal(false);

    } catch (e: any) {
      console.log("Error guardando test:", e);
      Alert.alert("Error", e?.message || "Falló la comunicación con el servidor al guardar.");
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
                <View>
                  <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
                    {isTrainer ? (athletes.find(a => a.id === selectedAthlete)?.name || 'Cargando...') : 'Tests Físicos'}
                  </Text>
                  {isTrainer && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Vista Entrenador</Text>}
                </View>
                <View style={styles.headerActions}>
                  {/* <-- BOTÓN DE SELECCIÓN DE DEPORTISTA --> */}
                  {isTrainer && (
                    <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.refreshIcon}>
                      <Ionicons name="people" size={24} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={onRefresh} style={styles.refreshIcon}>
                    {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync-outline" size={24} color={colors.primary} />}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]} 
                    onPress={() => {
                      setEditTest(null);
                      setFormData({ name: '', category: selectedCategory !== 'all' ? selectedCategory : 'strength', isBilateral: false, unit: 'kg', value: '', valueLeft: '', valueRight: '', notes: '' });
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
                
                <TouchableOpacity 
                  style={[styles.filterChip, { borderColor: colors.primary, backgroundColor: colors.primary + '10', borderStyle: 'dashed' }]} 
                  onPress={() => setShowCategoryModal(true)}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                </TouchableOpacity>
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
              <Text style={[styles.testName, { color: colors.textPrimary }]}>{item.custom_name || TEST_TRANSLATIONS[item.test_name] || item.test_name}</Text>
              
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

      {/* <-- MODAL SELECTOR DE DEPORTISTA --> */}
      <Modal visible={showPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlayPicker} onPress={() => setShowPicker(false)}>
          <View style={[styles.modalContentPicker, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Seleccionar Deportista</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {athletes.map(a => (
                <TouchableOpacity 
                  key={a.id} 
                  style={[styles.athleteItem, { borderBottomColor: colors.border }]} 
                  onPress={() => { setSelectedAthlete(a.id); setShowPicker(false); }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL NUEVA CATEGORÍA */}
      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Nueva Categoría</Text>
              <TextInput 
                style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                placeholder="Ej. Resistencia, Flexibilidad..." 
                placeholderTextColor={colors.textSecondary}
                value={newCategoryName} 
                onChangeText={setNewCategoryName} 
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => { setShowCategoryModal(false); setNewCategoryName(''); }}>
                  <Text style={{color: colors.textPrimary, fontWeight: '700'}}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleSaveCategory}>
                  <Text style={{color: '#FFF', fontWeight: '700'}}>Crear</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL NUEVO/EDITAR TEST */}
      <Modal visible={showCustomModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
              <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editTest ? 'Editar Test' : 'Nuevo Test'}</Text>
                
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NOMBRE DEL TEST</Text>
                <TextInput 
                  style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                  placeholder="Ej. Salto Vertical" 
                  placeholderTextColor={colors.textSecondary}
                  value={formData.name} 
                  onChangeText={(t) => setFormData({...formData, name: t})} 
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>TIPO DE MEDICIÓN</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, !formData.isBilateral && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setFormData({...formData, isBilateral: false})}
                  >
                    <Text style={{ color: !formData.isBilateral ? '#FFF' : colors.textPrimary, fontWeight: '700', fontSize: 13 }}>Dato Único</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, formData.isBilateral && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setFormData({...formData, isBilateral: true})}
                  >
                    <Text style={{ color: formData.isBilateral ? '#FFF' : colors.textPrimary, fontWeight: '700', fontSize: 13 }}>Izq + Der</Text>
                  </TouchableOpacity>
                </View>

                {formData.isBilateral ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>VALOR IZQUIERDA</Text>
                      <TextInput 
                        style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                        keyboardType="decimal-pad"
                        placeholder="0.0" 
                        placeholderTextColor={colors.textSecondary}
                        value={formData.valueLeft} 
                        onChangeText={(t) => setFormData({...formData, valueLeft: t})} 
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>VALOR DERECHA</Text>
                      <TextInput 
                        style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                        keyboardType="decimal-pad"
                        placeholder="0.0" 
                        placeholderTextColor={colors.textSecondary}
                        value={formData.valueRight} 
                        onChangeText={(t) => setFormData({...formData, valueRight: t})} 
                      />
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>VALOR DEL TEST</Text>
                    <TextInput 
                      style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} 
                      keyboardType="decimal-pad"
                      placeholder="Ej. 120" 
                      placeholderTextColor={colors.textSecondary}
                      value={formData.value} 
                      onChangeText={(t) => setFormData({...formData, value: t})} 
                    />
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CATEGORÍA</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                      {dynamicCategories.filter(c => c.key !== 'all').map(cat => (
                        <TouchableOpacity 
                          key={cat.key} 
                          style={[styles.chipSelect, { borderColor: colors.border }, formData.category === cat.key && { backgroundColor: colors.primary, borderColor: colors.primary }]} 
                          onPress={() => setFormData({...formData, category: cat.key})}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: formData.category === cat.key ? '#FFF' : colors.textSecondary }}>{cat.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  
                  <View style={{ width: 80 }}>
                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>UNIDAD</Text>
                    <View style={{ gap: 5, marginBottom: 20 }}>
                      {['kg', 'cm', 'seg', 'reps'].map(u => (
                        <TouchableOpacity 
                          key={u} 
                          style={[styles.chipSelect, { borderColor: colors.border, paddingVertical: 6 }, formData.unit === u && { backgroundColor: colors.primary, borderColor: colors.primary }]} 
                          onPress={() => setFormData({...formData, unit: u})}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: formData.unit === u ? '#FFF' : colors.textSecondary, textAlign: 'center' }}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowCustomModal(false)}>
                    <Text style={{color: colors.textPrimary, fontWeight: '700'}}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{color: '#FFF', fontWeight: '700'}}>Guardar</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
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
  filterRow: { paddingHorizontal: 20, paddingTop: 15, gap: 10, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1 }, 
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
  fieldLabel: { fontSize: 10, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  modalInput: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 20, fontSize: 16 },
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderRadius: 12, alignItems: 'center' },
  chipSelect: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, marginRight: 8, alignSelf: 'center' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  modalBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  
  // <-- ESTILOS DEL SELECTOR DE DEPORTISTAS -->
  modalOverlayPicker: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContentPicker: { padding: 30, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '80%' },
  athleteItem: { paddingVertical: 18, borderBottomWidth: 1 }
});
