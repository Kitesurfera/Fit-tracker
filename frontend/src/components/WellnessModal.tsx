import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, Modal, TouchableOpacity, 
  TextInput, ScrollView, ActivityIndicator, Alert, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const CYCLE_PHASES = [
  { id: 'menstrual', label: 'Menstruación', color: '#EF4444' },
  { id: 'folicular', label: 'Folicular', color: '#10B981' },
  { id: 'ovulatoria', label: 'Ovulación', color: '#F59E0B' },
  { id: 'lutea', label: 'Fase Lútea', color: '#8B5CF6' }
];

export default function WellnessModal({ isVisible, onClose }: { isVisible: boolean, onClose: () => void }) {
  const { colors } = useTheme();
  const { user } = useAuth(); 
  const [loading, setLoading] = useState(false);
  
  const [form, setForm] = useState({
    fatigue: 3,
    stress: 3,
    sleep_quality: 3,
    soreness: 3,
    notes: '',
    cycle_phase: ''
  });

  const isFemale = ['female', 'mujer', 'femenino'].includes(user?.gender?.toLowerCase() || '');

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.postWellness(form);
      onClose(); // <-- CIERRE AUTOMÁTICO INMEDIATO
    } catch (e: any) {
      if (Platform.OS !== 'web') Alert.alert("Error de envío", e.message || "No se pudo conectar con el servidor.");
      else console.error("Error guardando wellness:", e);
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
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>SENSACIONES SUBJETIVAS</Text>
            
            <RatingScale label="Nivel de Fatiga" field="fatigue" />
            <RatingScale label="Nivel de Estrés" field="stress" />
            <RatingScale label="Calidad de Sueño" field="sleep_quality" />
            <RatingScale label="Dolor Muscular" field="soreness" />

            {isFemale && (
              <View style={{ marginTop: 10, marginBottom: 20 }}>
                <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>
                  <Ionicons name="water" size={12} color="#EF4444" /> FASE DEL CICLO MENSTRUAL
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {CYCLE_PHASES.map((phase) => (
                    <TouchableOpacity
                      key={phase.id}
                      style={[
                        styles.phaseChip,
                        { borderColor: colors.border },
                        form.cycle_phase === phase.id && { backgroundColor: phase.color + '20', borderColor: phase.color }
                      ]}
                      onPress={() => setForm(prev => ({ ...prev, cycle_phase: form.cycle_phase === phase.id ? '' : phase.id }))}
                    >
                      <Text style={{ 
                        fontSize: 12, 
                        fontWeight: form.cycle_phase === phase.id ? '800' : '600',
                        color: form.cycle_phase === phase.id ? phase.color : colors.textSecondary 
                      }}>
                        {phase.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.divider} />

            <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>OBSERVACIONES PARA ANDREINA</Text>
            <TextInput 
              style={[styles.input, styles.textArea, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="¿Cómo te has sentido hoy?" 
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
  phaseChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, marginRight: 8 }
});
