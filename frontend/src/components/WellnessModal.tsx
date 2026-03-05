import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api';

export default function WellnessModal({ isVisible, onClose }: { isVisible: boolean, onClose: () => void }) {
  const { colors } = useTheme();
  const [sleep, setSleep] = useState(3);
  const [stress, setStress] = useState(3);
  const [fatigue, setFatigue] = useState(3);
  
  // Estados para Apple Health
  const [hrRest, setHrRest] = useState('');
  const [steps, setSteps] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.submitWellness({ 
        sleep, 
        stress, 
        fatigue, 
        hr_rest: hrRest ? parseInt(hrRest) : null,
        steps: steps ? parseInt(steps) : null,
        sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
        notes: "" 
      });
      onClose();
    } catch (e) {
      console.log("Error guardando wellness", e);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Control Diario 📊</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sincroniza tu Apple Watch y sensaciones</Text>

          {/* SECCIÓN APPLE HEALTH */}
          <View style={[styles.healthSection, { backgroundColor: colors.background + '80' }]}>
            <Text style={[styles.sectionTitle, { color: colors.primary }]}>
              <Ionicons name="watch-outline" size={16} /> DATOS DE SALUD (iOS)
            </Text>
            <View style={styles.healthRow}>
              <View style={styles.healthInputGroup}>
                <Text style={styles.healthLabel}>Pulsaciones</Text>
                <TextInput 
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="60 ppm"
                  keyboardType="numeric"
                  value={hrRest}
                  onChangeText={setHrRest}
                />
              </View>
              <View style={styles.healthInputGroup}>
                <Text style={styles.healthLabel}>Horas Sueño</Text>
                <TextInput 
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="8.5h"
                  keyboardType="numeric"
                  value={sleepHours}
                  onChangeText={setSleepHours}
                />
              </View>
            </View>
          </View>

          {/* SELECTORES DE SENSACIONES (Los que ya teníamos) */}
          <View style={{ marginVertical: 10 }}>
            <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 10 }]}>SENSACIONES SUBJETIVAS</Text>
            {/* Aquí irían tus selectores de 1 a 5 de antes (resumidos para el código) */}
            {/* ... (Sleep, Stress, Fatigue) ... */}
          </View>

          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>GUARDAR Y SINCRONIZAR</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  content: { borderRadius: 25, padding: 24 },
  title: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  healthSection: { padding: 15, borderRadius: 15, marginBottom: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', marginBottom: 12, letterSpacing: 1 },
  healthRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  healthInputGroup: { flex: 1 },
  healthLabel: { fontSize: 11, fontWeight: '600', color: '#888', marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, textAlign: 'center', fontSize: 16 },
  btn: { padding: 16, borderRadius: 15, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#FFF', fontWeight: '800', fontSize: 16 }
});
