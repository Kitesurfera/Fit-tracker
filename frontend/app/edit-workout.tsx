import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function EditWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const workoutId = typeof params.workoutId === 'string' ? params.workoutId : params.workoutId?.[0];
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  
  const [athleteId, setAthleteId] = useState<string>('');
  const [workoutType, setWorkoutType] = useState<'traditional' | 'hiit'>('traditional');
  
  const [exercises, setExercises] = useState<any[]>([]);
  const [hiitBlocks, setHiitBlocks] = useState<any[]>([]);

  useEffect(() => {
    const fetchWorkoutData = async () => {
      if (!workoutId) return;
      try {
        const allWorkouts = await api.getWorkouts();
        const w = allWorkouts.find((wk: any) => wk.id === workoutId);

        if (w) {
          setTitle(w.title || '');
          setNotes(w.notes || '');
          setDate(w.date || '');
          setAthleteId(w.athlete_id || ''); 
          
          // DETECTAMOS SI ES HIIT LEYENDO LA ETIQUETA OCULTA
          const isHiit = w.exercises && w.exercises.length > 0 && w.exercises[0].is_hiit_block === true;

          if (isHiit) {
            setWorkoutType('hiit');
            setHiitBlocks(w.exercises.map((b: any) => ({ 
              ...b, 
              _key: Math.random().toString(), 
              exercises: (b.hiit_exercises || []).map((e: any) => ({ ...e, _key: Math.random().toString() })) 
            })));
          } else {
            setWorkoutType('traditional');
            setExercises((w.exercises || []).map((ex: any) => ({ ...ex, _key: Math.random().toString() })));
          }
        }
      } catch (err) { setError('Error de conexión.'); } 
      finally { setLoading(false); }
    };
    fetchWorkoutData();
  }, [workoutId]);

  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...exercises]; updated[index] = { ...updated[index], [field]: value }; setExercises(updated);
  };
  const addExercise = () => setExercises([...exercises, { _key: Math.random().toString(), name: '', sets: '', reps: '', weight: '', rest: '', rest_exercise: '' }]);
  const removeExercise = (index: number) => setExercises(exercises.filter((_, i) => i !== index));

  const addHiitBlock = () => setHiitBlocks([...hiitBlocks, { _key: Math.random().toString(), name: `Bloque ${hiitBlocks.length + 1}`, sets: '3', rest_exercise: '15', rest_block: '60', exercises: [{ _key: Math.random().toString(), name: '', duration_reps: '' }] }]);
  const removeHiitBlock = (bIndex: number) => setHiitBlocks(hiitBlocks.filter((_, i) => i !== bIndex));
  const updateHiitBlock = (bIndex: number, field: string, value: string) => { const updated = [...hiitBlocks]; updated[bIndex] = { ...updated[bIndex], [field]: value }; setHiitBlocks(updated); };
  const addHiitExercise = (bIndex: number) => { const updated = [...hiitBlocks]; updated[bIndex].exercises.push({ _key: Math.random().toString(), name: '', duration_reps: '' }); setHiitBlocks(updated); };
  const removeHiitExercise = (bIndex: number, eIndex: number) => { const updated = [...hiitBlocks]; updated[bIndex].exercises = updated[bIndex].exercises.filter((_: any, i: number) => i !== eIndex); setHiitBlocks(updated); };
  const updateHiitExercise = (bIndex: number, eIndex: number, field: string, value: string) => { const updated = [...hiitBlocks]; updated[bIndex].exercises[eIndex] = { ...updated[bIndex].exercises[eIndex], [field]: value }; setHiitBlocks(updated); };

  const handleSave = async () => {
    setError('');
    if (!title.trim()) { setError('El título es obligatorio'); return; }
    
    let payloadData: any = { title: title.trim(), date: date.trim(), notes: notes.trim() };

    if (workoutType === 'traditional') {
      const cleanExercises = exercises.filter(e => e.name.trim()).map(ex => ({ name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight, rest: ex.rest, rest_exercise: ex.rest_exercise, video_url: ex.video_url }));
      if (cleanExercises.length === 0) { setError('Agrega al menos un ejercicio'); return; }
      payloadData.exercises = cleanExercises;
    } else {
      const cleanBlocks = hiitBlocks.map(block => ({ 
        is_hiit_block: true, 
        name: block.name, 
        sets: block.sets, 
        rest_exercise: block.rest_exercise, 
        rest_block: block.rest_block, 
        hiit_exercises: block.exercises.filter((e: any) => e.name.trim()).map((e: any) => ({ name: e.name, duration_reps: e.duration_reps })) 
      })).filter(b => b.hiit_exercises.length > 0);
      
      if (cleanBlocks.length === 0) { setError('Añade al menos un bloque válido'); return; }
      payloadData.exercises = cleanBlocks;
    }

    setSaving(true);
    try {
      await api.updateWorkout(workoutId!, payloadData);
      router.back();
    } catch (e: any) { setError('Error al guardar'); } finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Editar Sesión</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn} disabled={saving}>{saving ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={[styles.saveText, { color: colors.primary }]}>Guardar</Text>}</TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TÍTULO Y FECHA</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 2, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={title} onChangeText={setTitle} placeholder="Título" />
              <TextInput style={[styles.input, { flex: 1, backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
            </View>
          </View>

          <View style={[styles.typeSelector, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
            <TouchableOpacity style={[styles.typeBtn, workoutType === 'traditional' && { backgroundColor: colors.primary }]} onPress={() => setWorkoutType('traditional')}><Text style={{ color: workoutType === 'traditional' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Fuerza</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, workoutType === 'hiit' && { backgroundColor: colors.error }]} onPress={() => setWorkoutType('hiit')}><Text style={{ color: workoutType === 'hiit' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Circuito HIIT</Text></TouchableOpacity>
          </View>

          {workoutType === 'traditional' ? (
            <View style={styles.section}>
              {exercises.map((ex, i) => (
                <View key={ex._key} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.exerciseHeader}>
                    <TextInput style={[styles.exNameInput, { color: colors.textPrimary }]} value={ex.name} onChangeText={v => updateExercise(i, 'name', v)} placeholder="Nombre del ejercicio" />
                    <TouchableOpacity onPress={() => removeExercise(i)} style={styles.removeExBtn}><Ionicons name="trash-outline" size={18} color={colors.error} /></TouchableOpacity>
                  </View>
                  <View style={[styles.exDetailsRow, { borderTopColor: colors.border }]}>
                    <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Series</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.sets} onChangeText={v => updateExercise(i, 'sets', v)} placeholder="-" keyboardType="numeric" /></View>
                    <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Reps</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.reps} onChangeText={v => updateExercise(i, 'reps', v)} placeholder="-" keyboardType="numeric" /></View>
                    <View style={styles.exDetail}><Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Desc.S</Text><TextInput style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]} value={ex.rest} onChangeText={v => updateExercise(i, 'rest', v)} placeholder="s" keyboardType="numeric" /></View>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addExercise} style={styles.addExBtnBig}><Ionicons name="add" size={20} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: '700' }}>Añadir Ejercicio</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.section}>
              {hiitBlocks.map((block, bIndex) => (
                <View key={block._key} style={[styles.hiitBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.hiitHeader, { borderBottomColor: colors.border }]}>
                    <TextInput style={[styles.hiitNameInput, { color: colors.textPrimary }]} value={block.name} onChangeText={v => updateHiitBlock(bIndex, 'name', v)} placeholder="Nombre del Bloque" />
                    <TouchableOpacity onPress={() => removeHiitBlock(bIndex)}><Ionicons name="trash-outline" size={20} color={colors.error} /></TouchableOpacity>
                  </View>
                  <View style={styles.hiitConfigRow}>
                    <View style={styles.hiitConfigItem}><Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}>Vueltas</Text><TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.sets} onChangeText={v => updateHiitBlock(bIndex, 'sets', v)} keyboardType="numeric" /></View>
                    <View style={styles.hiitConfigItem}><Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}>Desc. Ej</Text><TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_exercise} onChangeText={v => updateHiitBlock(bIndex, 'rest_exercise', v)} keyboardType="numeric" /></View>
                    <View style={styles.hiitConfigItem}><Text style={[styles.hiitConfigLabel, { color: colors.textSecondary }]}>Desc. Vuelta</Text><TextInput style={[styles.hiitConfigInput, { color: colors.textPrimary, borderColor: colors.border }]} value={block.rest_block} onChangeText={v => updateHiitBlock(bIndex, 'rest_block', v)} keyboardType="numeric" /></View>
                  </View>
                  <View style={styles.hiitExList}>
                    {block.exercises.map((ex: any, eIndex: number) => (
                      <View key={ex._key} style={styles.hiitExRow}>
                        <View style={styles.hiitExNum}><Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>{eIndex + 1}</Text></View>
                        <TextInput style={[styles.hiitExInput, { flex: 2, color: colors.textPrimary, borderColor: colors.border }]} value={ex.name} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'name', v)} placeholder="Ej: Burpees" />
                        <TextInput style={[styles.hiitExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.duration_reps} onChangeText={v => updateHiitExercise(bIndex, eIndex, 'duration_reps', v)} placeholder="40s o 15 reps" />
                        <TouchableOpacity onPress={() => removeHiitExercise(bIndex, eIndex)} style={{ padding: 8 }}><Ionicons name="close-circle" size={20} color={colors.textSecondary} /></TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => addHiitExercise(bIndex)} style={styles.addHiitExBtn}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>+ Añadir ejercicio</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity onPress={addHiitBlock} style={[styles.addExBtnBig, { borderColor: colors.error, borderStyle: 'dashed' }]}><Ionicons name="add" size={20} color={colors.error} /><Text style={{ color: colors.error, fontWeight: '700' }}>Añadir Bloque HIIT</Text></TouchableOpacity>
            </View>
          )}

          {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 }, headerBtn: { minWidth: 60 }, headerTitle: { fontSize: 17, fontWeight: '600' }, saveText: { fontSize: 16, fontWeight: '600', textAlign: 'right' }, form: { padding: 20, gap: 20, paddingBottom: 48 }, section: { gap: 10 }, label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }, input: { borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1 }, typeSelector: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1 }, typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 }, exerciseCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginBottom: 10 }, exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }, exNameInput: { flex: 1, fontSize: 16, fontWeight: '500' }, removeExBtn: { padding: 4 }, exDetailsRow: { flexDirection: 'row', borderTopWidth: 0.5 }, exDetail: { flex: 1, alignItems: 'center', padding: 8, borderRightWidth: 0.5, borderRightColor: 'rgba(0,0,0,0.1)' }, exDetailLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 }, exDetailInput: { width: '100%', textAlign: 'center', borderRadius: 6, padding: 8, fontSize: 14, fontWeight: '600' }, addExBtnBig: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', gap: 8 }, hiitBlock: { borderRadius: 16, borderWidth: 2, overflow: 'hidden', marginBottom: 15 }, hiitHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, backgroundColor: 'rgba(0,0,0,0.02)' }, hiitNameInput: { fontSize: 18, fontWeight: '800', flex: 1 }, hiitConfigRow: { flexDirection: 'row', padding: 12, gap: 10, backgroundColor: 'rgba(0,0,0,0.01)' }, hiitConfigItem: { flex: 1 }, hiitConfigLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4, textAlign: 'center' }, hiitConfigInput: { borderWidth: 1, borderRadius: 8, padding: 8, textAlign: 'center', fontSize: 14, fontWeight: '600' }, hiitExList: { padding: 12, gap: 10 }, hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, hiitExNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, hiitExInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 }, addHiitExBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, marginLeft: 20 }, errorText: { textAlign: 'center', fontWeight: '600', marginTop: 10 }
});
