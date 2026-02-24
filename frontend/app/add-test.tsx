import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const STRENGTH_TESTS = [
  { key: 'squat_rm', label: 'Sentadilla RM', unit: 'kg' },
  { key: 'bench_rm', label: 'Press Banca RM', unit: 'kg' },
  { key: 'deadlift_rm', label: 'Peso Muerto RM', unit: 'kg' },
];

const PLYO_TESTS = [
  { key: 'cmj', label: 'CMJ', unit: 'cm' },
  { key: 'sj', label: 'SJ', unit: 'cm' },
  { key: 'dj', label: 'DJ', unit: 'cm' },
];

export default function AddTestScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<string>('');
  const [testType, setTestType] = useState<'strength' | 'plyometrics'>('strength');
  const [selectedTest, setSelectedTest] = useState('');
  const [customName, setCustomName] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('kg');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.role === 'trainer') {
      api.getAthletes().then(setAthletes).catch(console.log);
    } else {
      setSelectedAthlete(user?.id || '');
    }
  }, []);

  const currentTests = testType === 'strength' ? STRENGTH_TESTS : PLYO_TESTS;

  const handleSelectTest = (key: string, u: string) => {
    setSelectedTest(key);
    setUnit(u);
  };

  const handleSubmit = async () => {
    setError('');
    const athleteId = user?.role === 'athlete' ? user?.id : selectedAthlete;
    if (!athleteId || !selectedTest || !value || !date) {
      setError('Completa todos los campos obligatorios');
      return;
    }
    if (selectedTest === 'custom' && !customName) {
      setError('Introduce el nombre del test personalizado');
      return;
    }
    setSubmitting(true);
    try {
      await api.createTest({
        athlete_id: athleteId,
        test_type: testType,
        test_name: selectedTest,
        custom_name: selectedTest === 'custom' ? customName : '',
        value: parseFloat(value),
        unit,
        date,
        notes,
      });
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="close-add-test" activeOpacity={0.7}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nuevo Test</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Athlete selector (trainer only) */}
          {user?.role === 'trainer' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>DEPORTISTA *</Text>
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
          )}

          {/* Test Type */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TIPO DE TEST *</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[
                  styles.typeChip,
                  { borderColor: colors.border },
                  testType === 'strength' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => { setTestType('strength'); setSelectedTest(''); setUnit('kg'); }}
                activeOpacity={0.7}
              >
                <Ionicons name="barbell-outline" size={18} color={testType === 'strength' ? '#FFF' : colors.textPrimary} />
                <Text style={[styles.typeText, { color: testType === 'strength' ? '#FFF' : colors.textPrimary }]}>Fuerza</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeChip,
                  { borderColor: colors.border },
                  testType === 'plyometrics' && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => { setTestType('plyometrics'); setSelectedTest(''); setUnit('cm'); }}
                activeOpacity={0.7}
              >
                <Ionicons name="flash-outline" size={18} color={testType === 'plyometrics' ? '#FFF' : colors.textPrimary} />
                <Text style={[styles.typeText, { color: testType === 'plyometrics' ? '#FFF' : colors.textPrimary }]}>Pliometria</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Test Selection */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TEST *</Text>
            <View style={styles.testGrid}>
              {currentTests.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.testOption,
                    { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                    selectedTest === t.key && { backgroundColor: colors.primary + '20', borderColor: colors.primary },
                  ]}
                  onPress={() => handleSelectTest(t.key, t.unit)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.testOptionText,
                    { color: colors.textPrimary },
                    selectedTest === t.key && { color: colors.primary, fontWeight: '700' },
                  ]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.testOption,
                  { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                  selectedTest === 'custom' && { backgroundColor: colors.warning + '20', borderColor: colors.warning },
                ]}
                onPress={() => handleSelectTest('custom', unit)}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={16} color={selectedTest === 'custom' ? colors.warning : colors.textSecondary} />
                <Text style={[
                  styles.testOptionText,
                  { color: colors.textPrimary },
                  selectedTest === 'custom' && { color: colors.warning, fontWeight: '700' },
                ]}>Personalizado</Text>
              </TouchableOpacity>
            </View>
          </View>

          {selectedTest === 'custom' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE DEL TEST *</Text>
              <TextInput
                testID="custom-test-name-input"
                style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={customName} onChangeText={setCustomName}
                placeholder="Ej: Salto horizontal" placeholderTextColor={colors.textSecondary}
              />
            </View>
          )}

          <View style={styles.valueRow}>
            <View style={[styles.inputGroup, { flex: 2 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>VALOR *</Text>
              <TextInput
                testID="test-value-input"
                style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={value} onChangeText={setValue} placeholder="0"
                placeholderTextColor={colors.textSecondary} keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>UNIDAD</Text>
              <TextInput
                testID="test-unit-input"
                style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={unit} onChangeText={setUnit} placeholder="kg/cm"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA *</Text>
            <TextInput
              testID="test-date-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOTAS</Text>
            <TextInput
              testID="test-notes-input"
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
            testID="create-test-submit"
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleSubmit} disabled={submitting} activeOpacity={0.7}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.submitText}>REGISTRAR TEST</Text>
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
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  chipText: { fontSize: 14, fontWeight: '500' },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1,
  },
  typeText: { fontSize: 15, fontWeight: '600' },
  testGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  testOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  testOptionText: { fontSize: 14 },
  valueRow: { flexDirection: 'row', gap: 12 },
  errorBox: { borderRadius: 8, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  submitBtn: { borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
});
