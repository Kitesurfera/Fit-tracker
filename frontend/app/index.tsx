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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/hooks/useTheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api';

// --- IMPORTACIONES PARA GOOGLE OAUTH ---
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

// Cierra la sesión del navegador web de Expo si se queda pillada
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  // ⚠️ Asegúrate de tener una función en AuthContext que acepte el token directamente
  // Por ejemplo: loginWithToken(token, user)
  const { user, loading, login, register, loginWithToken } = useAuth() as any; 
  const router = useRouter();
  const { colors } = useTheme();

  const [isLogin, useState_isLogin] = useState(true);
  const isLoginValue = isLogin;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // --- CONFIGURACIÓN DE GOOGLE OAUTH ---
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: '351214985492-nn6efvp8hi5vnqrnk65g6qs1j0qma28e.apps.googleusercontent.com',
    androidClientId: '351214985492-ahg14f57mak2mcj47q6jucsvcieu4dq9.apps.googleusercontent.com',
  });

  // Escucha la respuesta del navegador de Google
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (id_token) {
        handleGoogleLoginToBackend(id_token);
      }
    } else if (response?.type === 'error') {
      setError("No se pudo completar el inicio de sesión con Google.");
    }
  }, [response]);

  const handleGoogleLoginToBackend = async (idToken: string) => {
    setIsGoogleLoading(true);
    setError('');
    try {
      // Si está en modo registro, pedimos rol de trainer, si no, atleta
      const role = isLoginValue ? 'athlete' : 'trainer';
      const data = await api.googleLogin(idToken, role);
      
      // Guardamos la sesión (necesitarás este método en tu AuthContext)
      if (loginWithToken) {
        await loginWithToken(data.token, data.user);
      } else {
        throw new Error("Falta configurar loginWithToken en AuthContext");
      }
    } catch (e: any) {
      setError(e.message || 'Error al conectar con Google');
    } finally {
      setIsGoogleLoading(false);
    }
  };

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
    if (!email || !password || (!isLoginValue && !name)) {
      setError('Completa todos los campos');
      return;
    }
    setSubmitting(true);
    try {
      if (isLoginValue) {
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
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled"
        >
          {/* SECCIÓN DEL LOGO Y NOMBRE APP */}
          <View style={styles.header}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logo}
            />
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>AM COACHING</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              {isLoginValue ? 'GESTIÓN DE ALTO RENDIMIENTO' : 'REGISTRO DE ENTRENADOR'}
            </Text>
          </View>

          <View style={styles.form}>
            {!isLoginValue && (
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
                placeholder="atleta@amcoaching.com"
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
              disabled={submitting || isGoogleLoading}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.mainBtnText}>
                  {isLoginValue ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}
                </Text>
              )}
            </TouchableOpacity>

            {/* --- SEPARADOR GOOGLE --- */}
            <View style={styles.dividerContainer}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>O continúa con</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* --- BOTÓN DE GOOGLE --- */}
            <TouchableOpacity 
              style={[styles.googleBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
              onPress={() => promptAsync()}
              disabled={!request || submitting || isGoogleLoading}
              activeOpacity={0.8}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color={colors.textPrimary} />
                  <Text style={[styles.googleBtnText, { color: colors.textPrimary }]}>
                    Google
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { useState_isLogin(!isLoginValue); setError(''); }}
              style={styles.toggleBtn}
            >
              <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
                {isLoginValue ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
                <Text style={{ color: colors.primary, fontWeight: '800' }}>
                  {isLoginValue ? 'Regístrate' : 'Inicia sesión'}
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
  logo: {
    width: 140, 
    height: 140, 
    marginBottom: 15,
    resizeMode: 'contain',
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
  
  // Nuevos estilos para Google Auth
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 16, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  googleBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 10, 
    paddingVertical: 16, 
    borderRadius: 15, 
    borderWidth: 1 
  },
  googleBtnText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  
  toggleBtn: { alignItems: 'center', paddingVertical: 20 },
  toggleText: { fontSize: 14 },
});
