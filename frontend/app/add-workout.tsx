import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert, Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const BASE_MUSCLE_MAP: Record<string, string[]> = {
  'Pecho': ['press banca', 'flexiones', 'pecho', 'aperturas', 'push up'],
  'Espalda': ['dominadas', 'remo', 'pull up', 'espalda', 'lat pulldown'],
  'Cuádriceps': ['sentadilla', 'squat', 'prensa', 'extensiones', 'bulgara', 'lunge', 'zancada'],
  'Isquiotibiales': ['peso muerto', 'deadlift', 'curl femoral', 'isquios', 'buenos dias'],
  'Glúteo': ['hip thrust', 'puente', 'gluteo', 'patada'],
  'Hombro': ['press militar', 'hombro', 'elevaciones', 'deltoides', 'face pull'],
  'Bíceps': ['curl', 'biceps'],
  'Tríceps': ['triceps', 'extensiones triceps', 'fondos', 'dip'],
  'Core': ['plancha', 'crunch', 'core', 'abs', 'abdominales', 'leg raise', 'rueda'],
  'Gemelos': ['gemelos', 'gemelo', 'calf', 'calves', 'soleo', 'elevacion talones'],
  'Antebrazos': ['antebrazos', 'antebrazo', 'forearm', 'curl muñeca', 'paseo granjero', 'agarre'],
  'Aductores': ['aductores', 'aductor', 'adductor', 'copenhague', 'copenhagen', 'interior pierna'],
  'Abductores': ['abductores', 'abductor', 'aperturas pierna', 'banda lateral', 'exterior pierna']
};
const MUSCLE_GROUPS = Object.keys(BASE_MUSCLE_MAP);

const normalizeName = (name: string) => {
  if (!name) return "";
  let n = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.endsWith('es')) n = n.slice(0, -2);
  else if (n.endsWith('s')) n = n.slice(0, -1);
  return n;
};

export default function AddWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string; microciclo_id?: string }>();

  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  
  const [microciclosDisponibles, setMicrociclosDisponibles] = useState<any[]>([]);
  const [selectedMicroId, setSelectedMicroId] = useState<string | null>(params.microciclo_id || null);

  const [workoutType, setWorkoutType] = useState<'traditional' | 'hiit'>('traditional');

  const [exercises, setExercises] = useState<any[]>([
    { _key: '1', name: '', sets: '', reps: '', weight: '', rest: '', rest_exercise: '', video_url: '', exercise_notes: '', image_path: '' }
  ]);

  const [hiitBlocks, setHiitBlocks] = useState<any[]>([
    { 
      _key: 'b1', name: 'Bloque 1', sets: '3', rest_exercise: '15', rest_block: '60', rest_between_blocks: '120',
      exercises: [{ _key: 'e1', name: '', duration_reps: '', exercise_notes: '', video_url: '' }] 
    }
  ]);

  // --- ESTADOS PARA MAPEO DE MÚSCULOS ---
  const [customMap, setCustomMap] = useState<Record<string, string[]>>({});
  const [showMapModal, setShowMapModal] = useState(false);
  const [unknownExercises, setUnknownExercises] = useState<string[]>([]);
  const [exerciseMappings, setExerciseMappings] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (params.athlete_id) {
      api.getPeriodizationTree(params.athlete_id).then((tree) => {
        const todosLosMicros = Array.isArray(tree) ? tree.flatMap((macro: any) => macro.microciclos || []) : (tree?.macros || []).flatMap((macro: any) => macro.microciclos || []);
        todosLosMicros.sort((a: any, b: any) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
        setMicrociclosDisponibles(todosLosMicros);
      }).catch((e) => console.log("Error cargando microciclos:", e));
    }
    
    // Cargar mapa personalizado al iniciar
    AsyncStorage.getItem('custom_muscle_map').then(res => {
      if (res) setCustomMap(JSON.parse(res));
    });
  }, [params.athlete_id]);

  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...exercises]; updated[index] = { ...updated[index], [field]: value }; setExercises(updated);
  };
  const addExercise = () => setExercises([...exercises, { _key: Math.random().toString(), name: '', sets: '', reps: '', weight: '', rest: '', rest_exercise: '', video_url: '', exercise_notes: '', image_path: '' }]);
  const removeExercise = (index: number) => setExercises(exercises.filter((_, i) => i !== index));
  
  const moveExerciseUp = (index: number) => {
    if (index === 0) return;
    const newExs = [...exercises]; [newExs[index - 1], newExs[index]] = [newExs[index], newExs[index - 1]]; setExercises(newExs);
  };
  const moveExerciseDown = (index: number) => {
    if (index === exercises.length - 1) return;
    const newExs = [...exercises]; [newExs[index + 1], newExs[index]] = [newExs[index], newExs[index + 1]]; setExercises(newExs);
  };

  const addHiitBlock = () => setHiitBlocks([...hiitBlocks, { _key: Math.random().toString(), name: `Bloque ${hiitBlocks.length + 1}`, sets: '3', rest_exercise: '15', rest_block: '60', rest_between_blocks: '120', exercises: [{ _key: Math.random().toString(), name: '', duration_reps: '', exercise_notes: '', video_url: '' }] }]);
  const removeHiitBlock = (bIndex: number) => setHiitBlocks(hiitBlocks.filter((_, i) => i !== bIndex));
  const updateHiitBlock = (bIndex: number, field: string, value: string) => { const updated = [...hiitBlocks]; updated[bIndex] = { ...updated[bIndex], [field]: value }; setHiitBlocks(updated); };
  
  const addHiitExercise = (bIndex: number) => { const updated = [...hiitBlocks]; updated[bIndex].exercises.push({ _key: Math.random().toString(), name: '', duration_reps: '', exercise_notes: '', video_url: '' }); setHiitBlocks(updated); };
  const removeHiitExercise = (bIndex: number, eIndex: number) => { const updated = [...hiitBlocks]; updated[bIndex].exercises = updated[bIndex].exercises.filter((_: any, i: number) => i !== eIndex); setHiitBlocks(updated); };
  const updateHiitExercise = (bIndex: number, eIndex: number, field: string, value: string) => { const updated = [...hiitBlocks]; updated[bIndex].exercises[eIndex] = { ...updated[bIndex].exercises[eIndex], [field]: value }; setHiitBlocks(updated); };
  
  const moveHiitExerciseUp = (bIndex: number, eIndex: number) => {
    if (eIndex === 0) return;
    const updated = [...hiitBlocks]; [updated[bIndex].exercises[eIndex - 1], updated[bIndex].exercises[eIndex]] = [updated[bIndex].exercises[eIndex], updated[bIndex].exercises[eIndex - 1]]; setHiitBlocks(updated);
  };
  const moveHiitExerciseDown = (bIndex: number, eIndex: number) => {
    if (eIndex === hiitBlocks[bIndex].exercises.length - 1) return;
    const updated = [...hiitBlocks]; [updated[bIndex].exercises[eIndex + 1], updated[bIndex].exercises[eIndex]] = [updated[bIndex].exercises[eIndex], updated[bIndex].exercises[eIndex + 1]]; setHiitBlocks(updated);
  };

  const handleImportCSV = async () => { /* ... (se mantiene igual) ... */ };

  // --- INTERCEPTOR DE GUARDADO PARA EL MAPA DE CALOR ---
  const handleSave = () => {
    setError('');
    if (!title.trim()) { setError('El título es obligatorio'); return; }
    if (!date.trim()) { setError('La fecha es obligatoria'); return; }

    const exNames = workoutType === 'traditional' 
      ? exercises.map(e => e.name.trim()).filter(Boolean)
      : hiitBlocks.flatMap(b => b.exercises.map((e: any) => e.name.trim()).filter(Boolean));

    if (exNames.length === 0) { setError('Añade al menos un ejercicio'); return; }

    const unknowns: string[] = [];
    exNames.forEach(name => {
      const norm = normalizeName(name);
      let found = false;
      
      // Buscar en el mapa base
      for (const keywords of Object.values(BASE_MUSCLE_MAP)) {
        if (keywords.some(k => norm.includes(k))) found = true;
      }
      // Buscar en el mapa personalizado
      for (const keywords of Object.values(customMap)) {
        if (keywords.some(k => norm.includes(k))) found = true;
      }

      if (!found && !unknowns.includes(name)) unknowns.push(name);
    });

    if (unknowns.length > 0) {
      setUnknownExercises(unknowns);
      setExerciseMappings({}); // Limpiar selecciones previas
      setShowMapModal(true);
    } else {
      executeSave();
    }
  };

  const saveMappingsAndContinue = async () => {
    const updatedMap = { ...customMap };
    for (const [exName, muscles] of Object.entries(exerciseMappings)) {
      const norm = normalizeName(exName);
      muscles.forEach(m => {
        if (!updatedMap[m]) updatedMap[m] = [];
        if (!updatedMap[m].includes(norm)) updatedMap[m].push(norm);
      });
    }
    await AsyncStorage.setItem('custom_muscle_map', JSON.stringify(updatedMap));
    setCustomMap(updatedMap);
    setShowMapModal(false);
    executeSave();
  };

  const toggleMuscleSelection = (exName: string, muscle: string) => {
    setExerciseMappings(prev => {
      const current = prev[exName] || [];
      const updated = current.includes(muscle) ? current.filter(m => m !== muscle) : [...current, muscle];
      return { ...prev, [exName]: updated };
    });
  };

  // --- GUARDADO REAL EN LA API ---
  const executeSave = async () => {
    // CORRECCIÓN: Mandamos tanto microciclo_id como microcycle_id
    let payloadData: any = {
      title: title.trim(), 
      date: date.trim(), 
      notes: notes.trim(),
      athlete_id: params.athlete_id, 
      microciclo_id: selectedMicroId,
      microcycle_id: selectedMicroId // Añadido para mayor compatibilidad
    };

    if (workoutType === 'traditional') {
      payloadData.exercises = exercises.filter(e => e.name.trim()).map(ex => ({
        name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight,
        rest: ex.rest, rest_exercise: ex.rest_exercise, video_url: ex.video_url, exercise_notes: ex.exercise_notes
      }));
    } else {
      payloadData.exercises = hiitBlocks.map(block => ({
        is_hiit_block: true, name: block.name, sets: block.sets, rest_exercise: block.rest_exercise,
        rest_block: block.rest_block, rest_between_blocks: block.rest_between_blocks, 
        hiit_exercises: block.exercises.filter((e: any) => e.name.trim()).map((e: any) => ({ 
          name: e.name, duration_reps: e.duration_reps, exercise_notes: e.exercise_notes, video_url: e.video_url 
        }))
      })).filter(b => b.hiit_exercises.length > 0);
    }

    setSaving(true);
    try {
      await api.createWorkout(payloadData);
      router.back();
    } catch (e: any) { setError(e.message || 'Error al guardar'); } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, width: '100%' }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nueva Sesión</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={saving}>{saving ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={[styles.saveText, { color: colors.primary }]}>Guardar</Text>}</TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TÍTULO Y FECHA</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 2, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Ej: Core y Estabilidad" placeholderTextColor={colors.textSecondary} />
              <TextInput style={[styles.input, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>ASIGNAR A SEMANA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={[styles.microChip, { borderColor: colors.border }, selectedMicroId === null && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setSelectedMicroId(null)}>
                <Text style={{ color: selectedMicroId === null ? '#FFF' : colors.textPrimary, fontSize: 13, fontWeight: '700' }}>Suelto / Sin asignar</Text>
              </TouchableOpacity>
              {microciclosDisponibles.map(m => (
                <TouchableOpacity key={m.id} style={[styles.microChip, { borderColor: colors.border }, selectedMicroId === m.id && { backgroundColor: m.color || colors.primary, borderColor: m.color || colors.primary }]} onPress={() => setSelectedMicroId(m.id)}>
                  <Text style={{ color: selectedMicroId === m.id ? '#FFF' : colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{m.nombre}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={[styles.typeSelector, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
            <TouchableOpacity style={[styles.typeBtn, workoutType === 'traditional' && { backgroundColor: colors.primary }]} onPress={() => setWorkoutType('traditional')}><Text style={{ color: workoutType === 'traditional' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Fuerza</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, workoutType === 'hiit' && { backgroundColor: colors.error || '#EF4444' }]} onPress={() => setWorkoutType('hiit')}><Text style={{ color: workoutType === 'hiit' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Circuito HIIT</Text></TouchableOpacity>
          </View>

          {workoutType === 'traditional' ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>EJERCICIOS ({exercises.length})</Text>
              </View>

              {exercises.map((ex, i) => (
                <View key={ex._key} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.exerciseHeader}>
                    <TextInput style={[styles.exNameInput, { color: colors.textPrimary }]} value={ex.name} onChangeText={v => updateExercise(i, 'name', v)} placeholder="Nombre del ejercicio" placeholderTextColor={colors.textSecondary} />
                    <View style={styles.exActions}>
                      {i > 0 && <TouchableOpacity onPress={() => moveExerciseUp(i)} style={styles.iconBtn}><Ionicons name="arrow-up" size={18} color={colors.textSecondary} /></TouchableOpacity>}
                      {i < exercises.length - 1 && <TouchableOpacity onPress={() => moveExerciseDown(i)} style={styles.iconBtn}><Ionicons name="arrow-down" size={18} color={colors.textSecondary} /></TouchableOpacity>}
                      {exercises.length > 1 && <TouchableOpacity onPress={() => removeExercise(i)} style={styles.iconBtn}><Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} /></TouchableOpacity>}
                    </View>
                  </View>
                  <View style={[styles.exDetailsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Series</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.sets} onChangeText={v => updateExercise(i, 'sets', v)} placeholder="-" keyboardType="numeric" /></View>
                    <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Reps</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.reps} onChangeText={v => updateExercise(i, 'reps', v)} placeholder="-" keyboardType="numeric" /></View>
                    <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Desc. S.</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.rest} onChangeText={v => updateExercise(i, 'rest', v)} placeholder="s" keyboardType="numeric" /></View>
                    <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Desc. Ej.</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.rest_exercise} onChangeText={v => updateExercise(i, 'rest_exercise', v)} placeholder="s" keyboardType="numeric" /></View>
                  </View>
                  <View style={[styles.mediaContainer, { borderTopColor: colors.border }]}>
                    <Ionicons name="logo-youtube" size={16} color={colors.error || '#EF4444'} />
                    <TextInput style={[styles.urlInput, { color: colors.textPrimary }]} value={ex.video_url} onChangeText={v => updateExercise(i, 'video_url', v)} placeholder="URL de YouTube o Drive (opcional)" placeholderTextColor={colors.textSecondary} autoCapitalize="none" />
                  </View>
                  <View style={[styles.notesContainer, { borderTopColor: colors.border }]}>
                    <TextInput style={[styles.notesInput, { color: colors.textPrimary }]} value={ex.exercise_notes} onChangeText={v => updateExercise(i, 'exercise_notes', v)} placeholder="Añadir observaciones técnicas..." placeholderTextColor={colors.textSecondary} />
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addExercise} style={styles.addExBtnBig}><Ionicons name="add" size={20} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: '700' }}>Añadir Ejercicio</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 10 }]}>BLOQUES DE CIRCUITO ({hiitBlocks.length})</Text>
              {hiitBlocks.map((block, bIndex) => (
                <View key={block._key} style={[styles.hiitBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.hiitHeader, { borderBottomColor: colors.border }]}>
                    <TextInput style={[styles.hiitNameInput, { color: colors.textPrimary }]} value={block.name} onChangeText={v => updateHiitBlock(bIndex, 'name', v)} placeholder="Nombre del Bloque" placeholderTextColor={colors.textSecondary} />
                    {hiitBlocks.length > 1 && <TouchableOpacity onPress={() => removeHiitBlock(bIndex)}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>}
                  </View>
                  <View style={styles.hiitConfigGrid}>
                    <View style={styles.hiitConfigRow}>
                      <View style={styles.hiitConfigItem}><Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}>Vueltas</Text><TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.sets} onChangeText={v => updateHiitBlock(bIndex, 'sets', v)} keyboardType="numeric" placeholder="Ej: 3" /></View>
                      <View style={styles.hiitConfigItem}><Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}>Desc. Ej.</Text><TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_exercise} onChangeText={v => updateHiitBlock(bIndex, 'rest_exercise', v)} keyboardType="numeric" placeholder="Seg" /></View>
                    </View>
                    <View style={styles.hiitConfigRow}>
                      <View style={styles.hiitConfigItem}><Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}>Desc. Vuelta</Text><TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_block} onChangeText={v => updateHiitBlock(bIndex, 'rest_block', v)} keyboardType="numeric" placeholder="Seg" /></View>
                      <View style={styles.hiitConfigItem}><Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}>Sig. Bloque</Text><TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_between_blocks} onChangeText={v => updateHiitBlock(bIndex, 'rest_between_blocks', v)} keyboardType="numeric" placeholder="Seg" /></View>
                    </View>
                  </View>
                  <View style={styles.hiitExList}>
                    {block.exercises.map((ex: any, eIndex: number) => (
                      <View key={ex._key} style={styles.hiitExContainer}>
                        <View style={styles.hiitExRow}>
                          <View style={styles.hiitExNum}><Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>{eIndex + 1}</Text></View>
                          <TextInput style={[styles.hiitExInput, { flex: 2, color: colors.textPrimary, borderColor: colors.border }]} value={ex.name} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'name', v)} placeholder="Ej: Burpees" placeholderTextColor={colors.textSecondary} />
                          <TextInput style={[styles.hiitExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.duration_reps} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'duration_reps', v)} placeholder="40s o 15r" placeholderTextColor={colors.textSecondary} />
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: 60 }}>
                             {eIndex > 0 && <TouchableOpacity onPress={() => moveHiitExerciseUp(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="arrow-up" size={16} color={colors.textSecondary} /></TouchableOpacity>}
                             {eIndex < block.exercises.length - 1 && <TouchableOpacity onPress={() => moveHiitExerciseDown(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="arrow-down" size={16} color={colors.textSecondary} /></TouchableOpacity>}
                             <TouchableOpacity onPress={() => removeHiitExercise(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="close-circle" size={20} color={colors.textSecondary} /></TouchableOpacity>
                          </View>
                        </View>
                        <TextInput style={[styles.hiitNotesInput, { color: colors.textPrimary, borderColor: colors.border }]} value={ex.video_url} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'video_url', v)} placeholder="URL de vídeo (opcional)" placeholderTextColor={colors.textSecondary} />
                        <TextInput style={[styles.hiitNotesInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: 4 }]} value={ex.exercise_notes} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'exercise_notes', v)} placeholder="Observaciones técnicas (opcional)" placeholderTextColor={colors.textSecondary} />
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => addHiitExercise(bIndex)} style={styles.addHiitExBtn}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>+ Añadir ejercicio al bloque</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addHiitBlock} style={[styles.addExBtnBig, { borderColor: colors.error || '#EF4444', borderStyle: 'dashed' }]}><Ionicons name="add" size={20} color={colors.error || '#EF4444'} /><Text style={{ color: colors.error || '#EF4444', fontWeight: '700' }}>Añadir Nuevo Bloque HIIT</Text></TouchableOpacity>
            </View>
          )}

          {error ? <Text style={[styles.errorText, { color: colors.error || '#EF4444' }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* MODAL PARA MAPEADO DE MÚSCULOS */}
      <Modal visible={showMapModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginBottom: 10 }}>Ejercicios Nuevos 🤔</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, fontSize: 14 }}>
              Para que el Mapa de Calor sea preciso, indícale a Fit Tracker qué grupos musculares trabajan estos ejercicios:
            </Text>
            
            <ScrollView style={{ flexShrink: 1, marginBottom: 20 }}>
              {unknownExercises.map(ex => (
                <View key={ex} style={{ marginBottom: 20 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>{ex}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {MUSCLE_GROUPS.map(muscle => {
                      const isSelected = (exerciseMappings[ex] || []).includes(muscle);
                      return (
                        <TouchableOpacity 
                          key={muscle} 
                          onPress={() => toggleMuscleSelection(ex, muscle)}
                          style={[
                            styles.musclePill, 
                            { borderColor: colors.border }, 
                            isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }
                          ]}
                        >
                          <Text style={{ color: isSelected ? '#FFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{muscle}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.saveBtnBig, { backgroundColor: colors.primary }]} onPress={saveMappingsAndContinue}>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>GUARDAR Y CONTINUAR</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={executeSave} style={{ marginTop: 15 }}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center', fontWeight: '600' }}>Ignorar y continuar sin mapear</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, 
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 }, 
  headerBtn: { minWidth: 60 }, 
  headerTitle: { fontSize: 17, fontWeight: '600' }, 
  saveText: { fontSize: 16, fontWeight: '600', textAlign: 'right' }, 
  form: { padding: 20, gap: 20, paddingBottom: 48, width: '100%', maxWidth: 800, alignSelf: 'center' }, 
  section: { gap: 10 }, 
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, 
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }, 
  input: { borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, minWidth: 0 }, 
  typeSelector: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1 }, 
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 }, 
  microChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginRight: 10 }, 
  csvBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  exerciseCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 10 }, 
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }, 
  exNameInput: { flex: 1, fontSize: 16, fontWeight: '500', minWidth: 0 }, 
  exActions: { flexDirection: 'row', gap: 4 }, 
  iconBtn: { padding: 4 }, 
  exDetailsRow: { flexDirection: 'row', borderTopWidth: 0.5 }, 
  exDetail: { flex: 1, alignItems: 'center', padding: 8, borderRightWidth: 0.5, borderRightColor: 'rgba(0,0,0,0.1)' }, 
  exDetailLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 }, 
  exDetailInput: { width: '100%', textAlign: 'center', borderRadius: 6, padding: 8, fontSize: 14, fontWeight: '600' }, 
  mediaContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 0.5, gap: 8 }, 
  urlInput: { flex: 1, fontSize: 13, minWidth: 0 }, 
  notesContainer: { padding: 10, borderTopWidth: 0.5 }, 
  notesInput: { fontSize: 13, fontStyle: 'italic', minWidth: 0 },
  addExBtnBig: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', gap: 8 }, 
  hiitBlock: { borderRadius: 16, borderWidth: 2, overflow: 'hidden', marginBottom: 15 }, 
  hiitHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, backgroundColor: 'rgba(0,0,0,0.02)' }, 
  hiitNameInput: { flex: 1, fontSize: 16, fontWeight: '700', minWidth: 0 }, 
  hiitConfigGrid: { gap: 10, padding: 12, backgroundColor: 'rgba(0,0,0,0.01)' }, 
  hiitConfigRow: { flexDirection: 'row', gap: 10 }, 
  hiitConfigItem: { flex: 1 }, 
  hiitConfigLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4, textAlign: 'center' }, 
  hiitConfigInput: { borderWidth: 1, borderRadius: 8, padding: 8, textAlign: 'center', fontSize: 14, fontWeight: '600', minWidth: 0 }, 
  hiitExList: { padding: 12, gap: 10 }, 
  hiitExContainer: { marginBottom: 8 }, 
  hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, 
  hiitExNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, 
  hiitExInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minWidth: 0 }, 
  hiitNotesInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 12, fontStyle: 'italic', marginTop: 5, marginLeft: 28, minWidth: 0 }, 
  addHiitExBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, marginLeft: 20 }, 
  errorText: { textAlign: 'center', fontWeight: '600', marginTop: 10 },

  // Estilos Modal Mapa de Músculos
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  musclePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  saveBtnBig: { paddingVertical: 16, borderRadius: 15, alignItems: 'center' }
});
