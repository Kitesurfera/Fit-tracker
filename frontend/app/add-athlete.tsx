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

  const InputField = ({ label, value, onChangeText, placeholder, testID, required, ...props }: any) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}{required ? '' : ' (opcional)'}
      </Text>
      <TextInput
        testID={testID}
        style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        {...props}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} testID="close-add-athlete" activeOpacity={0.7} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nuevo Deportista</Text>
          <View style={styles.headerBtn} />
        </View>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={[styles.infoBox, { backgroundColor: colors.primary + '10' }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              El deportista podra iniciar sesion con el email y contraseña que definas aqui.
            </Text>
          </View>

          <InputField label="Nombre" value={name} onChangeText={setName}
            placeholder="Nombre completo" testID="athlete-name-input" required autoCapitalize="words" />
          <InputField label="Email" value={email} onChangeText={setEmail}
            placeholder="email@ejemplo.com" testID="athlete-email-input" required
            keyboardType="email-address" autoCapitalize="none" />
          <InputField label="Contraseña" value={password} onChangeText={setPassword}
            placeholder="Min. 4 caracteres" testID="athlete-password-input" required secureTextEntry />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <InputField label="Deporte" value={sport} onChangeText={setSport}
                placeholder="Ej: Futbol" testID="athlete-sport-input" />
            </View>
            <View style={{ flex: 1 }}>
              <InputField label="Posicion" value={position} onChangeText={setPosition}
                placeholder="Ej: Portero" testID="athlete-position-input" />
            </View>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '12' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            testID="create-athlete-submit"
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleCreate} disabled={submitting} activeOpacity={0.7}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.submitText}>Crear deportista</Text>
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
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  headerBtn: { width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  form: { padding: 20, gap: 16, paddingBottom: 48 },
  field: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1 },
  row: { flexDirection: 'row', gap: 12 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10 },
  infoText: { fontSize: 14, flex: 1, lineHeight: 20 },
  errorBox: { borderRadius: 10, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  submitBtn: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
