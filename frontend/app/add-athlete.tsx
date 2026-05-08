import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
  Alert, Linking, Switch
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const SPORT_ICONS = [
  { id: 'kite', icon: 'kitesurfing', lib: 'MaterialCommunityIcons' },
  { id: 'football', icon: 'football', lib: 'Ionicons' },
  { id: 'volleyball', icon: 'volleyball', lib: 'MaterialCommunityIcons' },
  { id: 'tennis', icon: 'tennisball', lib: 'Ionicons' },
  { id: 'gym', icon: 'barbell', lib: 'Ionicons' },
  { id: 'surf', icon: 'surfing', lib: 'MaterialCommunityIcons' },
  { id: 'bike', icon: 'bicycle', lib: 'Ionicons' },
];

export default function AddAthleteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sport, setSport] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Femenino');
  
  // Nuevos campos para el icono de deporte
  const [hasExtraSport, setHasExtraSport] = useState(false);
  const [selectedSportIcon, setSelectedSportIcon] = useState('kite');

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
      await api.createAthlete({ 
        name, email, password, sport, phone, gender,
        has_extra_sport: hasExtraSport,
        sport_icon: selectedSportIcon 
      });
      
      if (Platform.OS === 'web') {
        const wantsToNotify = window.confirm("Deportista creado con éxito. ¿Quieres avisarle?");
        if (wantsToNotify) {
          if (phone) notifyAthlete('whatsapp');
          else notifyAthlete('email');
        } else { router.back(); }
      } else {
        Alert.alert("¡Deportista Creado!", "¿Avisar al deportista?", [
          { text: "No", style: "cancel", onPress: () => router.back() },
          { text: "WhatsApp", onPress: () => notifyAthlete('whatsapp') },
          { text: "Email", onPress: () => notifyAthlete('email') }
        ]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Nuevo Deportista</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.form}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Nombre</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]} value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor={colors.textSecondary} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]} value={email} onChangeText={setEmail} placeholder="email@ejemplo.com" autoCapitalize="none" />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Contraseña</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]} value={password} onChangeText={setPassword} secureTextEntry placeholder="Mín. 4 caracteres" />
          </View>

          {/* SECCIÓN DE DEPORTE ESPECÍFICO */}
          <View style={[styles.sportToggleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, pr: 10 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Deporte / Competición</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Permite al atleta registrar sesiones técnicas.</Text>
              </View>
              <Switch value={hasExtraSport} onValueChange={setHasExtraSport} trackColor={{ false: colors.border, true: colors.primary }} />
            </View>

            {hasExtraSport && (
              <View style={{ marginTop: 15 }}>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 10 }]}>Icono para el calendario</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                  {SPORT_ICONS.map((item) => (
                    <TouchableOpacity 
                      key={item.id} 
                      onPress={() => setSelectedSportIcon(item.id)}
                      style={[
                        styles.iconCircle, 
                        { borderColor: colors.border },
                        selectedSportIcon === item.id && { backgroundColor: colors.primary, borderColor: colors.primary }
                      ]}
                    >
                      {item.lib === 'Ionicons' ? (
                        <Ionicons name={item.icon as any} size={20} color={selectedSportIcon === item.id ? '#FFF' : colors.textPrimary} />
                      ) : (
                        <MaterialCommunityIcons name={item.icon as any} size={20} color={selectedSportIcon === item.id ? '#FFF' : colors.textPrimary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleCreate} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Crear deportista</Text>}
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
  sportToggleCard: { padding: 16, borderRadius: 15, borderWidth: 1, marginTop: 10 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  submitBtn: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '600' }
});
