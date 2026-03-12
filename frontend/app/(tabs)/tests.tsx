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

// Categorías iniciales fijas
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
  
  // NUEVO: Gestión de categorías dinámicas
  const [dynamicCategories, setDynamicCategories] = useState(INITIAL_CATEGORIES);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Estados para creación y edición
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customTest, setCustomTest] = useState({
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
      
      const [ts, ath] = await Promise.all([
        api.getTests(params).catch(() => []), 
        isTrainer ? api.getAthletes().catch(() => []) : Promise.resolve([]),
      ]);
      
      setTests(Array.isArray(ts) ? ts : []);
      setAthletes(Array.isArray(ath) ? ath : []);
    } catch (e) {
      console.log("Error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedCategory, selectedAthlete]);

  const addCategory = () => {
    if (!newCategoryName.trim()) return;
    const key = newCategoryName.toLowerCase().trim().replace(/\s+/g, '_');
    if (dynamicCategories.find(c => c.key === key)) {
      Alert.alert("Error", "Esta categoría ya existe.");
      return;
    }
    const newCat = { key, label: newCategoryName.trim() };
    setDynamicCategories([...dynamicCategories, newCat]);
    setNewCategoryName('');
    setShowCategoryModal(false);
  };

  const handleCreateCustomTest = async () => {
    if (!customTest.name.trim()) return Alert.alert("Error", "Ponle un nombre al test.");
    if (isTrainer && !selectedAthlete) return Alert.alert("Error", "Selecciona un deportista primero.");

    setSaving(true);
    try {
      const payload: any = {
        athlete_id: isTrainer ? selectedAthlete : user?.id,
        test_name: 'custom',
        custom_name: customTest.name.trim(),
        test_type: customTest.category, // Aquí enviamos la categoría (fija o personalizada)
        unit: customTest.unit.trim(),
        notes: customTest.notes.trim(),
        date: new Date().toISOString().split('T')[0],
      };

      if (customTest.isBilateral) {
        payload.value_left = parseFloat(customTest.valueLeft) || 0;
        payload.value_right = parseFloat(customTest.valueRight) || 0;
      } else {
        payload.value = parseFloat(customTest.value) || 0;
      }

      const created = await api.createTest(payload);
      setTests([created, ...tests]);
      setShowCustomModal(false);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Tests</Text>
        <View style={styles.headerActions}>
          {/* Botón para gestionar categorías */}
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: colors.surfaceHighlight }]} 
            onPress={() => setShowCategoryModal(true)}
          >
            <Ionicons name="pricetags-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: colors.primary }]} 
            onPress={() => setShowCustomModal(true)}
          >
            <Ionicons name="add" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filtro de Categorías (incluye las dinámicas) */}
      <View style={{ height: 50, marginTop: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
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

      {loading ? <ActivityIndicator style={{marginTop: 50}} color={colors.primary} /> : (
        <FlatList
          data={tests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.testCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.testHeader}>
                <View style={[styles.typeBadge, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={[styles.typeBadgeText, { color: colors.primary }]}>
                    {dynamicCategories.find(c => c.key === item.test_type)?.label || item.test_type?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={[styles.testName, { color: colors.textPrimary }]}>
                {item.test_name === 'custom' ? item.custom_name : (TEST_LABELS[item.test_name] || item.test_name)}
              </Text>
              <Text style={[styles.testValue, { color: colors.textPrimary }]}>
                {item.value_left != null ? `L: ${item.value_left} R: ${item.value_right}` : item.value} {item.unit}
              </Text>
            </View>
          )}
          contentContainerStyle={{ padding: 20 }}
        />
      )}

      {/* MODAL GESTIÓN DE CATEGORÍAS */}
      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Nueva Categoría</Text>
            <TextInput 
              style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Ej: Resistencia, Salto..." placeholderTextColor={colors.textSecondary}
              value={newCategoryName} onChangeText={setNewCategoryName}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={styles.flexBtn} onPress={() => setShowCategoryModal(false)}><Text style={{color: colors.textSecondary}}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.flexBtn, { backgroundColor: colors.primary }]} onPress={addCategory}><Text style={{color: '#FFF', fontWeight: '700'}}>Añadir</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CREAR TEST (con selector de categoría) */}
      <Modal visible={showCustomModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Nuevo Test Personalizado</Text>
              
              <Text style={styles.label}>CATEGORÍA</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
                {dynamicCategories.filter(c => c.key !== 'all').map(cat => (
                  <TouchableOpacity 
                    key={cat.key} 
                    style={[styles.miniChip, customTest.category === cat.key && { backgroundColor: colors.primary }]}
                    onPress={() => setCustomTest({...customTest, category: cat.key})}
                  >
                    <Text style={{ color: customTest.category === cat.key ? '#FFF' : colors.textSecondary }}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput 
                style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Nombre del test (ej. Cooper)" placeholderTextColor={colors.textSecondary}
                value={customTest.name} onChangeText={(t) => setCustomTest({...customTest, name: t})}
              />
              
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput 
                  style={[styles.modalInput, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Valor" keyboardType="numeric"
                  value={customTest.value} onChangeText={(t) => setCustomTest({...customTest, value: t})}
                />
                <TextInput 
                  style={[styles.modalInput, { flex: 0.5, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Unidad"
                  value={customTest.unit} onChangeText={(t) => setCustomTest({...customTest, unit: t})}
                />
              </View>

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleCreateCustomTest}>
                <Text style={{ color: '#FFF', fontWeight: '800' }}>GUARDAR TEST</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCustomModal(false)}><Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 10 }}>Cerrar</Text></TouchableOpacity>
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
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, height: 38 },
  filterText: { fontSize: 13, fontWeight: '700' },
  testCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 15 },
  testHeader: { marginBottom: 10 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  testName: { fontSize: 18, fontWeight: '800' },
  testValue: { fontSize: 22, fontWeight: '900', marginTop: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 25 },
  modalCard: { padding: 25, borderRadius: 25 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 15 },
  modalInput: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 15, fontSize: 16 },
  flexBtn: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '800', marginBottom: 8, color: '#888' },
  miniChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center' }
});
