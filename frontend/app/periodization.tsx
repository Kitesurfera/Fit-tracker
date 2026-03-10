import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const MACRO_COLORS = ['#4A90E2', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];
const MICRO_COLORS = ['#34C759', '#5856D6', '#FF9500', '#FF2D55', '#32ADE6', '#8B5CF6'];
const MICRO_TIPOS = ['CARGA', 'RECUPERACION', 'TEST', 'COMPETICION'];

export default function PeriodizationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [macros, setMacros] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [macroModal, setMacroModal] = useState(false);
  const [microModal, setMicroModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMacroId, setSelectedMacroId] = useState<string>('');
  
  const [macroForm, setMacroForm] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '', color: MACRO_COLORS[0] });
  const [microForm, setMicroForm] = useState({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', color: MICRO_COLORS[0] });

  const loadTree = async () => {
    try {
      setLoading(true);
      if (!params.athlete_id) return;
      const res = await api.getPeriodizationTree(params.athlete_id);
      setMacros(res?.macros || []);
      setUnassigned(res?.unassigned_workouts || []);
    } catch (e) { console.log(e); } 
    finally { setLoading(false); }
  };

  useEffect(() => { loadTree(); }, [params.athlete_id]);

  const formatDateForDB = (dateStr: string) => {
    if (!dateStr) return '';
    const cleanStr = dateStr.replace(/\//g, '-');
    const parts = cleanStr.split('-');
    if (parts.length === 3 && parts[0].length <= 2) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return cleanStr;
  };

  const handleSaveMacro = async () => {
    if (!macroForm.nombre) return;
    try {
      const payload = {
        ...macroForm,
        fecha_inicio: formatDateForDB(macroForm.fecha_inicio),
        fecha_fin: formatDateForDB(macroForm.fecha_fin),
        start_date: formatDateForDB(macroForm.fecha_inicio),
        end_date: formatDateForDB(macroForm.fecha_fin),
        athlete_id: params.athlete_id
      };

      if (editingId) await api.updateMacrociclo(editingId, payload);
      else await api.createMacrociclo(payload);
      
      setMacroModal(false); loadTree();
    } catch (e) { Alert.alert("Error", "No se pudo guardar"); }
  };

  // --- CORRECCIÓN: BOTÓN ELIMINAR MACRO COMPATIBLE CON WEB ---
  const deleteMacro = (id: string) => {
    if (Platform.OS === 'web') {
      const isConfirmed = window.confirm("¿Estás segura de borrar este macrociclo entero?");
      if (isConfirmed) {
        api.deleteMacrociclo(id).then(loadTree).catch(() => alert("Error al eliminar"));
      }
    } else {
      Alert.alert("Eliminar", "¿Borrar este bloque entero?", [
        { text: "No", style: "cancel" }, 
        { text: "Sí", style: 'destructive', onPress: async () => { await api.deleteMacrociclo(id); loadTree(); } }
      ]);
    }
  };

  const handleSaveMicro = async () => {
    if (!microForm.nombre) return;
    try {
      const payload = {
        ...microForm,
        fecha_inicio: formatDateForDB(microForm.fecha_inicio),
        fecha_fin: formatDateForDB(microForm.fecha_fin),
        start_date: formatDateForDB(microForm.fecha_inicio),
        end_date: formatDateForDB(microForm.fecha_fin),
        macrociclo_id: selectedMacroId
      };

      if (editingId) await api.updateMicrociclo(editingId, payload);
      else await api.createMicrociclo(payload);
      
      setMicroModal(false); loadTree();
    } catch (e) { Alert.alert("Error", "No se pudo guardar"); }
  };

  // --- CORRECCIÓN: BOTÓN ELIMINAR MICRO COMPATIBLE CON WEB ---
  const deleteMicro = (id: string) => {
    if (Platform.OS === 'web') {
      const isConfirmed = window.confirm("¿Estás segura de borrar este microciclo?");
      if (isConfirmed) {
        api.deleteMicrociclo(id).then(loadTree).catch(() => alert("Error al eliminar"));
      }
    } else {
      Alert.alert("Eliminar", "¿Borrar esta semana?", [
        { text: "No", style: "cancel" }, 
        { text: "Sí", style: 'destructive', onPress: async () => { await api.deleteMicrociclo(id); loadTree(); } }
      ]);
    }
  };

  if (loading) return <View style={{flex:1, justifyContent:'center', backgroundColor:colors.background}}><ActivityIndicator size="large" color={colors.primary}/></View>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Planificación - {params.name}</Text>
        <TouchableOpacity onPress={loadTree}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity style={[styles.addMacroMain, { backgroundColor: colors.primary }]} onPress={() => { setEditingId(null); setMacroForm({ nombre: '', fecha_inicio: '', fecha_fin: '', color: MACRO_COLORS[0] }); setMacroModal(true); }}>
          <Ionicons name="add-circle" size={20} color="#FFF" />
          <Text style={styles.addMacroText}>NUEVO MACROCICLO</Text>
        </TouchableOpacity>

        {macros.length === 0 && <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 30 }}>Aún no has creado ningún macrociclo.</Text>}

        {macros.map((macro) => (
          <View key={macro.id} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
            <View style={[styles.macroHeader, { backgroundColor: (macro.color || colors.primary) + '15' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.macroTitle, { color: macro.color }]}>{macro.nombre}</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>{macro.fecha_inicio} - {macro.fecha_fin}</Text>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.iconHitbox} onPress={() => { setEditingId(macro.id); setMacroForm({ ...macro }); setMacroModal(true); }}>
                  <Ionicons name="pencil" size={18} color={macro.color} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconHitbox} onPress={() => deleteMacro(macro.id)}>
                  <Ionicons name="trash" size={18} color={colors.error} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.addMicroSmall, { backgroundColor: macro.color }]} onPress={() => { setEditingId(null); setSelectedMacroId(macro.id); setMicroForm({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', color: MICRO_COLORS[0] }); setMicroModal(true); }}>
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>+ MICRO</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ padding: 12 }}>
              {macro.microciclos?.map((micro: any) => (
                <View key={micro.id} style={[styles.microItem, { borderLeftColor: micro.color || colors.primary }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                      {micro.nombre} <Text style={{fontSize:10, color: micro.color || colors.primary, fontWeight: '900'}}>[{micro.tipo}]</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <TouchableOpacity style={styles.iconHitboxSmall} onPress={() => { setEditingId(micro.id); setMicroForm({ ...micro }); setSelectedMacroId(macro.id); setMicroModal(true); }}>
                        <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconHitboxSmall} onPress={() => deleteMicro(micro.id)}>
                        <Ionicons name="trash" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  <TouchableOpacity style={styles.addSessionBtn} onPress={() => router.push({ pathname: '/add-workout', params: { athlete_id: params.athlete_id, microciclo_id: micro.id } })}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Añadir sesión</Text>
                  </TouchableOpacity>

                  {micro.workouts?.map((wk: any) => (
                    <TouchableOpacity key={wk.id} style={styles.workoutRow} onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } })}>
                      <Ionicons name="barbell-outline" size={16} color={colors.textSecondary} />
                      <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>{wk.title}</Text>
                      {wk.completed && <Ionicons name="checkmark-circle" size={14} color={colors.success} />}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* --- MODAL MACROCICLO CON COLOR PICKER --- */}
      <Modal visible={macroModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingId ? 'Editar Macrociclo' : 'Nuevo Macrociclo'}</Text>
            
            <Text style={styles.label}>NOMBRE DEL MACROCICLO</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: Fase de Volumen" placeholderTextColor={colors.textSecondary} value={macroForm.nombre} onChangeText={(t) => setMacroForm({...macroForm, nombre: t})} />
            
            <View style={{flexDirection:'row', gap:10, marginTop: 10}}>
              <View style={{flex: 1}}>
                <Text style={styles.label}>INICIO</Text>
                <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={macroForm.fecha_inicio} onChangeText={(t) => setMacroForm({...macroForm, fecha_inicio: t})} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.label}>FIN</Text>
                <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={macroForm.fecha_fin} onChangeText={(t) => setMacroForm({...macroForm, fecha_fin: t})} />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 15 }]}>COLOR IDENTIFICATIVO</Text>
            <View style={styles.colorPickerContainer}>
              {MACRO_COLORS.map(c => (
                <TouchableOpacity 
                  key={c} 
                  style={[styles.colorCircle, { backgroundColor: c, borderWidth: macroForm.color === c ? 3 : 0, borderColor: colors.textPrimary }]} 
                  onPress={() => setMacroForm({...macroForm, color: c})} 
                />
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMacro}><Text style={styles.saveBtnText}>GUARDAR MACRO</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMacroModal(false)} style={styles.cancelBtn}><Text style={{ color: colors.error, fontWeight: '600' }}>Cancelar</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* --- MODAL MICROCICLO CON COLOR PICKER Y TIPO --- */}
      <Modal visible={microModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingId ? 'Editar Microciclo' : 'Nuevo Microciclo'}</Text>
            
            <Text style={styles.label}>NOMBRE DEL MICROCICLO</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: Semana 1" placeholderTextColor={colors.textSecondary} value={microForm.nombre} onChangeText={(t) => setMicroForm({...microForm, nombre: t})} />
            
            <Text style={[styles.label, { marginTop: 10 }]}>TIPO DE SEMANA</Text>
            <View style={styles.typeChipsContainer}>
              {MICRO_TIPOS.map(tipo => (
                <TouchableOpacity 
                  key={tipo} 
                  style={[styles.typeChip, { borderColor: colors.border, backgroundColor: microForm.tipo === tipo ? colors.primary : 'transparent' }]}
                  onPress={() => setMicroForm({...microForm, tipo})}
                >
                  <Text style={{ color: microForm.tipo === tipo ? '#FFF' : colors.textPrimary, fontSize: 11, fontWeight: '700' }}>{tipo}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{flexDirection:'row', gap:10, marginTop: 15}}>
              <View style={{flex: 1}}>
                <Text style={styles.label}>INICIO</Text>
                <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={microForm.fecha_inicio} onChangeText={(t) => setMicroForm({...microForm, fecha_inicio: t})} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.label}>FIN</Text>
                <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={microForm.fecha_fin} onChangeText={(t) => setMicroForm({...microForm, fecha_fin: t})} />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 15 }]}>COLOR IDENTIFICATIVO</Text>
            <View style={styles.colorPickerContainer}>
              {MICRO_COLORS.map(c => (
                <TouchableOpacity 
                  key={c} 
                  style={[styles.colorCircle, { backgroundColor: c, borderWidth: microForm.color === c ? 3 : 0, borderColor: colors.textPrimary }]} 
                  onPress={() => setMicroForm({...microForm, color: c})} 
                />
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMicro}><Text style={styles.saveBtnText}>GUARDAR MICRO</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMicroModal(false)} style={styles.cancelBtn}><Text style={{ color: colors.error, fontWeight: '600' }}>Cancelar</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  addMacroMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, marginBottom: 20, gap: 10 },
  addMacroText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  macroCard: { borderWidth: 2, borderRadius: 16, marginBottom: 20, overflow: 'hidden' },
  macroHeader: { flexDirection: 'row', padding: 15, alignItems: 'center' },
  macroTitle: { fontSize: 16, fontWeight: '900', textTransform: 'uppercase' },
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  addMicroSmall: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  iconHitbox: { padding: 8 },
  iconHitboxSmall: { padding: 4 },
  microItem: { marginBottom: 15, paddingLeft: 12, borderLeftWidth: 4, paddingVertical: 5 },
  addSessionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 8, paddingVertical: 4 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.02)', paddingHorizontal: 10, borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  input: { borderWidth: 1, padding: 14, borderRadius: 12, fontSize: 15 },
  label: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 6, letterSpacing: 0.5 },
  colorPickerContainer: { flexDirection: 'row', gap: 12, marginTop: 5, flexWrap: 'wrap' },
  colorCircle: { width: 36, height: 36, borderRadius: 18 },
  typeChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 25 },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  cancelBtn: { padding: 15, alignItems: 'center', marginTop: 5 }
});
