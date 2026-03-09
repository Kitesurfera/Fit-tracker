import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert, Image
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  const [exercises, setExercises] = useState<any[]>([]);
  const [error, setError] = useState('');
  
  const [athleteId, setAthleteId] = useState<string>('');
  const [microciclosDisponibles, setMicrociclosDisponibles] = useState<any[]>([]);
  const [selectedMicroId, setSelectedMicroId] = useState<string | null>(null);

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
          setSelectedMicroId(w.microciclo_id || null); 
          
          setExercises(
            (w.exercises || []).map((ex: any) => ({
              _key: Math.random().toString(),
              name: ex.name || '',
              sets: ex.sets || '',
              reps: ex.reps || '',
              weight: ex.weight || '',
              rest: ex.rest || '',
              rest_exercise: ex.rest_exercise || '', // Recuperamos el nuevo tipo de descanso
              video_url: ex.video_url || '',
              exercise_notes: ex.exercise_notes || '',
              image_path: ex.image_path || '',
            }))
          );
        } else {
          setError('No se pudo encontrar el entrenamiento en la base de datos.');
        }
      } catch (err) {
        setError('Error de conexión al cargar el entrenamiento.');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkoutData();
  }, [workoutId]);

  useEffect(() => {
    if (athleteId) {
      api.getPeriodizationTree(athleteId).then((tree) => {
        const todosLosMicros = tree.flatMap((macro: any) => macro.microciclos || []);
        todosLosMicros.sort((a: any, b: any) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
        setMicrociclosDisponibles(todosLosMicros);
      }).catch((e) => console.log("Error cargando microciclos:", e));
    }
  }, [athleteId]);

  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  };

  const addExercise = () => {
    setExercises([...exercises, { 
      _key: Math.random().toString(),
      name: '', sets: '', reps: '', weight: '', rest: '', rest_exercise: '', video_url: '', exercise_notes: '', image_path: '' 
    }]);
  };

  const moveExercise = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= exercises.length) return;
    const updated = [...exercises];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setExercises(updated);
  };

  const removeExercise = (index: number) => {
    if (exercises.length <= 1) return;
    
    if (Platform.OS === 'web') {
      const confirm = window.confirm(`¿Eliminar "${exercises[index].name || 'ejercicio'}"?`);
      if (confirm) {
        setExercises(exercises.filter((_, i) => i !== index));
      }
    } else {
      Alert.alert('Eliminar ejercicio', `Eliminar "${exercises[index].name || 'ejercicio'}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => setExercises(exercises.filter((_, i) => i !== index)) },
      ]);
    }
  };

  const [imageUploading, setImageUploading] = useState<number | null>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<number, string>>({});

  const pickExerciseImage = async (exIndex: number) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setImageUploading(exIndex);
      setImagePreviews(prev => ({ ...prev, [exIndex]: asset.uri }));
      const fileName = asset.uri.split('/').pop() || 'image.jpg';
      const fileType = asset.mimeType || 'image/jpeg';
      const uploaded = await api.uploadFile(asset.uri, fileName, fileType);
      updateExercise(exIndex, 'image_path', uploaded.storage_path);
    } catch (e: any) {
      if (Platform.OS === 'web') {
          window.alert(e.message || 'No se pudo subir la imagen');
      } else {
          Alert.alert('Error', e.message || 'No se pudo subir la imagen');
      }
    } finally {
      setImageUploading(null);
    }
  };

  const handleSave = async () => {
    setError('');
    if (!title.trim()) { setError('El título es obligatorio'); return; }
    if (!date.trim()) { setError('La fecha es obligatoria'); return; }
    
    const cleanExercises = exercises
      .filter(e => e.name.trim())
      .map(ex => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        rest: ex.rest,
        rest_exercise: ex.rest_exercise, // Guardamos el nuevo descanso
        video_url: ex.video_url,
        exercise_notes: ex.exercise_notes,
        image_path: ex.image_path
      }));

    if (cleanExercises.length === 0) { setError('Agrega al menos un ejercicio'); return; }
    setSaving(true);
    try {
      await api.updateWorkout(workoutId!, { 
        title: title.trim(), 
        date: date.trim(), // Actualizamos la fecha
        notes: notes.trim(), 
        exercises: cleanExercises,
        microciclo_id: selectedMicroId 
      });
      router.back();
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} testID="close-edit-workout" activeOpacity={0.7} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Editar Entreno</Text>
          <TouchableOpacity onPress={handleSave} testID="save-workout-btn" activeOpacity={0.7} style={styles.headerBtn} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.primary} size="small" /> : (
              <Text style={[styles.saveText, { color: colors.primary }]}>Guardar</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TÍTULO</Text>
            <TextInput
              testID="edit-workout-title"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={title} onChangeText={setTitle} placeholder="Título del entrenamiento"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA</Text>
            <TextInput
              testID="edit-workout-date"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={[styles.section, { marginTop: 8, marginBottom: 8 }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>PERTENECE AL MICROCICLO:</Text>
            
            {microciclosDisponibles.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
                No hay microciclos creados en la periodización.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <TouchableOpacity
                  style={[
                    styles.microChip,
                    selectedMicroId === null 
                      ? { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }
                      : { backgroundColor: 'transparent', borderColor: colors.border }
                  ]}
                  onPress={() => setSelectedMicroId(null)}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: selectedMicroId === null ? '700' : '400' }}>
                    Sin asignar
                  </Text>
                </TouchableOpacity>

                {microciclosDisponibles.map((micro) => (
                  <TouchableOpacity
                    key={micro.id}
                    style={[
                      styles.microChip,
                      selectedMicroId === micro.id 
                        ? { backgroundColor: micro.color + '20', borderColor: micro.color, borderWidth: 2 }
                        : { backgroundColor: 'transparent', borderColor: colors.border }
                    ]}
                    onPress={() => setSelectedMicroId(micro.id)}
                  >
                    <Text style={{ color: selectedMicroId === micro.id ? micro.color : colors.textPrimary, fontWeight: selectedMicroId === micro.id ? '800' : '500' }}>
                      {micro.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>EJERCICIOS ({exercises.length})</Text>
              <TouchableOpacity onPress={addExercise} testID="edit-add-exercise-btn" activeOpacity={0.7} style={styles.addExBtn}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.addExText, { color: colors.primary }]}>Añadir</Text>
              </TouchableOpacity>
            </View>

            {exercises.map((ex, i) => (
              <View key={ex._key || i} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.exerciseHeader}>
                  <View style={styles.reorderBtns}>
                    <TouchableOpacity onPress={() => moveExercise(i, 'up')} disabled={i === 0}
                      activeOpacity={0.6} style={[styles.reorderBtn, i === 0 && { opacity: 0.25 }]}>
                      <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => moveExercise(i, 'down')} disabled={i === exercises.length - 1}
                      activeOpacity={0.6} style={[styles.reorderBtn, i === exercises.length - 1 && { opacity: 0.25 }]}>
                      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[styles.exNameInput, { color: colors.textPrimary }]}
                    value={ex.name} onChangeText={v => updateExercise(i, 'name', v)}
                    placeholder="Nombre del ejercicio" placeholderTextColor={colors.textSecondary}
                  />
                  {exercises.length > 1 && (
                    <TouchableOpacity onPress={() => removeExercise(i)} testID={`edit-remove-ex-${i}`} activeOpacity={0.7} style={styles.removeExBtn}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Grid adaptado para 5 campos */}
                <View style={[styles.exDetailsRow, { borderTopColor: colors.border }]}>
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]} numberOfLines={1}>Series</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.sets} onChangeText={v => updateExercise(i, 'sets', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.exDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]} numberOfLines={1}>Reps</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.reps} onChangeText={v => updateExercise(i, 'reps', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.exDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]} numberOfLines={1}>Kg</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.weight} onChangeText={v => updateExercise(i, 'weight', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.exDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]} numberOfLines={1}>Desc.S</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.rest} onChangeText={v => updateExercise(i, 'rest', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.exDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]} numberOfLines={1}>Desc.E</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.rest_exercise} onChangeText={v => updateExercise(i, 'rest_exercise', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={[styles.videoUrlRow, { borderTopColor: colors.border }]}>
                  <Ionicons name="videocam-outline" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.videoUrlInput, { color: colors.textPrimary }]}
                    value={ex.video_url} onChangeText={v => updateExercise(i, 'video_url', v)}
                    placeholder="URL de video (YouTube, Drive...)"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none" keyboardType="url"
                  />
                </View>

                <View style={[styles.videoUrlRow, { borderTopColor: colors.border }]}>
                  <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.videoUrlInput, { color: colors.textPrimary }]}
                    value={ex.exercise_notes} onChangeText={v => updateExercise(i, 'exercise_notes', v)}
                    placeholder="Observaciones del ejercicio..."
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <View style={[styles.videoUrlRow, { borderTopColor: colors.border }]}>
                  {imagePreviews[i] || (ex as any).image_path ? (
                    <View style={styles.imagePreviewRow}>
                      <Image source={{ uri: imagePreviews[i] || (ex as any).image_path }} style={styles.imageThumb} />
                      <Text style={[styles.imageFileName, { color: colors.textSecondary }]} numberOfLines={1}>Imagen adjunta</Text>
                      <TouchableOpacity onPress={() => {
                        updateExercise(i, 'image_path', '');
                        setImagePreviews(prev => { const n = {...prev}; delete n[i]; return n; });
                      }}>
                        <Ionicons name="close-circle" size={20} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      testID={`upload-image-${i}`}
                      style={styles.imagePickBtn}
                      onPress={() => pickExerciseImage(i)}
                      disabled={imageUploading === i}
                      activeOpacity={0.7}
                    >
                      {imageUploading === i ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="camera-outline" size={18} color={colors.primary} />
                      )}
                      <Text style={[styles.imagePickText, { color: colors.primary }]}>
                        {imageUploading === i ? 'Subiendo...' : 'Subir imagen/dibujo'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTAS GENERALES</Text>
            <TextInput
              testID="edit-workout-notes"
              style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={notes} onChangeText={setNotes} placeholder="Observaciones opcionales..."
              placeholderTextColor={colors.textSecondary} multiline numberOfLines={3}
            />
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '12' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            testID="edit-workout-save"
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave} disabled={saving} activeOpacity={0.7}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.submitText}>Guardar cambios</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  headerBtn: { minWidth: 60 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  saveText: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
  form: { padding: 20, gap: 20, paddingBottom: 48 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  
  microChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1 },

  addExBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addExText: { fontSize: 13, fontWeight: '600' },
  exerciseCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  reorderBtns: { gap: 2 },
  reorderBtn: { padding: 2 },
  exNameInput: { flex: 1, fontSize: 16, fontWeight: '500' },
  removeExBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  exDetailsRow: { flexDirection: 'row', borderTopWidth: 0.5 },
  exDetail: { flex: 1, alignItems: 'center', padding: 6, gap: 4 },
  exDetailLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2, textTransform: 'uppercase' },
  exDetailInput: { width: '100%', textAlign: 'center', borderRadius: 6, padding: 6, fontSize: 14, fontWeight: '600' },
  exDivider: { width: 0.5 },
  videoUrlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5 },
  videoUrlInput: { flex: 1, fontSize: 14 },
  errorBox: { borderRadius: 10, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
  submitBtn: { borderRadius: 10, padding: 16, alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  imagePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  imageThumb: { width: 40, height: 40, borderRadius: 6 },
  imageFileName: { flex: 1, fontSize: 13 },
  imagePickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  imagePickText: { fontSize: 14, fontWeight: '500' },
});
