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
      setLoading(true);
      // Validamos que exista el ID del atleta antes de llamar
      if (!params.athlete_id) return;
      
      const data = await api.getPeriodizationTree(params.athlete_id);
      
      // Seguridad: Verificamos que data no sea null antes de actualizar estados
      if (data) {
        setMacros(data.macros || []);
        setUnassignedWorkouts(data.unassigned_workouts || []);
      }
    } catch (e) { 
      console.log("Error cargando planificación:", e);
      Alert.alert("Error", "No se pudo conectar con el servidor para cargar el calendario.");
    } finally { 
      setLoading(false); 
    }
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

  // --- GESTIÓN MACROS ---
  const handleSaveMacro = async () => {
    if (!macroForm.nombre) return;
    setSavingMacro(true);
    try {
      if (editingMacroId) await api.updateMacrociclo(editingMacroId, macroForm);
      else await api.createMacrociclo({ ...macroForm, athlete_id: params.athlete_id });
      setMacroModalVisible(false); loadTree();
    } catch (e) { Alert.alert('Error', 'Error al guardar el macrociclo'); } finally { setSavingMacro(false); }
  };

  // --- GESTIÓN MICROS ---
  const handleSaveMicro = async () => {
    if (!microForm.nombre) return;
    setSavingMicro(true);
    try {
      if (editingMicroId) await api.updateMicrociclo(editingMicroId, microForm);
      else await api.createMicrociclo({ ...microForm, macrociclo_id: selectedMacroId });
      setMicroModalVisible(false); loadTree();
    } catch (e) { Alert.alert('Error', 'Error al guardar'); } finally { setSavingMicro(false); }
  };

  // --- RENDERIZADO DE ITEMS ---
  const renderWorkoutItem = (wk: any) => (
    <View key={wk?.id || Math.random().toString()} style={[styles.workoutItem, { backgroundColor: colors.surfaceHighlight }]}>
      <Ionicons name={wk?.completed ? "checkmark-circle" : "ellipse-outline"} size={16} color={wk?.completed ? colors.success : colors.textSecondary} />
      <TouchableOpacity 
        style={{ flex: 1, paddingVertical: 4 }}
        onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk?.id } })}
      >
        <Text style={[styles.workoutTitle, { color: colors.textPrimary, textDecorationLine: wk?.completed ? 'line-through' : 'none' }]} numberOfLines={1}>
          {wk?.title || 'Entrenamiento'}
        </Text>
        <Text style={{ fontSize: 10, color: colors.textSecondary }}>{wk?.date}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDeleteWorkout(wk.id, wk.title)} style={{ padding: 4 }}>
        <Ionicons name="trash-outline" size={16} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  const handleDeleteWorkout = (id: string, title: string) => {
    Alert.alert('Eliminar Entreno', `¿Borrar la sesión "${title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => { await api.deleteWorkout(id); loadTree(); } }
    ]);
  };

  // --- PANTALLA DE CARGA ---
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ textAlign: 'center', marginTop: 15, color: colors.textSecondary }}>Sincronizando planificación...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Planificación - {params.name?.split(' ')[0]}</Text>
        <TouchableOpacity onPress={loadTree}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
        
        {/* BOTONES ACCIÓN */}
        <View style={styles.topActions}>
          <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.primary }]} onPress={() => { setEditingMacroId(null); setMacroForm({ nombre: '', fecha_inicio: '', fecha_fin: '', objetivo: '', color: MACRO_COLORS[0] }); setMacroModalVisible(true); }}>
            <Ionicons name="layers" size={20} color="#FFF" />
            <Text style={[styles.mainBtnText, { color: '#FFF' }]}>MACROCICLO</Text>
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

        {/* LISTADO PRINCIPAL */}
        {(macros?.length === 0 && unassignedWorkouts?.length === 0) ? (
          <View style={{ marginTop: 50, alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={50} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No hay planificación aún.</Text>
          </View>
        ) : (
          <>
            {/* RENDER MACROS */}
            {macros?.map((macro) => (
              <View key={macro?.id || Math.random()} style={[styles.macroCard, { borderColor: macro?.color || colors.border }]}>
                <View style={[styles.macroHeader, { backgroundColor: (macro?.color || colors.primary) + '20' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.macroTitle, { color: macro?.color }]}>{macro?.nombre}</Text>
                    <Text style={styles.dateText}>{macro?.fecha_inicio} al {macro?.fecha_fin}</Text>
                  </View>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => { setEditingMacroId(macro.id); setMacroForm({ nombre: macro.nombre, fecha_inicio: macro.fecha_inicio, fecha_fin: macro.fecha_fin, objetivo: macro.objetivo || '', color: macro.color }); setMacroModalVisible(true); }} style={{ padding: 4 }}><Ionicons name="pencil" size={18} color={macro?.color} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => Alert.alert('Eliminar', '¿Borrar bloque?', [{ text: 'No' }, { text: 'Sí', onPress: async () => { await api.deleteMacrociclo(macro.id); loadTree(); } }])} style={{ padding: 4, marginRight: 8 }}><Ionicons name="trash" size={18} color={colors.error} /></TouchableOpacity>
                    <TouchableOpacity style={styles.addMicroBtn} onPress={() => { setEditingMicroId(null); setSelectedMacroId(macro.id); setMicroForm({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', notas: '', color: MICRO_COLORS[0] }); setMicroModalVisible(true); }}>
                      <Ionicons name="add" size={16} color={macro?.color} />
                      <Text style={{ color: macro?.color, fontSize: 11, fontWeight: '700' }}>Micro</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.microContainer}>
                  {macro.microciclos?.map((micro: any) => (
                    <View key={micro?.id || Math.random()} style={[styles.microCard, { borderLeftColor: micro?.color }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.microTitle}>{micro?.nombre}</Text>
                          <Text style={styles.dateText}>{micro?.fecha_inicio} al {micro?.fecha_fin}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <TouchableOpacity 
                            style={[styles.addWorkoutBtn, { backgroundColor: (micro?.color || colors.primary) + '15' }]}
                            onPress={() => router.push({ pathname: '/add-workout', params: { athlete_id: params.athlete_id, name: params.name, microciclo_id: micro.id } })}
                          >
                            <Ionicons name="add-circle" size={14} color={micro?.color} />
                            <Text style={{ color: micro?.color, fontSize: 10, fontWeight: '800' }}>SESIÓN</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      
                      <View style={styles.workoutList}>
                        {micro?.workouts?.map(renderWorkoutItem)}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {/* RENDER SUELTOS */}
            {unassignedWorkouts?.length > 0 && (
              <View style={[styles.macroCard, { borderColor: colors.border, marginTop: 10 }]}>
                 <View style={[styles.macroHeader, { backgroundColor: colors.surfaceHighlight }]}>
                    <Text style={[styles.macroTitle, { color: colors.textSecondary }]}>SESIONES SIN ASIGNAR</Text>
                 </View>
                 <View style={{ padding: 12 }}>
                    {unassignedWorkouts.map(renderWorkoutItem)}
                 </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* --- MODALES (IDÉNTICOS AL PASO ANTERIOR) --- */}
      {macroModalVisible && (
        <View style={styles.modalOverlayFull}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingMacroId ? 'Editar Macrociclo' : 'Nuevo Macrociclo'}</Text>
                <TouchableOpacity onPress={() => setMacroModalVisible(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre" value={macroForm.nombre} onChangeText={(t) => setMacroForm({ ...macroForm, nombre: t })} />
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMacro}><Text style={styles.submitBtnText}>GUARDAR</Text></TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {microModalVisible && (
        <View style={styles.modalOverlayFull}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Semana</Text>
                <TouchableOpacity onPress={() => setMicroModalVisible(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
              </View>
              <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre" value={microForm.nombre} onChangeText={(t) => setMicroForm({ ...microForm, nombre: t })} />
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMicro}><Text style={styles.submitBtnText}>GUARDAR</Text></TouchableOpacity>
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
  emptyText: { textAlign: 'center', marginTop: 10, fontSize: 15 },
  macroCard: { borderWidth: 2, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  macroHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroTitle: { fontSize: 16, fontWeight: '800', textTransform: 'uppercase' },
  dateText: { fontSize: 11, color: '#666', marginTop: 4 },
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  addMicroBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  microContainer: { padding: 12, backgroundColor: '#FAFAFA' },
  microCard: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderLeftWidth: 6, marginBottom: 12 },
  microTitle: { fontSize: 14, fontWeight: '700' },
  addWorkoutBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, gap: 4 },
  workoutList: { marginTop: 12, gap: 6 },
  workoutItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, paddingRight: 4, borderRadius: 8 },
  workoutTitle: { fontSize: 13, fontWeight: '600' },
  modalOverlayFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16 },
  submitBtn: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 }
});
