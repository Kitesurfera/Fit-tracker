import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const MACRO_COLORS = ['#4A90E2', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];
const MICRO_COLORS = ['#34C759', '#5856D6', '#FF9500', '#FF2D55', '#32ADE6'];
const MICRO_TIPOS = ['CARGA', 'RECUPERACION', 'TEST', 'COMPETICION'];

export default function PeriodizationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [tree, setTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // --- Estados Macrociclo ---
  const [macroModalVisible, setMacroModalVisible] = useState(false);
  const [savingMacro, setSavingMacro] = useState(false);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [macroForm, setMacroForm] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '', objetivo: '', color: MACRO_COLORS[0] });

  // --- Estados Microciclo ---
  const [microModalVisible, setMicroModalVisible] = useState(false);
  const [savingMicro, setSavingMicro] = useState(false);
  const [selectedMacroId, setSelectedMacroId] = useState('');
  const [editingMicroId, setEditingMicroId] = useState<string | null>(null);
  const [microForm, setMicroForm] = useState({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', notas: '', color: MICRO_COLORS[0] });

  const loadTree = async () => {
    try {
      const data = await api.getPeriodizationTree(params.athlete_id!);
      setTree(data);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, []);

  // --- GESTIÓN DE MACROCICLOS ---
  const openNewMacro = () => {
    setEditingMacroId(null);
    setMacroForm({ nombre: '', fecha_inicio: '', fecha_fin: '', objetivo: '', color: MACRO_COLORS[0] });
    setMacroModalVisible(true);
  };

  const openEditMacro = (macro: any) => {
    setEditingMacroId(macro.id);
    setMacroForm({ 
      nombre: macro.nombre, 
      fecha_inicio: macro.fecha_inicio, 
      fecha_fin: macro.fecha_fin, 
      objetivo: macro.objetivo || '', 
      color: macro.color 
    });
    setMacroModalVisible(true);
  };

  const handleSaveMacro = async () => {
    if (!macroForm.nombre || !macroForm.fecha_inicio || !macroForm.fecha_fin) {
      Alert.alert('Aviso', 'Por favor, completa el nombre y las fechas.');
      return;
    }
    setSavingMacro(true);
    try {
      if (editingMacroId) {
        await api.updateMacrociclo(editingMacroId, macroForm);
      } else {
        await api.createMacrociclo({ ...macroForm, athlete_id: params.athlete_id });
      }
      setMacroModalVisible(false);
      loadTree();
    } catch (e) {
      Alert.alert('Error', 'Error al guardar el macrociclo');
    } finally {
      setSavingMacro(false);
    }
  };

  const handleDeleteMacro = (id: string, nombre: string) => {
    const confirmDelete = async () => {
      try {
        await api.deleteMacrociclo(id);
        loadTree();
      } catch (e) { Alert.alert('Error', 'No se pudo eliminar el macrociclo.'); }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar el bloque "${nombre}"? Los entrenamientos dentro de este bloque NO se borrarán.`)) confirmDelete();
    } else {
      Alert.alert('Eliminar Macrociclo', `¿Eliminar "${nombre}"? Los entrenamientos quedarán sin asignar.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  // --- GESTIÓN DE MICROCICLOS ---
  const openNewMicro = (macroId: string) => {
    setEditingMicroId(null);
    setSelectedMacroId(macroId);
    setMicroForm({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', notas: '', color: MICRO_COLORS[0] });
    setMicroModalVisible(true);
  };

  const openEditMicro = (micro: any) => {
    setEditingMicroId(micro.id);
    setMicroForm({ 
      nombre: micro.nombre, 
      tipo: micro.tipo, 
      fecha_inicio: micro.fecha_inicio, 
      fecha_fin: micro.fecha_fin, 
      notas: micro.notas || '', 
      color: micro.color 
    });
    setMicroModalVisible(true);
  };

  const handleSaveMicro = async () => {
    if (!microForm.nombre || !microForm.fecha_inicio || !microForm.fecha_fin) {
      Alert.alert('Aviso', 'Por favor, completa el nombre y las fechas.');
      return;
    }
    setSavingMicro(true);
    try {
      if (editingMicroId) {
        await api.updateMicrociclo(editingMicroId, microForm);
      } else {
        await api.createMicrociclo({ ...microForm, macrociclo_id: selectedMacroId });
      }
      setMicroModalVisible(false);
      loadTree();
    } catch (e) {
      Alert.alert('Error', 'Error al guardar el microciclo');
    } finally {
      setSavingMicro(false);
    }
  };

  const handleDeleteMicro = (id: string, nombre: string) => {
    const confirmDelete = async () => {
      try {
        await api.deleteMicrociclo(id);
        loadTree();
      } catch (e) { Alert.alert('Error', 'No se pudo eliminar el microciclo.'); }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`¿Eliminar la semana "${nombre}"? Los entrenamientos NO se borrarán.`)) confirmDelete();
    } else {
      Alert.alert('Eliminar Microciclo', `¿Eliminar "${nombre}"? Los entrenamientos pasarán a estar sin asignar.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Calendario - {params.name}</Text>
        <TouchableOpacity onPress={openNewMacro}>
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
        {tree.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No hay planificación estructurada aún. Comienza creando un Macrociclo.
          </Text>
        ) : (
          tree.map((macro, i) => (
            <View key={i} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
              {/* HEADER MACRO */}
              <View style={[styles.macroHeader, { backgroundColor: macro.color + '20' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.macroTitle, { color: macro.color }]}>{macro.nombre}</Text>
                  <Text style={styles.dateText}>{macro.fecha_inicio} al {macro.fecha_fin}</Text>
                </View>
                
                {/* BOTONES ACCIÓN MACRO */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={() => openEditMacro(macro)} style={{ padding: 4 }}>
                    <Ionicons name="pencil" size={18} color={macro.color} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteMacro(macro.id, macro.nombre)} style={{ padding: 4, marginRight: 8 }}>
                    <Ionicons name="trash" size={18} color={colors.error} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addMicroBtn} onPress={() => openNewMicro(macro.id)}>
                    <Ionicons name="add" size={16} color={macro.color} />
                    <Text style={{ color: macro.color, fontSize: 11, fontWeight: '700' }}>Micro</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* LISTA MICRO */}
              <View style={styles.microContainer}>
                {macro.microciclos?.length === 0 && (
                  <Text style={[styles.emptyText, { fontSize: 12, marginTop: 0 }]}>No hay semanas planificadas en este bloque.</Text>
                )}
                {macro.microciclos?.map((micro: any, j: number) => (
                  <View key={j} style={[styles.microCard, { borderLeftColor: micro.color }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.microTitle}>{micro.nombre}</Text>
                        <Text style={styles.dateText}>{micro.fecha_inicio} al {micro.fecha_fin}</Text>
                      </View>
                      
                      {/* BOTONES ACCIÓN MICRO */}
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={[styles.typeBadge, { backgroundColor: micro.color + '20', marginBottom: 6 }]}>
                          <Text style={[styles.typeBadgeText, { color: micro.color }]}>{micro.tipo}</Text>
                        </View>
                        <View style={styles.actionsRow}>
                          <TouchableOpacity onPress={() => openEditMicro(micro)} style={{ padding: 4 }}>
                            <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteMicro(micro.id, micro.nombre)} style={{ padding: 4 }}>
                            <Ionicons name="trash" size={16} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    
                    {/* LISTA DE ENTRENAMIENTOS (AHORA CLICABLES) */}
                    <View style={styles.workoutList}>
                      {micro.workouts?.map((wk: any, k: number) => (
                        <TouchableOpacity 
                          key={k} 
                          style={[styles.workoutItem, { backgroundColor: colors.surfaceHighlight }]}
                          onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } })}
                        >
                          <Ionicons name={wk.completed ? "checkmark-circle" : "barbell"} size={16} color={wk.completed ? colors.success : colors.textSecondary} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.workoutTitle, { color: colors.textPrimary }]} numberOfLines={1}>{wk.title}</Text>
                            <Text style={{ fontSize: 10, color: colors.textSecondary }}>{wk.date}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* --- MODAL MACROCICLO --- */}
      <Modal visible={macroModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingMacroId ? 'Editar Macrociclo' : 'Nuevo Macrociclo'}</Text>
              <TouchableOpacity onPress={() => setMacroModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE DEL BLOQUE</Text>
              <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: Pretemporada..." placeholderTextColor={colors.textSecondary} value={macroForm.nombre} onChangeText={(t) => setMacroForm({ ...macroForm, nombre: t })} />
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>INICIO</Text>
                  <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={macroForm.fecha_inicio} onChangeText={(t) => setMacroForm({ ...macroForm, fecha_inicio: t })} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>FIN</Text>
                  <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={macroForm.fecha_fin} onChangeText={(t) => setMacroForm({ ...macroForm, fecha_fin: t })} />
                </View>
              </View>
              <Text style={[styles.label, { color: colors.textSecondary }]}>COLOR</Text>
              <View style={styles.colorRow}>
                {MACRO_COLORS.map(c => (
                  <TouchableOpacity key={c} style={[styles.colorCircle, { backgroundColor: c, borderWidth: macroForm.color === c ? 3 : 0, borderColor: colors.textPrimary }]} onPress={() => setMacroForm({ ...macroForm, color: c })} />
                ))}
              </View>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMacro} disabled={savingMacro}>
                {savingMacro ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>GUARDAR</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- MODAL MICROCICLO --- */}
      <Modal visible={microModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingMicroId ? 'Editar Semana' : 'Nueva Semana'}</Text>
              <TouchableOpacity onPress={() => setMicroModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE</Text>
              <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: Semana 1 - Adaptación" placeholderTextColor={colors.textSecondary} value={microForm.nombre} onChangeText={(t) => setMicroForm({ ...microForm, nombre: t })} />
              
              <Text style={[styles.label, { color: colors.textSecondary }]}>TIPO DE CARGA</Text>
              <View style={styles.chipsRow}>
                {MICRO_TIPOS.map(tipo => (
                  <TouchableOpacity 
                    key={tipo} 
                    style={[styles.chip, { backgroundColor: microForm.tipo === tipo ? colors.primary : colors.surfaceHighlight }]}
                    onPress={() => setMicroForm({ ...microForm, tipo })}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: microForm.tipo === tipo ? '#FFF' : colors.textSecondary }}>{tipo}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>INICIO</Text>
                  <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={microForm.fecha_inicio} onChangeText={(t) => setMicroForm({ ...microForm, fecha_inicio: t })} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>FIN</Text>
                  <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={microForm.fecha_fin} onChangeText={(t) => setMicroForm({ ...microForm, fecha_fin: t })} />
                </View>
              </View>
              
              <Text style={[styles.label, { color: colors.textSecondary }]}>COLOR</Text>
              <View style={styles.colorRow}>
                {MICRO_COLORS.map(c => (
                  <TouchableOpacity key={c} style={[styles.colorCircle, { backgroundColor: c, borderWidth: microForm.color === c ? 3 : 0, borderColor: colors.textPrimary }]} onPress={() => setMicroForm({ ...microForm, color: c })} />
                ))}
              </View>

              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMicro} disabled={savingMicro}>
                {savingMicro ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>GUARDAR</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15, color: '#888' },
  
  macroCard: { borderWidth: 2, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  macroHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroTitle: { fontSize: 17, fontWeight: '800', textTransform: 'uppercase' },
  dateText: { fontSize: 12, color: '#666', marginTop: 4 },
  
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  addMicroBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  
  microContainer: { padding: 12, backgroundColor: '#FAFAFA' },
  microCard: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderLeftWidth: 6, marginBottom: 10, elevation: 1 },
  microTitle: { fontSize: 15, fontWeight: '700' },
  
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },

  workoutList: { marginTop: 12, gap: 6 },
  workoutItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8 },
  workoutTitle: { fontSize: 13, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },

  colorRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 },
  colorCircle: { width: 40, height: 40, borderRadius: 20 },
  
  submitBtn: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 1 }
});
