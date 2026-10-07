import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// Círculo dinámico de progreso del tiempo (preparación, trabajo y descanso).
// Su tamaño se adapta al espacio disponible para que toda la pantalla de entrenamiento quepa sin desplazarse.
// Si el ejercicio no tiene tiempo (series a tu ritmo), el círculo muestra el progreso de las series.

type Props = {
  size: number;
  isPrep: boolean; isResting: boolean; isWorking: boolean; isPaused: boolean;
  prepSeconds: number; restSeconds: number; workSeconds: number;
  restTotalSeconds: number; workTotalSeconds: number;
  label: string;          // Nombre del ejercicio o de lo siguiente que viene
  reps?: string;          // Repeticiones (o reps / duración) a mostrar cuando no hay tiempo
  idleProgress?: number;  // 0..1 progreso de series cuando no hay tiempo
  idleCaption?: string;   // Texto pequeño cuando no hay tiempo (p. ej. "Serie 2 de 3")
  colors: any;
};

export default function TimerRing({
  size, isPrep, isResting, isWorking, isPaused, prepSeconds, restSeconds, workSeconds,
  restTotalSeconds, workTotalSeconds, label, reps, idleProgress = 0, idleCaption, colors,
}: Props) {
  const hasTime = isPrep || isResting || (isWorking && workTotalSeconds > 0);
  const currentSeconds = isPrep ? prepSeconds : isResting ? restSeconds : workSeconds;
  const currentTotal = isPrep ? 5 : isResting ? restTotalSeconds : workTotalSeconds;
  const title = isPrep ? 'PREPÁRATE' : isResting ? 'DESCANSO' : isPaused ? 'EN PAUSA' : hasTime ? '¡A TOPE!' : 'A TU RITMO';

  const warning = colors.warning || '#F59E0B';
  const activeColor = isResting || isPrep ? (colors.success || '#10B981') : colors.primary;
  const ringColor = isPaused ? warning : activeColor;

  const strokeWidth = Math.max(8, Math.round(size * 0.055));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = hasTime ? currentSeconds / (currentTotal > 0 ? currentTotal : 1) : Math.min(1, Math.max(0, idleProgress));
  const strokeDashoffset = circumference - progress * circumference;

  const bigFont = Math.round(size * (hasTime ? 0.3 : 0.24));

  return (
    <View
      style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}
      accessibilityRole="timer"
      accessibilityLabel={hasTime ? `${title}: ${currentSeconds} segundos. ${label}` : `${title}. ${label}`}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle stroke={colors.surfaceHighlight || '#E5E7EB'} fill="none" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
        <Circle
          stroke={ringColor} fill="none" cx={size / 2} cy={size / 2} r={radius}
          strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
        />
      </Svg>

      <View style={{ alignItems: 'center', justifyContent: 'center', width: size - strokeWidth * 4 }}>
        <Text style={{ color: colors.textSecondary, fontSize: Math.max(10, size * 0.05), fontWeight: '900', letterSpacing: 2 }}>
          {title}
        </Text>
        {hasTime ? (
          <Text style={{ color: ringColor, fontSize: bigFont, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] }}>
            {currentSeconds}
          </Text>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: bigFont, fontWeight: '900', letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
              {reps || '—'}
            </Text>
            {!!reps && <Text style={{ color: colors.textSecondary, fontSize: Math.max(11, size * 0.055), fontWeight: '800', marginTop: -4 }}>REPS</Text>}
          </View>
        )}
        {!!idleCaption && !hasTime && (
          <Text style={{ color: colors.textSecondary, fontSize: Math.max(11, size * 0.055), fontWeight: '700', marginTop: 2 }}>{idleCaption}</Text>
        )}
        <Text
          style={{ color: colors.textPrimary, fontSize: Math.max(12, size * 0.062), fontWeight: '800', textAlign: 'center', marginTop: 4 }}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}
