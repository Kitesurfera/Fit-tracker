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
  const [selectedMicroId, setSelectedMicroId] = useState<string | null>(params.microciclo_id || null);

  // --- ESTADOS PARA IMÁGENES y CSV ---
  const [imageUploading, setImageUploading] = useState<number | null>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<number, string>>({});
  const [csvLoading, setCsvLoading] = useState(false);
  const [showCsvFormat, setShowCsvFormat] = useState(false);

  // --- CARGAR MICROCICLOS ---
  const loadMicrociclos = async () => {
    try {
      if (!params.athlete_id) return;
      const tree = await api.getPeriodizationTree(params.athlete_id);
      const todosLosMicros = tree.flatMap((macro: any) => macro.microciclos || []);
      todosLosMicros.sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime());
      setMicrociclosDisponibles(todosLosMicros);
    } catch (error) {
      console.log("Error cargando microciclos:", error);
    }
  };

  useEffect(() => { loadMicrociclos(); }, [params.athlete_id]);

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

  // --- MANEJO DE CSV (TRUCO NATIVO PARA WEB SIN DEPENDENCIAS) ---
  const handleImportCSV = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Aviso', 'La importación de CSV actualmente está optimizada para la versión Web.');
      return;
    }

    // Creamos un input de archivo invisible en el navegador
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv, text/csv';
    
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setCsvLoading(true);
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const csvText = event.target?.result as string;
        procesarTextoCSV(csvText);
      };
      
      reader.onerror = () => {
        Alert.alert('Error', 'No se pudo leer el archivo.');
        setCsvLoading(false);
      };

      reader.readAsText(file);
    };

    // Simulamos un click para abrir el explorador de archivos
    input.click();
  };

  const procesarTextoCSV = (csvText: string) => {
    try {
      // Separar por líneas (soportando saltos de línea de Windows y Mac/Linux)
      const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) {
        Alert.alert('Error', 'El archivo CSV parece estar vacío o no tiene ejercicios.');
        setCsvLoading(false);
        return;
      }

      // Mapear líneas a ejercicios (saltando la cabecera en la línea 0)
      const newExercises = lines.slice(1).map(line => {
        const separator = line.includes(';') ? ';' : ',';
        const columns = line.split(separator).map(item => item?.trim().replace(/^"|"$/g, '') || '');
        
        return {
          name: columns[0] || '',
          sets: columns[1] || '',
          reps: columns[2] || '',
          weight: columns[3] || '',
          rest: columns[4] || '',
          exercise_notes: columns[5] || '',
          video_url: columns[6] || '',
          image_path: ''
        };
      });

      const validExercises = newExercises.filter(ex => ex.name !== '');
      
      if (validExercises.length > 0) {
        setEjercicios(validExercises);
        Alert.alert('Éxito', `Se han importado ${validExercises.length} ejercicios.`);
      } else {
        Alert.alert('Aviso', 'No se detectaron ejercicios válidos en el archivo.');
      }
    } catch (error) {
      Alert.alert('Error', 'El formato del CSV no es válido.');
    } finally {
      setCsvLoading(false);
    }
  };

  // --- MANEJO DE EJERCICIOS ---
  const addExercise = () => setEjercicios([...ejercicios, { name: '', sets: '', reps: '', weight: '', rest: '', exercise_notes: '', video_url: '', image_path: '' }]);
  
  const updateExercise = (index: number, field: string, value: string) => {
    const updated = [...ejercicios];
    updated[index] = { ...updated[index], [field]: value };
    setEjercicios(updated);
  };
  
  const removeExercise = (index: number) => setEjercicios(ejercicios.filter((_, i) => i !== index));

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
          
          {/* SECCIÓN CSV */}
          <View style={styles.csvSection}>
            <TouchableOpacity 
              style={[styles.csvBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
              onPress={handleImportCSV}
              disabled={csvLoading}
            >
              {csvLoading ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="document-text-outline" size={20} color={colors.primary} />}
              <Text style={{ color: colors.primary, fontWeight: '800', letterSpacing: 0.5 }}>
                {csvLoading ? 'IMPORTANDO...' : 'IMPORTAR DESDE CSV'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setShowCsvFormat(!showCsvFormat)} style={{ alignSelf: 'center', marginBottom: showCsvFormat ? 10 : 24 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, textDecorationLine: 'underline' }}>
                {showCsvFormat ? 'Ocultar formato CSV' : '¿Cómo debe ser el archivo CSV?'}
              </Text>
            </TouchableOpacity>

            {showCsvFormat && (
              <View style={[styles.csvFormatBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>1. Crea un Excel con estas columnas (en este orden):</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 10, backgroundColor: 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 6 }}>
                  Nombre, Series, Reps, Kilos, Descanso, Notas, URL Video
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>2. Ejemplo de fila:</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 10, backgroundColor: 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 6 }}>
                  Sentadilla, 4, 8-10, 60, 90s, Bajar lento, https://...
                </Text>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>3. Guárdalo como "CSV delimitado por comas" y súbelo.</Text>
              </View>
            )}
          </View>

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
                    <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Reps</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: 8-10" placeholderTextColor={colors.textSecondary} value={ej.reps} onChangeText={(t) => updateExercise(index, 'reps', t)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>Descanso</Text>
                    <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: 90s" placeholderTextColor={colors.textSecondary} value={ej.rest} onChangeText={(t) => updateExercise(index, 'rest', t)} />
                  </View>
                </View>

                {/* Extras: URL, Notas e Imagen */}
                <View style={[styles.extrasContainer, { borderTopColor: colors.border }]}>
                  <View style={styles.extraRow}>
                    <Ionicons name="videocam-outline" size={16} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.extraInput, { color: colors.textPrimary }]}
                      placeholder="URL de video (YouTube, Drive...)"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      keyboardType="url"
                      value={ej.video_url}
                      onChangeText={(t) => updateExercise(index, 'video_url', t)}
                    />
                  </View>
                  
                  <View style={styles.extraRow}>
                    <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
                    <TextInput
                      style={[styles.extraInput, { color: colors.textPrimary }]}
                      placeholder="Observaciones de la técnica..."
                      placeholderTextColor={colors.textSecondary}
                      value={ej.exercise_notes}
                      onChangeText={(t) => updateExercise(index, 'exercise_notes', t)}
                    />
                  </View>

                  <View style={styles.extraRow}>
                    {imagePreviews[index] || ej.image_path ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Image source={{ uri: imagePreviews[index] || ej.image_path }} style={{ width: 40, height: 40, borderRadius: 6 }} />
                        <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>Imagen adjunta</Text>
                        <TouchableOpacity onPress={() => {
                          updateExercise(index, 'image_path', '');
                          setImagePreviews(prev => { const n = {...prev}; delete n[index]; return n; });
                        }}>
                          <Ionicons name="close-circle" size={20} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
                        onPress={() => pickExerciseImage(index)}
                        disabled={imageUploading === index}
                      >
                        {imageUploading === index ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="camera-outline" size={18} color={colors.primary} />}
                        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                          {imageUploading === index ? 'Subiendo...' : 'Añadir imagen/dibujo'}
                        </Text>
                      </TouchableOpacity>
                    )}
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
  
  csvSection: { marginBottom: 10 },
  csvBtn: { padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 10, borderWidth: 1 },
  csvFormatBox: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 24 },
  
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  smallLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4, letterSpacing: 0.5 },
  
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 15 },
  textArea: { height: 100, textAlignVertical: 'top' },
  
  microChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  
  exerciseCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 2, borderRadius: 12, marginTop: 8 },
  
  extrasContainer: { borderTopWidth: 0.5, paddingTop: 8, gap: 4 },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  extraInput: { flex: 1, fontSize: 14 }
});
