import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function EditWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [exercises, setExercises] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (workoutId) {
      api.getWorkout(workoutId).then((w) => {
        setTitle(w.title || '');
        setNotes(w.notes || '');
        setDate(w.date || '');
        setExercises(
          (w.exercises || []).map((ex: any) => ({
            name: ex.name || '',
            sets: ex.sets || '',
            reps: ex.reps || '',
            weight: ex.weight || '',
            rest: ex.rest || '',
            video_url: ex.video_url || '',
            exercise_notes: ex.exercise_notes || '',
          }))
        );
      }).catch(() => setError('No se pudo cargar el entrenamiento'))
        .finally(() => setLoading(false));
    }
  }, [workoutId]);

  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  };

  const addExercise = () => {
    setExercises([...exercises, { name: '', sets: '', reps: '', weight: '', rest: '', video_url: '', exercise_notes: '' }]);
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
    Alert.alert('Eliminar ejercicio', `Eliminar "${exercises[index].name || 'ejercicio'}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => setExercises(exercises.filter((_, i) => i !== index)) },
    ]);
  };

  const handleSave = async () => {
    setError('');
    if (!title.trim()) { setError('El titulo es obligatorio'); return; }
    const validExercises = exercises.filter(e => e.name.trim());
    if (validExercises.length === 0) { setError('Agrega al menos un ejercicio'); return; }
    setSaving(true);
    try {
      await api.updateWorkout(workoutId!, { title: title.trim(), notes: notes.trim(), exercises: validExercises });
      router.back();
    } catch (e: any) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
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
          {/* Date badge */}
          <View style={[styles.dateBadge, { backgroundColor: colors.surfaceHighlight }]}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>{date}</Text>
          </View>

          {/* Title */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TITULO</Text>
            <TextInput
              testID="edit-workout-title"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              value={title} onChangeText={setTitle} placeholder="Titulo del entrenamiento"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {/* Exercises */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>EJERCICIOS ({exercises.length})</Text>
              <TouchableOpacity onPress={addExercise} testID="edit-add-exercise-btn" activeOpacity={0.7} style={styles.addExBtn}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.addExText, { color: colors.primary }]}>Anadir</Text>
              </TouchableOpacity>
            </View>

            {exercises.map((ex, i) => (
              <View key={i} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Exercise header with name and delete */}
                <View style={styles.exerciseHeader}>
                  <View style={[styles.exNumBadge, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.exNum, { color: colors.primary }]}>{i + 1}</Text>
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

                {/* Details row */}
                <View style={[styles.exDetailsRow, { borderTopColor: colors.border }]}>
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Series</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.sets} onChangeText={v => updateExercise(i, 'sets', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.exDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Reps</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.reps} onChangeText={v => updateExercise(i, 'reps', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.exDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Kg</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.weight} onChangeText={v => updateExercise(i, 'weight', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.exDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.exDetail}>
                    <Text style={[styles.exDetailLabel, { color: colors.textSecondary }]}>Desc</Text>
                    <TextInput
                      style={[styles.exDetailInput, { color: colors.textPrimary, backgroundColor: colors.surfaceHighlight }]}
                      value={ex.rest} onChangeText={v => updateExercise(i, 'rest', v)}
                      placeholder="-" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Video URL */}
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
              </View>
            ))}
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTAS</Text>
            <TextInput
              testID="edit-workout-notes"
              style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              value={notes} onChangeText={setNotes} placeholder="Observaciones opcionales..."
              placeholderTextColor={colors.textSecondary} multiline numberOfLines={3}
            />
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '12' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          {/* Save button */}
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
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  dateText: { fontSize: 14, fontWeight: '500' },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  addExBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addExText: { fontSize: 13, fontWeight: '600' },
  exerciseCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  exNumBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  exNum: { fontSize: 13, fontWeight: '700' },
  exNameInput: { flex: 1, fontSize: 16, fontWeight: '500' },
  removeExBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  exDetailsRow: { flexDirection: 'row', borderTopWidth: 0.5 },
  exDetail: { flex: 1, alignItems: 'center', padding: 8, gap: 4 },
  exDetailLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  exDetailInput: { width: '100%', textAlign: 'center', borderRadius: 6, padding: 8, fontSize: 16, fontWeight: '600' },
  exDivider: { width: 0.5 },
  videoUrlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5 },
  videoUrlInput: { flex: 1, fontSize: 14 },
  errorBox: { borderRadius: 10, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  submitBtn: { borderRadius: 10, padding: 16, alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
