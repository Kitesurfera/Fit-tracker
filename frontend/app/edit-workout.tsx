import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert, Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const normalizeName = (name: string) => {
  if (!name) return "";
  let n = name.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.endsWith('es')) n = n.slice(0, -2);
  else if (n.endsWith('s')) n = n.slice(0, -1);
  return n;
};

export default function EditWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ workoutId: string }>();

  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [athleteId, setAthleteId] = useState('');
  const [error, setError] = useState('');
  
  const [microciclosDisponibles, setMicrociclosDisponibles] = useState<any[]>([]);
  const [selectedMicroId, setSelectedMicroId] = useState<string | null>(null);

  const [workoutType, setWorkoutType] = useState<'traditional' | 'hiit'>('traditional');
  
  const [hiitConfig, setHiitConfig] = useState({
    reps: true, duration: true, restEx: true, restSet: true, restBlock: true
  });

  const [exercises, setExercises] = useState<any[]>([]);
  const [hiitBlocks, setHiitBlocks] = useState<any[]>([]);

  // Estados Píldoras
  const [pills, setPills] = useState<any[]>([]);
  const [showPillModal, setShowPillModal] = useState(false);
  const [showSavePillModal, setShowSavePillModal] = useState(false);
  const [newPillName, setNewPillName] = useState('');

  useEffect(() => {
    const fetchWorkout = async () => {
      try {
        const allWorkouts = await api.getWorkouts();
        const w = allWorkouts.find((wk: any) => wk.id === params.workoutId);
        if (w) {
          setTitle(w.title || '');
          setDate(w.date || '');
          setNotes(w.notes || '');
          setAthleteId(w.athlete_id);
          setSelectedMicroId(w.microciclo_id || w.microcycle_id || null);
          
          if (w.hiit_settings) {
            setHiitConfig({ ...hiitConfig, ...w.hiit_settings });
          }

          if (w.athlete_id) {
            api.getPeriodizationTree(w.athlete_id).then((tree) => {
              const todosLosMicros = Array.isArray(tree) 
                ? tree.flatMap((macro: any) => macro.microciclos || macro.microcycles || []) 
                : (tree?.macros || []).flatMap((macro: any) => macro.microciclos || macro.microcycles || []);
              
              todosLosMicros.sort((a: any, b: any) => new Date(a.fecha_inicio || a.start_date).getTime() - new Date(b.fecha_inicio || b.start_date).getTime());
              setMicrociclosDisponibles(todosLosMicros);
            }).catch(console.log);
          }

          if (w.exercises && w.exercises.length > 0 && w.exercises[0].is_hiit_block) {
            setWorkoutType('hiit');
            setHiitBlocks(w.exercises.map((b: any) => ({ 
              ...b, 
              _key: Math.random().toString(), 
              exercises: (b.hiit_exercises || b.exercises || []).map((e: any) => ({...e, _key: Math.random().toString(), sets: e.sets || '1', is_unilateral: !!e.is_unilateral})) 
            })));
          } else {
            setWorkoutType('traditional');
            setExercises((w.exercises || []).map((e: any) => ({ ...e, _key: Math.random().toString() })));
          }
        }
      } catch (e) { console.error("Error al cargar sesión", e); } 
      finally { setLoadingData(false); }
    };
    if (params.workoutId) fetchWorkout();

    api.getPills().then(setPills).catch(console.log);
  }, [params.workoutId]);

  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...exercises]; updated[index] = { ...updated[index], [field]: value }; setExercises(updated);
  };
  const addExercise = () => setExercises([...exercises, { _key: Math.random().toString(), name: '', sets: '', reps: '', duration: '', weight: '', rest: '', rest_exercise: '', video_url: '', exercise_notes: '', image_path: '', is_unilateral: false }]);
  const removeExercise = (index: number) => setExercises(exercises.filter((_, i) => i !== index));
  
  const moveExerciseUp = (index: number) => {
    if (index === 0) return;
    const newExs = [...exercises]; [newExs[index - 1], newExs[index]] = [newExs[index], newExs[index - 1]]; setExercises(newExs);
  };
  const moveExerciseDown = (index: number) => {
    if (index === exercises.length - 1) return;
    const newExs = [...exercises]; [newExs[index + 1], newExs[index]] = [newExs[index], newExs[index + 1]]; setExercises(newExs);
  };

  const addHiitBlock = () => setHiitBlocks([...hiitBlocks, { _key: Math.random().toString(), name: `Bloque ${hiitBlocks.length + 1}`, sets: '3', rest_exercise: '15', rest_block: '60', rest_between_blocks: '120', exercises: [{ _key: Math.random().toString(), name: '', sets: '1', duration_reps: '', duration: '', exercise_notes: '', video_url: '', is_unilateral: false }] }]);
  const removeHiitBlock = (bIndex: number) => setHiitBlocks(hiitBlocks.filter((_, i) => i !== bIndex));
  const updateHiitBlock = (bIndex: number, field: string, value: string) => { const updated = [...hiitBlocks]; updated[bIndex] = { ...updated[bIndex], [field]: value }; setHiitBlocks(updated); };

  const moveHiitBlockUp = (bIndex: number) => {
    if (bIndex === 0) return;
    const updated = [...hiitBlocks]; [updated[bIndex - 1], updated[bIndex]] = [updated[bIndex], updated[bIndex - 1]]; setHiitBlocks(updated);
  };
  const moveHiitBlockDown = (bIndex: number) => {
    if (bIndex === hiitBlocks.length - 1) return;
    const updated = [...hiitBlocks]; [updated[bIndex + 1], updated[bIndex]] = [updated[bIndex], updated[bIndex + 1]]; setHiitBlocks(updated);
  };

  const applyPreset = (bIndex: number, preset: string) => {
    const updated = [...hiitBlocks];
    const block = updated[bIndex];
    if (preset === 'tabata') {
      block.sets = '8'; block.rest_exercise = '10'; block.rest_block = '60';
      block.exercises.forEach((ex: any) => { ex.duration = '20s'; });
    } else if (preset === 'emom') {
      block.sets = '1'; block.rest_exercise = '0'; block.rest_block = '0';
      block.exercises.forEach((ex: any) => { ex.duration = '60s'; });
    } else if (preset === 'amrap') {
      block.sets = '1'; block.rest_exercise = '0'; block.rest_block = '0';
      block.exercises.forEach((ex: any) => { ex.duration = ''; ex.duration_reps = '10'; });
    } else if (preset === 'hiit') {
      block.sets = '4'; block.rest_exercise = '20'; block.rest_block = '60';
      block.exercises.forEach((ex: any) => { ex.duration = '40s'; });
    }
    setHiitBlocks(updated);
  };
  
  const addHiitExercise = (bIndex: number) => { const updated = [...hiitBlocks]; updated[bIndex].exercises.push({ _key: Math.random().toString(), name: '', sets: '1', duration_reps: '', duration: '', exercise_notes: '', video_url: '', is_unilateral: false }); setHiitBlocks(updated); };
  const removeHiitExercise = (bIndex: number, eIndex: number) => { const updated = [...hiitBlocks]; updated[bIndex].exercises = updated[bIndex].exercises.filter((_: any, i: number) => i !== eIndex); setHiitBlocks(updated); };
  const duplicateHiitExercise = (bIndex: number, eIndex: number) => { 
    const updated = [...hiitBlocks]; 
    const toCopy = { ...updated[bIndex].exercises[eIndex], _key: Math.random().toString() };
    updated[bIndex].exercises.splice(eIndex + 1, 0, toCopy);
    setHiitBlocks(updated); 
  };
  const updateHiitExercise = (bIndex: number, eIndex: number, field: string, value: any) => { const updated = [...hiitBlocks]; updated[bIndex].exercises[eIndex] = { ...updated[bIndex].exercises[eIndex], [field]: value }; setHiitBlocks(updated); };
  
  const moveHiitExerciseUp = (bIndex: number, eIndex: number) => {
    if (eIndex === 0) return;
    const updated = [...hiitBlocks]; [updated[bIndex].exercises[eIndex - 1], updated[bIndex].exercises[eIndex]] = [updated[bIndex].exercises[eIndex], updated[bIndex].exercises[eIndex - 1]]; setHiitBlocks(updated);
  };
  const moveHiitExerciseDown = (bIndex: number, eIndex: number) => {
    if (eIndex === hiitBlocks[bIndex].exercises.length - 1) return;
    const updated = [...hiitBlocks]; [updated[bIndex].exercises[eIndex + 1], updated[bIndex].exercises[eIndex]] = [updated[bIndex].exercises[eIndex], updated[bIndex].exercises[eIndex + 1]]; setHiitBlocks(updated);
  };

  const handleSavePill = async () => {
    if (!newPillName.trim()) { Alert.alert("Error", "Ponle un nombre a la píldora"); return; }
    
    let exercisesToSave = [];
    
    if (workoutType === 'traditional') {
        exercisesToSave = exercises.filter(e => e.name.trim()).map(e => ({
            name: e.name, sets: e.sets, reps: e.reps, duration: e.duration, weight: e.weight,
            rest: e.rest, rest_exercise: e.rest_exercise, video_url: e.video_url, exercise_notes: e.exercise_notes, is_unilateral: !!e.is_unilateral
        }));
    } else {
        exercisesToSave = hiitBlocks.filter(b => b.exercises.some((e:any) => e.name.trim())).map(block => ({
            is_hiit_block: true, name: block.name, sets: block.sets, rest_exercise: block.rest_exercise, rest_block: block.rest_block, rest_between_blocks: block.rest_between_blocks,
            hiit_exercises: block.exercises.filter((e:any) => e.name.trim()).map((e:any) => ({
                name: e.name, sets: e.sets, duration_reps: e.duration_reps, duration: e.duration, exercise_notes: e.exercise_notes, video_url: e.video_url, is_unilateral: !!e.is_unilateral
            }))
        }));
    }

    if (exercisesToSave.length === 0) {
        Alert.alert("Error", "Añade al menos un ejercicio antes de guardar."); return;
    }

    const data = {
        name: newPillName.trim(),
        is_hiit: workoutType === 'hiit',
        exercises: exercisesToSave
    };

    try {
        await api.createPill(data);
        Alert.alert("Éxito", "Píldora guardada correctamente");
        setShowSavePillModal(false);
        setNewPillName('');
        api.getPills().then(setPills);
    } catch (e: any) {
        Alert.alert("Error", e.message);
    }
  };

  const injectPill = (pill: any) => {
    if (workoutType === 'traditional') {
        if (pill.is_hiit) {
            Alert.alert("Aviso", "Esta píldora es de formato circuito. Se ha insertado como ejercicios sueltos de fuerza.");
            const flatExercises = pill.exercises.flatMap((b: any) =>
                (b.hiit_exercises || b.exercises || []).map((e: any) => ({
                    _key: Math.random().toString(), name: e.name, sets: e.sets || '1', reps: e.duration_reps || '', duration: e.duration || '', weight: '', rest: '', rest_exercise: '', video_url: e.video_url || '', exercise_notes: e.exercise_notes || '', is_unilateral: e.is_unilateral || false
                }))
            );
            setExercises([...exercises.filter(e => e.name), ...flatExercises]);
        } else {
            const newExs = pill.exercises.map((e: any) => ({...e, _key: Math.random().toString()}));
            setExercises([...exercises.filter(e => e.name), ...newExs]);
        }
    } else {
        if (pill.is_hiit) {
            const newBlocks = pill.exercises.map((b: any) => ({
                ...b, _key: Math.random().toString(),
                exercises: (b.hiit_exercises || b.exercises || []).map((e: any) => ({...e, _key: Math.random().toString()}))
            }));
            setHiitBlocks([...hiitBlocks.filter(b => b.exercises.some((e:any) => e.name)), ...newBlocks]);
        } else {
            const newBlock = {
                _key: Math.random().toString(), name: `Píldora: ${pill.name}`, sets: '1', rest_exercise: '0', rest_block: '0', rest_between_blocks: '60',
                exercises: pill.exercises.map((e: any) => ({
                    _key: Math.random().toString(), name: e.name, sets: e.sets, duration_reps: e.reps, duration: e.duration, exercise_notes: e.exercise_notes, video_url: e.video_url, is_unilateral: e.is_unilateral || false
                }))
            };
            setHiitBlocks([...hiitBlocks.filter(b => b.exercises.some((e:any) => e.name)), newBlock]);
        }
    }
    setShowPillModal(false);
  };

  const handleDeletePill = async (pillId: string) => {
      try {
          await api.deletePill(pillId);
          api.getPills().then(setPills);
      } catch(e:any) {
          Alert.alert("Error", e.message);
      }
  };

  const handleSave = () => {
    setError('');
    if (!title.trim()) { setError('El título es obligatorio'); return; }
    if (!date.trim()) { setError('La fecha es obligatoria'); return; }

    const exNames = workoutType === 'traditional' 
      ? exercises.map(e => e.name.trim()).filter(Boolean)
      : hiitBlocks.flatMap(b => b.exercises.map((e: any) => e.name.trim()).filter(Boolean));

    if (exNames.length === 0) { setError('Añade al menos un ejercicio'); return; }

    executeSave();
  };

  const executeSave = async () => {
    let payloadData: any = {
      title: title.trim(), date: date.trim(), notes: notes.trim(), athlete_id: athleteId, 
      microciclo_id: selectedMicroId, microcycle_id: selectedMicroId, hiit_settings: hiitConfig
    };

    if (workoutType === 'traditional') {
      payloadData.exercises = exercises.filter(e => e.name.trim()).map(ex => ({
        name: ex.name, sets: ex.sets, reps: ex.reps, duration: ex.duration, weight: ex.weight,
        rest: ex.rest, rest_exercise: ex.rest_exercise, video_url: ex.video_url, exercise_notes: ex.exercise_notes, is_unilateral: !!ex.is_unilateral
      }));
    } else {
      payloadData.exercises = hiitBlocks.map(block => ({
        is_hiit_block: true, name: block.name, sets: block.sets, rest_exercise: hiitConfig.restEx ? block.rest_exercise : '',
        rest_block: hiitConfig.restSet ? block.rest_block : '', rest_between_blocks: hiitConfig.restBlock ? block.rest_between_blocks : '', 
        hiit_exercises: block.exercises.filter((e: any) => e.name.trim()).map((e: any) => {
          let dReps = hiitConfig.reps ? (e.duration_reps ? e.duration_reps.trim() : '') : '';
          if (/^\d+$/.test(dReps)) dReps += 'r';
          return { 
            name: e.name, sets: e.sets, duration_reps: dReps, duration: hiitConfig.duration ? e.duration : '', 
            exercise_notes: e.exercise_notes, video_url: e.video_url, is_unilateral: !!e.is_unilateral
          };
        })
      })).filter(b => b.hiit_exercises.length > 0);
    }

    setSaving(true);
    try { await api.updateWorkout(params.workoutId, payloadData); router.back(); } 
    catch (e: any) { setError(e.message || 'Error al actualizar'); } 
    finally { setSaving(false); }
  };

  const toggleConfig = (key: keyof typeof hiitConfig) => {
    setHiitConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (loadingData) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent:'center' }]}><ActivityIndicator color={colors.primary} size="large" /></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, width: '100%' }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Editar Sesión</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={saving}>{saving ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={[styles.saveText, { color: colors.primary }]}>Actualizar</Text>}</TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TÍTULO Y FECHA</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 2, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Ej: Core y Estabilidad" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
              <TextInput style={[styles.input, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>ASIGNAR A SEMANA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TouchableOpacity style={[styles.microChip, { borderColor: colors.border }, !selectedMicroId && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setSelectedMicroId(null)}>
                <Text style={{ color: !selectedMicroId ? '#FFF' : colors.textPrimary, fontSize: 13, fontWeight: '700' }}>Suelto / Sin asignar</Text>
              </TouchableOpacity>
              {microciclosDisponibles.map(m => {
                const mId = m.id || m._id;
                const mName = m.nombre || m.name;
                const isSelected = selectedMicroId && String(selectedMicroId) === String(mId);
                return (
                  <TouchableOpacity key={mId} style={[styles.microChip, { borderColor: colors.border }, isSelected && { backgroundColor: m.color || colors.primary, borderColor: m.color || colors.primary }]} onPress={() => setSelectedMicroId(mId)}>
                    <Text style={{ color: isSelected ? '#FFF' : colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{mName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>INDICACIONES GENERALES (OPCIONAL)</Text>
            <TextInput
              style={[styles.notesInputBig, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={notes} onChangeText={setNotes} placeholder="Ej: Calentamiento de 10 min..." placeholderTextColor="rgba(150, 150, 150, 0.5)" multiline
            />
          </View>

          <View style={[styles.typeSelector, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
            <TouchableOpacity style={[styles.typeBtn, workoutType === 'traditional' && { backgroundColor: colors.primary }]} onPress={() => setWorkoutType('traditional')}><Text style={{ color: workoutType === 'traditional' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Fuerza</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, workoutType === 'hiit' && { backgroundColor: colors.error || '#EF4444' }]} onPress={() => setWorkoutType('hiit')}><Text style={{ color: workoutType === 'hiit' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Circuito HIIT</Text></TouchableOpacity>
          </View>

          {/* SECCIÓN PÍLDORAS */}
          <View style={[styles.csvSection, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>PÍLDORAS (ACTIVACIÓN/PREHAB)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.csvBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }]} onPress={() => setShowSavePillModal(true)}>
                  <Ionicons name="save-outline" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Guardar Base</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.csvBtn, { backgroundColor: colors.primary }]} onPress={() => setShowPillModal(true)}>
                  <Ionicons name="flask" size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>Inyectar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {workoutType === 'hiit' && (
            <View style={[styles.section, { padding: 12, backgroundColor: colors.surfaceHighlight, borderRadius: 12, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 8 }]}>AJUSTES GLOBALES DEL CIRCUITO (OCULTAR/MOSTRAR)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { key: 'reps', label: 'Repeticiones' }, { key: 'duration', label: 'Tiempo Ejercicio' },
                  { key: 'restEx', label: 'Descanso Ejercicios' }, { key: 'restSet', label: 'Descanso Vueltas' }, { key: 'restBlock', label: 'Descanso Bloques' }
                ].map((item) => (
                  <TouchableOpacity key={item.key} onPress={() => toggleConfig(item.key as keyof typeof hiitConfig)} style={[styles.togglePill, hiitConfig[item.key as keyof typeof hiitConfig] ? { backgroundColor: colors.primary } : { backgroundColor: colors.border }]}>
                    <Text style={{ color: hiitConfig[item.key as keyof typeof hiitConfig] ? '#FFF' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {workoutType === 'traditional' ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}><Text style={[styles.label, { color: colors.textSecondary }]}>EJERCICIOS ({exercises.length})</Text></View>
              {exercises.map((ex, i) => (
                <View key={ex._key} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.exerciseHeader}>
                    <TextInput style={[styles.exNameInput, { color: colors.textPrimary }]} value={ex.name} onChangeText={v => updateExercise(i, 'name', v)} placeholder="Nombre del ejercicio" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
                    <View style={styles.exActions}>
                      {i > 0 && <TouchableOpacity onPress={() => moveExerciseUp(i)} style={styles.iconBtn}><Ionicons name="arrow-up" size={18} color={colors.textSecondary} /></TouchableOpacity>}
                      {i < exercises.length - 1 && <TouchableOpacity onPress={() => moveExerciseDown(i)} style={styles.iconBtn}><Ionicons name="arrow-down" size={18} color={colors.textSecondary} /></TouchableOpacity>}
                      {exercises.length > 1 && <TouchableOpacity onPress={() => removeExercise(i)} style={styles.iconBtn}><Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} /></TouchableOpacity>}
                    </View>
                  </View>
                  <View style={[styles.exDetailsContainer, { borderTopColor: colors.border }]}>
                    <View style={styles.exDetailsRow}>
                      <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Series</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.sets} onChangeText={v => updateExercise(i, 'sets', v)} placeholder="-" keyboardType="numeric" /></View>
                      <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Reps</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.reps} onChangeText={v => updateExercise(i, 'reps', v)} placeholder="-" keyboardType="numeric" /></View>
                      <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Dur. (s)</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.duration} onChangeText={v => updateExercise(i, 'duration', v)} placeholder="Ej: 90s" /></View>
                    </View>
                    <View style={[styles.exDetailsRow, { borderTopWidth: 0, backgroundColor: 'rgba(59, 130, 246, 0.03)' }]}>
                      <View style={styles.exDetail}>
                        <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}><Ionicons name="timer-outline" size={10}/> Desc. Serie</Text>
                        <TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.rest} onChangeText={v => updateExercise(i, 'rest', v)} placeholder="Ej: 2m" />
                      </View>
                      <View style={styles.exDetail}>
                        <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}><Ionicons name="timer-outline" size={10}/> Desc. Ejercicio</Text>
                        <TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.rest_exercise} onChangeText={v => updateExercise(i, 'rest_exercise', v)} placeholder="Ej: 1m" />
                      </View>
                    </View>
                  </View>
                  <View style={[styles.mediaContainer, { borderTopColor: colors.border }]}>
                    <Ionicons name="logo-youtube" size={16} color={colors.error || '#EF4444'} />
                    <TextInput style={[styles.urlInput, { color: colors.textPrimary }]} value={ex.video_url} onChangeText={v => updateExercise(i, 'video_url', v)} placeholder="URL de YouTube (opcional)" placeholderTextColor="rgba(150, 150, 150, 0.5)" autoCapitalize="none" />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingBottom: 10, borderTopWidth: 0.5, borderTopColor: colors.border, marginTop: 4, paddingTop: 10 }}>
                     <TouchableOpacity onPress={() => updateExercise(i, 'is_unilateral', !ex.is_unilateral)} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                        <Ionicons name={ex.is_unilateral ? "checkbox" : "square-outline"} size={18} color={ex.is_unilateral ? colors.primary : colors.textSecondary} />
                        <Text style={{color: ex.is_unilateral ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '700'}}>Unilateral (Doble Temporizador)</Text>
                     </TouchableOpacity>
                  </View>
                  <View style={[styles.notesContainer, { borderTopColor: colors.border }]}>
                    <TextInput style={[styles.notesInput, { color: colors.textPrimary }]} value={ex.exercise_notes} onChangeText={v => updateExercise(i, 'exercise_notes', v)} placeholder="Añadir observaciones..." placeholderTextColor="rgba(150, 150, 150, 0.5)" />
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
                    <TextInput style={[styles.hiitNameInput, { color: colors.textPrimary }]} value={block.name} onChangeText={v => updateHiitBlock(bIndex, 'name', v)} placeholder="Nombre del Bloque" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
                    <View style={{flexDirection: 'row', gap: 6}}>
                       {bIndex > 0 && <TouchableOpacity onPress={() => moveHiitBlockUp(bIndex)}><Ionicons name="arrow-up" size={20} color={colors.textSecondary} /></TouchableOpacity>}
                       {bIndex < hiitBlocks.length - 1 && <TouchableOpacity onPress={() => moveHiitBlockDown(bIndex)}><Ionicons name="arrow-down" size={20} color={colors.textSecondary} /></TouchableOpacity>}
                       {hiitBlocks.length > 1 && <TouchableOpacity onPress={() => removeHiitBlock(bIndex)}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>}
                    </View>
                  </View>
                  <View style={[styles.presetsRow, { backgroundColor: 'rgba(0,0,0,0.01)' }]}>
                     <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textSecondary, marginRight: 8 }}>AUTO-REPLENAR:</Text>
                     <TouchableOpacity onPress={() => applyPreset(bIndex, 'tabata')} style={[styles.presetChip, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>TABATA</Text></TouchableOpacity>
                     <TouchableOpacity onPress={() => applyPreset(bIndex, 'emom')} style={[styles.presetChip, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>EMOM</Text></TouchableOpacity>
                     <TouchableOpacity onPress={() => applyPreset(bIndex, 'amrap')} style={[styles.presetChip, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>AMRAP</Text></TouchableOpacity>
                     <TouchableOpacity onPress={() => applyPreset(bIndex, 'hiit')} style={[styles.presetChip, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>HIIT</Text></TouchableOpacity>
                  </View>
                  <View style={styles.hiitConfigGrid}>
                    <View style={styles.hiitConfigRow}>
                      <View style={styles.hiitConfigItem}>
                        <Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}><Ionicons name="refresh" size={12}/> Vueltas</Text>
                        <TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.sets} onChangeText={v => updateHiitBlock(bIndex, 'sets', v)} keyboardType="numeric" placeholder="Ej: 3" />
                      </View>
                      {hiitConfig.restEx && (
                        <View style={styles.hiitConfigItem}>
                          <Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}><Ionicons name="timer-outline" size={12}/> Entre Ejercicios</Text>
                          <TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_exercise} onChangeText={v => updateHiitBlock(bIndex, 'rest_exercise', v)} placeholder="Ej: 15s" />
                        </View>
                      )}
                    </View>
                    <View style={styles.hiitConfigRow}>
                      {hiitConfig.restSet && (
                        <View style={styles.hiitConfigItem}>
                          <Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}><Ionicons name="timer-outline" size={12}/> Entre Vueltas</Text>
                          <TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_block} onChangeText={v => updateHiitBlock(bIndex, 'rest_block', v)} placeholder="Ej: 1m" />
                        </View>
                      )}
                      {hiitConfig.restBlock && (
                        <View style={styles.hiitConfigItem}>
                          <Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}><Ionicons name="timer-outline" size={12}/> Cambio Bloque</Text>
                          <TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_between_blocks} onChangeText={v => updateHiitBlock(bIndex, 'rest_between_blocks', v)} placeholder="Ej: 2m" />
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.hiitExList}>
                    {block.exercises.map((ex: any, eIndex: number) => (
                      <View key={ex._key} style={styles.hiitExContainer}>
                        <View style={styles.hiitExRow}>
                          <View style={styles.hiitExNum}><Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>{eIndex + 1}</Text></View>
                          <TextInput style={[styles.hiitExInput, { flex: 2, color: colors.textPrimary, borderColor: colors.border }]} value={ex.name} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'name', v)} placeholder="Ej: Burpees" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', minWidth: 60 }}>
                             <TouchableOpacity onPress={() => duplicateHiitExercise(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="copy-outline" size={16} color={colors.textSecondary} /></TouchableOpacity>
                             {eIndex > 0 && <TouchableOpacity onPress={() => moveHiitExerciseUp(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="arrow-up" size={16} color={colors.textSecondary} /></TouchableOpacity>}
                             {eIndex < block.exercises.length - 1 && <TouchableOpacity onPress={() => moveHiitExerciseDown(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="arrow-down" size={16} color={colors.textSecondary} /></TouchableOpacity>}
                             <TouchableOpacity onPress={() => removeHiitExercise(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="close-circle" size={20} color={colors.textSecondary} /></TouchableOpacity>
                          </View>
                        </View>
                        
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, paddingLeft: 28, alignItems: 'center' }}>
                          <TextInput style={[styles.hiitExInput, { flex: 0.8, color: colors.textPrimary, borderColor: colors.border, fontSize: 13, padding: 8 }]} value={ex.sets} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'sets', v)} placeholder="Series (3)" keyboardType="numeric" />
                          {hiitConfig.reps && <TextInput style={[styles.hiitExInput, { flex: 1.1, color: colors.textPrimary, borderColor: colors.border, fontSize: 13, padding: 8 }]} value={ex.duration_reps} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'duration_reps', v)} placeholder="Reps (15)" />}
                          {hiitConfig.duration && <TextInput style={[styles.hiitExInput, { flex: 1.1, color: colors.textPrimary, borderColor: colors.border, fontSize: 13, padding: 8 }]} value={ex.duration} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'duration', v)} placeholder="Tiempo (45s)" />}
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 28, marginTop: 8 }}>
                           <TouchableOpacity onPress={() => updateHiitExercise(bIndex, eIndex, 'is_unilateral', !ex.is_unilateral)} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                              <Ionicons name={ex.is_unilateral ? "checkbox" : "square-outline"} size={18} color={ex.is_unilateral ? colors.primary : colors.textSecondary} />
                              <Text style={{color: ex.is_unilateral ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '700'}}>Unilateral (Doble Temporizador)</Text>
                           </TouchableOpacity>
                        </View>

                        <TextInput style={[styles.hiitNotesInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: 8 }]} value={ex.video_url} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'video_url', v)} placeholder="URL de vídeo (opcional)" />
                        <TextInput style={[styles.hiitNotesInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: 4 }]} value={ex.exercise_notes} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'exercise_notes', v)} placeholder="Observaciones técnicas (opcional)" />
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

      {/* MODAL INYECTAR PÍLDORA */}
      <Modal visible={showPillModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Mis Píldoras 💊</Text>
              <TouchableOpacity onPress={() => setShowPillModal(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            {pills.length === 0 ? (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 20 }}>No tienes píldoras guardadas. Crea una base de ejercicios y dale a "Guardar Base".</Text>
            ) : (
                <ScrollView style={{ flexShrink: 1 }}>
                {pills.map(p => (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16 }}>{p.name}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{p.is_hiit ? 'Formato Circuito' : 'Formato Fuerza'} • {p.exercises?.length || 0} bloques/ejercicios</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity onPress={() => handleDeletePill(p.id)} style={{ padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}>
                                <Ionicons name="trash" size={18} color="#EF4444" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => injectPill(p)} style={{ padding: 8, backgroundColor: colors.primary, borderRadius: 8 }}>
                                <Ionicons name="add" size={18} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
                </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL GUARDAR PÍLDORA */}
      <Modal visible={showSavePillModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Guardar Base 💾</Text>
              <TouchableOpacity onPress={() => setShowSavePillModal(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 14 }}>Guarda los ejercicios actuales como una píldora para poder inyectarlos rápidamente en futuros entrenamientos.</Text>
            <TextInput 
                style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border, marginBottom: 20 }]} 
                value={newPillName} onChangeText={setNewPillName} placeholder="Nombre de la píldora (ej: Activación Core)" placeholderTextColor="rgba(150, 150, 150, 0.5)" autoFocus
            />
            <TouchableOpacity style={[styles.saveBtnBig, { backgroundColor: colors.primary }]} onPress={handleSavePill}>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>GUARDAR PÍLDORA</Text>
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
  notesInputBig: { borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, minHeight: 80, textAlignVertical: 'top' },
  typeSelector: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1 }, 
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 }, 
  microChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginRight: 10 }, 
  togglePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  presetsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  presetChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  exerciseCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 10 }, 
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }, 
  exNameInput: { flex: 1, fontSize: 16, fontWeight: '500', minWidth: 0 }, 
  exActions: { flexDirection: 'row', gap: 4 }, 
  iconBtn: { padding: 4 }, 
  exDetailsContainer: { borderTopWidth: 0.5 },
  exDetailsRow: { flexDirection: 'row', borderTopWidth: 0.5, borderColor: 'rgba(0,0,0,0.05)' }, 
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
  hiitExContainer: { marginBottom: 12 }, 
  hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, 
  hiitExNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, 
  hiitExInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minWidth: 0 }, 
  hiitNotesInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 12, fontStyle: 'italic', marginLeft: 28, minWidth: 0 }, 
  addHiitExBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, marginLeft: 20 }, 
  errorText: { textAlign: 'center', fontWeight: '600', marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  csvSection: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  csvBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  saveBtnBig: { paddingVertical: 16, borderRadius: 15, alignItems: 'center' }
});
