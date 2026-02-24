import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function AddAthleteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sport, setSport] = useState('');
  const [position, setPosition] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setError('');
    if (!name || !email || !password) {
      setError('Nombre, email y contraseña son obligatorios');
      return;
    }
    setSubmitting(true);
    try {
      await api.createAthlete({ name, email, password, sport, position });
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
          <TouchableOpacity onPress={() => router.back()} testID="close-add-athlete" activeOpacity={0.7}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nuevo Deportista</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE *</Text>
            <TextInput
              testID="athlete-name-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={name} onChangeText={setName} placeholder="Nombre del deportista"
              placeholderTextColor={colors.textSecondary} autoCapitalize="words"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>EMAIL *</Text>
            <TextInput
              testID="athlete-email-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={email} onChangeText={setEmail} placeholder="email@ejemplo.com"
              placeholderTextColor={colors.textSecondary} keyboardType="email-address" autoCapitalize="none"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>CONTRASEÑA *</Text>
            <TextInput
              testID="athlete-password-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={password} onChangeText={setPassword} placeholder="Contraseña"
              placeholderTextColor={colors.textSecondary} secureTextEntry
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>DEPORTE</Text>
            <TextInput
              testID="athlete-sport-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={sport} onChangeText={setSport} placeholder="Ej: Futbol, Atletismo"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>POSICION</Text>
            <TextInput
              testID="athlete-position-input"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={position} onChangeText={setPosition} placeholder="Ej: Portero, Velocista"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '15' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            testID="create-athlete-submit"
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleCreate} disabled={submitting} activeOpacity={0.7}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.submitText}>CREAR DEPORTISTA</Text>
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
  form: { padding: 16, gap: 16, paddingBottom: 32 },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  input: { borderRadius: 8, padding: 16, fontSize: 16, borderWidth: 1 },
  errorBox: { borderRadius: 8, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  submitBtn: { borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
});
