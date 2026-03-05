import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { api } from '../api';

export default function WellnessModal({ isVisible, onClose }: { isVisible: boolean, onClose: () => void }) {
  const { colors } = useTheme();
  const [sleep, setSleep] = useState(3);
  const [stress, setStress] = useState(3);
  const [fatigue, setFatigue] = useState(3);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.submitWellness({ sleep, stress, fatigue, notes: "" });
      onClose();
    } catch (e) {
      console.log("Error guardando wellness", e);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const Selector = ({ label, value, setter, icon }: any) => (
    <View style={styles.selectorContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} style={{ marginRight: 6 }} />
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map(num => (
          <TouchableOpacity 
            key={num} 
            onPress={() => setter(num)}
            style={[
              styles.circle, 
              { borderColor: colors.border },
              value === num && { backgroundColor: colors.primary, borderColor: colors.primary }
            ]}
          >
            <Text style={{ color: value === num ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{num}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.labelsRow}>
        <Text style={{ fontSize: 10, color: colors.textSecondary }}>Pésimo</Text>
        <Text style={{ fontSize: 10, color: colors.textSecondary }}>Genial</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Control Diario 📊</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>¿Cómo ha amanecido el cuerpo hoy, Claudia?</Text>

          <Selector label="Calidad del Sueño" value={sleep} setter={setSleep} icon="moon-outline" />
          <Selector label="Nivel de Estrés" value={stress} setter={setStress} icon="pulse-outline" />
          <Selector label="Fatiga / Agujetas" value={fatigue} setter={setFatigue} icon="body-outline" />

          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>REGISTRAR</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  content: { borderRadius: 20, padding: 24, elevation: 5 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  selectorContainer: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  circle: { width: 45, height: 45, borderRadius: 22.5, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 5 },
  btn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 1 }
});
