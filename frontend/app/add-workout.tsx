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
import { localDateStr, addDaysStr, friendlyDate, normalizeDateInput } from '../src/utils/dates';
import { goBack } from '../src/utils/navigation';
import CsvImportSheet, { ResolvedSession } from '../src/components/CsvImportSheet';
import { buildWorkoutPayload, defaultSessionTitle, findMicroForDate, microId, microsFromTree } from '../src/utils/workoutCsv';

export default function AddWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string; microciclo_id?: string; pill_data?: string; date?: string }>();

  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  // Si venimos del calendario, la sesión se crea en el día que estaba seleccionado
  const [date, setDate] = useState(normalizeDateInput(params.date || '') || localDateStr());
  const [error, setError] = useState('');
  
  const [microciclosDisponibles, setMicrociclosDisponibles] = useState<any[]>([]);
  const [selectedMicroId, setSelectedMicroId] = useState<string | null>(params.microciclo_id || null);
  // Mientras no elijas una semana a mano, se asigna sola la que contiene la fecha
  const [microTouched, setMicroTouched] = useState(!!params.microciclo_id);
  const [showImport, setShowImport] = useState(false);
  // Programar la misma sesión varias semanas seguidas y/o para más atletas a la vez
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [otherAthletes, setOtherAthletes] = useState<any[]>([]);
  const [extraAthleteIds, setExtraAthleteIds] = useState<string[]>([]);

  const [workoutType, setWorkoutType] = useState<'traditional' | 'hiit'>('traditional');

  const [hiitConfig, setHiitConfig] = useState({
    reps: true, duration: true, restEx: true, restSet: true, restBlock: true
  });

  const [exercises, setExercises] = useState<any[]>([
    { _key: '1', name: '', sets: '', reps: '', duration: '', weight: '', rest: '', rest_exercise: '', video_url: '', exercise_notes: '', image_path: '', is_unilateral: false, group_sets: '1' }
  ]);

  const [hiitBlocks, setHiitBlocks] = useState<any[]>([
    { 
      _key: 'b1', name: 'Bloque 1', sets: '3', rest_exercise: '15', rest_block: '60', rest_between_blocks: '120',
      exercises: [{ _key: 'e1', name: '', sets: '1', duration_reps: '', duration: '', exercise_notes: '', video_url: '', is_unilateral: false }] 
    }
  ]);

  const [pills, setPills] = useState<any[]>([]);
  const [showPillModal, setShowPillModal] = useState(false);

  useEffect(() => {
    if (params.pill_data) {
      try {
        const pill = JSON.parse(decodeURIComponent(params.pill_data));
        
        setTitle(pill.name || '');
        
        if (pill.is_hiit) {
          setWorkoutType('hiit');
          const newBlocks = pill.exercises.map((b: any) => ({
              ...b, _key: Math.random().toString(),
              name: `[${pill.name}] ${b.name || 'Bloque'}`,
              sets: String(b.sets || '1'),
              exercises: (b.hiit_exercises || b.exercises || []).map((e: any) => ({...e, _key: Math.random().toString()}))
          }));
          if (newBlocks.length > 0) setHiitBlocks(newBlocks);
        } else {
          setWorkoutType('traditional');
          const groupId = Math.random().toString();
          const groupName = pill.name || "Píldora";
          const newExs = pill.exercises.map((e: any) => ({...e, _key: Math.random().toString(), group_id: groupId, group_name: groupName, group_sets: '1'}));
          if (newExs.length > 0) setExercises(newExs);
        }
      } catch (error) {
        console.log("Error al inyectar la píldora desde parámetros:", error);
      }
    }
  }, [params.pill_data]);

  useEffect(() => {
    if (params.athlete_id) {
      api.getPeriodizationTree(params.athlete_id).then((tree) => {
        setMicrociclosDisponibles(microsFromTree(tree));
      }).catch((e) => console.log("Error cargando microciclos:", e));
      api.getAthletes().then((list: any[]) => {
        setOtherAthletes((list || []).filter(a => a.id !== params.athlete_id));
      }).catch(() => {});
    }
    
    api.getPills().then(setPills).catch(console.log);
  }, [params.athlete_id]);

  useEffect(() => {
    if (microTouched) return;
    setSelectedMicroId(microId(findMicroForDate(microciclosDisponibles, normalizeDateInput(date))));
  }, [date, microciclosDisponibles, microTouched]);

  const chooseMicro = (id: string | null) => { setMicroTouched(true); setSelectedMicroId(id); };

  // Cargar en el formulario una sesión leída del CSV
  const loadImportedSession = (s: ResolvedSession) => {
    if (s.title) setTitle(s.title);
    if (s.notes) setNotes(s.notes);
    setDate(s.resolvedDate);
    setMicroTouched(false);
    setWorkoutType(s.type);
    if (s.type === 'traditional') setExercises(s.exercises);
    else setHiitBlocks(s.blocks);
  };

  const exerciseBlocks = React.useMemo(() => {
    const blocks: any[] = [];
    let currentGroupId = null;
    let currentBlock: any = null;

    exercises.forEach((ex, index) => {
      if (ex.group_id) {
        if (currentGroupId === ex.group_id) {
          currentBlock.exercises.push({ ...ex, originalIndex: index });
        } else {
          currentGroupId = ex.group_id;
          currentBlock = { type: 'group', group_id: ex.group_id, group_name: ex.group_name, exercises: [{ ...ex, originalIndex: index }] };
          blocks.push(currentBlock);
        }
      } else {
        currentGroupId = null;
        blocks.push({ type: 'single', exercises: [{ ...ex, originalIndex: index }] });
      }
    });
    return blocks;
  }, [exercises]);

  const updateExercise = (index: number, field: string, value: any) => {
    const updated = [...exercises]; updated[index] = { ...updated[index], [field]: value }; setExercises(updated);
  };
  
  const updateGroupSets = (groupId: string, newSets: string) => {
    setExercises(exercises.map(e => e.group_id === groupId ? { ...e, group_sets: newSets } : e));
  };
  
  // El ejercicio nuevo copia las series y los descansos del anterior (suelen repetirse)
  const addExercise = () => {
    const last = exercises[exercises.length - 1] || {};
    setExercises([...exercises, { _key: Math.random().toString(), name: '', sets: last.sets || '', reps: '', duration: '', weight: '', rest: last.rest || '', rest_exercise: last.rest_exercise || '', video_url: '', exercise_notes: '', image_path: '', is_unilateral: false, group_sets: '1' }]);
  };
  const duplicateExercise = (index: number) => {
    const copy = { ...exercises[index], _key: Math.random().toString() };
    setExercises([...exercises.slice(0, index + 1), copy, ...exercises.slice(index + 1)]);
  };
  
  const removeExercise = (index: number) => setExercises(exercises.filter((_, i) => i !== index));

  const moveBlockUp = (bIndex: number) => {
    if (bIndex === 0) return;
    const newBlocks = [...exerciseBlocks];
    [newBlocks[bIndex - 1], newBlocks[bIndex]] = [newBlocks[bIndex], newBlocks[bIndex - 1]];
    setExercises(newBlocks.flatMap(b => b.exercises.map((e: any) => {
      const { originalIndex, ...rest } = e;
      return rest;
    })));
  };

  const moveBlockDown = (bIndex: number) => {
    if (bIndex === exerciseBlocks.length - 1) return;
    const newBlocks = [...exerciseBlocks];
    [newBlocks[bIndex + 1], newBlocks[bIndex]] = [newBlocks[bIndex], newBlocks[bIndex + 1]];
    setExercises(newBlocks.flatMap(b => b.exercises.map((e: any) => {
      const { originalIndex, ...rest } = e;
      return rest;
    })));
  };

  const moveToTop = (bIndex: number) => {
    if (bIndex === 0) return;
    const newBlocks = [...exerciseBlocks];
    const [movedBlock] = newBlocks.splice(bIndex, 1);
    newBlocks.unshift(movedBlock);
    setExercises(newBlocks.flatMap(b => b.exercises.map((e: any) => {
      const { originalIndex, ...rest } = e;
      return rest;
    })));
  };

  const moveToBottom = (bIndex: number) => {
    if (bIndex === exerciseBlocks.length - 1) return;
    const newBlocks = [...exerciseBlocks];
    const [movedBlock] = newBlocks.splice(bIndex, 1);
    newBlocks.push(movedBlock);
    setExercises(newBlocks.flatMap(b => b.exercises.map((e: any) => {
      const { originalIndex, ...rest } = e;
      return rest;
    })));
  };

  const removeBlock = (bIndex: number) => {
    const newBlocks = exerciseBlocks.filter((_, i) => i !== bIndex);
    setExercises(newBlocks.flatMap(b => b.exercises.map((e: any) => {
      const { originalIndex, ...rest } = e;
      return rest;
    })));
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

  const injectPill = (pill: any) => {
    const groupId = Math.random().toString();
    const groupName = pill.name || "Píldora";

    if (workoutType === 'traditional') {
        if (pill.is_hiit) {
            Alert.alert("Aviso", "Esta píldora es de formato circuito. Se ha insertado como ejercicios agrupados de fuerza.");
            const flatExercises = pill.exercises.flatMap((b: any, bIdx: number) => {
                const grpId = b._key || (groupId + bIdx);
                const grpName = `[${pill.name}] ${b.name || 'Bloque'}`;
                return (b.hiit_exercises || b.exercises || []).map((e: any) => ({
                    _key: Math.random().toString(), name: e.name, 
                    sets: String(e.sets || '1'),
                    reps: e.duration_reps || '', duration: e.duration || '', weight: '', rest: '', rest_exercise: '', video_url: e.video_url || '', exercise_notes: e.exercise_notes || '', is_unilateral: !!e.is_unilateral,
                    group_id: grpId, group_name: grpName, group_sets: String(b.sets || '1')
                }));
            });
            setExercises([...exercises.filter(e => e.name), ...flatExercises]);
        } else {
            const newExs = pill.exercises.map((e: any) => ({...e, _key: Math.random().toString(), group_id: groupId, group_name: groupName, group_sets: '1'}));
            setExercises([...exercises.filter(e => e.name), ...newExs]);
        }
    } else {
        if (pill.is_hiit) {
            const newBlocks = pill.exercises.map((b: any) => ({
                ...b, _key: Math.random().toString(),
                name: `[${pill.name}] ${b.name || 'Bloque'}`,
                sets: String(b.sets || '1'),
                exercises: (b.hiit_exercises || b.exercises || []).map((e: any) => ({...e, _key: Math.random().toString()}))
            }));
            setHiitBlocks([...hiitBlocks.filter(b => (b.exercises || []).some((e:any) => e.name)), ...newBlocks]);
        } else {
            const newBlock = {
                _key: Math.random().toString(), name: `💊 ${pill.name}`, sets: '1', rest_exercise: '0', rest_block: '0', rest_between_blocks: '60',
                exercises: pill.exercises.map((e: any) => ({
                    _key: Math.random().toString(), name: e.name, sets: e.sets, duration_reps: e.reps, duration: e.duration, exercise_notes: e.exercise_notes, video_url: e.video_url, is_unilateral: !!e.is_unilateral
                }))
            };
            setHiitBlocks([...hiitBlocks.filter(b => (b.exercises || []).some((e:any) => e.name)), newBlock]);
        }
    }
    setShowPillModal(false);
  };

  const handleSave = () => {
    setError('');
    const cleanDate = normalizeDateInput(date);
    if (!cleanDate) { setError('La fecha no es válida. Escríbela como DD/MM/AAAA'); return; }

    const exNames = workoutType === 'traditional' 
      ? exercises.map(e => e.name.trim()).filter(Boolean)
      : hiitBlocks.flatMap(b => b.exercises.map((e: any) => e.name.trim()).filter(Boolean));

    if (exNames.length === 0) { setError('Añade al menos un ejercicio'); return; }

    executeSave(cleanDate);
  };

  const totalToCreate = repeatWeeks * (1 + extraAthleteIds.length);

  const executeSave = async (cleanDate: string) => {
    // Sin título, le ponemos uno automático (se puede cambiar luego)
    const finalTitle = title.trim() || defaultSessionTitle(workoutType, cleanDate);
    const base = { title: finalTitle, notes, type: workoutType, exercises, blocks: hiitBlocks, hiitConfig };

    setSaving(true);
    try { 
      if (totalToCreate === 1) {
        await api.createWorkout(buildWorkoutPayload({ ...base, date: cleanDate, athleteId: params.athlete_id, microId: selectedMicroId }));
      } else {
        const workouts: any[] = [];
        for (const athleteId of [params.athlete_id, ...extraAthleteIds]) {
          const isMain = athleteId === params.athlete_id;
          const micros = isMain ? microciclosDisponibles : microsFromTree(await api.getPeriodizationTree(athleteId).catch(() => null));
          for (let w = 0; w < repeatWeeks; w++) {
            const d = addDaysStr(cleanDate, 7 * w);
            const micro = isMain && w === 0 ? selectedMicroId : microId(findMicroForDate(micros, d));
            workouts.push(buildWorkoutPayload({ ...base, date: d, athleteId, microId: micro }));
          }
        }
        const res: any = await api.createWorkoutsBulk({ workouts });
        Alert.alert(res?.status === 'queued' ? 'Guardado sin conexión' : '¡Listo!', res?.status === 'queued'
          ? 'Las sesiones se subirán solas cuando vuelva la conexión.'
          : `Se han programado ${workouts.length} sesiones.`);
      }
      handleClose(); 
    } 
    catch (e: any) { setError(e.message || 'Error al guardar'); } 
    finally { setSaving(false); }
  };

  const handleClose = () => {
    goBack(router);
  };

  const toggleConfig = (key: keyof typeof hiitConfig) => {
    setHiitConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const renderExerciseCard = (ex: any, absoluteIndex: number, bIndex: number, isGrouped: boolean) => (
    <View key={ex._key} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: isGrouped ? 0 : 10, borderWidth: isGrouped ? 1 : 1 }]}>
      <View style={styles.exerciseHeader}>
        <TextInput style={[styles.exNameInput, { color: colors.textPrimary }]} value={ex.name} onChangeText={v => updateExercise(absoluteIndex, 'name', v)} placeholder="Nombre del ejercicio" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
        <View style={styles.exActions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Duplicar ejercicio" onPress={() => duplicateExercise(absoluteIndex)} style={styles.iconBtn}><Ionicons name="copy-outline" size={18} color={colors.textSecondary} /></TouchableOpacity>
          {!isGrouped && bIndex > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover arriba" onPress={() => moveBlockUp(bIndex)} style={styles.iconBtn}><Ionicons name="arrow-up" size={18} color={colors.textSecondary} /></TouchableOpacity>}
          {!isGrouped && bIndex < exerciseBlocks.length - 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover abajo" onPress={() => moveBlockDown(bIndex)} style={styles.iconBtn}><Ionicons name="arrow-down" size={18} color={colors.textSecondary} /></TouchableOpacity>}
          {(!isGrouped ? exerciseBlocks.length > 1 : true) && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Eliminar" onPress={() => removeExercise(absoluteIndex)} style={styles.iconBtn}><Ionicons name="trash-outline" size={18} color={colors.error || '#EF4444'} /></TouchableOpacity>}
        </View>
      </View>
      <View style={[styles.exDetailsContainer, { borderTopColor: colors.border }]}>
        <View style={styles.exDetailsRow}>
          <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Series</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.sets} onChangeText={v => updateExercise(absoluteIndex, 'sets', v)} placeholder="-" keyboardType="numeric" /></View>
          <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Reps</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.reps} onChangeText={v => updateExercise(absoluteIndex, 'reps', v)} placeholder="-" keyboardType="numeric" /></View>
          <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Kg</Text><TextInput accessibilityLabel="Peso en kg" style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.weight} onChangeText={v => updateExercise(absoluteIndex, 'weight', v)} placeholder="-" keyboardType="decimal-pad" /></View>
          <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Dur. (s)</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.duration} onChangeText={v => updateExercise(absoluteIndex, 'duration', v)} placeholder="Ej: 90s" /></View>
        </View>
        <View style={[styles.exDetailsRow, { borderTopWidth: 0, backgroundColor: 'rgba(59, 130, 246, 0.03)' }]}>
          <View style={styles.exDetail}>
            <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}><Ionicons name="timer-outline" size={10}/> Desc. Serie</Text>
            <TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.rest} onChangeText={v => updateExercise(absoluteIndex, 'rest', v)} placeholder="Ej: 2m" />
          </View>
          <View style={styles.exDetail}>
            <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}><Ionicons name="timer-outline" size={10}/> Desc. Ejercicio</Text>
            <TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.rest_exercise} onChangeText={v => updateExercise(absoluteIndex, 'rest_exercise', v)} placeholder="Ej: 1m" />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, borderColor: colors.border }}>
        <TouchableOpacity onPress={() => updateExercise(absoluteIndex, 'is_unilateral', !ex.is_unilateral)} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
          <Ionicons name={ex.is_unilateral ? "checkbox" : "square-outline"} size={18} color={ex.is_unilateral ? colors.primary : colors.textSecondary} />
          <Text style={{color: ex.is_unilateral ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '700'}}>Unilateral (Doble Temporizador)</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.mediaContainer, { borderTopColor: colors.border }]}>
        <Ionicons name="logo-youtube" size={16} color={colors.error || '#EF4444'} />
        <TextInput style={[styles.urlInput, { color: colors.textPrimary }]} value={ex.video_url} onChangeText={v => updateExercise(absoluteIndex, 'video_url', v)} placeholder="URL de YouTube (opcional)" placeholderTextColor="rgba(150, 150, 150, 0.5)" autoCapitalize="none" />
      </View>
      <View style={[styles.notesContainer, { borderTopColor: colors.border }]}>
        <TextInput style={[styles.notesInput, { color: colors.textPrimary }]} value={ex.exercise_notes} onChangeText={v => updateExercise(absoluteIndex, 'exercise_notes', v)} placeholder="Añadir observaciones..." placeholderTextColor="rgba(150, 150, 150, 0.5)" />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, width: '100%' }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nueva Sesión</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={saving}>{saving ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={[styles.saveText, { color: colors.primary }]}>{totalToCreate > 1 ? `Guardar (${totalToCreate})` : 'Guardar'}</Text>}</TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TÍTULO Y FECHA</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput accessibilityLabel="Título de la sesión" style={[styles.input, { flex: 2, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Ej: Core y Estabilidad" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
              <TextInput
                accessibilityLabel="Fecha de la sesión"
                style={[styles.input, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={date} onChangeText={setDate}
                onBlur={() => { const d = normalizeDateInput(date); if (d) setDate(d); }}
                placeholder="DD/MM/AAAA" placeholderTextColor="rgba(150, 150, 150, 0.5)"
              />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {[
                { label: 'Hoy', value: localDateStr() },
                { label: 'Mañana', value: addDaysStr(localDateStr(), 1) },
              ].map(o => {
                const active = normalizeDateInput(date) === o.value;
                return (
                  <TouchableOpacity key={o.label} accessibilityRole="button" accessibilityLabel={`Fecha: ${o.label.toLowerCase()}`} onPress={() => setDate(o.value)}
                    style={[styles.dateChip, { borderColor: colors.border }, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    <Text style={{ color: active ? '#FFF' : colors.textPrimary, fontSize: 12, fontWeight: '700' }}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Una semana después" onPress={() => { const d = normalizeDateInput(date); if (d) setDate(addDaysStr(d, 7)); }}
                style={[styles.dateChip, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '700' }}>+1 semana</Text>
              </TouchableOpacity>
              <Text style={{ color: normalizeDateInput(date) ? colors.textSecondary : (colors.error || '#EF4444'), fontSize: 12, fontWeight: '600' }}>
                {normalizeDateInput(date) ? friendlyDate(normalizeDateInput(date)) : 'Fecha no válida'}
              </Text>
            </View>
            {!title.trim() && (
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Si no pones título se llamará «{defaultSessionTitle(workoutType, normalizeDateInput(date))}».</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>ASIGNAR A SEMANA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={[styles.microChip, { borderColor: colors.border }, selectedMicroId === null && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => chooseMicro(null)}>
                <Text style={{ color: selectedMicroId === null ? '#FFF' : colors.textPrimary, fontSize: 13, fontWeight: '700' }}>Suelto / Sin asignar</Text>
              </TouchableOpacity>
              {microciclosDisponibles.map(m => (
                <TouchableOpacity key={m.id || m._id} style={[styles.microChip, { borderColor: colors.border }, selectedMicroId === (m.id || m._id) && { backgroundColor: m.color || colors.primary, borderColor: m.color || colors.primary }]} onPress={() => chooseMicro(m.id || m._id)}>
                  <Text style={{ color: selectedMicroId === (m.id || m._id) ? '#FFF' : colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{m.nombre || m.name}</Text>
                </TouchableOpacity>
              ))}
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

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Importar desde CSV" style={[styles.quickAction, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]} onPress={() => setShowImport(true)}>
              <Ionicons name="document-text" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Importar CSV</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Uno o varios días</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Añadir píldora" style={[styles.quickAction, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]} onPress={() => setShowPillModal(true)}>
              <Ionicons name="flask" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Añadir píldora</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Activación / prehab</Text>
              </View>
            </TouchableOpacity>
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
              {exerciseBlocks.map((block, bIndex) => {
                if (block.type === 'group') {
                  return (
                    <View key={`group-${block.group_id}-${bIndex}`} style={{ marginBottom: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, overflow: 'hidden' }}>
                      <View style={{ backgroundColor: colors.primary + '20', padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                          <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>💊 {block.group_name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.primary + '40' }}>
                            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '800' }}>Vueltas:</Text>
                            <TextInput
                              style={{ color: colors.primary, fontWeight: '900', fontSize: 13, minWidth: 24, textAlign: 'center', padding: 0 }}
                              value={block.exercises[0]?.group_sets || '1'}
                              onChangeText={(v) => updateGroupSets(block.group_id, v)}
                              keyboardType="numeric"
                              placeholder="1"
                              placeholderTextColor={colors.textSecondary}
                            />
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {bIndex === 0 ? (
                            <TouchableOpacity onPress={() => moveToBottom(bIndex)} style={[styles.dynamicJumpBtn, { backgroundColor: colors.primary }]}>
                              <Text style={styles.dynamicJumpText}>Bajar al final ⬇️</Text>
                            </TouchableOpacity>
                          ) : bIndex === exerciseBlocks.length - 1 ? (
                            <TouchableOpacity onPress={() => moveToTop(bIndex)} style={[styles.dynamicJumpBtn, { backgroundColor: colors.primary }]}>
                              <Text style={styles.dynamicJumpText}>Subir princ. ⬆️</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={() => moveToTop(bIndex)} style={[styles.dynamicJumpBtn, { backgroundColor: colors.primary + '80' }]}>
                              <Text style={styles.dynamicJumpText}>⬆️ / ⬇️</Text>
                            </TouchableOpacity>
                          )}

                          {bIndex > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover arriba" onPress={() => moveBlockUp(bIndex)} style={styles.iconBtn}><Ionicons name="arrow-up" size={18} color={colors.primary} /></TouchableOpacity>}
                          {bIndex < exerciseBlocks.length - 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover abajo" onPress={() => moveBlockDown(bIndex)} style={styles.iconBtn}><Ionicons name="arrow-down" size={18} color={colors.primary} /></TouchableOpacity>}
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Eliminar" onPress={() => removeBlock(bIndex)} style={styles.iconBtn}><Ionicons name="trash" size={18} color={colors.error || '#EF4444'} /></TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ padding: 10, gap: 10 }}>
                        {block.exercises.map((ex: any) => renderExerciseCard(ex, ex.originalIndex, bIndex, true))}
                      </View>
                    </View>
                  );
                } else {
                  const ex = block.exercises[0];
                  return renderExerciseCard(ex, ex.originalIndex, bIndex, false);
                }
              })}
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
                       {bIndex > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover arriba" onPress={() => moveHiitBlockUp(bIndex)}><Ionicons name="arrow-up" size={20} color={colors.textSecondary} /></TouchableOpacity>}
                       {bIndex < hiitBlocks.length - 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover abajo" onPress={() => moveHiitBlockDown(bIndex)}><Ionicons name="arrow-down" size={20} color={colors.textSecondary} /></TouchableOpacity>}
                       {hiitBlocks.length > 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Eliminar" onPress={() => removeHiitBlock(bIndex)}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>}
                    </View>
                  </View>
                  <View style={[styles.presetsRow, { backgroundColor: 'rgba(0,0,0,0.01)' }]}>
                     <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textSecondary, marginRight: 8 }}>AUTO-RELLENAR:</Text>
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
                             <TouchableOpacity accessibilityRole="button" accessibilityLabel="Duplicar" onPress={() => duplicateHiitExercise(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="copy-outline" size={16} color={colors.textSecondary} /></TouchableOpacity>
                             {eIndex > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover arriba" onPress={() => moveHiitExerciseUp(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="arrow-up" size={16} color={colors.textSecondary} /></TouchableOpacity>}
                             {eIndex < block.exercises.length - 1 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mover abajo" onPress={() => moveHiitExerciseDown(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="arrow-down" size={16} color={colors.textSecondary} /></TouchableOpacity>}
                             <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quitar" onPress={() => removeHiitExercise(bIndex, eIndex)} style={{ padding: 4 }}><Ionicons name="close-circle" size={20} color={colors.textSecondary} /></TouchableOpacity>
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

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>AL GUARDAR: REPETIR CADA SEMANA</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[1, 2, 4, 6, 8].map(n => (
                <TouchableOpacity key={n} accessibilityRole="button" accessibilityLabel={n === 1 ? 'Solo esta semana' : `Repetir ${n} semanas`} onPress={() => setRepeatWeeks(n)}
                  style={[styles.dateChip, { borderColor: colors.border }, repeatWeeks === n && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={{ color: repeatWeeks === n ? '#FFF' : colors.textPrimary, fontSize: 12, fontWeight: '700' }}>{n === 1 ? 'Solo esta' : `${n} semanas`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {otherAthletes.length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 6 }]}>PROGRAMAR TAMBIÉN PARA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {otherAthletes.map(a => {
                    const on = extraAthleteIds.includes(a.id);
                    return (
                      <TouchableOpacity key={a.id} accessibilityRole="button" accessibilityLabel={`${on ? 'Quitar' : 'Añadir'} a ${a.name}`}
                        onPress={() => setExtraAthleteIds(on ? extraAthleteIds.filter(id => id !== a.id) : [...extraAthleteIds, a.id])}
                        style={[styles.dateChip, { borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 4 }, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                        <Ionicons name={on ? 'checkmark' : 'person-add-outline'} size={13} color={on ? '#FFF' : colors.textSecondary} />
                        <Text style={{ color: on ? '#FFF' : colors.textPrimary, fontSize: 12, fontWeight: '700' }}>{a.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
            {totalToCreate > 1 && (
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                Se crearán {totalToCreate} sesiones{repeatWeeks > 1 ? `, del ${friendlyDate(normalizeDateInput(date))} al ${friendlyDate(addDaysStr(normalizeDateInput(date) || localDateStr(), 7 * (repeatWeeks - 1)))}` : ''}. Cada una se asigna sola a su semana.
              </Text>
            )}
          </View>

          {error ? <Text style={[styles.errorText, { color: colors.error || '#EF4444' }]}>{error}</Text> : null}

          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Guardar sesión" onPress={handleSave} disabled={saving}
            style={[styles.bottomSave, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Ionicons name="checkmark-circle" size={22} color="#FFF" />}
            <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>{totalToCreate > 1 ? `Guardar ${totalToCreate} sesiones` : 'Guardar sesión'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <CsvImportSheet
        visible={showImport} onClose={() => setShowImport(false)}
        athleteId={params.athlete_id} athleteName={params.name} mode="single" defaultDate={date}
        onUseInForm={loadImportedSession} onCreated={() => handleClose()}
      />

      {/* MODAL INYECTAR PÍLDORA */}
      <Modal visible={showPillModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Mis Píldoras 💊</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => setShowPillModal(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>
            {pills.length === 0 ? (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 20 }}>No tienes píldoras guardadas. Ve a la pantalla de Ajustes para crearlas.</Text>
            ) : (
                <ScrollView style={{ flexShrink: 1 }}>
                {pills.map(p => (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16 }}>{p.name}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{p.is_hiit ? 'Formato Circuito' : 'Formato Fuerza'} • {p.exercises?.length || 0} bloques/ejercicios</Text>
                        </View>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Añadir" onPress={() => injectPill(p)} style={{ padding: 10, backgroundColor: colors.primary, borderRadius: 8 }}>
                            <Ionicons name="add" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                ))}
                </ScrollView>
            )}
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
  exerciseCard: { borderRadius: 12, overflow: 'hidden' }, 
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
  bottomSave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 14 },
  quickAction: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  dynamicJumpBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  dynamicJumpText: { color: '#FFF', fontSize: 11, fontWeight: '800' }
});
