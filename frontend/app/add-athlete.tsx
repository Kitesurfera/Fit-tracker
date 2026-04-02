import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Alert, Linking
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
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Femenino');
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const notifyAthlete = (method: 'whatsapp' | 'email') => {
    const loginUrl = "https://fit-tracker-azure-iota.vercel.app/";
    const text = `¡Hola ${name}! He creado tu perfil de entrenamiento en Fit Tracker. Puedes iniciar sesión aquí: ${loginUrl}\n\nTu Email: ${email}\nTu Contraseña: ${password}`;

    if (method === 'whatsapp' && phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`);
    } else if (method === 'email') {
      Linking.openURL(`mailto:${email}?subject=${encodeURIComponent("Tu acceso a Fit Tracker")}&body=${encodeURIComponent(text)}`);
    }
    router.back();
  };

  const handleCreate = async () => {
    setError('');
    if (!name || !email || !password) {
      setError('Nombre, email y contraseña son obligatorios');
      return;
    }
    setSubmitting(true);
    try {
      await api.createAthlete({ name, email, password, sport, phone, gender });
      
      if (Platform.OS === 'web') {
        const wantsToNotify = window.confirm("Deportista creado con éxito. ¿Quieres avisarle por email/WhatsApp con sus claves?");
        if (wantsToNotify) {
          if (phone) notifyAthlete('whatsapp');
          else notifyAthlete('email');
        } else {
          router.back();
        }
      } else {
        const buttons: any[] = [
          { text: "No, volver", style: "cancel", onPress: () => router.back() },
          { text: "Por Email", onPress: () => notifyAthlete('email') }
        ];

        if (phone) {
          buttons.push({ text: "Por WhatsApp", onPress: () => notifyAthlete('whatsapp') });
        }

        Alert.alert(
          "¡Deportista Creado!",
          "¿Quieres enviarle un mensaje automático con el enlace de la app y sus claves de acceso?",
          buttons
        );
      }
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
              El deportista podrá iniciar sesión con el email y contraseña que definas aquí.
            </Text>
          </View>

          <InputField label="Nombre" value={name} onChangeText={setName}
            placeholder="Nombre completo" testID="athlete-name-input" required autoCapitalize="words" />
          <InputField label="Email" value={email} onChangeText={setEmail}
            placeholder="email@ejemplo.com" testID="athlete-email-input" required
            keyboardType="email-address" autoCapitalize="none" />
          <InputField label="Contraseña" value={password} onChangeText={setPassword}
            placeholder="Min. 4 caracteres" testID="athlete-password-input" required secureTextEntry />

          <InputField label="Deporte" value={sport} onChangeText={setSport}
            placeholder="Ej: Kitesurf Freestyle" testID="athlete-sport-input" />

          <InputField label="Teléfono (WhatsApp)" value={phone} onChangeText={setPhone}
            placeholder="Ej: +34 600 000 000" testID="athlete-phone-input" keyboardType="phone-pad" />

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Género</Text>
            <View style={styles.genderRow}>
              {['Masculino', 'Femenino'].map(g => (
                <TouchableOpacity 
                  key={g} 
                  style={[styles.genderBtn, { borderColor: colors.border }, gender === g && { backgroundColor: colors.primary, borderColor: colors.primary }]} 
                  onPress={() => setGender(g)}
                >
                  <Text style={{ color: gender === g ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{g}</Text>
                </TouchableOpacity>
              ))}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  headerBtn: { width: 32 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  form: { padding: 20, gap: 16, paddingBottom: 48 },
  field: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10 },
  infoText: { fontSize: 14, flex: 1, lineHeight: 20 },
  errorBox: { borderRadius: 10, padding: 12 },
  errorText: { fontSize: 14, textAlign: 'center' },
  submitBtn: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  genderRow: { flexDirection: 'row', gap: 10 },
  genderBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 }
});
