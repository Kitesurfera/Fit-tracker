import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  TextInput, ScrollView, ActivityIndicator, Alert, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const BODY_PARTS = [
  'Cuello', 'Hombros', 'Espalda Alta', 'Lumbar', 
  'Codos', 'Muñecas', 'Cadera', 'Rodillas', 'Tobillos'
];

const SLEEP_HOURS_OPTIONS = ['<6', '6', '7', '8', '9+'];

export default function WellnessModal({ isVisible, onClose }: { isVisible: boolean, onClose: () => void }) {
  const { colors } = useTheme();
  const { user, updateUser } = useAuth(); 
  const [loading, setLoading] = useState(false);
  
  const [form, setForm] = useState({
    fatigue: 3,
    stress: 3,
    sleep_quality: 3,
    sleep_hours: '',
    soreness: 3,
    notes: '',
    discomforts: {} as Record<string, 'leve' | 'fuerte'>
  });

  const isFemale = ['female', 'mujer', 'femenino'].includes(user?.gender?.toLowerCase() || '');

  // Resetear el formulario cada vez que se abre el modal
  useEffect(() => {
    if (isVisible) {
      setForm({
        fatigue: 3,
        stress: 3,
        sleep_quality: 3,
        sleep_hours: '',
        soreness: 3,
        notes: '',
        discomforts: {}
      });
    }
  }, [isVisible]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.postWellness({ ...form, cycle_phase: '' }); // El backend calculará la fase, o se ignora.
      onClose();
    } catch (e: any) {
      if (Platform.OS !== 'web') Alert.alert("Error de envío", e.message || "No se pudo conectar con el servidor.");
      else console.error("Error guardando wellness:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleDiscomfort = (part: string) => {
    setForm(prev => {
      const current = prev.discomforts[part];
      let nextState: 'leve' | 'fuerte' | null = null;
      
      if (!current) nextState = 'leve';
      else if (current === 'leve') nextState = 'fuerte';
      
      const newDiscomforts = { ...prev.discomforts };
      if (nextState) {
        newDiscomforts[part] = nextState;
      } else {
        delete newDiscomforts[part];
      }
      return { ...prev, discomforts: newDiscomforts };
    });
  };

  // --- LÓGICA DE DETECCIÓN INTELIGENTE DEL CICLO ---
  const getLocalDateStr = useCallback((date: Date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }, []);

  const todayStr = useMemo(() => getLocalDateStr(new Date()), [getLocalDateStr]);

  const cycleStatus = useMemo(() => {
    if (!isFemale || !user) return { showPrompt: false, type: 'none' };

    const lastPeriodStr = (user as any).last_period_date;
    const cycleLength = Number((user as any).cycle_length) || 28;
    const periodLength = Number((user as any).period_length) || 5;
    const isBleeding = (user as any).is_bleeding; 
    
    // Si no hay fecha registrada, mostramos prompt de inicio para que marque la primera
    if (!lastPeriodStr) return { showPrompt: true, type: 'start' };

    const parts = lastPeriodStr.split('-');
    const startY = Number(parts[0]);
    const startM = Number(parts[1]);
    const startD = Number(parts[2]);

    if (isNaN(startY) || isNaN(startM) || isNaN(startD)) return { showPrompt: true, type: 'start' };

    const lastPeriodDate = new Date(startY, startM - 1, startD);
    const todayDate = new Date();
    
    // Resetear horas para cálculo justo de días
    lastPeriodDate.setHours(0, 0, 0, 0);
    todayDate.setHours(0, 0, 0, 0);

    const diffTime = todayDate.getTime() - lastPeriodDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));

    // Si está marcada como sangrando actualmente
    if (isBleeding) {
        // Mostramos botón de finalizar, pero si lleva más de X días (ej. 10), asumimos que se olvidó y forzamos final
        if (diffDays > 10) return { showPrompt: false, type: 'none' }; 
        return { showPrompt: true, type: 'end' };
    }

    // Calcular días faltantes para la próxima regla (ventana de -3 a +periodLength días)
    const daysUntilNextPeriod = cycleLength - (diffDays % cycleLength);
    const isInStartWindow = daysUntilNextPeriod <= 3 || daysUntilNextPeriod === cycleLength || (diffDays % cycleLength) < periodLength;

    if (isInStartWindow) {
      return { showPrompt: true, type: 'start' };
    }

    return { showPrompt: false, type: 'none' };
  }, [user, isFemale]);

  const handleCycleAction = async (action: 'start' | 'end') => {
    setLoading(true);
    try {
        const payload = action === 'start' 
            ? { last_period_date: todayStr, is_bleeding: true }
            : { is_bleeding: false };

        if (api.updateProfile) {
            await api.updateProfile(payload);
            updateUser(payload); // Actualizamos contexto para que desaparezca el botón
        }
    } catch (e) {
        console.error("Error actualizando ciclo:", e);
        Alert.alert("Error", "No se pudo actualizar el registro del ciclo.");
    } finally {
        setLoading(false);
    }
  };

  const RatingScale = ({ label, field }: { label: string, field: keyof typeof form }) => (
    <View style={styles.scaleContainer}>
      <Text style={[styles.scaleLabel, { color: colors.textPrimary }]}>{label}</Text>
      <View style={styles.optionsRow}>
        {[1, 2, 3, 4, 5].map((num) => (
          <TouchableOpacity 
            key={num} 
            onPress={() => setForm(prev => ({ ...prev, [field]: num as never }))}
            style={[
              styles.optionCircle, 
              { borderColor: colors.border },
              form[field] === num && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}
          >
            <Text style={{ color: form[field] === num ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>
              {num}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Estado Diario ⚡</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close-circle" size={32} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            
            {/* --- TRACKER INTELIGENTE DE CICLO --- */}
            {isFemale && cycleStatus.showPrompt && (
              <View style={[styles.cycleTrackerCard, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 }}>
                    <Ionicons name="water" size={20} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Tracker Menstrual
                    </Text>
                </View>

                {cycleStatus.type === 'start' ? (
                    <>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginBottom: 5 }}>
                            ¿Ha comenzado tu periodo?
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 15, lineHeight: 18 }}>
                            Según tus cálculos, deberías estar cerca. Confirma para ajustar tu planificación biológica.
                        </Text>
                        <TouchableOpacity 
                            style={[styles.cycleBtn, { backgroundColor: '#EF4444' }]}
                            onPress={() => handleCycleAction('start')}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.cycleBtnText}>SÍ, COMENZÓ HOY</Text>}
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 16, marginBottom: 5 }}>
                            ¿Sigues con sangrado?
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 15, lineHeight: 18 }}>
                            Toca el botón cuando haya finalizado tu periodo para cerrar el registro de esta fase menstrual.
                        </Text>
                        <TouchableOpacity 
                            style={[styles.cycleBtn, { backgroundColor: '#EF4444', opacity: 0.9 }]}
                            onPress={() => handleCycleAction('end')}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.cycleBtnText}>YA HA TERMINADO</Text>}
                        </TouchableOpacity>
                    </>
                )}
              </View>
            )}

            <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: isFemale && cycleStatus.showPrompt ? 10 : 0 }]}>SENSACIONES SUBJETIVAS</Text>
            
            <RatingScale label="Nivel de Fatiga" field="fatigue" />
            <RatingScale label="Nivel de Estrés" field="stress" />
            
            {/* --- SECCIÓN DESCANSO Y SUEÑO --- */}
            <RatingScale label="Calidad de Sueño" field="sleep_quality" />
            <View style={styles.scaleContainer}>
              <Text style={[styles.scaleLabel, { color: colors.textPrimary }]}>Horas de Sueño</Text>
              <View style={styles.optionsRow}>
                {SLEEP_HOURS_OPTIONS.map((opt) => (
                  <TouchableOpacity 
                    key={opt} 
                    onPress={() => setForm(prev => ({ ...prev, sleep_hours: opt }))}
                    style={[
                      styles.optionCircle, 
                      { borderColor: colors.border },
                      form.sleep_hours === opt && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                  >
                    <Text style={{ color: form.sleep_hours === opt ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <RatingScale label="Dolor Muscular" field="soreness" />

            <View style={styles.divider} />
            <Text style={[styles.sectionTitle, { color: colors.primary, marginBottom: 5 }]}>MAPA TÉRMICO DE MOLESTIAS</Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 15 }}>
              Toca 1 vez para leve (amarillo), 2 para fuerte (rojo).
            </Text>
            
            <View style={styles.discomfortGrid}>
              {BODY_PARTS.map(part => {
                const state = form.discomforts[part];
                const isActive = !!state;
                const bgColor = state === 'leve' ? '#F59E0B' : state === 'fuerte' ? '#EF4444' : colors.surfaceHighlight;
                const textColor = isActive ? '#FFF' : colors.textPrimary;
                const borderColor = state === 'leve' ? '#F59E0B' : state === 'fuerte' ? '#EF4444' : colors.border;

                return (
                  <TouchableOpacity 
                    key={part}
                    style={[styles.discomfortChip, { backgroundColor: bgColor, borderColor }]}
                    onPress={() => toggleDiscomfort(part)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: textColor, fontSize: 13, fontWeight: isActive ? '800' : '600' }}>
                      {part}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>OBSERVACIONES PARA ANDREINA / COACH</Text>
            <TextInput 
              style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="¿Cómo te has sentido hoy en general?" 
              placeholderTextColor="#888" 
              multiline
              value={form.notes} 
              onChangeText={(t) => setForm(prev => ({ ...prev, notes: t }))}
            />

            <TouchableOpacity 
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]} 
              onPress={handleSave} 
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>GUARDAR ESTADO</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  content: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '900' },
  closeBtn: { padding: 5 },
  sectionTitle: { fontSize: 11, fontWeight: '800', marginBottom: 20, letterSpacing: 1 },
  scaleContainer: { marginBottom: 18 },
  scaleLabel: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  optionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  optionCircle: { width: 50, height: 50, borderRadius: 15, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 20 },
  inputLabel: { fontSize: 11, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
  input: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 15, fontSize: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  saveBtn: { padding: 20, borderRadius: 18, alignItems: 'center', marginTop: 15 },
  saveBtnText: { color: '#FFF', fontWeight: '900', letterSpacing: 1, fontSize: 16 },
  discomfortGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  discomfortChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  
  cycleTrackerCard: { borderWidth: 1, borderRadius: 20, padding: 20, marginBottom: 25 },
  cycleBtn: { padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 5 },
  cycleBtnText: { color: '#FFF', fontWeight: '900', fontSize: 14, letterSpacing: 1 }
});
