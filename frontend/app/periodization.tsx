import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const MACRO_COLORS = ['#4A90E2', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];
const MICRO_COLORS = ['#34C759', '#5856D6', '#FF9500', '#FF2D55', '#32ADE6'];
const MICRO_TIPOS = ['CARGA', 'RECUPERACION', 'TEST', 'COMPETICION'];

export default function PeriodizationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [macros, setMacros] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DE LOS MODALES ---
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

  // --- ACCIONES MACRO ---
  const handleSaveMacro = async () => {
    if (!macroForm.nombre) return;
    try {
      if (editingId) await api.updateMacrociclo(editingId, macroForm);
      else await api.createMacrociclo({ ...macroForm, athlete_id: params.athlete_id });
      setMacroModal(false); loadTree();
    } catch (e) { Alert.alert("Error", "No se pudo guardar"); }
  };

  const deleteMacro = (id: string) => {
    Alert.alert("Eliminar", "¿Borrar este bloque entero?", [
      { text: "No" },
      { text: "Sí", style: 'destructive', onPress: async () => { await api.deleteMacrociclo(id); loadTree(); } }
    ]);
  };

  // --- ACCIONES MICRO ---
  const handleSaveMicro = async () => {
    if (!microForm.nombre) return;
    try {
      if (editingId) await api.updateMicrociclo(editingId, microForm);
      else await api.createMicrociclo({ ...microForm, macrociclo_id: selectedMacroId });
      setMicroModal(false); loadTree();
    } catch (e) { Alert.alert("Error", "No se pudo guardar"); }
  };

  const deleteMicro = (id: string) => {
    Alert.alert("Eliminar", "¿Borrar esta semana?", [
      { text: "No" },
      { text: "Sí", style: 'destructive', onPress: async () => { await api.deleteMicrociclo(id); loadTree(); } }
    ]);
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
        {/* BOTÓN AÑADIR MACRO */}
        <TouchableOpacity 
          style={[styles.addMacroMain, { backgroundColor: colors.primary }]}
          onPress={() => { setEditingId(null); setMacroForm({ nombre: '', fecha_inicio: '', fecha_fin: '', color: MACRO_COLORS[0] }); setMacroModal(true); }}
        >
          <Ionicons name="add-circle" size={20} color="#FFF" />
          <Text style={styles.addMacroText}>NUEVO MACROCICLO</Text>
        </TouchableOpacity>

        {macros.length === 0 && (
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 30 }}>Aún no has creado ningún macrociclo.</Text>
        )}

        {macros.map((macro) => (
          <View key={macro.id} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
            {/* CABECERA MACRO */}
            <View style={[styles.macroHeader, { backgroundColor: (macro.color || colors.primary) + '15' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.macroTitle, { color: macro.color }]}>{macro.nombre}</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>{macro.fecha_inicio} - {macro.fecha_fin}</Text>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity onPress={() => { setEditingId(macro.id); setMacroForm({ ...macro }); setMacroModal(true); }}><Ionicons name="pencil" size={18} color={macro.color} /></TouchableOpacity>
                <TouchableOpacity onPress={() => deleteMacro(macro.id)} style={{ marginLeft: 10 }}><Ionicons name="trash" size={18} color={colors.error} /></TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.addMicroSmall, { backgroundColor: macro.color }]}
                  onPress={() => { setEditingId(null); setSelectedMacroId(macro.id); setMicroForm({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', color: MICRO_COLORS[0] }); setMicroModal(true); }}
                >
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>+ MICRO</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* MICROCICLOS */}
            <View style={{ padding: 12 }}>
              {macro.microciclos?.map((micro: any) => (
                <View key={micro.id} style={[styles.microItem, { borderLeftColor: micro.color }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{micro.nombre} <Text style={{fontSize:10, color:micro.color}}>[{micro.tipo}]</Text></Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => { setEditingId(micro.id); setMicroForm({ ...micro }); setMicroModal(true); }}><Ionicons name="pencil" size={14} color={colors.textSecondary} /></TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteMicro(micro.id)}><Ionicons name="trash" size={14} color={colors.error} /></TouchableOpacity>
                    </View>
                  </View>
                  
                  {/* BOTÓN AÑADIR SESIÓN A ESTE MICRO */}
                  <TouchableOpacity 
                    style={styles.addSessionBtn}
                    onPress={() => router.push({ pathname: '/add-workout', params: { athlete_id: params.athlete_id, microciclo_id: micro.id } })}
                  >
                    <Ionicons name="add-circle-outline" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 11 }}>Añadir sesión</Text>
                  </TouchableOpacity>

                  {micro.workouts?.map((wk: any) => (
                    <TouchableOpacity key={wk.id} style={styles.workoutRow} onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } })}>
                      <Ionicons name="barbell-outline" size={14} color={colors.textSecondary} />
                      <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{wk.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* MODAL MACROCICLO */}
      <Modal visible={macroModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingId ? 'Editar Macrociclo' : 'Nuevo Macrociclo'}</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre" value={macroForm.nombre} onChangeText={(t) => setMacroForm({...macroForm, nombre: t})} />
            <View style={{flexDirection:'row', gap:10, marginTop: 10}}>
              <TextInput style={[styles.input, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Inicio (YYYY-MM-DD)" value={macroForm.fecha_inicio} onChangeText={(t) => setMacroForm({...macroForm, fecha_inicio: t})} />
              <TextInput style={[styles.input, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Fin (YYYY-MM-DD)" value={macroForm.fecha_fin} onChangeText={(t) => setMacroForm({...macroForm, fecha_fin: t})} />
            </View>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMacro}><Text style={styles.saveBtnText}>GUARDAR</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMacroModal(false)}><Text style={{ textAlign: 'center', color: colors.error, marginTop: 15 }}>Cancelar</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* MODAL MICROCICLO */}
      <Modal visible={microModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior="padding" style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingId ? 'Editar Micro' : 'Nueva Semana'}</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Nombre de la semana" value={microForm.nombre} onChangeText={(t) => setMicroForm({...microForm, nombre: t})} />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMicro}><Text style={styles.saveBtnText}>GUARDAR</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMicroModal(false)}><Text style={{ textAlign: 'center', color: colors.error, marginTop: 15 }}>Cancelar</Text></TouchableOpacity>
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
  macroTitle: { fontSize: 15, fontWeight: '900', textTransform: 'uppercase' },
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  addMicroSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 15 },
  microItem: { marginBottom: 15, paddingLeft: 12, borderLeftWidth: 4, paddingVertical: 5 },
  addSessionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, marginBottom: 5 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 15 },
  input: { borderWidth: 1, padding: 12, borderRadius: 10, marginBottom: 10 },
  saveBtn: { padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#FFF', fontWeight: '800' }
});
