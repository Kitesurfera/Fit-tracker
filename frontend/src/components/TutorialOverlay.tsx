// Tutorial de bienvenida: lo más importante de la app en unos pasos, distinto para deportistas y entrenadores.
// A las deportistas mujeres se les muestra además el seguimiento del ciclo menstrual, y los textos se adaptan
// al género (bienvenida/bienvenido). Se puede omitir en cualquier paso y volver a ver en Ajustes > Ayuda.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { TUTORIAL_IMAGES } from './tutorialImages';

// Sube este número cuando cambie el tutorial: se volverá a mostrar una vez a todo el mundo
export const TUTORIAL_VERSION = 2;

type Step = { key: string; icon: any; color: string; title: string; intro: string; bullets: { icon: any; text: string }[]; action?: { label: string; route: string }; image?: string };
type Gender = 'female' | 'male' | 'unknown';

export const genderOf = (g?: string): Gender => {
  const v = (g || '').toLowerCase();
  if (['female', 'mujer', 'femenino'].includes(v)) return 'female';
  if (['male', 'hombre', 'masculino'].includes(v)) return 'male';
  return 'unknown';
};

export function buildTutorialSteps(role: string, gender: Gender, name: string): Step[] {
  const g = (f: string, m: string, n: string) => (gender === 'female' ? f : gender === 'male' ? m : n);
  const first = (name || '').trim().split(' ')[0];
  const hello = `¡${g('Bienvenida', 'Bienvenido', 'Te damos la bienvenida')}${first ? `, ${first}` : ''}!`;
  const skipHint = 'Son pocos pasos. Puedes omitirlo cuando quieras y volver a verlo en Ajustes → Ayuda.';

  const withImages = (prefix: string, list: Step[]) => list.map(st => (TUTORIAL_IMAGES[`${prefix}_${st.key}`] ? { ...st, image: `${prefix}_${st.key}` } : st));

  if (role === 'trainer') {
    return withImages('t', [
      { key: 'welcome', icon: 'sparkles', color: '#2563EB', title: hello, intro: `Este es tu panel de entrenador en AM Coaching. ${skipHint}`, bullets: [] },
      { key: 'athletes', icon: 'people', color: '#2563EB', title: 'Tus deportistas', intro: 'Todo empieza en Inicio.', bullets: [
        { icon: 'person-add', text: 'Añade deportistas con el botón azul de arriba a la derecha.' },
        { icon: 'person-circle', text: 'Toca su tarjeta para ver su perfil: calendario, analíticas, tests, vídeos y, en las mujeres, la fase del ciclo menstrual.' },
        { icon: 'logo-whatsapp', text: 'Escríbeles por WhatsApp con el icono verde de su tarjeta.' },
      ] },
      { key: 'planning', icon: 'calendar', color: '#7C3AED', title: 'Programa sesiones en segundos', intro: 'En el perfil de la deportista → «Sesiones». Fuerza, HIIT o baterías de tests.', bullets: [
        { icon: 'add-circle', text: '«+ Nueva» para crear una sesión.' },
        { icon: 'document-text', text: '«CSV» para importar uno o varios días con la plantilla (se descarga desde ahí mismo).' },
        { icon: 'copy', text: 'El icono de copiar duplica una sesión para pegarla en otro día.' },
        { icon: 'git-branch', text: 'Organiza la temporada con macrociclos y microciclos.' },
      ] },
      { key: 'ai', icon: 'chatbubbles', color: '#0EA5E9', title: 'Asistente con IA', intro: 'La burbuja azul del perfil de cada deportista (también en el calendario).', bullets: [
        { icon: 'flash', text: 'Pídele una sesión o una semana entera («3 sesiones de fuerza para la semana que viene»).' },
        { icon: 'save', text: 'Revisa la propuesta y pulsa «Añadir a la agenda» o «Añadir las 2 sesiones».' },
        { icon: 'analytics', text: 'Tiene en cuenta lo que ha hecho la deportista y cómo se encuentra.' },
      ] },
      { key: 'tracking', icon: 'checkmark-done-circle', color: '#10B981', title: 'Seguimiento al día', intro: 'Sabrás cómo va cada deportista sin preguntar.', bullets: [
        { icon: 'speedometer', text: 'Cada sesión hecha llega con el esfuerzo (RPE), la duración y las molestias; si no la hace, verás el motivo.' },
        { icon: 'create', text: 'Deja una nota en cada ejercicio con «Guardar Feedback», o corrige sus vídeos en el segundo exacto.' },
        { icon: 'warning', text: 'Alertas cuando la fatiga, el dolor o el estrés están altos.' },
      ] },
      { key: 'reports', icon: 'trending-up', color: '#F59E0B', title: 'Rendimiento e informes', intro: 'En la pestaña Rendimiento.', bullets: [
        { icon: 'stats-chart', text: 'Evolución de tests y marcas, carga y fatiga.' },
        { icon: 'document', text: 'El botón del documento abre el informe: elige 7 días, 30 días o 3 meses, añade el análisis de IA y tu comentario.' },
        { icon: 'share', text: '«Compartir PDF» para mandarlo por WhatsApp, email o guardarlo.' },
      ] },
      { key: 'notify', icon: 'notifications', color: '#EF4444', title: 'Avisos y ayuda', intro: 'Para no perderte nada.', action: { label: 'Activar notificaciones', route: '/settings' }, bullets: [
        { icon: 'notifications', text: 'En Ajustes, activa «Avisos en este dispositivo» y elige cuáles quieres: sesión terminada, alertas de bienestar, vídeos…' },
        { icon: 'phone-portrait', text: 'En iPhone, primero añade la app a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio»).' },
        { icon: 'bug', text: 'Si algo falla, Ajustes → Ayuda → «Informar de un problema». Los de tus deportistas te llegan a «Problemas reportados».' },
      ] },
    ]);
  }

  const steps: Step[] = [
    { key: 'welcome', icon: 'sparkles', color: '#2563EB', title: hello, intro: `Aquí tienes tus entrenamientos y el contacto con tu entrenador. ${skipHint}`, bullets: [] },
    { key: 'today', icon: 'home', color: '#2563EB', title: 'Tu día de un vistazo', intro: 'En Inicio está todo lo de hoy.', bullets: [
      { icon: 'play', text: 'Pulsa «Empezar» en la sesión de hoy para entrenar.' },
      { icon: 'close-circle', text: '¿No puedes entrenar? Pulsa la ✕ roja junto a la sesión y explica el motivo: tu entrenador lo verá.' },
      { icon: 'logo-whatsapp', text: 'Con «Enviar Status» le mandas por WhatsApp a tu entrenador cómo estás hoy.' },
    ] },
    { key: 'training', icon: 'play-circle', color: '#7C3AED', title: 'Modo entrenamiento', intro: 'Te guía serie a serie.', bullets: [
      { icon: 'timer', text: 'Temporizador con pitidos (3, 2, 1 y uno largo) que suenan por encima de tu música sin pararla.' },
      { icon: 'calculator', text: 'Apunta pesos y repeticiones; la calculadora de discos está arriba a la derecha.' },
      { icon: 'battery-half', text: `¿Llegas ${g('muy cansada', 'muy cansado', 'con mucha fatiga')}? El botón «Supervivencia» baja un 20 % el volumen.` },
      { icon: 'flag', text: 'Al terminar, indica el esfuerzo (RPE) y si te molesta alguna zona.' },
    ] },
    { key: 'videos', icon: 'videocam', color: '#0EA5E9', title: 'Vídeos de técnica', intro: 'Tu entrenador te corrige aunque no esté contigo.', bullets: [
      { icon: 'camera', text: 'Graba o sube un vídeo con el botón de la cámara del modo entrenamiento.' },
      { icon: 'chatbox-ellipses', text: 'Tu entrenador te deja correcciones en el segundo exacto: toca el tiempo (p. ej. 0:04) para ver ese momento.' },
      { icon: 'eye', text: 'Las verás en Rendimiento → «Vídeos y feedback», y puedes responderle.' },
    ] },
    { key: 'wellness', icon: 'pulse', color: '#10B981', title: 'Tu bienestar diario', intro: 'Un minuto al día que ayuda mucho a ajustar tus cargas.', bullets: [
      { icon: 'happy', text: 'Pulsa «Anotar Fatiga» en Inicio: indica fatiga, estrés, sueño y agujetas, y marca en el mapa del cuerpo si te duele algo.' },
      { icon: 'alert-circle', text: 'Si algo está alto, tu entrenador recibe una alerta y puede adaptar la sesión.' },
    ] },
  ];
  if (gender === 'female') {
    steps.push({ key: 'cycle', icon: 'water', color: '#E11D48', title: 'Tu ciclo menstrual', intro: 'Entrenar según la fase de tu ciclo.', bullets: [
      { icon: 'calendar-number', text: 'En el formulario de bienestar, cuando te venga la regla pulsa «Sí, comenzó hoy», y márcalo también cuando termine.' },
      { icon: 'leaf', text: 'En Inicio verás tu fase y el día del ciclo, con consejos de entrenamiento, prevención y nutrición.' },
      { icon: 'people', text: 'Tu entrenador ve la fase para ajustar tu planificación.' },
    ] });
  }
  steps.push(
    { key: 'progress', icon: 'trending-up', color: '#F59E0B', title: 'Tu progreso', intro: 'En las pestañas Tests y Rendimiento.', bullets: [
      { icon: 'trophy', text: 'Tus tests y mejores marcas, con su evolución.' },
      { icon: 'stats-chart', text: 'Cómo han ido tu carga y tu fatiga en las últimas semanas.' },
      { icon: 'document', text: 'El botón del documento, arriba, crea un informe en PDF para guardarlo o compartirlo.' },
    ] },
    { key: 'notify', icon: 'notifications', color: '#EF4444', title: 'Avisos y ayuda', intro: 'Para no perderte nada.', action: { label: 'Activar notificaciones', route: '/settings' }, bullets: [
      { icon: 'notifications', text: 'En Ajustes, activa «Avisos en este dispositivo»: te avisaremos de sesiones nuevas, cambios y correcciones.' },
      { icon: 'phone-portrait', text: 'En iPhone, primero añade la app a la pantalla de inicio (Compartir → «Añadir a pantalla de inicio»).' },
      { icon: 'bug', text: 'Si algo falla, Ajustes → Ayuda → «Informar de un problema».' },
    ] },
  );
  return withImages('a', steps);
}

type Props = { isVisible: boolean; onClose: () => void; role: string; gender?: string; name?: string };

export default function TutorialOverlay({ isVisible, onClose, role, gender, name }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { width: winW, height: winH } = useWindowDimensions();
  const [i, setI] = useState(0);
  const steps = useMemo(() => buildTutorialSteps(role, genderOf(gender), name || ''), [role, gender, name]);
  useEffect(() => { if (isVisible) setI(0); }, [isVisible]);
  if (!isVisible || !steps.length) return null;

  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  // La captura ocupa el ancho de la tarjeta, sin pasar de ~un tercio del alto de la pantalla (así caben las explicaciones)
  const img = step.image ? TUTORIAL_IMAGES[step.image] : null;
  const innerW = Math.min(440, winW - 32) - 44;
  const imgH = img ? Math.min(innerW * (img.height / img.width), Math.max(170, winH * 0.31)) : 0;
  const imgW = img ? imgH * (img.width / img.height) : 0;

  return (
    <Modal transparent visible={isVisible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View accessibilityRole="none" accessibilityLabel="Tutorial de bienvenida" style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.top}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{i + 1} de {steps.length}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Omitir tutorial" onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.skipBtn}>
              <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 14 }}>Omitir</Text>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {img ? (
              <View style={[styles.shotFrame, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                <Image source={img.source} accessibilityLabel={`Captura de la app: ${step.title}`} style={{ width: imgW, height: imgH }} resizeMode="contain" />
              </View>
            ) : (
              <View style={[styles.iconCircle, { backgroundColor: step.color + '18' }]}>
                <Ionicons name={step.icon} size={38} color={step.color} />
              </View>
            )}
            <View style={styles.titleRow}>
              {img && <View style={[styles.titleIcon, { backgroundColor: step.color + '18' }]}><Ionicons name={step.icon} size={18} color={step.color} /></View>}
              <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }, img && { fontSize: 20, flexShrink: 1 }]}>{step.title}</Text>
            </View>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>{step.intro}</Text>
            {step.bullets.map((b, k) => (
              <View key={k} style={styles.bullet}>
                <View style={[styles.bulletIcon, { backgroundColor: step.color + '14' }]}><Ionicons name={b.icon} size={16} color={step.color} /></View>
                <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{b.text}</Text>
              </View>
            ))}
            {step.action && (
              <TouchableOpacity accessibilityRole="button" onPress={() => { onClose(); router.push(step.action!.route as any); }}
                style={[styles.actionBtn, { borderColor: step.color }]}>
                <Ionicons name="arrow-forward-circle" size={18} color={step.color} />
                <Text style={{ color: step.color, fontWeight: '800' }}>{step.action.label}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <View style={styles.dots}>
            {steps.map((s, k) => (
              <TouchableOpacity key={s.key} accessibilityRole="button" accessibilityLabel={`Ir al paso ${k + 1}`} onPress={() => setI(k)} hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}>
                <View style={[styles.dot, { backgroundColor: k === i ? step.color : colors.border, width: k === i ? 18 : 8 }]} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.footer}>
            {i > 0 ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Paso anterior" onPress={() => setI(i - 1)} style={[styles.backBtn, { backgroundColor: colors.surfaceHighlight }]}>
                <Ionicons name="arrow-back" size={18} color={colors.textPrimary} />
                <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>Atrás</Text>
              </TouchableOpacity>
            ) : <View />}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={last ? 'Empezar a usar la app' : 'Siguiente paso'} onPress={() => (last ? onClose() : setI(i + 1))}
              style={[styles.nextBtn, { backgroundColor: step.color }]}>
              <Text style={styles.nextText}>{last ? '¡Empezar!' : i === 0 ? 'Ver lo más importante' : 'Siguiente'}</Text>
              {!last && <Ionicons name="arrow-forward" size={18} color="#FFF" />}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Lo muestra una vez a cada persona al entrar (o cuando cambia TUTORIAL_VERSION). Se recuerda en el servidor
// (para no repetirlo en otro dispositivo) y en el propio dispositivo (por si no hay conexión).
export function WelcomeTutorialGate() {
  const { user, updateUser } = useAuth();
  const [visible, setVisible] = useState(false);
  const key = user?.id ? `tutorial_seen_${user.id}` : '';

  useEffect(() => {
    if (!user?.id || (Number(user.tutorial_version) || 0) >= TUTORIAL_VERSION) return;
    let cancelled = false;
    AsyncStorage.getItem(key).then(v => { if (!cancelled && (Number(v) || 0) < TUTORIAL_VERSION) setVisible(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setVisible(false);
    if (!user?.id) return;
    AsyncStorage.setItem(key, String(TUTORIAL_VERSION)).catch(() => {});
    updateUser({ tutorial_version: TUTORIAL_VERSION });
    api.updateProfile({ tutorial_version: TUTORIAL_VERSION }).catch(() => {});
  };

  if (!user) return null;
  return <TutorialOverlay isVisible={visible} onClose={close} role={user.role} gender={user.gender} name={user.name} />;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.75)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, maxHeight: '92%', padding: 22, borderRadius: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingLeft: 8 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 6, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  titleIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  shotFrame: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginTop: 4, marginBottom: 14 },
  intro: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 8, marginBottom: 12 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 10 },
  bulletIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bulletText: { flex: 1, fontSize: 14.5, lineHeight: 21, paddingTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 10, marginTop: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18 },
  dot: { height: 8, borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14 },
  nextText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
