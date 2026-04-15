import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isWorkoutPayload?: boolean; 
  workoutData?: any; 
}

export default function GeminiChatModal({ 
  isVisible, 
  onClose, 
  athleteContext 
}: { 
  isVisible: boolean; 
  onClose: () => void;
  athleteContext?: any; 
}) {
  const { colors } = useTheme();
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: '¡Hola! Soy la IA de asistencia deportiva. ¿Qué ajustamos o planificamos hoy?',
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
    };
    
    setMessages(prev => [...prev, newUserMsg]);
    const currentInput = inputText;
    setInputText('');
    setIsTyping(true);

    try {
      const chatHistory = messages
        .filter(m => m.id !== 'welcome-1')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      const aiData = await api.generateWorkout({
          userMessage: currentInput,
          athleteContext: athleteContext || { fatigue: 3, soreness: 3, cyclePhase: 'No definida' },
          chatHistory: chatHistory
      });

      const newAssistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiData.response_message || 'He preparado esta sesión para ti:',
        isWorkoutPayload: !!aiData.workoutData,
        workoutData: aiData.workoutData
      };

      setMessages(prev => [...prev, newAssistantMsg]);

    } catch (error) {
      console.error("Error en el chat:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Lo siento, no he podido conectar con el cerebro de la IA. Comprueba tu conexión.'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageWrapper, isUser ? styles.messageWrapperUser : styles.messageWrapperAssistant]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Ionicons name="sparkles" size={14} color="#FFF" />
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
          </View>

          {/* --- TARJETA DE ENTRENAMIENTO PREMIUM --- */}
          {item.isWorkoutPayload && item.workoutData && (
            <View style={[styles.workoutPreviewCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.previewHeader}>
                <View style={styles.titleRow}>
                  <Ionicons name="clipboard" size={18} color={colors.primary} />
                  <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
                    {item.workoutData.title}
                  </Text>
                </View>
                <Text style={styles.blockCountText}>
                  {item.workoutData.exercises.length} bloques
                </Text>
              </View>
              
              <View style={styles.previewBody}>
                {item.workoutData.exercises.map((ex: any, idx: number) => {
                  const isHiit = ex.is_hiit_block;
                  // Colores dinámicos según el tipo de bloque
                  const badgeBg = isHiit ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';
                  const badgeColor = isHiit ? '#EF4444' : '#3B82F6';
                  const badgeText = isHiit ? 'HIIT / METCON' : 'FUERZA';

                  return (
                    <View key={idx} style={[styles.exerciseBlock, { borderLeftColor: badgeColor }]}>
                      <View style={styles.exerciseHeader}>
                        <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{ex.name}</Text>
                        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeText}</Text>
                        </View>
                      </View>
                      
                      <View style={styles.metricsRow}>
                        <View style={styles.metricItem}>
                          <Ionicons name="layers-outline" size={14} color={colors.textSecondary} />
                          <Text style={[styles.metricText, { color: colors.textSecondary }]}>{ex.sets} series</Text>
                        </View>
                        <View style={styles.metricItem}>
                          <Ionicons name="repeat-outline" size={14} color={colors.textSecondary} />
                          <Text style={[styles.metricText, { color: colors.textSecondary }]}>{ex.reps}</Text>
                        </View>
                      </View>

                      {ex.exercise_notes ? (
                        <Text style={[styles.notesText, { color: colors.textSecondary }]}>
                          💡 {ex.exercise_notes}
                        </Text>
                      ) : null}
                    </View>
                  )
                })}
              </View>

              <TouchableOpacity 
                style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                onPress={() => console.log("Añadir lógica de guardado aquí:", item.workoutData)}
              >
                <Ionicons name="add-circle" size={20} color="#FFF" />
                <Text style={styles.acceptBtnText}>Añadir al Calendario</Text>
              </TouchableOpacity>
            </View>
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
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          {isTyping && (
            <View style={styles.typingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 8, fontWeight: '500' }}>
                Analizando biomecánica y fatiga...
              </Text>
            </View>
          )}

          <View style={[styles.inputArea, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary }]}
              placeholder="Ej: Adapta el entreno, me duele el hombro..."
              placeholderTextColor={colors.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity 
              style={[styles.sendBtn, { backgroundColor: inputText.trim() ? colors.primary : colors.surfaceHighlight }]} 
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Ionicons name="arrow-up" size={20} color={inputText.trim() ? '#FFF' : colors.textSecondary} />
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
  
  // Estilos de la nueva Tarjeta de Entrenamiento
  workoutPreviewCard: { marginTop: 12, borderWidth: 1, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  previewTitle: { fontSize: 16, fontWeight: '800', marginLeft: 8, flex: 1 },
  blockCountText: { fontSize: 12, fontWeight: '600', color: '#888', backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  previewBody: { padding: 16, gap: 16 },
  
  // Estilos de cada bloque de ejercicio
  exerciseBlock: { borderLeftWidth: 4, paddingLeft: 12, marginBottom: 4 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  exerciseName: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  metricsRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  metricItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricText: { fontSize: 13, fontWeight: '600' },
  notesText: { fontSize: 13, fontStyle: 'italic', lineHeight: 18, marginTop: 4 },
  
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  acceptBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  typingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  inputArea: { flexDirection: 'row', padding: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 16, borderTopWidth: 1, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, fontSize: 16, lineHeight: 22 },
  sendBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginLeft: 12 }
});
