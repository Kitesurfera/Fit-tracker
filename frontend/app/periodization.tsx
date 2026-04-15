import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert, Modal } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import GeminiChatModal from '../src/components/GeminiChatModal';

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
  
  // Estados para controlar qué elementos están desplegados
  const [expandedMicros, setExpandedMicros] = useState<Record<string, boolean>>({});
  const [expandedMacros, setExpandedMacros] = useState<Record<string, boolean>>({});

  const [macroModal, setMacroModal] = useState(false);
  const [microModal, setMicroModal] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [targetMicroId, setTargetMicroId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMacroId, setSelectedMacroId] = useState<string>('');
  
  const [macroForm, setMacroForm] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '', color: MACRO_COLORS[0] });
  const [microForm, setMicroForm] = useState({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', color: MICRO_COLORS[0] });

  // <-- ESTADO PARA EL MODAL DE IA -->
  const [isChatVisible, setChatVisible] = useState(false);

  const sortByDateDesc = (a: any, b: any, key: string = 'fecha_inicio') => {
    return new Date(b[key] || b.start_date || 0).getTime() - new Date(a[key] || a.start_date || 0).getTime();
  };

  const loadTree = async () => {
    try {
      setLoading(true);
      if (!params.athlete_id) return;
      const res = await api.getPeriodizationTree(params.athlete_id);
      
      const sortedMacros = (res?.macros || []).sort(sortByDateDesc);
      
      sortedMacros.forEach((macro: any) => {
        if (macro.microciclos) {
          macro.microciclos.sort(sortByDateDesc);
          macro.microciclos.forEach((micro: any) => {
            if (micro.workouts) {
              micro.workouts.sort((a: any, b: any) => sortByDateDesc(a, b, 'date'));
            }
          });
        }
      });

      // Expandimos el primer macro por defecto al cargar
      if (sortedMacros.length > 0 && Object.keys(expandedMacros).length === 0) {
        const firstId = sortedMacros[0].id || sortedMacros[0]._id;
        if (firstId) setExpandedMacros({ [firstId]: true });
      }

      setMacros(sortedMacros);
      setUnassigned(res?.unassigned_workouts || []);
    } catch (e) { console.log(e); } 
    finally { setLoading(false); }
  };

  useFocusEffect(
    useCallback(() => {
      if (params.athlete_id) {
        loadTree();
      }
    }, [params.athlete_id])
  );

  const toggleMicro = (id: string) => {
    setExpandedMicros(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleMacro = (id: string) => {
    setExpandedMacros(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
      
      setMacroModal(false); 
      loadTree();
    } catch (e) { Alert.alert("Error", "No se pudo guardar el macrociclo."); }
  };

  const deleteMacro = (id: string) => {
    if (!id) return;
    const action = async () => { await api.deleteMacrociclo(id); loadTree(); };
    if (Platform.OS === 'web') {
      if (window.confirm("¿Borrar este macrociclo entero?")) action();
    } else {
      Alert.alert("Eliminar", "¿Borrar este bloque entero?", [{ text: "No" }, { text: "Sí", style: 'destructive', onPress: action }]);
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
      
      setMicroModal(false); 
      loadTree();
      
      if (!editingId) {
        setExpandedMacros(prev => ({ ...prev, [selectedMacroId]: true }));
      }
    } catch (e) { Alert.alert("Error", "No se pudo guardar el microciclo."); }
  };

  const deleteMicro = (id: string) => {
    if (!id) return;
    const action = async () => { await api.deleteMicrociclo(id); loadTree(); };
    if (Platform.OS === 'web') {
      if (window.confirm("¿Borrar este microciclo?")) action();
    } else {
      Alert.alert("Eliminar", "¿Borrar esta semana?", [{ text: "No" }, { text: "Sí", style: 'destructive', onPress: action }]);
    }
  };

  const handleAssignWorkout = async (workoutId: string) => {
    if (!targetMicroId) return;
    try {
      setLoading(true);
      await api.updateWorkout(workoutId, { microciclo_id: targetMicroId });
      setAssignModal(false);
      loadTree();
      setExpandedMicros(prev => ({ ...prev, [targetMicroId]: true }));
    } catch (e) {
      setLoading(false);
      Alert.alert("Error", "No se pudo asignar la sesión");
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
        <TouchableOpacity 
          style={[styles.addMacroMain, { backgroundColor: colors.primary }]} 
          onPress={() => { setEditingId(null); setMacroForm({ nombre: '', fecha_inicio: '', fecha_fin: '', color: MACRO_COLORS[0] }); setMacroModal(true); }}
        >
          <Ionicons name="add-circle" size={20} color="#FFF" />
          <Text style={styles.addMacroText}>NUEVO MACROCICLO</Text>
        </TouchableOpacity>

        {macros.length === 0 && <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 30 }}>Aún no has creado ningún macrociclo.</Text>}

        {macros.map((macro) => {
          const macroId = macro.id || macro._id;
          if (!macroId) return null;
          const isMacroExpanded = expandedMacros[macroId];

          return (
            <View key={macroId} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
              <TouchableOpacity 
                style={[styles.macroHeader, { backgroundColor: (macro.color || colors.primary) + '15' }]}
                onPress={() => toggleMacro(macroId)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.macroTitle, { color: colors.textPrimary }]}>{macro.nombre || macro.name}</Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>{macro.fecha_inicio || macro.start_date} - {macro.fecha_fin || macro.end_date}</Text>
                </View>
                <View style={styles.actionsRow}>
                  {/* EDITAR MACRO */}
                  <TouchableOpacity style={styles.iconHitbox} onPress={(e) => { 
                    if (e?.stopPropagation) e.stopPropagation(); 
                    setEditingId(macroId); 
                    setMacroForm({ 
                      nombre: macro.nombre || macro.name || '', 
                      fecha_inicio: macro.fecha_inicio || macro.start_date || '', 
                      fecha_fin: macro.fecha_fin || macro.end_date || '', 
                      color: macro.color || MACRO_COLORS[0] 
                    }); 
                    setMacroModal(true); 
                  }}>
                    <Ionicons name="pencil" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  
                  {/* ELIMINAR MACRO */}
                  <TouchableOpacity style={styles.iconHitbox} onPress={(e) => { 
                    if (e?.stopPropagation) e.stopPropagation(); 
                    deleteMacro(macroId); 
                  }}>
                    <Ionicons name="trash" size={18} color={colors.error || '#EF4444'} />
                  </TouchableOpacity>
                  
                  {/* NUEVO MICRO */}
                  <TouchableOpacity style={[styles.addMicroSmall, { backgroundColor: colors.primary }]} onPress={(e) => { 
                    if (e?.stopPropagation) e.stopPropagation(); 
                    setEditingId(null); 
                    setSelectedMacroId(macroId); 
                    setMicroForm({ nombre: '', tipo: 'CARGA', fecha_inicio: '', fecha_fin: '', color: macro.color || MICRO_COLORS[0] }); 
                    setMicroModal(true); 
                  }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>+ MICRO</Text>
                  </TouchableOpacity>
                  
                  <Ionicons name={isMacroExpanded ? "chevron-up" : "chevron-down"} size={22} color={colors.textSecondary} style={{ marginLeft: 10 }} />
                </View>
              </TouchableOpacity>

              {isMacroExpanded && (
                <View style={{ padding: 12 }}>
                  {macro.microciclos?.length > 0 ? (
                    macro.microciclos.map((micro: any) => {
                      const microId = micro.id || micro._id;
                      if (!microId) return null;
                      const isExpanded = expandedMicros[microId];
                      
                      return (
                        <View key={microId} style={[styles.microItem, { borderLeftColor: micro.color || colors.primary }]}>
                          <TouchableOpacity 
                            style={styles.microHeaderToggle} 
                            onPress={() => toggleMicro(microId)}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
                                {micro.nombre || micro.name} <Text style={{fontSize:10, color: micro.color || colors.primary, fontWeight: '900'}}>[{micro.tipo || micro.type}]</Text>
                              </Text>
                              <Text style={{ fontSize: 9, color: colors.textSecondary }}>{micro.fecha_inicio || micro.start_date} al {micro.fecha_fin || micro.end_date}</Text>
                            </View>
                            
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              {/* EDITAR MICRO */}
                              <TouchableOpacity style={styles.iconHitboxSmall} onPress={(e) => { 
                                if (e?.stopPropagation) e.stopPropagation(); 
                                setEditingId(microId); 
                                setMicroForm({ 
                                  nombre: micro.nombre || micro.name || '', 
                                  tipo: micro.tipo || micro.type || 'CARGA', 
                                  fecha_inicio: micro.fecha_inicio || micro.start_date || '', 
                                  fecha_fin: micro.fecha_fin || micro.end_date || '', 
                                  color: micro.color || macro.color || MICRO_COLORS[0] 
                                }); 
                                setSelectedMacroId(macroId); 
                                setMicroModal(true); 
                              }}>
                                <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                              </TouchableOpacity>
                              
                              {/* ELIMINAR MICRO */}
                              <TouchableOpacity style={styles.iconHitboxSmall} onPress={(e) => { 
                                if (e?.stopPropagation) e.stopPropagation(); 
                                deleteMicro(microId); 
                              }}>
                                <Ionicons name="trash" size={16} color={colors.error || '#EF4444'} />
                              </TouchableOpacity>
                              
                              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.primary} />
                            </View>
                          </TouchableOpacity>
                          
                          {isExpanded && (
                            <View style={styles.expandedContent}>
                              <TouchableOpacity 
                                style={styles.addSessionBtn} 
                                onPress={() => { setTargetMicroId(microId); setAssignModal(true); }}
                              >
                                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Añadir sesión</Text>
                              </TouchableOpacity>

                              {micro.workouts?.length > 0 ? micro.workouts.map((wk: any) => {
                                const wkId = wk.id || wk._id;
                                return (
                                  <TouchableOpacity key={wkId} style={styles.workoutRow} onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wkId } })}>
                                    <Ionicons name="barbell-outline" size={16} color={colors.textSecondary} />
                                    <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>{wk.title}</Text>
                                    <Text style={{ fontSize: 10, color: colors.textSecondary, marginRight: 5 }}>{(wk.date || '').split('-').slice(1).reverse().join('/')}</Text>
                                    {wk.completed && <Ionicons name="checkmark-circle" size={14} color={colors.success || '#10B981'} />}
                                  </TouchableOpacity>
                                );
                              }) : (
                                <Text style={styles.emptyWorkoutsText}>No hay sesiones en este microciclo.</Text>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })
                  ) : (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginVertical: 10 }}>Este macrociclo aún no tiene microciclos.</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* --- BOTÓN FLOTANTE GEMINI --- */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setChatVisible(true)}
      >
        <Ionicons name="sparkles" size={26} color="#FFF" />
      </TouchableOpacity>

      {/* --- MODAL PARA ASIGNAR SESIONES --- */}
      <Modal visible={assignModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Añadir al microciclo</Text>
              <TouchableOpacity onPress={() => setAssignModal(false)}><Ionicons name="close" size={24} color={colors.textPrimary} /></TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={[styles.createNewSessionBtn, { backgroundColor: colors.primary }]} 
              onPress={() => { 
                setAssignModal(false); 
                router.push({ pathname: '/add-workout', params: { athlete_id: params.athlete_id, microciclo_id: targetMicroId } });
              }}
            >
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '800', marginLeft: 8 }}>CREAR NUEVA SESIÓN</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { marginBottom: 10 }]}>O RESCATAR SESIÓN SUELTA:</Text>
            <ScrollView style={{ maxHeight: 250 }}>
              {unassigned.length > 0 ? unassigned.map((wk: any) => (
                <TouchableOpacity key={wk.id || wk._id} style={[styles.unassignedWkBtn, { borderColor: colors.border }]} onPress={() => handleAssignWorkout(wk.id || wk._id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>{wk.title}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{wk.date}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                </TouchableOpacity>
              )) : <Text style={{ color: colors.textSecondary, textAlign: 'center', marginVertical: 20, fontStyle: 'italic' }}>No hay sesiones sueltas.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* --- MODALES RESTANTES --- */}
      <Modal visible={macroModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingId ? 'Editar Macrociclo' : 'Nuevo Macrociclo'}</Text>
            <Text style={styles.label}>NOMBRE DEL MACROCICLO</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: Fase de Volumen" placeholderTextColor={colors.textSecondary} value={macroForm.nombre} onChangeText={(t) => setMacroForm({...macroForm, nombre: t})} />
            
            {/* SELECTOR DE COLOR MACRO */}
            <Text style={[styles.label, { marginTop: 15 }]}>COLOR IDENTIFICATIVO</Text>
            <View style={styles.colorRow}>
              {MACRO_COLORS.map(c => (
                <TouchableOpacity 
                  key={c} 
                  style={[styles.colorSwatch, { backgroundColor: c }, macroForm.color === c && styles.colorSwatchSelected]} 
                  onPress={() => setMacroForm({...macroForm, color: c})} 
                />
              ))}
            </View>

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
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMacro}><Text style={styles.saveBtnText}>GUARDAR MACRO</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMacroModal(false)} style={styles.cancelBtn}><Text style={{ color: colors.error || '#EF4444', fontWeight: '600' }}>Cancelar</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={microModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editingId ? 'Editar Microciclo' : 'Nuevo Microciclo'}</Text>
            
            <Text style={styles.label}>NOMBRE DEL MICROCICLO</Text>
            <TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="Semana 1" placeholderTextColor={colors.textSecondary} value={microForm.nombre} onChangeText={(t) => setMicroForm({...microForm, nombre: t})} />
            
            <Text style={[styles.label, { marginTop: 15 }]}>TIPO (EDITABLE O SELECCIONABLE)</Text>
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, marginBottom: 10 }]} 
              placeholder="Ej: Transformación, Carga..." 
              placeholderTextColor={colors.textSecondary} 
              value={microForm.tipo} 
              onChangeText={(t) => setMicroForm({...microForm, tipo: t.toUpperCase()})} 
            />
            <View style={styles.typeChipsContainer}>
              {MICRO_TIPOS.map(tipo => (
                <TouchableOpacity key={tipo} style={[styles.typeChip, { borderColor: colors.border, backgroundColor: microForm.tipo === tipo ? colors.primary : 'transparent' }]} onPress={() => setMicroForm({...microForm, tipo})}>
                  <Text style={{ color: microForm.tipo === tipo ? '#FFF' : colors.textPrimary, fontSize: 11, fontWeight: '700' }}>{tipo}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* SELECTOR DE COLOR MICRO */}
            <Text style={[styles.label, { marginTop: 15 }]}>COLOR EN CALENDARIO</Text>
            <View style={styles.colorRow}>
              {MICRO_COLORS.map(c => (
                <TouchableOpacity 
                  key={c} 
                  style={[styles.colorSwatch, { backgroundColor: c }, microForm.color === c && styles.colorSwatchSelected]} 
                  onPress={() => setMicroForm({...microForm, color: c})} 
                />
              ))}
            </View>

            <View style={{flexDirection:'row', gap:10, marginTop: 15}}>
              <View style={{flex: 1}}><Text style={styles.label}>INICIO</Text><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" value={microForm.fecha_inicio} onChangeText={(t) => setMicroForm({...microForm, fecha_inicio: t})} /></View>
              <View style={{flex: 1}}><Text style={styles.label}>FIN</Text><TextInput style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} placeholder="YYYY-MM-DD" value={microForm.fecha_fin} onChangeText={(t) => setMicroForm({...microForm, fecha_fin: t})} /></View>
            </View>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveMicro}><Text style={styles.saveBtnText}>GUARDAR MICRO</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setMicroModal(false)} style={styles.cancelBtn}><Text style={{ color: colors.error || '#EF4444', fontWeight: '600' }}>Cancelar</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* <-- MODAL DE GEMINI ACTUALIZADO --> */}
      <GeminiChatModal 
        isVisible={isChatVisible} 
        onClose={() => setChatVisible(false)} 
        athleteId={params.athlete_id as string}
        athleteName={params.name as string}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  addMacroMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12, marginBottom: 20, gap: 10 },
  addMacroText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
  macroCard: { borderWidth: 2, borderRadius: 16, marginBottom: 20, overflow: 'hidden' },
  macroHeader: { flexDirection: 'row', padding: 15, alignItems: 'center' },
  macroTitle: { fontSize: 16, fontWeight: '900', textTransform: 'uppercase' },
  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  addMicroSmall: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 10 },
  iconHitbox: { padding: 8 },
  iconHitboxSmall: { padding: 4 },
  microItem: { marginBottom: 10, paddingLeft: 12, borderLeftWidth: 4, paddingVertical: 5 },
  microHeaderToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  expandedContent: { marginTop: 5, paddingLeft: 5 },
  addSessionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 10 },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.03)', paddingHorizontal: 10, borderRadius: 10 },
  emptyWorkoutsText: { color: '#999', fontSize: 12, fontStyle: 'italic', marginVertical: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 20 },
  input: { borderWidth: 1, padding: 14, borderRadius: 12, fontSize: 15 },
  label: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 6, letterSpacing: 0.5 },
  typeChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  saveBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 25 },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  cancelBtn: { padding: 15, alignItems: 'center', marginTop: 5 },
  createNewSessionBtn: { flexDirection: 'row', justifyContent: 'center', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 25 },
  unassignedWkBtn: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  
  // ESTILOS PARA LOS COLORES
  colorRow: { flexDirection: 'row', gap: 12, marginTop: 5, marginBottom: 5, flexWrap: 'wrap' },
  colorSwatch: { width: 34, height: 34, borderRadius: 17, opacity: 0.4, borderWidth: 2, borderColor: 'transparent' },
  colorSwatchSelected: { opacity: 1, borderColor: '#FFF', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },

  // --- ESTILO DEL BOTÓN FLOTANTE ---
  fab: {
    position: 'absolute',
    bottom: 25,
    right: 25,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  }
});
