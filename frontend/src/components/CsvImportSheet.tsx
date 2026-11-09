import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api';
import { friendlyDate, localDateStr, addDaysStr, nextMondayStr, normalizeDateInput } from '../utils/dates';
import { downloadTextFile, readFileAsText, CSV_PICKER_TYPES } from '../utils/fileIO';
import {
  parseWorkoutCsv, buildTemplateCsv, TEMPLATE_FILE_NAME, TEMPLATE_COLUMNS, CsvParseResult, ImportedSession,
  resolveSessionDate, microsFromTree, findMicroForDate, microId, buildWorkoutPayload, defaultSessionTitle,
} from '../utils/workoutCsv';

// Ventana única para importar sesiones desde CSV. La usan "Nueva sesión" (un día) y Planificación/Ficha (varios días):
// las dos leen la MISMA plantilla. Antes de crear nada enseña un resumen para comprobar que está todo bien.

export type ResolvedSession = ImportedSession & { resolvedDate: string; microId: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  athleteId: string;
  athleteName?: string;
  // 'single': desde "Nueva sesión". Las sesiones sin fecha usan la del formulario y se puede cargar una en el formulario.
  mode: 'single' | 'multi';
  defaultDate?: string;
  onUseInForm?: (session: ResolvedSession) => void;
  onCreated?: (count: number) => void;
};

export default function CsvImportSheet({ visible, onClose, athleteId, athleteName, mode, defaultDate, onUseInForm, onCreated }: Props) {
  const { colors } = useTheme();
  const [result, setResult] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [micros, setMicros] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(nextMondayStr());
  const [startInput, setStartInput] = useState('');

  useEffect(() => {
    if (!visible || !athleteId) return;
    api.getPeriodizationTree(athleteId).then(tree => setMicros(microsFromTree(tree))).catch(() => setMicros([]));
  }, [visible, athleteId]);

  useEffect(() => { if (!visible) { setResult(null); setFileName(''); setShowHelp(false); } }, [visible]);

  const sessions = result?.sessions || [];
  const fallbackDate = mode === 'single' ? (normalizeDateInput(defaultDate || '') || localDateStr()) : startDate;
  const needsStartDate = sessions.some(s => s.dayOffset !== null || (mode === 'multi' && !s.date));

  const resolved: ResolvedSession[] = useMemo(() => sessions.map(s => {
    const resolvedDate = resolveSessionDate(s, startDate, fallbackDate);
    return { ...s, resolvedDate, microId: microId(findMicroForDate(micros, resolvedDate)) };
  }), [sessions, startDate, fallbackDate, micros]);

  const microName = (id: string | null) => {
    const m = micros.find(x => microId(x) === id);
    return m ? (m.nombre || m.name) : '';
  };

  const pickFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: CSV_PICKER_TYPES, copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.length) return;
      setReading(true);
      const asset = picked.assets[0];
      const text = await readFileAsText(asset.uri);
      setFileName(asset.name || 'archivo.csv');
      if (text.startsWith('PK')) {
        setResult({ sessions: [], warnings: [], error: 'Parece un archivo de Excel (.xlsx). En Excel, Numbers o Google Sheets usa «Guardar como» / «Descargar» en formato CSV y súbelo de nuevo.' });
      } else {
        setResult(parseWorkoutCsv(text));
      }
    } catch (e) {
      setResult({ sessions: [], warnings: [], error: 'No se pudo leer el archivo. Comprueba que es un CSV.' });
    } finally {
      setReading(false);
    }
  };

  const applyStartInput = () => {
    const d = normalizeDateInput(startInput);
    if (d) setStartDate(d);
    setStartInput('');
  };

  const createAll = async () => {
    if (!resolved.length) return;
    const workouts = resolved.map(s => buildWorkoutPayload({
      title: s.title || defaultSessionTitle(s.type, s.resolvedDate), date: s.resolvedDate, notes: s.notes,
      athleteId, microId: s.microId, type: s.type, exercises: s.exercises, blocks: s.blocks,
    }));
    setSaving(true);
    try {
      const res: any = workouts.length === 1 ? await api.createWorkout(workouts[0]) : await api.createWorkoutsBulk({ workouts });
      const n = workouts.length;
      const queued = res?.status === 'queued' || String(res?.id || '').startsWith('temp_');
      Alert.alert(queued ? 'Guardado sin conexión' : '¡Listo!', queued
        ? 'Las sesiones se subirán solas cuando vuelva la conexión.'
        : (n === 1 ? 'Sesión programada.' : `Se han programado ${n} sesiones.`));
      onClose();
      onCreated?.(n);
    } catch (e: any) {
      Alert.alert('Error', e?.message && !/ERROR/.test(e.message) ? e.message : 'No se pudieron guardar las sesiones. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const useInForm = (s: ResolvedSession) => { onUseInForm?.(s); onClose(); };

  const singleOne = mode === 'single' && resolved.length === 1 && !!onUseInForm;

  const Btn = ({ label, icon, onPress, primary, disabled, a11y }: any) => (
    <TouchableOpacity
      accessibilityRole="button" accessibilityLabel={a11y || label} disabled={disabled} onPress={onPress}
      style={[styles.btn, primary ? { backgroundColor: colors.primary } : { borderWidth: 1, borderColor: colors.primary }, disabled && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={18} color={primary ? '#FFF' : colors.primary} />
      <Text style={{ color: primary ? '#FFF' : colors.primary, fontWeight: '800', fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Importar desde CSV</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                {athleteName ? `Para ${athleteName} · ` : ''}Una sola plantilla para uno o varios días, de fuerza o HIIT
              </Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 6 }} keyboardShouldPersistTaps="handled">
            {(!result || !!result.error) && (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Btn label="Plantilla" a11y="Descargar plantilla CSV" icon="download-outline" onPress={() => downloadTextFile(TEMPLATE_FILE_NAME, buildTemplateCsv())} />
                  <Btn label={reading ? 'Leyendo…' : 'Elegir archivo'} a11y="Elegir archivo CSV" icon="folder-open-outline" primary disabled={reading} onPress={pickFile} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                  1. Descarga la plantilla y ábrela con Excel, Numbers o Google Sheets.{'\n'}
                  2. Escribe una fila por ejercicio (borra los ejemplos).{'\n'}
                  3. Guárdala como CSV y elígela aquí. Antes de guardar nada verás un resumen.
                </Text>
              </>
            )}

            {reading && <ActivityIndicator color={colors.primary} />}

            {result?.error && (
              <View style={[styles.notice, { backgroundColor: (colors.error || '#EF4444') + '15', borderColor: (colors.error || '#EF4444') + '55' }]}>
                <Ionicons name="alert-circle" size={18} color={colors.error || '#EF4444'} />
                <Text style={{ color: colors.textPrimary, flex: 1, fontSize: 13 }}>{result.error}</Text>
              </View>
            )}

            {result && !result.error && (
              <>
                <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 15 }}>
                  {resolved.length === 1 ? '1 sesión encontrada' : `${resolved.length} sesiones encontradas`}
                  <Text style={{ color: colors.textSecondary, fontWeight: '500', fontSize: 12 }}>  ·  {fileName}</Text>
                </Text>

                {needsStartDate && (
                  <View style={[styles.startBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                      {sessions.some(s => s.dayOffset !== null) ? 'EL DÍA 1 ES EL…' : 'FECHA PARA LAS SESIONES SIN FECHA'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {[{ l: 'Hoy', d: localDateStr() }, { l: 'Mañana', d: addDaysStr(localDateStr(), 1) }, { l: 'Próximo lunes', d: nextMondayStr() }].map(o => (
                        <TouchableOpacity key={o.l} accessibilityRole="button" accessibilityLabel={`Empezar ${o.l.toLowerCase()}`} onPress={() => setStartDate(o.d)}
                          style={[styles.chip, { borderColor: colors.border }, startDate === o.d && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                          <Text style={{ color: startDate === o.d ? '#FFF' : colors.textPrimary, fontWeight: '700', fontSize: 12 }}>{o.l}</Text>
                        </TouchableOpacity>
                      ))}
                      <TextInput
                        accessibilityLabel="Otra fecha de inicio" value={startInput} onChangeText={setStartInput} onBlur={applyStartInput} onSubmitEditing={applyStartInput}
                        placeholder={startDate.split('-').reverse().join('/')} placeholderTextColor={colors.textSecondary}
                        style={[styles.dateInput, { color: colors.textPrimary, borderColor: colors.border }]}
                      />
                    </View>
                  </View>
                )}

                <View style={{ gap: 8 }}>
                  {resolved.map(s => (
                    <View key={s.key} style={[styles.sessionRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <View style={[styles.dateBadge, { backgroundColor: colors.primary + '15' }]}>
                        <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 12, textAlign: 'center' }}>{friendlyDate(s.resolvedDate)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 14 }} numberOfLines={1}>
                          {s.title || defaultSessionTitle(s.type, s.resolvedDate)}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {s.type === 'hiit' ? `HIIT · ${s.blocks.length} ${s.blocks.length === 1 ? 'bloque' : 'bloques'} · ` : 'Fuerza · '}
                          {s.exerciseCount} {s.exerciseCount === 1 ? 'ejercicio' : 'ejercicios'}
                          {s.microId ? ` · ${microName(s.microId)}` : ''}
                        </Text>
                      </View>
                      {mode === 'single' && onUseInForm && !singleOne && (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Editar ${s.title || 'sesión'} en el formulario`} onPress={() => useInForm(s)} style={{ padding: 6 }}>
                          <Ionicons name="create-outline" size={20} color={colors.primary} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              </>
            )}

            {!!result?.warnings.length && result.warnings.map((w, i) => (
              <View key={i} style={[styles.notice, { backgroundColor: (colors.warning || '#F59E0B') + '15', borderColor: (colors.warning || '#F59E0B') + '55' }]}>
                <Ionicons name="warning" size={16} color={colors.warning || '#F59E0B'} />
                <Text style={{ color: colors.textPrimary, flex: 1, fontSize: 12 }}>{w}</Text>
              </View>
            ))}

            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cómo rellenar la plantilla" onPress={() => setShowHelp(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={showHelp ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>¿Cómo se rellena la plantilla?</Text>
            </TouchableOpacity>
            {showHelp && (
              <View style={{ gap: 6 }}>
                {[
                  'Una fila por ejercicio.',
                  'Fecha y Sesión vacías = las mismas que la fila de arriba.',
                  'Rellena «Bloque HIIT» solo en circuitos; si una sesión no tiene bloques, es de fuerza.',
                  'La misma plantilla sirve para un día o para varios, aquí y en Planificación.',
                  'Si la fecha cae dentro de un microciclo, la sesión se asigna sola a esa semana.',
                  'Vale guardada con comas o con punto y coma; también sirven las plantillas antiguas.',
                ].map(t => <Text key={t} style={{ color: colors.textPrimary, fontSize: 13 }}>• {t}</Text>)}
                <View style={[styles.helpTable, { borderColor: colors.border }]}>
                  {TEMPLATE_COLUMNS.map(c => (
                    <View key={c.field} style={[styles.helpRow, { borderColor: colors.border }]}>
                      <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 12, width: 130 }}>{c.header}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>{c.help}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {result && !result.error && (
            <View style={{ gap: 10, marginTop: 12 }}>
              {resolved.length > 0 && (singleOne ? (
                <>
                  <Btn label="Cargar en el formulario" icon="create-outline" primary onPress={() => useInForm(resolved[0])} />
                  <Btn label={saving ? 'Guardando…' : 'Guardar directamente'} icon="checkmark-done" disabled={saving} onPress={createAll} />
                </>
              ) : (
                <Btn label={saving ? 'Guardando…' : (resolved.length === 1 ? 'Programar 1 sesión' : `Programar ${resolved.length} sesiones`)} icon="calendar" primary disabled={saving} onPress={createAll} />
              ))}
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Elegir otro archivo" onPress={pickFile} style={{ alignSelf: 'center', padding: 6 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13 }}>Elegir otro archivo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { padding: 20, paddingBottom: 28, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%', width: '100%', maxWidth: 720, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 10 },
  title: { fontSize: 20, fontWeight: '900' },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, minHeight: 50 },
  notice: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'flex-start' },
  startBox: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  dateInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, minWidth: 110, fontSize: 13 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1 },
  dateBadge: { width: 74, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  helpTable: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginTop: 4 },
  helpRow: { flexDirection: 'row', gap: 8, padding: 8, borderBottomWidth: 0.5 },
});
