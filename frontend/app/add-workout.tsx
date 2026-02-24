import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function AddWorkoutScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string>('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState([{ name: '', sets: '', reps: '', weight: '', rest: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role === 'trainer') {
      api.getAthletes().then(setAthletes).catch(console.log);
    }
  }, []);

  const addExercise = () => {
    setExercises([...exercises, { name: '', sets: '', reps: '', weight: '', rest: '' }]);
  };

  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...exercises];
    (updated[index] as any)[field] = value;
    setExercises(updated);
  };

  const removeExercise = (index: number) => {
    if (exercises.length <= 1) return;
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError('');
    if (!selectedAthlete || !title || !date) {
      setError('Selecciona deportista, titulo y fecha');
      return;
    }
    setSubmitting(true);
    try {
      await api.createWorkout({
        athlete_id: selectedAthlete,
        title,
        date,
        notes,
        exercises: exercises.filter(e => e.name.trim()),
      });
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCSVUpload = async () => {
    if (!selectedAthlete) {
      setError('Selecciona un deportista primero');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
      if (!result.canceled && result.assets?.[0]) {
        setSubmitting(true);
        const file = result.assets[0];
        await api.uploadCSV(selectedAthlete, file.uri, file.name);
        Alert.alert('CSV importado', 'Los entrenamientos se han importado correctamente');
        router.back();
      }
    } catch (e: any) {
      setError(e.message || 'Error al importar CSV');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="close-add-workout" activeOpacity={0.7}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nuevo Entreno</Text>
          <TouchableOpacity onPress={handleCSVUpload} testID="csv-upload-btn" activeOpacity={0.7}>
            <Ionicons name="document-attach-outline" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Athlete selector */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>DEPORTISTA *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.athleteScroll}>
              <View style={styles.athleteRow}>
                {athletes.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[
                      styles.athleteChip,
                      { backgroundColor: colors.surfaceHighlight },
                      selectedAthlete === a.id && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setSelectedAthlete(a.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.athleteChipText,
                      { color: colors.textPrimary },
                      selectedAthlete === a.id && { color: '#FFF' },
                    ]}>
                      {a.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TITULO *</Text>
            <TextInput
              testID="workout-title-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={title} onChangeText={setTitle} placeholder="Ej: Fuerza tren inferior"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA *</Text>
            <TextInput
              testID="workout-date-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.exercisesSection}>
            <View style={styles.exercisesHeader}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>EJERCICIOS</Text>
              <TouchableOpacity onPress={addExercise} testID="add-exercise-btn" activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {exercises.map((ex, i) => (
              <View key={i} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.exerciseHeader}>
                  <Text style={[styles.exerciseNum, { color: colors.primary }]}>#{i + 1}</Text>
                  {exercises.length > 1 && (
                    <TouchableOpacity onPress={() => removeExercise(i)} activeOpacity={0.7}>
                      <Ionicons name="close-circle-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={[styles.exerciseInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  value={ex.name} onChangeText={v => updateExercise(i, 'name', v)}
                  placeholder="Nombre ejercicio" placeholderTextColor={colors.textSecondary}
                />
                <View style={styles.exerciseRow}>
                  <TextInput
                    style={[styles.smallInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    value={ex.sets} onChangeText={v => updateExercise(i, 'sets', v)}
                    placeholder="Series" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.smallInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    value={ex.reps} onChangeText={v => updateExercise(i, 'reps', v)}
                    placeholder="Reps" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.smallInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    value={ex.weight} onChangeText={v => updateExercise(i, 'weight', v)}
                    placeholder="Kg" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.smallInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                    value={ex.rest} onChangeText={v => updateExercise(i, 'rest', v)}
                    placeholder="Desc (s)" placeholderTextColor={colors.textSecondary} keyboardType="numeric"
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTAS</Text>
            <TextInput
              testID="workout-notes-input"
              style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={notes} onChangeText={setNotes} placeholder="Observaciones..."
              placeholderTextColor={colors.textSecondary} multiline numberOfLines={3}
            />
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '15' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            testID="create-workout-submit"
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleSubmit} disabled={submitting} activeOpacity={0.7}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.submitText}>CREAR ENTRENAMIENTO</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  form: { padding: 16, gap: 16, paddingBottom: 48 },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  input: { borderRadius: 8, padding: 16, fontSize: 16, borderWidth: 1 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  athleteScroll: { marginTop: 4 },
  athleteRow: { flexDirection: 'row', gap: 8 },
  athleteChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  athleteChipText: { fontSize: 14, fontWeight: '500' },
  exercisesSection: { gap: 8 },
  exercisesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseCard: { borderRadius: 10, padding: 12, borderWidth: 1, gap: 8 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseNum: { fontSize: 14, fontWeight: '700' },
  exerciseInput: { borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 1 },
  exerciseRow: { flexDirection: 'row', gap: 8 },
  smallInput: { flex: 1, borderRadius: 8, padding: 10, fontSize: 14, borderWidth: 1, textAlign: 'center' },
  errorBox: { borderRadius: 8, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  submitBtn: { borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
});
