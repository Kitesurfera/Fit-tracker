import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const MACRO_COLORS = ['#4A90E2', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];

export default function PeriodizationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [tree, setTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el Modal del Macrociclo
  const [macroModalVisible, setMacroModalVisible] = useState(false);
  const [savingMacro, setSavingMacro] = useState(false);
  const [macroForm, setMacroForm] = useState({
    nombre: '',
    fecha_inicio: '',
    fecha_fin: '',
    objetivo: '',
    color: MACRO_COLORS[0]
  });

  const loadTree = async () => {
    try {
      const data = await api.getPeriodizationTree(params.athlete_id!);
      setTree(data);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, []);

  const handleCreateMacro = async () => {
    if (!macroForm.nombre || !macroForm.fecha_inicio || !macroForm.fecha_fin) {
      alert('Por favor, completa el nombre y las fechas.');
      return;
    }
    setSavingMacro(true);
    try {
      await api.createMacrociclo({
        ...macroForm,
        athlete_id: params.athlete_id
      });
      setMacroModalVisible(false);
      setMacroForm({ nombre: '', fecha_inicio: '', fecha_fin: '', objetivo: '', color: MACRO_COLORS[0] });
      loadTree(); // Recargamos el calendario para ver el nuevo bloque
    } catch (e) {
      alert('Error al guardar el macrociclo');
    } finally {
      setSavingMacro(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Calendario - {params.name}</Text>
        <TouchableOpacity onPress={() => setMacroModalVisible(true)}>
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
        {tree.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No hay planificación estructurada aún. Comienza creando un Macrociclo.
          </Text>
        ) : (
          tree.map((macro, i) => (
            <View key={i} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
              <View style={[styles.macroHeader, { backgroundColor: macro.color + '20' }]}>
                <View>
                  <Text style={[styles.macroTitle, { color: macro.color }]}>{macro.nombre}</Text>
                  <Text style={styles.dateText}>{macro.fecha_inicio} al {macro.fecha_fin}</Text>
                </View>
                <TouchableOpacity style={styles.addMicroBtn} onPress={() => {/* Modal microciclo */}}>
                  <Ionicons name="add" size={18} color={macro.color} />
                  <Text style={{ color: macro.color, fontSize: 12, fontWeight: '700' }}>Microciclo</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.microContainer}>
                {macro.microciclos?.map((micro: any, j: number) => (
                  <View key={j} style={[styles.microCard, { borderLeftColor: micro.color }]}>
                    <Text style={styles.microTitle}>{micro.nombre} ({micro.tipo})</Text>
                    <Text style={styles.dateText}>{micro.fecha_inicio} al {micro.fecha_fin}</Text>
                    <View style={styles.workoutList}>
                      {micro.workouts?.map((wk: any, k: number) => (
                        <View key={k} style={styles.workoutItem}>
                          <Ionicons name={wk.completed ? "checkmark-circle" : "barbell"} size={16} color={wk.completed ? colors.success : colors.textSecondary} />
                          <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{wk.title} ({wk.date})</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* MODAL CREAR MACROCICLO */}
      <Modal visible={macroModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Nuevo Macrociclo</Text>
              <TouchableOpacity onPress={() => setMacroModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>NOMBRE DEL BLOQUE</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Ej: Temporada 2026, Pretemporada..."
                placeholderTextColor={colors.textSecondary}
                value={macroForm.nombre}
                onChangeText={(t) => setMacroForm({ ...macroForm, nombre: t })}
              />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA INICIO</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                    value={macroForm.fecha_inicio}
                    onChangeText={(t) => setMacroForm({ ...macroForm, fecha_inicio: t })}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>FECHA FIN</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textSecondary}
                    value={macroForm.fecha_fin}
                    onChangeText={(t) => setMacroForm({ ...macroForm, fecha_fin: t })}
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: colors.textSecondary }]}>OBJETIVO PRINCIPAL (Opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Ej: Pico de forma para Mundial..."
                placeholderTextColor={colors.textSecondary}
                multiline
                value={macroForm.objetivo}
                onChangeText={(t) => setMacroForm({ ...macroForm, objetivo: t })}
              />

              <Text style={[styles.label, { color: colors.textSecondary }]}>COLOR IDENTIFICATIVO</Text>
              <View style={styles.colorRow}>
                {MACRO_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorCircle, { backgroundColor: c, borderWidth: macroForm.color === c ? 3 : 0, borderColor: colors.textPrimary }]}
                    onPress={() => setMacroForm({ ...macroForm, color: c })}
                  />
                ))}
              </View>

              <TouchableOpacity 
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreateMacro}
                disabled={savingMacro}
              >
                {savingMacro ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>GUARDAR MACROCICLO</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  
  macroCard: { borderWidth: 2, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  macroHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroTitle: { fontSize: 18, fontWeight: '800', textTransform: 'uppercase' },
  dateText: { fontSize: 12, color: '#666', marginTop: 4 },
  addMicroBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  
  microContainer: { padding: 12, backgroundColor: '#FAFAFA' },
  microCard: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderLeftWidth: 6, marginBottom: 10, elevation: 1 },
  microTitle: { fontSize: 15, fontWeight: '700' },
  
  workoutList: { marginTop: 10, gap: 6 },
  workoutItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  workoutTitle: { fontSize: 13, fontWeight: '500' },

  // Estilos del Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12, letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  
  colorRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 24 },
  colorCircle: { width: 40, height: 40, borderRadius: 20 },
  
  submitBtn: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 1 }
});
