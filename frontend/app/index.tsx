import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/hooks/useTheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();

  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) {
      router.replace('/home');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (user) return null;

  const handleSubmit = async () => {
    setError('');
    if (!email || !password || (!isLogin && !name)) {
      setError('Completa todos los campos');
      return;
    }
    setSubmitting(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        // Por defecto, el registro desde aquí es para 'trainer'
        await register(name, email, password);
      }
    } catch (e: any) {
      setError(e.message || 'Error inesperado');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled"
        >
          {/* SECCIÓN DEL LOGO Y NOMBRE APP */}
          <View style={styles.header}>
            <View style={[styles.logoBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="fitness" size={40} color="#FFFFFF" />
            </View>
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>FIT TRACKER</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              {isLogin ? 'GESTIÓN DE ALTO RENDIMIENTO' : 'REGISTRO DE ENTRENADOR'}
            </Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Tu nombre completo"
                  placeholderTextColor="#888"
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>EMAIL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                value={email}
                onChangeText={setEmail}
                placeholder="atleta@fittracker.com"
                placeholderTextColor="#888"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>PASSWORD</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={[styles.input, styles.passwordInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="********"
                  placeholderTextColor="#888"
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity 
                  style={styles.eyeBtn} 
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons 
                    name={showPassword ? "eye-off-outline" : "eye-outline"} 
                    size={22} 
                    color={colors.textSecondary} 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {error ? (
              <View style={[styles.errorContainer, { backgroundColor: colors.error + '15' }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.mainBtn, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.mainBtnText}>
                  {isLogin ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setIsLogin(!isLogin); setError(''); }}
              style={styles.toggleBtn}
            >
              <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
                {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
                <Text style={{ color: colors.primary, fontWeight: '800' }}>
                  {isLogin ? 'Regístrate' : 'Inicia sesión'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 25 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  brandTitle: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
  tagline: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 5 },
  form: { gap: 15 },
  inputGroup: { gap: 6 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  eyeBtn: {
    position: 'absolute',
    right: 15,
  },
  errorContainer: { padding: 12, borderRadius: 10 },
  errorText: { textAlign: 'center', fontSize: 13, fontWeight: '600' },
  mainBtn: {
    borderRadius: 15,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  mainBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  toggleBtn: { alignItems: 'center', paddingVertical: 20 },
  toggleText: { fontSize: 14 },
});
