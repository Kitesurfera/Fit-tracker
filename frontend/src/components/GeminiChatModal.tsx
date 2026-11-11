import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api';
import { localDateStr, addDaysStr, friendlyDate, normalizeDateInput } from '../utils/dates';
import { formatReps, formatDuration, hiitTarget } from '../utils/exerciseFormat';
import { saveAiWorkout } from '../utils/aiWorkout';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
  retryText?: string;      // Mensaje que se puede reenviar si falló
  workouts?: any[];        // Sesiones propuestas por la IA (una o varias)
}

// Explicación clara de por qué no ha respondido la IA
const errorText = (e: any) => {
  if (typeof e?.detail === 'string' && e.detail) return e.detail;
  if (e?.message === 'NETWORK_ERROR') return 'No hay conexión con el servidor. Comprueba tu internet e inténtalo de nuevo.';
  if (e?.message === 'SERVER_ERROR') return 'El servidor no ha podido responder. Si llevaba un rato parado tarda en arrancar: espera un minuto y vuelve a intentarlo.';
  return e?.message || 'No se ha podido contactar con la IA.';
};

export default function GeminiChatModal({
  isVisible,
  onClose,
  athleteContext,
  athleteId,
  athleteName,
  onSaved,
}: {
  isVisible: boolean;
  onClose: () => void;
  athleteContext?: any;
  athleteId?: string;
  athleteName?: string;
  // Se llama después de guardar sesiones en la agenda (para recargar la pantalla de detrás)
  onSaved?: (count: number) => void;
}) {
  const { colors } = useTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `¡Hola! Soy la IA de asistencia deportiva. ¿Qué ajustamos o planificamos hoy${athleteName ? ` para ${athleteName}` : ''}?`,
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Fecha elegida y estado de guardado de cada sesión propuesta (clave: idMensaje-índice)
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean || isTyping) return;

    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: clean };
    // El historial lleva también las sesiones propuestas, para poder pedir cambios ("cambia el ejercicio 2 del viernes")
    const chatHistory = messages
      .filter(m => m.id !== 'welcome-1' && !m.isError)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.workouts?.length ? `${m.content}\n[Sesiones propuestas: ${JSON.stringify(m.workouts).slice(0, 4000)}]` : m.content }]
      }));

    setMessages(prev => [...prev.filter(m => !m.retryText), newUserMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const aiData = await api.generateWorkout({
          userMessage: clean,
          athleteContext: athleteContext || { fatigue: 3, soreness: 3, cyclePhase: 'No definida' },
          chatHistory,
          athlete_id: athleteId
      } as any);

      const workouts = Array.isArray(aiData?.workouts) ? aiData.workouts : (aiData?.workoutData ? [aiData.workoutData] : []);
      const id = (Date.now() + 1).toString();
      setDates(prev => {
        const next = { ...prev };
        workouts.forEach((w: any, i: number) => { next[`${id}-${i}`] = normalizeDateInput(w?.date || '') || localDateStr(); });
        return next;
      });
      setMessages(prev => [...prev, {
        id,
        role: 'assistant',
        content: aiData?.response_message || (workouts.length ? 'He preparado esta propuesta:' : 'Hecho.'),
        workouts,
      }]);
    } catch (error: any) {
      console.error("Error en el chat:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorText(error),
        isError: true,
        retryText: clean,
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const saveWorkouts = async (items: { key: string; workout: any }[]) => {
    if (!athleteId) { Alert.alert('Elige una atleta', 'Selecciona primero a quién quieres programar la sesión.'); return; }
    const toSave = items.filter(i => !saved[i.key]);
    for (const i of toSave) {
      if (!normalizeDateInput(dates[i.key] || '')) { Alert.alert('Fecha no válida', 'Escribe la fecha como DD/MM/AAAA.'); return; }
    }
    setSavingKey(toSave.length > 1 ? 'all' : toSave[0]?.key || null);
    let count = 0;
    try {
      for (const i of toSave) {
        await saveAiWorkout(athleteId, i.workout, normalizeDateInput(dates[i.key]));
        setSaved(prev => ({ ...prev, [i.key]: true }));
        count++;
      }
      Alert.alert('¡Hecho!', count === 1
        ? `Sesión guardada en la agenda para el ${friendlyDate(normalizeDateInput(dates[toSave[0].key])).toLowerCase()}.`
        : `${count} sesiones guardadas en la agenda.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar la sesión.');
    } finally {
      setSavingKey(null);
      if (count > 0) onSaved?.(count);
    }
  };

  const renderWorkoutCard = (msgId: string, workout: any, idx: number) => {
    const key = `${msgId}-${idx}`;
    const date = dates[key] ?? localDateStr();
    const validDate = normalizeDateInput(date);
    const isSaved = !!saved[key];
    return (
      <View key={key} style={[styles.workoutPreviewCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.previewHeader}>
          <View style={styles.titleRow}>
            <Ionicons name="clipboard" size={18} color={colors.primary} />
            <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>{workout.title || 'Sesión'}</Text>
          </View>
          <Text style={styles.blockCountText}>{workout.exercises?.length || 0} {(workout.exercises?.length || 0) === 1 ? 'bloque' : 'bloques'}</Text>
        </View>

        <View style={styles.previewBody}>
          {!!workout.notes && (
            <Text style={{ color: colors.textSecondary, fontStyle: 'italic', marginBottom: 12, fontSize: 13 }}>
              📝 {workout.notes}
            </Text>
          )}

          {workout.exercises?.map((ex: any, exIdx: number) => {
            const isHiit = ex.is_hiit_block;
            const badgeBg = isHiit ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';
            const badgeColor = isHiit ? '#EF4444' : '#3B82F6';
            const badgeText = isHiit ? 'HIIT / CIRCUITO' : 'FUERZA';

            return (
              <View key={exIdx} style={[styles.exerciseBlock, { borderLeftColor: badgeColor }]}>
                <View style={styles.exerciseHeader}>
                  <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{ex.name}</Text>
                  <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                    <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text>
                  </View>
                </View>

                {!isHiit && (
                  <>
                    <View style={styles.metricsRow}>
                      <View style={styles.metricItem}>
                        <Ionicons name="layers-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.metricText, { color: colors.textSecondary }]}>{ex.sets ? `${ex.sets} series` : '-'}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Ionicons name="repeat-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.metricText, { color: colors.textSecondary }]}>{[formatReps(ex.reps), formatDuration(ex.duration)].filter(Boolean).join(' · ') || '-'}</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Ionicons name="timer-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.metricText, { color: colors.textSecondary }]}>{ex.rest || '-'} rec.</Text>
                      </View>
                    </View>
                    {ex.exercise_notes ? (
                      <Text style={[styles.notesText, { color: colors.textSecondary }]}>💡 {ex.exercise_notes}</Text>
                    ) : null}
                  </>
                )}

                {isHiit && (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.02)', padding: 10, borderRadius: 8, marginTop: 4 }}>
                    <View style={[styles.metricsRow, { marginBottom: 10 }]}>
                      <Text style={[styles.metricText, { color: colors.textPrimary, fontWeight: '700' }]}>
                        🔄 {ex.sets || '1'} Vueltas
                      </Text>
                      {ex.rest_block ? (
                        <Text style={[styles.metricText, { color: colors.textSecondary }]}>
                          ⏱️ {formatDuration(ex.rest_block)} desc. vuelta
                        </Text>
                      ) : null}
                    </View>

                    {ex.hiit_exercises && ex.hiit_exercises.map((hiitEx: any, hIdx: number) => (
                      <View key={hIdx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                        <Text style={{ color: badgeColor, fontWeight: '900', marginRight: 6 }}>{hIdx + 1}.</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>
                            {hiitEx.name} <Text style={{ fontWeight: '400', color: colors.textSecondary }}>
                              {hiitTarget(hiitEx) ? `(${hiitTarget(hiitEx)})` : ''}
                            </Text>
                          </Text>
                          {hiitEx.exercise_notes ? (
                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontStyle: 'italic' }}>- {hiitEx.exercise_notes}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Fecha y guardar en la agenda */}
        <View style={[styles.scheduleArea, { backgroundColor: colors.surfaceHighlight }]}>
          {isSaved ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success || '#10B981'} />
              <Text style={{ color: colors.success || '#10B981', fontWeight: '800' }}>Guardada para el {friendlyDate(validDate).toLowerCase()}</Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <Text style={[styles.scheduleLabel, { color: colors.textPrimary, marginBottom: 0 }]}>Fecha:</Text>
                <TextInput
                  accessibilityLabel={`Fecha para ${workout.title || 'la sesión'}`}
                  style={[styles.dateInput, { backgroundColor: colors.surface, borderColor: validDate ? colors.border : (colors.error || '#EF4444'), color: colors.textPrimary }]}
                  value={date}
                  onChangeText={v => setDates(prev => ({ ...prev, [key]: v }))}
                  onBlur={() => { if (validDate) setDates(prev => ({ ...prev, [key]: validDate })); }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={colors.textSecondary}
                />
                {[{ l: 'Hoy', d: localDateStr() }, { l: 'Mañana', d: addDaysStr(localDateStr(), 1) }].map(o => (
                  <TouchableOpacity key={o.l} accessibilityRole="button" accessibilityLabel={`${o.l} para ${workout.title || 'la sesión'}`} onPress={() => setDates(prev => ({ ...prev, [key]: o.d }))}
                    style={[styles.dateChip, { borderColor: colors.border }, validDate === o.d && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    <Text style={{ color: validDate === o.d ? '#FFF' : colors.textPrimary, fontWeight: '700', fontSize: 12 }}>{o.l}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={{ color: validDate ? colors.textSecondary : (colors.error || '#EF4444'), fontSize: 12, fontWeight: '600' }}>
                  {validDate ? friendlyDate(validDate) : 'Fecha no válida'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button" accessibilityLabel={`Añadir ${workout.title || 'sesión'} a la agenda`}
                disabled={!!savingKey}
                style={[styles.scheduleBtn, { backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: savingKey ? 0.6 : 1 }]}
                onPress={() => saveWorkouts([{ key, workout }])}
              >
                {savingKey === key ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="calendar" size={18} color="#FFF" />}
                <Text style={{ color: '#FFF', fontWeight: '800' }}>Añadir a la agenda</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const workouts = item.workouts || [];
    const pending = workouts.map((w, i) => ({ key: `${item.id}-${i}`, workout: w })).filter(x => !saved[x.key]);

    return (
      <View style={[styles.messageWrapper, isUser ? styles.messageWrapperUser : styles.messageWrapperAssistant]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: item.isError ? (colors.error || '#EF4444') : colors.primary }]}>
            <Ionicons name={item.isError ? 'alert' : 'sparkles'} size={14} color="#FFF" />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={[
            styles.messageBubble,
            isUser ? { backgroundColor: colors.primary } : { backgroundColor: colors.surfaceHighlight }
          ]}>
            <Text style={[styles.messageText, { color: isUser ? '#FFF' : colors.textPrimary }]}>
              {item.content}
            </Text>
            {!!item.retryText && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar" onPress={() => sendMessage(item.retryText!)} disabled={isTyping}
                style={[styles.retryBtn, { borderColor: colors.primary }]}>
                <Ionicons name="refresh" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '800' }}>Reintentar</Text>
              </TouchableOpacity>
            )}
          </View>

          {workouts.map((w, i) => renderWorkoutCard(item.id, w, i))}

          {workouts.length > 1 && pending.length > 1 && (
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={`Añadir las ${pending.length} sesiones a la agenda`}
              disabled={!!savingKey}
              style={[styles.acceptBtn, { backgroundColor: colors.primary, borderRadius: 16, marginTop: 12, opacity: savingKey ? 0.6 : 1 }]}
              onPress={() => saveWorkouts(pending)}
            >
              {savingKey === 'all' ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="calendar" size={20} color="#FFF" />}
              <Text style={styles.acceptBtnText}>Añadir las {pending.length} sesiones</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.container, { backgroundColor: colors.background }]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>AI Coach Pro</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            extraData={{ dates, saved, savingKey, isTyping }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          {isTyping && (
            <View style={styles.typingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 8, fontWeight: '500' }}>
                Preparando la propuesta… (puede tardar hasta un minuto)
              </Text>
            </View>
          )}

          <View style={[styles.inputArea, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              accessibilityLabel="Mensaje para la IA"
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary }]}
              placeholder="Ej: Adapta el entreno, me duele el hombro..."
              placeholderTextColor={colors.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Enviar mensaje"
              style={[styles.sendBtn, { backgroundColor: inputText.trim() && !isTyping ? colors.primary : colors.surfaceHighlight }]}
              onPress={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isTyping}
            >
              <Ionicons name="arrow-up" size={20} color={inputText.trim() && !isTyping ? '#FFF' : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  container: { flex: 0.92, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  closeBtn: { padding: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 20 },
  listContent: { padding: 15, paddingBottom: 20 },
  messageWrapper: { flexDirection: 'row', marginBottom: 24, maxWidth: '90%' },
  messageWrapperUser: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  messageWrapperAssistant: { alignSelf: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  messageBubble: { padding: 16, borderRadius: 24, borderTopLeftRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 24 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },

  workoutPreviewCard: { marginTop: 12, borderWidth: 1, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, overflow: 'hidden' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  previewTitle: { fontSize: 16, fontWeight: '800', marginLeft: 8, flex: 1 },
  blockCountText: { fontSize: 12, fontWeight: '600', color: '#888', backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  previewBody: { padding: 16, gap: 16 },

  exerciseBlock: { borderLeftWidth: 4, paddingLeft: 12, marginBottom: 4 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  exerciseName: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 8 },
  metricItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricText: { fontSize: 13, fontWeight: '600' },
  notesText: { fontSize: 13, fontStyle: 'italic', lineHeight: 18, marginTop: 4 },

  scheduleArea: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  scheduleLabel: { fontWeight: '800', marginBottom: 12, fontSize: 14 },
  dateInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontWeight: '600', minWidth: 110, textAlign: 'center' },
  dateChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  scheduleBtn: { padding: 14, alignItems: 'center', borderRadius: 12 },

  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  acceptBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },

  typingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  inputArea: { flexDirection: 'row', padding: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 16, borderTopWidth: 1, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, fontSize: 16, lineHeight: 22 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginLeft: 12 }
});
