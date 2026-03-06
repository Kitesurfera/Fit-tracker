import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView
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
  const [showPassword, setShowPassword] = useState(false); // Mejora sorpresa
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    React.useEffect(() => {
  // Si ya no está cargando y hay un usuario, muévelo a la Home
  if (!loading && user) {
    console.log("Usuario detectado, redirigiendo...");
    // Intentamos ir a home. Si falla la ruta, Expo Router nos avisará
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* SECCIÓN DE LOGO Y NOMBRE */}
          <View style={styles.header}>
            <View style={[styles.logoWrapper, { backgroundColor: colors.primary }]}>
              <View style={styles.logoInner}>
                <Ionicons name="fitness" size={42} color="#FFFFFF" />
              </View>
            </View>
            <Text style={[styles.brandName, { color: colors.textPrimary }]}>FIT TRACKER</Text>
            <View style={[styles.taglineBadge, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.taglineText, { color: colors.primary }]}>PREPARACIÓN FÍSICA</Text>
            </View>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE COMPLETO</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Ej. Claudia ..."
                  placeholderTextColor={colors.textSecondary}
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
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>CONTRASEÑA</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[styles.input, styles.passwordInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity 
                  style={styles.eyeIcon} 
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
              <View style={[styles.errorBox, { backgroundColor: colors.error + '15' }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.mainButton, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.mainButtonText}>
                  {isLogin ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setIsLogin(!isLogin); setError(''); }}
              style={styles.toggleBtn}
              activeOpacity={0.6}
            >
              <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
                {isLogin ? '¿No tienes cuenta? ' : '¿Ya eres miembro? '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {isLogin ? 'Regístrate aquí' : 'Inicia sesión'}
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoWrapper: {
    width: 84,
    height: 84,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    // Sombra para iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    // Sombra para Android
    elevation: 8,
  },
  logoInner: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  brandName: { 
    fontSize: 32, 
    fontWeight: '900', 
    letterSpacing: 3,
    textAlign: 'center'
  },
  taglineBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  taglineText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  form: { gap: 18 },
  inputGroup: { gap: 6 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    height: '100%',
    justifyContent: 'center',
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
  },
  errorBox: { borderRadius: 12, padding: 14 },
  errorText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  mainButton: {
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
    elevation: 4,
  },
  mainButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  toggleBtn: { alignItems: 'center', paddingVertical: 20 },
  toggleText: { fontSize: 14 },
});
