import React, { useState, useRef, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  TextInput, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api'; // <-- IMPORTAMOS TU API

// Estructura de los mensajes del chat
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
      content: '¡Hola! Soy tu asistente de planificación. Dime qué tipo de sesión necesitas hoy o qué quieres modificar de tus entrenamientos anteriores.',
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
      // Preparamos el historial para que la IA sepa de qué estamos hablando
      const chatHistory = messages
        .filter(m => m.id !== 'welcome-1')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      // <-- USAMOS LA API QUE YA TIENE EL TOKEN INTEGRADO -->
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

          {item.isWorkoutPayload && item.workoutData && (
            <View style={[styles.workoutPreviewCard, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
              <View style={styles.previewHeader}>
                <Ionicons name="barbell" size={16} color={colors.primary} />
                <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
                  {item.workoutData.title}
                </Text>
              </View>
              
              <View style={styles.previewBody}>
                {item.workoutData.exercises.map((ex: any, idx: number) => (
                  <Text key={idx} style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 4 }}>
                    • {ex.name} <Text style={{fontWeight: '700', color: colors.textPrimary}}>({ex.sets}x{ex.reps})</Text>
                  </Text>
                ))}
              </View>

              <TouchableOpacity 
                style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                onPress={() => console.log("Claudia, aquí guardarías este JSON en tu base de datos:", item.workoutData)}
              >
                <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                <Text style={styles.acceptBtnText}>Aceptar y Guardar Sesión</Text>
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
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Gemini Coach</Text>
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
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>Escribiendo...</Text>
            </View>
          )}

          <View style={[styles.inputArea, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary }]}
              placeholder="Ej: Necesito un entreno suave hoy..."
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
              <Ionicons name="send" size={18} color={inputText.trim() ? '#FFF' : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: { flex: 0.9, borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '900' },
  closeBtn: { padding: 4 },
  listContent: { padding: 15, paddingBottom: 20 },
  messageWrapper: { flexDirection: 'row', marginBottom: 20, maxWidth: '85%' },
  messageWrapperUser: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  messageWrapperAssistant: { alignSelf: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 10, marginTop: 2 },
  messageBubble: { padding: 14, borderRadius: 20 },
  messageText: { fontSize: 15, lineHeight: 22 },
  workoutPreviewCard: { marginTop: 10, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  previewTitle: { fontSize: 14, fontWeight: '800', marginLeft: 8 },
  previewBody: { padding: 12 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, gap: 8 },
  acceptBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  typingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
  inputArea: { flexDirection: 'row', padding: 15, paddingBottom: Platform.OS === 'ios' ? 30 : 15, borderTopWidth: 1, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 45, maxHeight: 100, borderRadius: 20, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
  sendBtn: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginLeft: 10 }
});
