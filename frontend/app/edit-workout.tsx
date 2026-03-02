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
            _key: Math.random().toString(),
            name: ex.name || '',
            sets: ex.sets || '',
            reps: ex.reps || '',
            weight: ex.weight || '',
            rest: ex.rest || '',
            video_url: ex.video_url || '',
            exercise_notes: ex.exercise_notes || '',
            image_path: ex.image_path || '',
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
    setExercises([...exercises, { 
      _key: Math.random().toString(),
      name: '', sets: '', reps: '', weight: '', rest: '', video_url: '', exercise_notes: '', image_path: '' 
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
    
    // Arreglo web para la confirmación de eliminación
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
    if (!title.trim()) { setError('El titulo es obligatorio'); return; }
    
    // Limpiamos la etiqueta _key antes de enviar al backend
    const cleanExercises = exercises
      .filter(e => e.name.trim())
      .map(ex => ({
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        rest: ex.rest,
        video_url: ex.video_url,
        exercise_notes: ex.exercise_notes,
        image_path: ex.image_path
      }));

    if (cleanExercises.length === 0) { setError('Agrega al menos un ejercicio'); return; }
    setSaving(true);
    try {
      await api.updateWorkout(workoutId!, { title: title.trim(), notes: notes.trim(), exercises: cleanExercises });
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
                <Text style={[styles.addExText, { color: colors.primary }]}>Añadir</Text>
              </TouchableOpacity>
            </View>

            {exercises.map((ex, i) => (
              <View key={ex._key || i} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Exercise header with name, reorder, delete */}
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
                {/* Exercise notes */}
                <View style={[styles.videoUrlRow, { borderTopColor: colors.border }]}>
                  <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.videoUrlInput, { color: colors.textPrimary }]}
                    value={ex.exercise_notes} onChangeText={v => updateExercise(i, 'exercise_notes', v)}
                    placeholder="Observaciones del ejercicio..."
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                {/* Image upload */}
                <View style={[styles.videoUrlRow, { borderTopColor: colors.border }]}>
                  {imagePreviews[i] || (ex as any).image_path ? (
                    <View style={styles.imagePreviewRow}>
                      <Image source={{ uri: imagePreviews[i] || '' }} style={styles.imageThumb} />
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
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTAS</Text>
            <TextInput
              testID="edit-workout-notes"
              style={[styles.input, styles.textArea, { backgroundColor
