import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert, Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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

const parseCSV = (str: string) => {
  const arr: string[][] = [];
  let quote = false;
  let row = 0, col = 0;
  for (let c = 0; c < str.length; c++) {
    let cc = str[c], nc = str[c + 1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
    if (cc === '"') { quote = !quote; continue; }
    if (cc === ',' && !quote) { ++col; continue; }
    if (cc === '\r' && nc === '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc === '\n' && !quote) { ++row; col = 0; continue; }
    if (cc === '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  return arr;
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

  // Configuración global del HIIT (Toggles de visibilidad)
  const [hiitConfig, setHiitConfig] = useState({
    reps: true, duration: true, restEx: true, restSet: true, restBlock: true
  });

  const [exercises, setExercises] = useState<any[]>([
    { _key: '1', name: '', sets: '', reps: '', duration: '', weight: '', rest: '', rest_exercise: '', video_url: '', exercise_notes: '', image_path: '', is_unilateral: false }
  ]);

  const [hiitBlocks, setHiitBlocks] = useState<any[]>([
    { 
      _key: 'b1', name: 'Bloque 1', sets: '3', rest_exercise: '15', rest_block: '60', rest_between_blocks: '120',
      exercises: [{ _key: 'e1', name: '', sets: '1', duration_reps: '', duration: '', exercise_notes: '', video_url: '', is_unilateral: false }] 
    }
  ]);

  const [customMap, setCustomMap] = useState<Record<string, string[]>>({});
  const [showMapModal, setShowMapModal] = useState(false);
  const [unknownExercises, setUnknownExercises] = useState<string[]>([]);
  const [exerciseMappings, setExerciseMappings] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (params.athlete_id) {
      api.getPeriodizationTree(params.athlete_id).then((tree) => {
        const todosLosMicros = Array.isArray(tree) 
          ? tree.flatMap((macro: any) => macro.microciclos || macro.microcycles || []) 
          : (tree?.macros || []).flatMap((macro: any) => macro.microciclos || macro.microcycles || []);
        
        todosLosMicros.sort((a: any, b: any) => new Date(a.fecha_inicio || a.start_date).getTime() - new Date(b.fecha_inicio || b.start_date).getTime());
        setMicrociclosDisponibles(todosLosMicros);
      }).catch((e) => console.log("Error cargando microciclos:", e));
    }
    
    AsyncStorage.getItem('custom_muscle_map').then(res => {
      if (res) setCustomMap(JSON.parse(res));
    });
  }, [params.athlete_id]);

  const updateExercise = (index: number, field: string, value: any) => {
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

  const downloadCSVTemplate = async () => {
    let csvContent = "";
    let fileName = "";

    // Añadimos el BOM (Byte Order Mark) para que Excel reconozca los acentos correctamente.
    const BOM = "\uFEFF"; 

    if (workoutType === 'traditional') {
      csvContent = BOM + 
        "Nombre,Series,Reps,Duración (s),Desc. Serie,Desc. Ejercicio,URL Vídeo,Notas,Unilateral (Sí/No)\n" +
        "Sentadilla,4,10,,2m,1m,,Mantener espalda recta,No\n" +
        "Zancadas Búlgaras,3,12,,,1m,,,Sí";
      fileName = "Plantilla_Fuerza_FitTracker.csv";
    } else {
      csvContent = BOM + 
        "Nom. Bloque,Vueltas,Desc. Ex,Desc. Vuelta,Desc. Bloques,Nom. Ejercicio,Series Ex,Reps/Dur,Tiempo,Vídeo,Notas,Unilateral (Sí/No)\n" +
        "Bloque 1,3,15s,60s,120s,Burpees,1,15,45s,,,No\n" +
        ",,,,,Jumping Jacks,1,,45s,,,No\n" +
        "Bloque 2,4,10s,30s,60s,Flexiones,1,10,30s,,,No\n" +
        ",,,,,Plancha lateral,1,,30s,,,Sí";
      fileName = "Plantilla_HIIT_FitTracker.csv";
    }

    if (Platform.OS === 'web') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      try {
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert("Aviso", "No se puede compartir o guardar el archivo en este dispositivo.");
        }
      } catch (error) {
        Alert.alert("Error", "No se pudo generar la plantilla.");
      }
    }
  };

  const handleCSVUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'] });
      if (result.canceled || !result.assets) return;
      const fileUri = result.assets[0].uri;
      const response = await fetch(fileUri);
      const csvText = await response.text();
      const rows = parseCSV(csvText);
      if (rows.length < 2) { Alert.alert("Error", "El CSV parece estar vacío."); return; }

      if (workoutType === 'traditional') {
        const newExercises = rows.slice(1).map(row => ({
          _key: Math.random().toString(), 
          name: row[0]?.trim() || '', 
          sets: row[1]?.trim() || '', 
          reps: row[2]?.trim() || '', 
          duration: row[3]?.trim() || '', 
          rest: row[4]?.trim() || '', 
          rest_exercise: row[5]?.trim() || '', 
          video_url: row[6]?.trim() || '', 
          exercise_notes: row[7]?.trim() || '',
          is_unilateral: ['si', 'sí', 'true', '1'].includes((row[8] || '').trim().toLowerCase())
        })).filter(e => e.name);
        if (newExercises.length > 0) setExercises(newExercises);
      } else {
        const blocks: any[] = [];
        let currentBlockName = null;
        let currentBlockIndex = -1;
        
        rows.slice(1).forEach(row => {
          // Saltar filas completamente vacías
          if (!row.some(cell => cell?.trim())) return;

          const bName = row[0]?.trim();
          
          if (bName && bName !== currentBlockName) {
            currentBlockName = bName;
            blocks.push({ 
              _key: Math.random().toString(), 
              name: bName, 
              sets: row[1]?.trim() || '1', 
              rest_exercise: row[2]?.trim() || '', 
              rest_block: row[3]?.trim() || '', 
              rest_between_blocks: row[4]?.trim() || '', 
              exercises: [] 
            });
            currentBlockIndex++;
          }

          // Si empezamos un CSV con la celda de Nom. Bloque vacía, creamos un bloque por defecto
          if (currentBlockIndex === -1) {
            currentBlockName = "Bloque 1";
            blocks.push({ 
              _key: Math.random().toString(), 
              name: currentBlockName, 
              sets: '1', rest_exercise: '', rest_block: '', rest_between_blocks: '', 
              exercises: [] 
            });
            currentBlockIndex++;
          }

          const exName = row[5]?.trim();
          if (exName) {
            blocks[currentBlockIndex].exercises.push({
              _key: Math.random().toString(), 
              name: exName, 
              sets: row[6]?.trim() || '1', 
              duration_reps: row[7]?.trim() || '', 
              duration: row[8]?.trim() || '', 
              video_url: row[9]?.trim() || '', 
              exercise_notes: row[10]?.trim() || '', 
              is_unilateral: ['si', 'sí', 'true', '1'].includes((row[11] || '').trim().toLowerCase())
            });
          }
        });
        if (blocks.length > 0) setHiitBlocks(blocks);
      }
      Alert.alert("Éxito", "Ejercicios importados correctamente.");
    } catch (err) { Alert.alert("Error", "No se pudo leer el archivo CSV."); }
  };

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
      for (const keywords of Object.values(BASE_MUSCLE_MAP)) { if (keywords.some(k => norm.includes(k) || k === norm)) found = true; }
      for (const keywords of Object.values(customMap)) { if (keywords.some(k => norm.includes(k) || k === norm)) found = true; }
      if (!found && !unknowns.includes(name)) unknowns.push(name);
    });

    if (unknowns.length > 0) {
      setUnknownExercises(unknowns); setExerciseMappings({}); setShowMapModal(true);
    } else {
      executeSave();
    }
  };

  const saveMappingsAndContinue = async () => {
    try {
      const stored = await AsyncStorage.getItem('custom_muscle_map');
      const currentMap = stored ? JSON.parse(stored) : {};
      unknownExercises.forEach(exName => {
        const norm = normalizeName(exName);
        const muscles = exerciseMappings[exName] || [];
        if (muscles.length === 0) {
          if (!currentMap['Sin_Mapear']) currentMap['Sin_Mapear'] = [];
          if (!currentMap['Sin_Mapear'].includes(norm)) currentMap['Sin_Mapear'].push(norm);
        } else {
          muscles.forEach((m: string) => {
            if (!currentMap[m]) currentMap[m] = [];
            if (!currentMap[m].includes(norm)) currentMap[m].push(norm);
          });
        }
      });
      await AsyncStorage.setItem('custom_muscle_map', JSON.stringify(currentMap));
      setCustomMap(currentMap); setShowMapModal(false); executeSave();
    } catch (e) { setShowMapModal(false); executeSave(); }
  };

  const toggleMuscleSelection = (exName: string, muscle: string) => {
    setExerciseMappings(prev => {
      const current = prev[exName] || [];
      const updated = current.includes(muscle) ? current.filter(m => m !== muscle) : [...current, muscle];
      return { ...prev, [exName]: updated };
    });
  };

  const executeSave = async () => {
    let payloadData: any = {
      title: title.trim(), date: date.trim(), notes: notes.trim(), athlete_id: params.athlete_id, 
      microciclo_id: selectedMicroId, microcycle_id: selectedMicroId, hiit_settings: hiitConfig
    };

    if (workoutType === 'traditional') {
      payloadData.exercises = exercises.filter(e => e.name.trim()).map(ex => ({
        name: ex.name, sets: ex.sets, reps: ex.reps, duration: ex.duration, weight: ex.weight,
        rest: ex.rest, rest_exercise: ex.rest_exercise, video_url: ex.video_url, exercise_notes: ex.exercise_notes,
        is_unilateral: !!ex.is_unilateral
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
    try { await api.createWorkout(payloadData); router.back(); } 
    catch (e: any) { setError(e.message || 'Error al guardar'); } 
    finally { setSaving(false); }
  };

  const toggleConfig = (key: keyof typeof hiitConfig) => {
    setHiitConfig(prev => ({ ...prev, [key]: !prev[key] }));
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
              <TextInput style={[styles.input, { flex: 2, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Ej: Core y Estabilidad" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
              <TextInput style={[styles.input, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="rgba(150, 150, 150, 0.5)" />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>ASIGNAR A SEMANA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={[styles.microChip, { borderColor: colors.border }, selectedMicroId === null && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setSelectedMicroId(null)}>
                <Text style={{ color: selectedMicroId === null ? '#FFF' : colors.textPrimary, fontSize: 13, fontWeight: '700' }}>Suelto / Sin asignar</Text>
              </TouchableOpacity>
              {microciclosDisponibles.map(m => (
                <TouchableOpacity key={m.id || m._id} style={[styles.microChip, { borderColor: colors.border }, selectedMicroId === (m.id || m._id) && { backgroundColor: m.color || colors.primary, borderColor: m.color || colors.primary }]} onPress={() => setSelectedMicroId(m.id || m._id)}>
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

          {/* Sección Integrada CSV */}
          <View style={[styles.csvSection, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>IMPORTAR DESDE CSV</Text>
              
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.csvBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }]} onPress={downloadCSVTemplate}>
                  <Ionicons name="download-outline" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Plantilla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.csvBtn, { backgroundColor: colors.primary }]} onPress={handleCSVUpload}>
                  <Ionicons name="document-text" size={16} color="#FFF" />
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>Subir</Text>
                </TouchableOpacity>
              </View>

            </View>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.03)', padding: 10, borderRadius: 8 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700', marginBottom: 4 }}>
                {workoutType === 'traditional' ? 'Formato Columnas (Fuerza):' : 'Formato Columnas (HIIT):'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 16 }}>
                {workoutType === 'traditional'
                  ? '1. Nombre | 2. Series | 3. Reps | 4. Duración (s) | 5. Desc. Serie | 6. Desc. Ejercicio | 7. URL Vídeo | 8. Notas | 9. Unilateral (Sí/No)'
                  : '1. Nom. Bloque | 2. Vueltas | 3. Desc. Ex | 4. Desc. Vuelta | 5. Desc. Bloques | 6. Nom. Ejercicio | 7. Series Ex | 8. Reps/Dur | 9. Tiempo | 10. Vídeo | 11. Notas | 12. Unilateral (Sí/No)'}
              </Text>
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

                  {/* Toggle Unilateral para ejercicios tradicionales */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, borderColor: colors.border }}>
                    <TouchableOpacity onPress={() => updateExercise(i, 'is_unilateral', !ex.is_unilateral)} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                      <Ionicons name={ex.is_unilateral ? "checkbox" : "square-outline"} size={18} color={ex.is_unilateral ? colors.primary : colors.textSecondary} />
                      <Text style={{color: ex.is_unilateral ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '700'}}>Unilateral (Doble Temporizador)</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.mediaContainer, { borderTopColor: colors.border }]}>
                    <Ionicons name="logo-youtube" size={16} color={colors.error || '#EF4444'} />
                    <TextInput style={[styles.urlInput, { color: colors.textPrimary }]} value={ex.video_url} onChangeText={v => updateExercise(i, 'video_url', v)} placeholder="URL de YouTube (opcional)" placeholderTextColor="rgba(150, 150, 150, 0.5)" autoCapitalize="none" />
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

      <Modal visible={showMapModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: '85%' }]}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, marginBottom: 10 }}>Ejercicios Nuevos 🤔</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, fontSize: 14 }}>Para que el Mapa de Calor sea preciso, indícale a Fit Tracker qué grupos musculares trabajan estos ejercicios:</Text>
            <ScrollView style={{ flexShrink: 1, marginBottom: 20 }}>
              {unknownExercises.map(ex => (
                <View key={ex} style={{ marginBottom: 20 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16, marginBottom: 10 }}>{ex}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {MUSCLE_GROUPS.map(muscle => {
                      const isSelected = (exerciseMappings[ex] || []).includes(muscle);
                      return (
                        <TouchableOpacity key={muscle} onPress={() => toggleMuscleSelection(ex, muscle)} style={[styles.musclePill, { borderColor: colors.border }, isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
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
  musclePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  saveBtnBig: { paddingVertical: 16, borderRadius: 15, alignItems: 'center' },
  csvSection: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  csvBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }
});
