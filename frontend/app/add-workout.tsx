import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function AddWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  // Añadimos microciclo_id a los parámetros esperados
  const params = useLocalSearchParams<{ athlete_id: string; name: string; microciclo_id?: string }>();

  // --- ESTADOS ORIGINALES DEL ENTRENAMIENTO ---
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [notas, setNotas] = useState('');
  const [ejercicios, setEjercicios] = useState([
    { name: '', sets: '', reps: '', weight: '', rest: '', exercise_notes: '', video_url: '', image_path: '' }
  ]);
  const [saving, setSaving] = useState(false);

  // --- NUEVOS ESTADOS PARA PERIODIZACIÓN ---
  const [microciclosDisponibles, setMicrociclosDisponibles] = useState<any[]>([]);
  // Si venimos del calendario, el microciclo ya vendrá pre-seleccionado
  const [selectedMicroId, setSelectedMicroId] = useState<string | null>(params.microciclo_id || null);

  // --- ESTADOS PARA IMÁGENES ---
  const [imageUploading, setImageUploading] = useState<number | null>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<number, string>>({});

  // --- CARGAR MICROCICLOS DEL DEPORTISTA ---
  const loadMicrociclos = async () => {
    try {
      if (!params.athlete_id) return;
      const tree = await api.getPeriodizationTree(params.athlete_id);
      
      const todosLosMicros = tree.flatMap((macro: any) => macro.microciclos || []);
      todosLosMicros.sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
      
      setMicrociclosDisponibles(todosLosMicros);
    } catch (error) {
      console.log("Error cargando microciclos para el selector:", error);
    }
  };

  useEffect(() => {
    loadMicrociclos();
  }, [params.athlete_id]);

  // --- MANEJO DE IMÁGENES ---
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
      Alert.alert('Error', e.message || 'No se pudo subir la imagen');
    } finally {
      setImageUploading(null);
    }
  };

  // --- MANEJO DE EJERCICIOS ---
  const addExercise = () => {
    setEjercicios([...ejercicios, { name: '', sets: '', reps: '', weight: '', rest: '', exercise_notes: '', video_url: '', image_path: '' }]);
  };

  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...ejercicios];
    updated[index] = { ...updated[index], [field]: value };
    setEjercicios(updated);
  };

  const removeExercise = (index: number) => {
    const updated = ejercicios.filter((_, i) => i !== index);
    setEjercicios(updated);
  };

  // --- GUARDADO FINAL ---
  const handleSave = async () => {
    if (!titulo || !fecha) {
      Alert.alert('Error', 'Por favor, completa el título y la fecha.');
      return;
    }

    const ejerciciosLimpios = ejercicios.filter(e => e.name.trim() !== '');
    if (ejerciciosLimpios.length === 0) {
      Alert.alert('Error', 'Añade al menos un ejercicio con nombre.');
      return;
    }

    setSaving(true);
    try {
      await api.createWorkout({
        title: titulo,
        date: fecha,
        exercises: ejerciciosLimpios,
        notes: notas,
        athlete_id: params.athlete_id,
        microciclo_id: selectedMicroId 
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Hubo un problema al guardar el entrenamiento.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportCSV = () => {
    Alert.alert('Importar CSV', 'La función de importar desde Excel/CSV está en desarrollo y se conectará en el próximo bloque. 🚀');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nuevo Entrenamiento</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.saveText, { color: colors.primary }]}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          
          {/* BOTÓN CSV */}
          <TouchableOpacity 
            style={[styles.csvBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
            onPress={handleImportCSV}
          >
             <Ionicons name="document-text-outline" size={20} color={colors.primary} />
             <Text style={{ color: colors.primary, fontWeight: '800', letterSpacing: 0.5 }}>IMPORTAR DESDE CSV</Text>
          </TouchableOpacity>

          {/* DATOS BÁSICOS */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TÍTULO DEL ENTRENAMIENTO</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}
              placeholder="Ej: Torso Fuerza Máxima"
              placeholderTextColor={colors.textSecondary}
              value={titulo}
              onChangeText={setTitulo}
            />

            <View style={{ marginTop: 16 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textSecondary}
                value={fecha}
                onChangeText={setFecha}
              />
            </View>

            {/* SELECTOR DE MICROCICLO */}
            <View style={{ marginTop: 24, marginBottom: 8 }}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>ASIGNAR A SEMANA (MICROCICLO)</Text>
              
              {microciclosDisponibles.length === 0 ? (
                <Text style={{ fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 }}>
                  No hay microciclos creados en el calendario.
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
          </View>

          {/* EJERCICIOS */}
          <View style={[styles.section, { marginTop: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ejercicios</Text>
            </View>

            {ejercicios.map((ej, index) => (
              <View key={index} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontWeight: '800', color: colors.textPrimary, fontSize: 16 }}>#{index + 1}</Text>
                  {ejercicios.length > 1 && (
                    <TouchableOpacity onPress={() => removeExercise(index)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Nombre */}
                <TextInput
                  style={[styles.input, { marginBottom: 10, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Nombre del Ejercicio (Ej: Sentadilla)"
                  placeholderTextColor={colors.textSecondary}
                  value={ej.name}
                  onChangeText={(t) => updateExercise(index, 'name', t)}
                />

                {/* Grid Detalles */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Series</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: 4" placeholderTextColor={colors.textSecondary} value={ej.sets} onChangeText={(t) => updateExercise(index, 'sets', t)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
