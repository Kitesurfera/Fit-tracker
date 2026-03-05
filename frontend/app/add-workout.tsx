import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function AddWorkoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();

  // --- ESTADOS ORIGINALES DEL ENTRENAMIENTO ---
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [notas, setNotas] = useState('');
  const [ejercicios, setEjercicios] = useState([{ name: '', sets: '', reps: '', weight: '', rest: '', exercise_notes: '', video_url: '' }]);
  const [saving, setSaving] = useState(false);

  // --- NUEVOS ESTADOS PARA PERIODIZACIÓN ---
  const [microciclosDisponibles, setMicrociclosDisponibles] = useState<any[]>([]);
  const [selectedMicroId, setSelectedMicroId] = useState<string | null>(null);

  // --- CARGAR MICROCICLOS DEL DEPORTISTA ---
  const loadMicrociclos = async () => {
    try {
      if (!params.athlete_id) return;
      const tree = await api.getPeriodizationTree(params.athlete_id);
      
      // Extraemos todos los microciclos de dentro de los macrociclos
      const todosLosMicros = tree.flatMap((macro: any) => macro.microciclos || []);
      
      // Los ordenamos por fecha de inicio para que aparezcan lógicos
      todosLosMicros.sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
      
      setMicrociclosDisponibles(todosLosMicros);
    } catch (error) {
      console.log("Error cargando microciclos para el selector:", error);
    }
  };

  useEffect(() => {
    loadMicrociclos();
  }, [params.athlete_id]);

  // --- MANEJO DE EJERCICIOS ---
  const addExercise = () => {
    setEjercicios([...ejercicios, { name: '', sets: '', reps: '', weight: '', rest: '', exercise_notes: '', video_url: '' }]);
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

    // Limpiamos ejercicios vacíos
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
        microciclo_id: selectedMicroId // <-- AQUÍ ENLAZAMOS CON EL CALENDARIO
      });
      Alert.alert('Éxito', 'Entrenamiento creado correctamente', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert('Error', 'Hubo un problema al guardar el entrenamiento.');
    } finally {
      setSaving(false);
    }
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

            {/* --- SELECTOR DE MICROCICLO (NUEVO) --- */}
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
            {/* --- FIN SELECTOR MICROCICLO --- */}

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

                <TextInput
                  style={[styles.input, { marginBottom: 10, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Nombre del Ejercicio (Ej: Sentadilla)"
                  placeholderTextColor={colors.textSecondary}
                  value={ej.name}
                  onChangeText={(t) => updateExercise(index, 'name', t)}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Series</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: 4" placeholderTextColor={colors.textSecondary} value={ej.sets} onChangeText={(t) => updateExercise(index, 'sets', t)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Reps</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: 8-10" placeholderTextColor={colors.textSecondary} value={ej.reps} onChangeText={(t) => updateExercise(index, 'reps', t)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Descanso</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: 90s" placeholderTextColor={colors.textSecondary} value={ej.rest} onChangeText={(t) => updateExercise(index, 'rest', t)} />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary, borderStyle: 'dashed' }]} onPress={addExercise}>
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700', marginLeft: 8 }}>AÑADIR EJERCICIO</Text>
            </TouchableOpacity>
          </View>

          {/* NOTAS GENERALES */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTAS DEL ENTRENAMIENTO</Text>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}
              placeholder="Instrucciones generales para la sesión..."
              placeholderTextColor={colors.textSecondary}
              multiline
              value={notas}
              onChangeText={setNotas}
            />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  saveText: { fontSize: 16, fontWeight: '800' },
  content: { padding: 16 },
  
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  smallLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, letterSpacing: 0.5 },
  
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 15 },
  textArea: { height: 100, textAlignVertical: 'top' },
  
  microChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  
  exerciseCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 2, borderRadius: 12, marginTop: 8 }
});
