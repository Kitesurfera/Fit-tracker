// Ajustes > Notificaciones en el móvil: activar/desactivar en este dispositivo y elegir qué avisos llegan.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import {
  pushSupport, permissionState, getDeviceSubscription, enablePushOnDevice, disablePushOnDevice, deviceName, PushSupport,
} from '../utils/push';

type EventInfo = { key: string; label: string; hint: string; icon: any };

const EVENTS: Record<'athlete' | 'trainer', EventInfo[]> = {
  athlete: [
    { key: 'workout_assigned', label: 'Nuevas sesiones', hint: 'Cuando tu entrenador te programa una sesión o una batería de tests', icon: 'barbell-outline' },
    { key: 'workout_changed', label: 'Cambios en tus sesiones', hint: 'Si una sesión cambia de día, de ejercicios o se quita', icon: 'calendar-outline' },
    { key: 'coach_feedback', label: 'Correcciones del entrenador', hint: 'Comentarios en tus vídeos y notas en los ejercicios', icon: 'chatbubble-ellipses-outline' },
  ],
  trainer: [
    { key: 'workout_completed', label: 'Sesión terminada', hint: 'Con el esfuerzo (RPE), la duración y si hay molestias', icon: 'checkmark-circle-outline' },
    { key: 'workout_skipped', label: 'Sesión no realizada', hint: 'Cuando una deportista marca que no la ha hecho, con el motivo', icon: 'play-skip-forward-outline' },
    { key: 'wellness_alert', label: 'Alertas de bienestar y lesiones', hint: 'Fatiga, dolor o estrés altos, mal sueño, molestias o una lesión', icon: 'warning-outline' },
    { key: 'wellness_submitted', label: 'Todos los formularios de bienestar', hint: 'Cada vez que una deportista lo rellena, aunque esté todo bien', icon: 'pulse-outline' },
    { key: 'video_uploaded', label: 'Vídeos de técnica', hint: 'Cuando suben un vídeo o te responden a un comentario', icon: 'videocam-outline' },
    { key: 'test_recorded', label: 'Tests y medidas', hint: 'Cuando una deportista registra un test o una medida', icon: 'speedometer-outline' },
  ],
};

export default function PushSettings({ role, colors }: { role: 'athlete' | 'trainer'; colors: any }) {
  const [support] = useState<PushSupport>(() => pushSupport());
  const [permission, setPermission] = useState(() => permissionState());
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [devices, setDevices] = useState(0);
  const [deviceOn, setDeviceOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const events = EVENTS[role] || [];

  const load = useCallback(async () => {
    try {
      const cfg = await api.getPushConfig();
      setPublicKey(cfg.public_key);
      setPrefs(cfg.prefs || {});
      setDevices(cfg.devices || 0);
    } catch (e: any) {
      setMessage({ text: 'No se pudieron cargar tus preferencias de avisos. Revisa la conexión.', error: true });
    }
    const sub = await getDeviceSubscription();
    setDeviceOn(!!sub && permissionState() === 'granted');
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleDevice = async (value: boolean) => {
    setMessage(null);
    setBusy(true);
    try {
      if (value) {
        if (!publicKey) throw new Error('Sin conexión con el servidor.');
        const r = await enablePushOnDevice(publicKey);
        setPermission(r.permission);
        if (!r.ok) {
          setDeviceOn(false);
          setMessage({ text: r.permission === 'denied' ? 'Has bloqueado las notificaciones. Mira abajo cómo volver a permitirlas.' : 'No has dado permiso para las notificaciones.', error: true });
          return;
        }
        setDeviceOn(true);
        setDevices(r.devices);
        setMessage({ text: 'Notificaciones activadas en este dispositivo. Pulsa «Enviar una de prueba» para comprobarlo.' });
      } else {
        await disablePushOnDevice();
        setDeviceOn(false);
        setDevices(d => Math.max(0, d - 1));
        setMessage({ text: 'Este dispositivo ya no recibirá notificaciones.' });
      }
    } catch (e: any) {
      setMessage({ text: `No se pudieron ${value ? 'activar' : 'desactivar'} las notificaciones (${e?.message || 'error'}). Inténtalo de nuevo.`, error: true });
    } finally {
      setBusy(false);
    }
  };

  const togglePref = async (key: string, value: boolean) => {
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const r = await api.savePushPrefs({ [key]: value });
      setPrefs(r.prefs);
    } catch {
      setPrefs(before);
      setMessage({ text: 'No se pudo guardar el cambio. Revisa la conexión.', error: true });
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const r = await api.pushTest();
      setMessage(r.sent > 0
        ? { text: `Enviada a ${r.sent} ${r.sent === 1 ? 'dispositivo' : 'dispositivos'}. Debería llegarte en unos segundos.` }
        : { text: 'No se pudo entregar. Desactiva y vuelve a activar las notificaciones en este dispositivo.', error: true });
    } catch (e: any) {
      setMessage({ text: e?.message || 'No se pudo enviar la prueba.', error: true });
    } finally {
      setTesting(false);
    }
  };

  const denied = permission === 'denied';
  const canToggle = support === 'ok' && !denied && !!publicKey;
  const status = support === 'ios-install' ? 'Instala la app en el iPhone para activarlas'
    : support === 'ios-update' ? 'Necesitas iOS 16.4 o posterior'
    : support === 'dev' ? 'Solo en la versión publicada de la app'
    : support === 'unsupported' ? 'Este navegador no admite notificaciones'
    : denied ? 'Bloqueadas en este dispositivo'
    : deviceOn ? `Activadas · ${deviceName()}`
    : 'Te avisa aunque la app esté cerrada';

  const help = support === 'ios-install'
    ? 'En el iPhone las notificaciones solo funcionan con la app instalada: abre esta web en Safari, pulsa Compartir (el cuadrado con la flecha) → «Añadir a pantalla de inicio», abre la app desde ese icono y vuelve aquí.'
    : support === 'ios-update' ? 'Actualiza el iPhone en Ajustes → General → Actualización de software.'
    : denied ? 'Para volver a permitirlas — iPhone: Ajustes → Notificaciones → AM Coaching. Android: mantén pulsado el icono de la app → Información de la app → Notificaciones. Ordenador: pulsa el candado junto a la dirección de la web → Notificaciones → Permitir. Después vuelve aquí y activa el interruptor.'
    : null;

  return (
    <View>
      <Text style={styles.sectionTitle}>NOTIFICACIONES EN EL MÓVIL</Text>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <View style={styles.iconText}>
            <View style={[styles.iconBox, { backgroundColor: '#F59E0B15' }]}><Ionicons name="notifications" size={20} color="#F59E0B" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Avisos en este dispositivo</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{status}</Text>
            </View>
          </View>
          {busy ? <ActivityIndicator color={colors.primary} /> : (
            <Switch accessibilityLabel="Avisos en este dispositivo" value={deviceOn} disabled={!canToggle} onValueChange={toggleDevice}
              trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF" />
          )}
        </View>

        {help && (
          <View style={[styles.help, { backgroundColor: colors.surfaceHighlight }]}>
            <Ionicons name="information-circle" size={18} color={colors.primary} />
            <Text style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 19, flex: 1 }}>{help}</Text>
          </View>
        )}

        {deviceOn && (
          <TouchableOpacity accessibilityRole="button" onPress={sendTest} disabled={testing} style={[styles.testBtn, { borderColor: colors.primary }]}>
            {testing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="paper-plane-outline" size={16} color={colors.primary} />}
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>Enviar una de prueba</Text>
          </TouchableOpacity>
        )}

        {message && (
          <Text accessibilityLiveRegion="polite" style={[styles.message, { color: message.error ? colors.error : colors.success }]}>{message.text}</Text>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.subTitle, { color: colors.textSecondary }]}>QUÉ QUIERES QUE TE AVISE</Text>
        {events.map((ev, i) => (
          <View key={ev.key}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            <View style={styles.row}>
              <View style={styles.iconText}>
                <View style={[styles.iconBox, { backgroundColor: colors.primary + '12' }]}><Ionicons name={ev.icon} size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.textPrimary, fontSize: 14 }]}>{ev.label}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{ev.hint}</Text>
                </View>
              </View>
              <Switch accessibilityLabel={ev.label} value={!!prefs[ev.key]} disabled={!publicKey} onValueChange={v => togglePref(ev.key, v)}
                trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF" />
            </View>
          </View>
        ))}
        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {devices > 1 ? `Tienes las notificaciones activadas en ${devices} dispositivos. ` : ''}Lo que elijas aquí vale para todos tus dispositivos.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 12, letterSpacing: 1.5, marginLeft: 12, marginTop: 25 },
  card: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, gap: 10 },
  iconText: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  iconBox: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  help: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12 },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  message: { marginHorizontal: 16, marginBottom: 12, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  divider: { height: 1, marginLeft: 65, opacity: 0.3 },
  subTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginLeft: 16, marginTop: 14, marginBottom: 2 },
  footnote: { fontSize: 12, marginHorizontal: 16, marginTop: 6, lineHeight: 17 },
});
