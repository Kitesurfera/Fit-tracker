import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// RUTA CORREGIDA: Ya estamos dentro de src, solo subimos un nivel y entramos en hooks
import { useTheme } from '../hooks/useTheme';

const { width, height } = Dimensions.get('window');

interface Step {
  title: string;
  description: string;
  icon: string;
  tabTarget?: string;
}

export default function TutorialOverlay({ role, isVisible, onClose }: { role: string, isVisible: boolean, onClose: () => void }) {
  const { colors } = useTheme();
  const [currentStep, setCurrentStep] = useState(0);

  const trainerSteps: Step[] = [
    { title: "¡Hola!", description: "Aquí verás el listado de tus deportistas y su actividad de hoy de un vistazo.", icon: "people" },
    { title: "Planificación Pro", description: "Usa el botón '+' para añadir entrenos o el de 'copia' para duplicar rutinas rápidamente.", icon: "copy" },
    { title: "Feedback en tiempo real", description: "En el Dashboard del deportista verás las notas y el RPE que tu cliente te deje al terminar.", icon: "chatbubbles" },
    { title: "Buscador de Progresión", description: "Filtra por nombre de ejercicio para ver cómo evolucionan las cargas sin perder tiempo.", icon: "search" },
  ];

  const athleteSteps: Step[] = [
    { title: "¡A por todas!", description: "Aquí tienes tus entrenos de hoy. Si te saltas uno, aparecerá como 'No realizado'.", icon: "barbell" },
    { title: "Modo Entrenamiento", description: "Dale al 'Play' para empezar. Registra tus marcas reales y descansa con el cronómetro.", icon: "play-circle" },
    { title: "Tu Bienestar", description: "Al acabar, dinos qué tal has dormido y el RPE (esfuerzo). ¡Tu coach lo verá al instante!", icon: "battery-charging" },
    { title: "Récords Personales", description: "En la pestaña de Rendimiento verás tus PBs y gráficas de progreso sin duplicados.", icon: "trending-up" },
  ];

  const steps = role === 'trainer' ? trainerSteps : athleteSteps;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  if (!isVisible) return null;

  return (
    <Modal transparent visible={isVisible} animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <Ionicons name={steps[currentStep].icon as any} size={40} color={colors.primary} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>{steps[currentStep].title}</Text>
          </View>
          
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {steps[currentStep].description}
          </Text>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.skip, { color: colors.textSecondary }]}>Omitir</Text>
            </TouchableOpacity>
            
            <View style={styles.dotContainer}>
              {steps.map((_, i) => (
                <View key={i} style={[styles.dot, { backgroundColor: i === currentStep ? colors.primary : colors.border }]} />
              ))}
            </View>

            <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={handleNext}>
              <Text style={styles.nextText}>{currentStep === steps.length - 1 ? "Empezar" : "Siguiente"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  card: { width: width * 0.85, padding: 24, borderRadius: 20, gap: 20 },
  header: { alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  description: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  skip: { fontSize: 14, fontWeight: '600' },
  dotContainer: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  nextBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  nextText: { color: '#FFF', fontWeight: '700' }
});
