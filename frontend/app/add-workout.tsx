import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert, Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

type TabMode = 'manual' | 'csv';

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
  const [mode, setMode] = useState<TabMode>('manual');

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
        const res = await api.uploadCSV(selectedAthlete, file.uri, file.name);
        Alert.alert(
          'CSV importado',
          `Se han creado ${res.count} entrenamiento(s) correctamente`,
        );
        router.back();
      }
    } catch (e: any) {
      setError(e.message || 'Error al importar CSV');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const url = api.getCSVTemplateURL();
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} testID="close-add-workout" activeOpacity={0.7} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nuevo Entreno</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Athlete selector */}
          {athletes.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>DEPORTISTA</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {athletes.map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={[
                        styles.chip,
                        { backgroundColor: colors.surfaceHighlight },
                        selectedAthlete === a.id && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setSelectedAthlete(a.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.chipText,
                        { color: colors.textPrimary },
                        selectedAthlete === a.id && { color: '#FFF' },
                      ]}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.infoBox, { backgroundColor: colors.warning + '12' }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
              <Text style={[styles.infoText, { color: colors.warning }]}>Crea un deportista primero desde la pantalla de inicio</Text>
            </View>
          )}

          {/* Mode tabs */}
          <View style={[styles.modeTabs, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
            <TouchableOpacity
              testID="mode-manual"
              style={[styles.modeTab, mode === 'manual' && { backgroundColor: colors.surface }]}
              onPress={() => setMode('manual')}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={16} color={mode === 'manual' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.modeTabText, { color: mode === 'manual' ? colors.primary : colors.textSecondary }]}>Manual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="mode-csv"
              style={[styles.modeTab, mode === 'csv' && { backgroundColor: colors.surface }]}
              onPress={() => setMode('csv')}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={16} color={mode === 'csv' ? colors.primary : colors.textSecondary} />
              <Text style={[styles.modeTabText, { color: mode === 'csv' ? colors.primary : colors.textSecondary }]}>Importar CSV</Text>
            </TouchableOpacity>
          </View>

          {mode === 'manual' ? (
            <>
              {/* Title + Date */}
              <View style={styles.row}>
                <View style={[styles.section, { flex: 2 }]}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>TITULO</Text>
                  <TextInput
                    testID="workout-title-input"
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                    value={title} onChangeText={setTitle} placeholder="Ej: Tren inferior"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={[styles.section, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA</Text>
                  <TextInput
                    testID="workout-date-input"
                    style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                    value={date} onChangeText={setDate} placeholder="AAAA-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              </View>

              {/* Exercises */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>EJERCICIOS</Text>
                  <TouchableOpacity onPress={addExercise} testID="add-exercise-btn" activeOpacity={0.7} style={styles.addExBtn}>
                    <Ionicons name="add" size={18} color={colors.primary} />
                    <Text style={[styles.addExText, { color: colors.primary }]}>Anadir</Text>
                  </TouchableOpacity>
                </View>
                {exercises.map((ex, i) => (
                  <View key={i} style={[styles.exerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                        <TouchableOpacity onPress={() => removeExercise(i)} activeOpacity={0.7} style={styles.removeExBtn}>
                          <Ionicons name="close" size={16} color={colors.error} />
                        </TouchableOpacity>
                      )}
                    </View>
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
                  </View>
                ))}
              </View>

              {/* Notes */}
              <View style={styles.section}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>NOTAS</Text>
                <TextInput
                  testID="workout-notes-input"
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

              <TouchableOpacity
                testID="create-workout-submit"
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmit} disabled={submitting} activeOpacity={0.7}
              >
                {submitting ? <ActivityIndicator color="#FFF" /> : (
                  <Text style={styles.submitText}>Crear entrenamiento</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            /* CSV Mode */
            <View style={styles.csvSection}>
              {/* Inline template with copiable text */}
              <View style={[styles.csvTemplateCard, { backgroundColor: colors.surface }]}>
                <View style={styles.csvTemplateHeader}>
                  <View style={[styles.csvTemplateBadge, { backgroundColor: colors.primary + '12' }]}>
                    <Ionicons name="document-text" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.csvTemplateTitle, { color: colors.textPrimary }]}>Plantilla CSV</Text>
                    <Text style={[styles.csvTemplateSubtitle, { color: colors.textSecondary }]}>Copia este contenido en un archivo .csv</Text>
                  </View>
                </View>

                <View style={[styles.csvCodeBlock, { backgroundColor: colors.surfaceHighlight }]}>
                  <Text style={[styles.csvCodeText, { color: colors.primary }]} selectable>
                    {'dia,ejercicio,repeticiones,series\n2026-02-24,Sentadilla,8,4\n2026-02-24,Press banca,10,3\n2026-02-24,Peso muerto,6,4\n2026-02-25,Zancadas,12,3\n2026-02-25,Remo con barra,10,4'}
                  </Text>
                </View>

                <Text style={[styles.csvTip, { color: colors.textSecondary }]}>
                  Manten pulsado para seleccionar y copiar el texto
                </Text>
              </View>

              {/* Columns explanation */}
              <View style={[styles.csvColumnsCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.csvColumnsTitle, { color: colors.textPrimary }]}>Columnas requeridas</Text>
                {[
                  { col: 'dia', desc: 'Fecha en formato AAAA-MM-DD', example: '2026-02-24' },
                  { col: 'ejercicio', desc: 'Nombre del ejercicio', example: 'Sentadilla' },
                  { col: 'repeticiones', desc: 'Numero de repeticiones', example: '8' },
                  { col: 'series', desc: 'Numero de series', example: '4' },
                ].map((item) => (
                  <View key={item.col} style={[styles.csvColRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.csvColBadge, { backgroundColor: colors.primary + '10' }]}>
                      <Text style={[styles.csvColName, { color: colors.primary }]}>{item.col}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.csvColDesc, { color: colors.textPrimary }]}>{item.desc}</Text>
                      <Text style={[styles.csvColExample, { color: colors.textSecondary }]}>Ej: {item.example}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={[styles.csvInfoBox, { backgroundColor: colors.warning + '10' }]}>
                <Ionicons name="bulb-outline" size={18} color={colors.warning} />
                <Text style={[styles.csvInfoText, { color: colors.warning }]}>
                  Los ejercicios del mismo dia se agruparan automaticamente en un unico entrenamiento.
                </Text>
              </View>

              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.error + '12' }]}>
                  <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                </View>
              ) : null}

              {/* Upload button */}
              <TouchableOpacity
                testID="csv-upload-btn"
                style={[styles.uploadBtn, { backgroundColor: colors.primary }]}
                onPress={handleCSVUpload}
                disabled={submitting}
                activeOpacity={0.7}
              >
                {submitting ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={22} color="#FFF" />
                    <Text style={styles.uploadBtnText}>Seleccionar archivo CSV</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  headerBtn: { width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  form: { padding: 20, gap: 20, paddingBottom: 48 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24 },
  chipText: { fontSize: 14, fontWeight: '600' },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10 },
  infoText: { fontSize: 14, flex: 1 },
  // Mode tabs
  modeTabs: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1 },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  modeTabText: { fontSize: 14, fontWeight: '600' },
  // Exercise card
  addExBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addExText: { fontSize: 13, fontWeight: '600' },
  exerciseCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  exNumBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  exNum: { fontSize: 13, fontWeight: '700' },
  exNameInput: { flex: 1, fontSize: 16, fontWeight: '500' },
  removeExBtn: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  exDetailsRow: { flexDirection: 'row', borderTopWidth: 0.5 },
  exDetail: { flex: 1, alignItems: 'center', padding: 8, gap: 4 },
  exDetailLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  exDetailInput: { width: '100%', textAlign: 'center', borderRadius: 6, padding: 8, fontSize: 16, fontWeight: '600' },
  exDivider: { width: 0.5 },
  // CSV Section
  csvSection: { gap: 20 },
  csvFormatCard: { borderRadius: 12, padding: 16, borderWidth: 1, gap: 12 },
  csvFormatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  csvFormatTitle: { fontSize: 16, fontWeight: '600' },
  csvFormatDesc: { fontSize: 14, lineHeight: 20 },
  csvTable: { borderRadius: 8, overflow: 'hidden', borderWidth: 1 },
  csvRow: { flexDirection: 'row', borderBottomWidth: 0.5 },
  csvHeaderRow: { },
  csvCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, fontSize: 12, textAlign: 'center' },
  csvHeaderCell: { fontWeight: '700', fontSize: 12 },
  csvNote: { fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  templateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1.5, paddingVertical: 14,
  },
  templateBtnText: { fontSize: 15, fontWeight: '600' },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderRadius: 10, paddingVertical: 16,
  },
  uploadBtnText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  errorBox: { borderRadius: 10, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  submitBtn: { borderRadius: 10, padding: 16, alignItems: 'center' },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
