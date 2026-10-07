import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Botones de control del entrenamiento. Ocupan siempre el mismo sitio (dos filas) para que no "salten"
// al pasar de trabajo a descanso: arriba las acciones secundarias y abajo la acción principal.

type Props = {
  isPrep: boolean; isResting: boolean; isWorking: boolean; isPaused: boolean;
  workTotalSeconds: number;
  isHiit: boolean;
  colors: any;
  onTogglePause: () => void;
  onStopPrep: () => void;
  onSkipRest: () => void;
  onResetWork: () => void;
  onResetRest: () => void;
  onComplete: () => void;
  onSkip: () => void;
};

export default function TimerControls({
  isPrep, isResting, isWorking, isPaused, workTotalSeconds, isHiit, colors,
  onTogglePause, onStopPrep, onSkipRest, onResetWork, onResetRest, onComplete, onSkip,
}: Props) {
  const success = colors.success || '#10B981';
  const warning = colors.warning || '#F59E0B';
  const error = colors.error || '#EF4444';
  const timedWork = isWorking && workTotalSeconds > 0;
  const hasTime = isPrep || isResting || timedWork;
  const canReset = isResting || timedWork;

  // Acción principal según el momento
  let primary: { label: string; icon: any; color: string; onPress: () => void } | null = null;
  if (isPrep) primary = { label: 'Empezar ya', icon: 'play-forward', color: success, onPress: onStopPrep };
  else if (isResting) primary = { label: 'Saltar descanso', icon: 'play-forward', color: success, onPress: onSkipRest };
  else if (isWorking) primary = { label: `Completar ${isHiit ? 'ronda' : 'serie'}`, icon: 'checkmark-circle', color: colors.primary, onPress: onComplete };

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={isResting ? 'Reiniciar descanso' : 'Reiniciar tiempo'}
          disabled={!canReset}
          style={[styles.round, { backgroundColor: colors.surfaceHighlight, opacity: canReset ? 1 : 0.35 }]}
          onPress={isResting ? onResetRest : onResetWork}
        >
          <Ionicons name="refresh" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={isPaused ? 'Reanudar' : 'Pausar'}
          disabled={!hasTime}
          style={[styles.round, { backgroundColor: (isPaused ? warning : colors.primary) + '22', opacity: hasTime ? 1 : 0.35 }]}
          onPress={onTogglePause}
        >
          <Ionicons name={isPaused ? 'play' : 'pause'} size={22} color={isPaused ? warning : colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={isHiit ? 'Saltar ejercicio' : 'Saltar serie'}
          disabled={!isWorking}
          style={[styles.secondary, { backgroundColor: error + '15', opacity: isWorking ? 1 : 0.35 }]}
          onPress={onSkip}
        >
          <Ionicons name="play-skip-forward" size={18} color={error} />
          <Text style={{ color: error, fontWeight: '800', fontSize: 15 }}>{isHiit ? 'Saltar ejercicio' : 'Saltar serie'}</Text>
        </TouchableOpacity>
      </View>

      {primary && (
        <TouchableOpacity
          accessibilityRole="button" accessibilityLabel={primary.label}
          style={[styles.primary, { backgroundColor: primary.color }]}
          onPress={primary.onPress}
        >
          <Ionicons name={primary.icon} size={24} color="#FFF" />
          <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 18 }}>{primary.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  round: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  secondary: { flex: 1, height: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primary: { height: 58, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
});
