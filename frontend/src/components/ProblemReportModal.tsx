// Ajustes > Informar de un problema: formulario a pantalla completa con botón "Volver".
// Lo escrito se guarda como borrador en el dispositivo hasta que se envía (por si se cierra o no hay conexión).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Image, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../api';
import { collectDiagnostics } from '../utils/diagnostics';

const DRAFT_KEY = 'problem_report_draft';
const MIN_CHARS = 10;

const CATEGORIES = [
  { key: 'bug', label: 'Algo no funciona', icon: 'bug-outline', placeholder: 'Qué estabas haciendo, qué esperabas que pasara y qué pasó en realidad.\nEjemplo: «Al terminar el HIIT pulsé Guardar y se quedó cargando».' },
  { key: 'idea', label: 'Sugerencia', icon: 'bulb-outline', placeholder: 'Qué te gustaría que hiciera la app y en qué te ayudaría.' },
  { key: 'other', label: 'Otra cosa', icon: 'chatbubble-ellipses-outline', placeholder: 'Cuéntanos lo que necesites.' },
] as const;

const AREAS = ['Inicio', 'Calendario', 'Modo entrenamiento', 'Tests', 'Rendimiento', 'Vídeos', 'Asistente IA', 'Notificaciones', 'Ajustes', 'Otro'];

type Props = { visible: boolean; onClose: () => void; colors: any; role: 'athlete' | 'trainer'; onSent?: () => void; onOpenReports?: () => void };

export default function ProblemReportModal({ visible, onClose, colors, role, onSent, onOpenReports }: Props) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<string>('bug');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<any>(null);
  const [diag, setDiag] = useState<Record<string, any> | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const draftLoaded = useRef(false);

  // Al abrir: recupera el borrador y prepara los datos técnicos
  useEffect(() => {
    if (!visible) return;
    setError('');
    collectDiagnostics().then(setDiag).catch(() => setDiag(null));
    if (!draftLoaded.current) {
      draftLoaded.current = true;
      AsyncStorage.getItem(DRAFT_KEY).then(raw => {
        if (!raw) return;
        try {
          const d = JSON.parse(raw);
          if (d.category) setCategory(d.category);
          if (d.area) setArea(d.area);
          if (d.description) setDescription(d.description);
        } catch {}
      }).catch(() => {});
    }
  }, [visible]);

  // Guarda el borrador mientras escribe
  useEffect(() => {
    if (!draftLoaded.current || sent) return;
    const t = setTimeout(() => {
      if (description.trim() || area) AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ category, area, description })).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [category, area, description, sent]);

  const pickScreenshot = async () => {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      setShotBusy(true);
      const a = result.assets[0];
      // Más pequeña y en JPEG: se envía rápido aunque la cobertura sea mala
      const shrink = async (maxW: number, compress: number) => {
        const actions = a.width && a.width > maxW ? [{ resize: { width: maxW } }] : [];
        const r = await ImageManipulator.manipulateAsync(a.uri, actions, { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true });
        return `data:image/jpeg;base64,${r.base64}`;
      };
      let data = await shrink(1280, 0.6);
      if (data.length > 1_500_000) data = await shrink(900, 0.45);
      if (data.length > 1_500_000) throw new Error('La imagen es demasiado grande.');
      setScreenshot(data);
    } catch (e: any) {
      setError(`No se pudo añadir la captura: ${e?.message || 'error'}`);
    } finally {
      setShotBusy(false);
    }
  };

  const remaining = MIN_CHARS - description.trim().length;
  const canSend = remaining <= 0 && !sending && !shotBusy;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      const diagnostics = await collectDiagnostics().catch(() => diag || {});
      const report = await api.sendProblemReport({ category, area, description: description.trim(), screenshot, diagnostics });
      setSent(report);
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      onSent?.();
    } catch (e: any) {
      const msg = String(e?.message || '');
      setError(msg === 'NETWORK_ERROR'
        ? 'No hay conexión. Tu informe se queda guardado como borrador: envíalo cuando vuelvas a tener internet.'
        : msg === 'SERVER_ERROR' ? `El servidor ha fallado (${e?.detail || 'error'}). Tu borrador sigue guardado; inténtalo en un rato.`
        : msg || 'No se pudo enviar el informe.');
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setSent(null); setDescription(''); setArea(''); setCategory('bug'); setScreenshot(null); setError(''); setShowDiag(false);
  };

  const close = () => { if (sent) reset(); onClose(); };
  const cat = CATEGORIES.find(c => c.key === category) || CATEGORIES[0];

  const chip = (key: string, active: boolean, label: string, onPress: () => void, icon?: any) => (
    <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surfaceHighlight }]}>
      {icon && <Ionicons name={icon} size={15} color={active ? '#FFF' : colors.textSecondary} style={{ marginRight: 5 }} />}
      <Text style={{ color: active ? '#FFF' : colors.textSecondary, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver a Ajustes" onPress={close} style={[styles.backBtn, { backgroundColor: colors.surfaceHighlight }]}>
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>Volver</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>Informar de un problema</Text>
          </View>

          {sent ? (
            <ScrollView contentContainerStyle={[styles.body, styles.center]}>
              <View style={[styles.okCircle, { backgroundColor: colors.success + '20' }]}><Ionicons name="checkmark" size={44} color={colors.success} /></View>
              <Text style={[styles.okTitle, { color: colors.textPrimary }]}>¡Gracias! Hemos recibido tu informe</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Referencia: <Text style={{ fontWeight: '900', color: colors.textPrimary }}>#{sent.ref}</Text></Text>
              <Text style={[styles.okText, { color: colors.textSecondary }]}>
                {role === 'athlete'
                  ? 'Tu entrenador ya lo puede ver. Cuando te responda o lo resuelva, lo verás en Ajustes → «Mis informes» (y te llegará un aviso si tienes las notificaciones activadas).'
                  : 'Se ha enviado a soporte y lo tienes guardado en Ajustes → «Problemas reportados».'}
              </Text>
              <TouchableOpacity accessibilityRole="button" onPress={close} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.primaryText}>Volver a Ajustes</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
                <TouchableOpacity accessibilityRole="button" onPress={reset}><Text style={{ color: colors.primary, fontWeight: '800' }}>Enviar otro</Text></TouchableOpacity>
                {onOpenReports && <TouchableOpacity accessibilityRole="button" onPress={() => { reset(); onOpenReports(); }}><Text style={{ color: colors.primary, fontWeight: '800' }}>{role === 'athlete' ? 'Ver mis informes' : 'Ver problemas reportados'}</Text></TouchableOpacity>}
              </View>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: colors.textSecondary }]}>¿QUÉ QUIERES CONTARNOS?</Text>
              <View style={styles.chips}>{CATEGORIES.map(c => chip(c.key, category === c.key, c.label, () => setCategory(c.key), c.icon))}</View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>¿DÓNDE HA PASADO? <Text style={{ fontWeight: '600' }}>(opcional)</Text></Text>
              <View style={styles.chips}>{AREAS.map(a => chip(a, area === a, a, () => setArea(area === a ? '' : a)))}</View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>CUÉNTANOS QUÉ HA PASADO</Text>
              <TextInput
                accessibilityLabel="Descripción del problema"
                value={description} onChangeText={setDescription} multiline maxLength={4000}
                placeholder={cat.placeholder} placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <Text style={{ color: remaining > 0 ? colors.textSecondary : colors.success, fontSize: 12, marginTop: 6 }}>
                {remaining > 0 ? `Escribe al menos ${MIN_CHARS} caracteres (te faltan ${remaining}).` : `${description.trim().length} caracteres`}
              </Text>

              <Text style={[styles.label, { color: colors.textSecondary }]}>CAPTURA DE PANTALLA <Text style={{ fontWeight: '600' }}>(opcional, ayuda mucho)</Text></Text>
              {screenshot ? (
                <View style={[styles.shotBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Image accessibilityLabel="Captura adjunta" source={{ uri: screenshot }} style={styles.shot} resizeMode="contain" />
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Quitar la captura" onPress={() => setScreenshot(null)} style={styles.removeShot}>
                    <Ionicons name="close-circle" size={20} color={colors.error} /><Text style={{ color: colors.error, fontWeight: '800' }}>Quitar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Añadir captura de pantalla" onPress={pickScreenshot} disabled={shotBusy}
                  style={[styles.addShot, { borderColor: colors.primary }]}>
                  {shotBusy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="image-outline" size={20} color={colors.primary} />}
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>{shotBusy ? 'Preparando la imagen…' : 'Añadir captura de pantalla'}</Text>
                </TouchableOpacity>
              )}
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                Para hacer una captura: iPhone, botón lateral + subir volumen. Android, botón de encendido + bajar volumen.
              </Text>

              <TouchableOpacity accessibilityRole="button" onPress={() => setShowDiag(v => !v)} style={styles.diagToggle}>
                <Ionicons name={showDiag ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', flex: 1 }}>
                  También se envían datos técnicos: dispositivo, navegador, versión de la app y errores recientes
                </Text>
              </TouchableOpacity>
              {showDiag && diag && (
                <View style={[styles.diagBox, { backgroundColor: colors.surfaceHighlight }]}>
                  {Object.entries(diag).map(([k, v]) => (
                    <Text key={k} style={{ color: colors.textPrimary, fontSize: 12, lineHeight: 18 }}>
                      <Text style={{ fontWeight: '800' }}>{k}: </Text>{Array.isArray(v) ? v.join(' | ') : String(v)}
                    </Text>
                  ))}
                </View>
              )}

              {!!error && <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.error }]}>{error}</Text>}

              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Enviar informe" onPress={submit} disabled={!canSend}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: canSend ? 1 : 0.5 }]}>
                {sending ? <ActivityIndicator color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
                <Text style={styles.primaryText}>{sending ? 'Enviando…' : 'Enviar informe'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  title: { fontSize: 17, fontWeight: '900', flex: 1 },
  body: { padding: 18, width: '100%', maxWidth: 720, alignSelf: 'center' },
  center: { alignItems: 'center', paddingTop: 40 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 20, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  input: { minHeight: 140, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 15, lineHeight: 21, textAlignVertical: 'top' },
  addShot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' },
  shotBox: { borderWidth: 1, borderRadius: 14, padding: 8, alignItems: 'center' },
  shot: { width: '100%', height: 260, borderRadius: 10 },
  removeShot: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 8 },
  diagToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 22 },
  diagBox: { borderRadius: 12, padding: 12, marginTop: 8, gap: 2 },
  error: { marginTop: 16, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, paddingHorizontal: 24, borderRadius: 14, marginTop: 24, alignSelf: 'stretch' },
  primaryText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  okCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  okTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  okText: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12, maxWidth: 460 },
});
