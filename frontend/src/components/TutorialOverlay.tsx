import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
    { title: "Gestión Total", description: "Aquí verás a tus deportistas. Toca su perfil para ver su evolución, o el icono de WhatsApp para hablarles directamente.", icon: "people" },
    { title: "Periodización Pro", description: "Crea Macrociclos y Microciclos desde el perfil del deportista. Organiza la temporada de forma visual.", icon: "calendar" },
    { title: "Planificación Ágil", description: "Asigna sesiones y usa la función de 'copiar' en el calendario para pegar entrenamientos en otros días en un segundo.", icon: "copy" },
    { title: "Corrección de Técnica", description: "Revisa los vídeos que suben tus deportistas, evalúa su ejecución y déjales feedback directo en cada ejercicio.", icon: "videocam" },
  ];

  const athleteSteps: Step[] = [
    { title: "Tu Planificación", description: "Revisa tu calendario. Podrás ver de un vistazo qué sesiones tocan hoy y en qué fase del macrociclo te encuentras.", icon: "calendar" },
    { title: "Modo Entrenamiento", description: "Registra tus pesos reales, usa el cronómetro para los descansos y sube vídeos de tu técnica para tu coach.", icon: "play-circle" },
    { title: "Feedback del Coach", description: "Si tu entrenador corrige tu técnica o te deja notas en una sesión, verás una alerta naranja. ¡No te la pierdas!", icon: "chatbubbles" },
    { title: "Control de Wellness", description: "Registra a diario tu fatiga, sueño y fase del ciclo. Ayudará muchísimo a adaptar las cargas de tus entrenamientos.", icon: "fitness" },
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
