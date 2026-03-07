import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
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
  
  const [macros, setMacros] = useState<any[]>([]);
  const [unassignedWorkouts, setUnassignedWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  
  // Modales states
  const [macroModalVisible, setMacroModalVisible] = useState(false);
  const [savingMacro, setSavingMacro] = useState(false);
  const [editingMacroId, setEditingMacroId] = useState<string | null>(null);
  const [macroForm, setMacroForm] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '', objetivo: '', color: MACRO_COLORS[0] });

  const [microModalVisible, setMicroModalVisible] = useState(false);
  const [savingMicro, setSavingMicro] = useState(false);
  const [selectedMacroId, setSelectedMacroId] = useState('');
  const [editingMicroId, setEditingMicroId] = useState<string | null>(null);
  const [microForm, setMicroForm] = useState({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', notas: '', color: MICRO_COLORS[0] });

  const loadTree = async () => {
    try {
      const data = await api.getPeriodizationTree(params.athlete_id!);
      setMacros(data.macros || []);
      setUnassignedWorkouts(data.unassigned_workouts || []);
    } catch (e) { console.log(e); } 
    finally { setLoading(false); }
  };

  useEffect(() => { loadTree(); }, []);

  // --- LÓGICA IMPORTACIÓN SEMANAL (MODO WEB NATIVO) ---
  const handleImportWeeklyCSV = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Aviso', 'La importación masiva está optimizada para la versión Web.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setImporting(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const csvText = event.target?.result as string;
        await procesarImportacionMasiva(csvText);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const procesarImportacionMasiva = async (csvText: string) => {
    try {
      const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) throw new Error("Archivo vacío");

      const sessionsMap: { [key: string]: any } = {};

      // fecha, sesion, ejercicio, series, reps, kilos, descanso, notas
      lines.slice(1).forEach(line => {
        const sep = line.includes(';') ? ';' : ',';
        const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        
        const fecha = cols[0];
        const sesionTitulo = cols[1] || "Sesión Importada";
        const key = `${fecha}_${sesionTitulo}`;

        if (!sessionsMap[key]) {
          sessionsMap[key] = {
            title: sesionTitulo,
            date: fecha,
            athlete_id: params.athlete_id,
            exercises: [],
            notes: "Importado mediante CSV masivo"
          };
        }

        sessionsMap[key].exercises.push({
          name: cols[2],
          sets: cols[3],
          reps: cols[4],
          weight: cols[5],
          rest: cols[6],
          exercise_notes: cols[7]
        });
      });

      const workoutsArray = Object.values(sessionsMap);
      await api.createWorkoutsBulk({ workouts: workoutsArray });
      Alert.alert('Éxito', `Se han creado ${workoutsArray.length} sesiones de entrenamiento.`);
      loadTree();
    } catch (error) {
      Alert.alert('Error', 'Formato CSV incorrecto. Revisa las columnas.');
    } finally {
      setImporting(false);
    }
  };

  // --- MACROS ---
  const openNewMacro = () => { setEditingMacroId(null); setMacroForm({ nombre: '', fecha_inicio: '', fecha_fin: '', objetivo: '', color: MACRO_COLORS[0] }); setMacroModalVisible(true); };
  const openEditMacro = (macro: any) => { setEditingMacroId(macro.id); setMacroForm({ nombre: macro.nombre, fecha_inicio: macro.fecha_inicio, fecha_fin: macro.fecha_fin, objetivo: macro.objetivo || '', color: macro.color }); setMacroModalVisible(true); };
  const handleSaveMacro = async () => {
    if (!macroForm.nombre) return;
    setSavingMacro(true);
    try {
      if (editingMacroId) await api.updateMacrociclo(editingMacroId, macroForm);
      else await api.createMacrociclo({ ...macroForm, athlete_id: params.athlete_id });
      setMacroModalVisible(false); loadTree();
    } catch (e) { Alert.alert('Error', 'Error al guardar el macrociclo'); } finally { setSavingMacro(false); }
  };
  const handleDeleteMacro = (id: string, nombre: string) => {
    Alert.alert('Eliminar Macrociclo', `¿Eliminar "${nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await api.deleteMacrociclo(id); loadTree(); } }
    ]);
  };

  // --- MICROS ---
  const openNewMicro = (macroId: string) => { setEditingMicroId(null); setSelectedMacroId(macroId); setMicroForm({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', notas: '', color: MICRO_COLORS[0] }); setMicroModalVisible(true); };
  const openEditMicro = (micro: any) => { setEditingMicroId(micro.id); setMicroForm({ nombre: micro.nombre, tipo: micro.tipo, fecha_inicio: micro.fecha_inicio, fecha_fin: micro.fecha_fin, notas: micro.notas || '', color: micro.color }); setMicroModalVisible(true); };
  const handleSaveMicro = async () => {
    if (!microForm.nombre) return;
    setSavingMicro(true);
    try {
      if (editingMicroId) await api.updateMicrociclo(editingMicroId, microForm);
      else await api.createMicrociclo({ ...microForm, macrociclo_id: selectedMacroId });
      setMicroModalVisible(false); loadTree();
    } catch (e) { Alert.alert('Error', 'Error al guardar'); } finally { setSavingMicro(false); }
  };
  const handleDeleteMicro = (id: string, nombre: string) => {
    Alert.alert('Eliminar Semana', `¿Eliminar "${nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await api.deleteMicrociclo(id); loadTree(); } }
    ]);
  };

  // --- WORKOUTS ---
  const handleDeleteWorkout = (id: string, title: string) => {
    Alert.alert('Eliminar Entreno', `¿Borrar la sesión "${title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => { await api.deleteWorkout(id); loadTree(); } }
    ]);
  };

  const renderWorkoutItem = (wk: any) => (
    <View key={wk.id} style={[styles.workoutItem, { backgroundColor: colors.surfaceHighlight }]}>
      <Ionicons name={wk.completed ? "checkmark-circle" : "ellipse-outline"} size={16} color={wk.completed ? colors.success : colors.textSecondary} />
      <TouchableOpacity 
        style={{ flex: 1, paddingVertical: 4 }}
        onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } })}
      >
        <Text style={[styles.workoutTitle, { color: colors.textPrimary, textDecorationLine: wk.completed ? 'line-through' : 'none' }]} numberOfLines={1}>{wk.title}</Text>
        <Text style={{ fontSize: 10, color: colors.textSecondary }}>{wk.date}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDeleteWorkout(wk.id, wk.title)} style={{ padding: 4 }}>
        <Ionicons name="trash-outline" size={16} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Planificación - {params.name?.split(' ')[0]}</Text>
        <TouchableOpacity onPress={() => loadTree()}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
        
        {/* BOTONES SUPERIORES */}
        <View style={styles.topActions}>
          <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.primary }]} onPress={openNewMacro}>
            <Ionicons name="layers" size={20} color="#FFF" />
            <Text style={styles.mainBtnText}>MACROCICLO</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.mainBtn, { backgroundColor: colors.surfaceHighlight, borderWidth: 1, borderColor: colors.primary }]} 
            onPress={handleImportWeeklyCSV}
            disabled={importing}
          >
            {importing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="cloud-upload" size={20} color={colors.primary} />}
            <Text style={[styles.mainBtnText, { color: colors.primary }]}>IMPORTAR SEMANA</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.soloBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]} 
          onPress={() => router.push({ pathname: '/add-workout', params: { athlete_id: params.athlete_id, name: params.name } })}
        >
          <Ionicons name="barbell" size={20} color={colors.textPrimary} />
          <Text style={[styles.mainBtnText, { color: colors.textPrimary }]}>AÑADIR ENTRENO SUELTO</Text>
        </TouchableOpacity>

        {/* LISTA DE MACROS Y MICROS */}
        {macros.length === 0 && unassignedWorkouts.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No hay planificación estructurada aún.</Text>
        ) : (
          macros.map((macro) => (
            <View key={macro.id} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
              <View style={[styles.macroHeader, { backgroundColor: macro.color + '20' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.macroTitle, { color: macro.color }]}>{macro.nombre}</Text>
                  <Text style={styles.dateText}>{macro.fecha_inicio} al {macro.fecha_fin}</Text>
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={() => openEditMacro(macro)} style={{ padding: 4 }}><Ionicons name="pencil" size={18} color={macro.color} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteMacro(macro.id, macro.nombre)} style={{ padding: 4, marginRight: 8 }}><Ionicons name="trash" size={18} color={colors.error} /></TouchableOpacity>
                  <TouchableOpacity style={styles.addMicroBtn} onPress={() => openNewMicro(macro.id)}>
                    <Ionicons name="add" size={16} color={macro.color} />
                    <Text style={{ color: macro.color, fontSize: 11, fontWeight: '700' }}>Micro</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.microContainer}>
                {macro.microciclos?.map((micro: any) => (
                  <View key={micro.id} style={[styles.microCard, { borderLeftColor: micro.color }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.microTitle}>{micro.nombre}</Text>
                        <Text style={styles.dateText}>{micro.fecha_inicio} al {micro.fecha_fin}</Text>
                        <View style={[styles.typeBadge, { backgroundColor: micro.color + '20', marginTop: 4 }]}><Text style={[styles.typeBadgeText, { color: micro.color }]}>{micro.tipo}</Text></View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={styles.actionsRow}>
                          <TouchableOpacity onPress={() => openEditMicro(micro)} style={{ padding: 4 }}><Ionicons name="pencil" size={16} color={colors.textSecondary} /></TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteMicro(micro.id, micro.nombre)} style={{ padding: 4 }}><Ionicons name="trash" size={16} color={colors.error} /></TouchableOpacity>
                        </View>
                        <TouchableOpacity 
                          style={[styles.addWorkoutBtn, { backgroundColor: micro.color + '15' }]}
                          onPress={() => router.push({ pathname: '/add-workout', params: { athlete_id: params.athlete_id, name: params.name, microciclo_id: micro.id } })}
                        >
                          <Ionicons name="add-circle" size={16} color={micro.color} />
                          <Text style={{ color: micro.color, fontSize: 10, fontWeight: '800' }}>SESIÓN</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    <View style={styles.workoutList}>
                      {micro.workouts?.map(renderWorkoutItem)}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        {/* SIN ASIGNAR */}
        {unassignedWorkouts.length > 0 && (
          <View style={[styles.macroCard, { borderColor: colors.border, marginTop: 10 }]}>
             <View style={[styles.macroHeader, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.macroTitle, { color: colors.textSecondary }]}>SESIONES SIN ASIGNAR</Text>
             </View>
             <View style={{ padding: 12 }}>
                {unassignedWorkouts.map(renderWorkoutItem)}
             </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL MACROCICLO */}
      {macroModalVisible && (
        <View style={styles.modalOverlayFull}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingMacroId ? 'Editar Macrociclo' : 'Nuevo Macrociclo'}</Text>
                <TouchableOpacity onPress={() => setMacroModalVisible(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE DEL BLOQUE</Text>
                <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={macroForm.nombre} onChangeText={(t) => setMacroForm({ ...macroForm, nombre: t })} />
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>INICIO</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" value={macroForm.fecha_inicio} onChangeText={(t) => setMacroForm({ ...macroForm, fecha_inicio: t })} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>FIN</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" value={macroForm.fecha_fin} onChangeText={(t) => setMacroForm({ ...macroForm, fecha_fin: t })} />
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
        </View>
      )}

      {/* MODAL MICROCICLO */}
      {microModalVisible && (
        <View style={styles.modalOverlayFull}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingMicroId ? 'Editar Semana' : 'Nueva Semana'}</Text>
                <TouchableOpacity onPress={() => setMicroModalVisible(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE</Text>
                <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} value={microForm.nombre} onChangeText={(t) => setMicroForm({ ...microForm, nombre: t })} />
                <Text style={[styles.label, { color: colors.textSecondary }]}>TIPO DE CARGA</Text>
                <View style={styles.chipsRow}>
                  {MICRO_TIPOS.map(tipo => (
                    <TouchableOpacity key={tipo} style={[styles.chip, { backgroundColor: microForm.tipo === tipo ? colors.primary : colors.surfaceHighlight }]} onPress={() => setMicroForm({ ...microForm, tipo })}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: microForm.tipo === tipo ? '#FFF' : colors.textSecondary }}>{tipo}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.row}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>INICIO</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" value={microForm.fecha_inicio} onChangeText={(t) => setMicroForm({ ...microForm, fecha_inicio: t })} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>FIN</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" value={microForm.fecha_fin} onChangeText={(t) => setMicroForm({ ...microForm, fecha_fin: t })} />
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
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16 },
  topActions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  mainBtn: { flex: 1, padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  soloBtn: { width: '100%', padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 20, borderWidth: 1, borderStyle: 'dashed' },
  mainBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15, color: '#888' },
  macroCard: { borderWidth: 2, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  macroHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroTitle: { fontSize: 16, fontWeight: '800', textTransform: 'uppercase' },
  dateText: { fontSize: 11, color: '#666', marginTop: 4 },
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  addMicroBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  microContainer: { padding: 12, backgroundColor: '#FAFAFA' },
  microCard: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderLeftWidth: 6, marginBottom: 12, elevation: 1 },
  microTitle: { fontSize: 14, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  addWorkoutBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, gap: 4 },
  workoutList: { marginTop: 12, gap: 6 },
  workoutItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, paddingRight: 4, borderRadius: 8 },
  workoutTitle: { fontSize: 13, fontWeight: '600' },
  modalOverlayFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 12, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  colorRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 },
  colorCircle: { width: 34, height: 34, borderRadius: 17 },
  submitBtn: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 1 }
});
