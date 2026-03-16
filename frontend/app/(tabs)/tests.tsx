import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator,
  Alert, Modal, TextInput, Platform, ScrollView, KeyboardAvoidingView
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
  
  // Lo empezamos en true para que muestre el spinner nada más entrar
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

  // --- LÓGICA DE CARGA BLINDADA ---
  const loadData = async () => {
    try {
      const params: any = {};
      if (selectedCategory !== 'all') params.test_type = selectedCategory;
      if (selectedAthlete) params.athlete_id = selectedAthlete;
      
      // Asegurarnos de que si eres deportista envías tu propio ID
      if (!isTrainer && user?.id) {
        params.athlete_id = user.id;
      }

      // Quitamos el .catch(() => []) para que si el servidor falla o duerme nos avise el error
      const ts = await api.getTests(params);
      let ath = [];
      if (isTrainer) {
        ath = await api.getAthletes();
      }

      // Prevemos que a veces las APIs mandan { data: [...] } en lugar de [...]
      setTests(Array.isArray(ts) ? ts : (ts?.data || []));
      setAthletes(Array.isArray(ath) ? ath : (ath?.data || []));
      
    } catch (e: any) {
      console.log("Error en loadData de Tests:", e);
      Alert.alert(
        "Aviso del Servidor 🥱", 
        "Parece que el servidor estaba dormido o hay un problema de conexión. Espera un minutito y pulsa el botón de refrescar."
      );
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

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    const key = newCategoryName.toLowerCase().trim().replace(/\s+/g, '_');
    if (dynamicCategories.find(c => c.key === key)) {
      Alert.alert("Error", "Esta categoría ya existe.");
      return;
    }
    setDynamicCategories([...dynamicCategories, { key, label: newCategoryName.trim() }]);
    setNewCategoryName('');
    setShowCategoryModal(false);
  };

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
      Alert.alert('Eliminar test', `¿Seguro que quieres eliminar "${testName}"?`, [
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
      // Extra seguridad por si el valor es null en la base de datos
      value: String(test.value ?? ''),
      valueLeft: String(test.value_left ?? ''),
      valueRight: String(test.value_right ?? ''),
      notes: test.notes || ''
    });
    setShowCustomModal(true);
  };

  // Conversor ultra-seguro para asegurar que no nos da un NaN si alguien manda un string raro
  const safeParseFloat = (val: any) => {
    if (!val) return 0;
    const stringVal = String(val).replace(',', '.');
    const parsed = parseFloat(stringVal);
    return isNaN(parsed) ? 0 : parsed;
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return Alert.alert("Error", "El nombre del test es obligatorio.");
    setSaving(true);
    try {
      const payload: any = {
        unit: formData.unit.trim(),
        notes: formData.notes.trim(),
        test_type: formData.category,
      };

      if (formData.isBilateral) {
        payload.value_left = safeParseFloat(formData.valueLeft);
        payload.value_right = safeParseFloat(formData.valueRight);
        payload.value = 0;
      } else {
        payload.value = safeParseFloat(formData.value);
        payload.value_left = null;
        payload.value_right = null;
      }

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
      setEditTest(null);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el test. Puede que el servidor siga durmiendo.");
    } finally {
      setSaving(false);
    }
  };

  // Evitamos pantalla en blanco si sigue cargando de fondo la primera vez
  if (loading && tests.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 20, color: colors.textSecondary, fontWeight: '600' }}>
          Conectando con el servidor... 🥱
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={tests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={styles.headerRow}>
              <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Tests Físicos</Text>
              
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
                  {refreshing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="sync-outline" size={24} color={colors.primary} />}
                </TouchableOpacity>

                {isTrainer && (
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border, borderWidth: 1 }]} 
                    onPress={() => setShowCategoryModal(true)}
                  >
                    <Ionicons name="pricetags" size={20} color={colors.accent} />
                  </TouchableOpacity>
                )}

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

            {isTrainer && athletes.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.athleteFilter}>
                {[{ id: null, name: 'Todos' }, ...athletes].map((item) => (
                  <TouchableOpacity
                    key={item.id || 'all'}
                    style={[styles.athleteChip, { backgroundColor: colors.surfaceHighlight }, selectedAthlete === item.id && { backgroundColor: colors.primary }]}
                    onPress={() => setSelectedAthlete(item.id)}
                  >
                    <Text style={[styles.athleteChipText, { color: colors.textPrimary }, selectedAthlete === item.id && { color: '#FFF' }]}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.testHeader}>
              <View style={[styles.typeBadge, { backgroundColor: colors.primary + '15' }]}>
                <Text style={[styles.typeBadgeText, { color: colors.primary }]}>
                  {dynamicCategories.find(c => c.key === item.test_type)?.label || item.test_type?.toUpperCase()}
                </Text>
              </View>
              
              <View style={{ flexDirection: 'row', gap: 15 }}>
                <TouchableOpacity onPress={() => openEditModal(item)}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteTest(item.id, item.custom_name || item.test_name)}>
                  <Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.testName, { color: colors.textPrimary }]}>
              {item.test_name === 'custom' ? item.custom_name : (TEST_LABELS[item.test_name] || item.test_name)}
            </Text>

            {item.value_left != null || item.value_right != null ? (
              <View style={styles.bilateralValues}>
                <View style={styles.bilateralSide}>
                  <View style={[styles.sideBadge, { backgroundColor: '#1565C0' + '15' }]}><Text style={{ color: '#1565C0', fontSize: 10, fontWeight: '900' }}>IZQ</Text></View>
                  <Text style={[styles.testValue, { color: colors.textPrimary }]}>{item.value_left ?? '-'}</Text>
                  <Text style={[styles.testUnit, { color: colors.textSecondary }]}>{item.unit}</Text>
                </View>
                <View style={[styles.bilateralDivider, { backgroundColor: colors.border }]} />
                <View style={styles.bilateralSide}>
                  <View style={[styles.sideBadge, { backgroundColor: '#C62828' + '15' }]}><Text style={{ color: '#C62828', fontSize: 10, fontWeight: '900' }}>DER</Text></View>
                  <Text style={[styles.testValue, { color: colors.textPrimary }]}>{item.value_right ?? '-'}</Text>
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
          </View>
        )}
      />

      {/* MODALES */}
      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Nueva Categoría</Text>
            <TextInput 
              style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Ej: Kitesurf, Resistencia..." placeholderTextColor={colors.textSecondary}
              value={newCategoryName} onChangeText={setNewCategoryName}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowCategoryModal(false)}><Text style={{color: colors.textPrimary}}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={addCategory}><Text style={{color: '#FFF', fontWeight: '700'}}>Añadir</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCustomModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editTest ? 'Editar Test' : 'Nuevo Test'}</Text>
                
                {!editTest && (
                  <>
                    <Text style={styles.label}>NOMBRE DEL TEST</Text>
                    <TextInput 
                      style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                      placeholder="Ej: Salto Vertical" placeholderTextColor={colors.textSecondary}
                      value={formData.name} onChangeText={(t) => setFormData({...formData, name: t})}
                    />
                  </>
                )}

                <Text style={styles.label}>CATEGORÍA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                  {dynamicCategories.filter(c => c.key !== 'all').map(cat => (
                    <TouchableOpacity 
                      key={cat.key} 
                      style={[styles.miniChip, formData.category === cat.key && { backgroundColor: colors.primary }]}
                      onPress={() => setFormData({...formData, category: cat.key})}
                    >
                      <Text style={{ color: formData.category === cat.key ? '#FFF' : colors.textSecondary }}>{cat.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                   <TouchableOpacity 
                    style={[styles.toggleBtnCustom, !formData.isBilateral && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setFormData({...formData, isBilateral: false})}
                  >
                    <Text style={{ color: !formData.isBilateral ? '#FFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>Global</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtnCustom, formData.isBilateral && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setFormData({...formData, isBilateral: true})}
                  >
                    <Text style={{ color: formData.isBilateral ? '#FFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>Bilat. (L/R)</Text>
                  </TouchableOpacity>
                </View>
                
                {formData.isBilateral ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput 
                      style={[styles.modalInput, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                      placeholder="IZQ" keyboardType="decimal-pad" value={formData.valueLeft} onChangeText={(t) => setFormData({...formData, valueLeft: t})}
                    />
                    <TextInput 
                      style={[styles.modalInput, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                      placeholder="DER" keyboardType="decimal-pad" value={formData.valueRight} onChangeText={(t) => setFormData({...formData, valueRight: t})}
                    />
                  </View>
                ) : (
                  <TextInput 
                    style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="Valor" keyboardType="decimal-pad" value={formData.value} onChangeText={(t) => setFormData({...formData, value: t})}
                  />
                )}

                <Text style={styles.label}>UNIDAD Y NOTAS</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput 
                    style={[styles.modalInput, { flex: 0.5, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="kg, s, cm..." value={formData.unit} onChangeText={(t) => setFormData({...formData, unit: t})}
                  />
                  <TextInput 
                    style={[styles.modalInput, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="Notas..." value={formData.notes} onChangeText={(t) => setFormData({...formData, notes: t})}
                  />
                </View>

                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800' }}>GUARDAR CAMBIOS</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setShowCustomModal(false); setEditTest(null); }}>
                  <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 15 }}>Cerrar</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  screenTitle: { fontSize: 26, fontWeight: '900' },
  headerActions: { flexDirection: 'row', gap: 10 },
  actionBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  refreshBtn: { justifyContent: 'center', marginRight: 5 },
  filterRow: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, height: 38 },
  filterText: { fontSize: 13, fontWeight: '700' },
  athleteFilter: { paddingHorizontal: 20, paddingTop: 15, gap: 10 },
  athleteChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  athleteChipText: { fontSize: 13, fontWeight: '600' },
  listContent: { paddingBottom: 40 },
  testCard: { borderRadius: 20, padding: 20, marginHorizontal: 20, marginBottom: 15, borderWidth: 1 },
  testHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  testName: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  testValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  testValue: { fontSize: 32, fontWeight: '900' },
  testUnit: { fontSize: 16, fontWeight: '600' },
  bilateralValues: { flexDirection: 'row', alignItems: 'center' },
  bilateralSide: { flex: 1, alignItems: 'center' },
  sideBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 4 },
  bilateralDivider: { width: 1, height: 40, marginHorizontal: 15 },
  testDate: { fontSize: 12, marginTop: 10, opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 25 },
  modalCard: { padding: 25, borderRadius: 25, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 15 },
  modalInput: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 15, fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '800', marginBottom: 8, color: '#888' },
  miniChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  toggleBtnCustom: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
});
