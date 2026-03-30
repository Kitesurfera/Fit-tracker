import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

export default function UnifiedTimer({ 
  isPrep, isResting, isWorking, prepSeconds, restSeconds, workSeconds, 
  restTotalSeconds, workTotalSeconds, exName, colors, onToggleWork, 
  onStopPrep, onSkipRest, onResetWork 
}: any) {
  
  if (!isPrep && !isResting && !isWorking) return null;

  // 1. Determinar valores actuales del temporizador
  const currentSeconds = isPrep ? prepSeconds : isResting ? restSeconds : workSeconds;
  const currentTotal = isPrep ? 5 : isResting ? restTotalSeconds : workTotalSeconds;
  const currentTitle = isPrep ? 'PREPÁRATE' : isResting ? 'DESCANSO' : '¡A TOPE!';
  
  // 2. Determinar colores (Verde para descanso/prep, Color principal para trabajo)
  const activeColor = isResting || isPrep ? (colors.success || '#10B981') : colors.primary;
  const inactiveColor = colors.surfaceHighlight || '#E5E7EB';

  // 3. Cálculos de la rueda SVG
  const size = 220; // Tamaño del círculo
  const strokeWidth = 14; // Grosor de la línea
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Protección por si el total es 0 (evita errores matemáticos)
  const safeTotal = currentTotal > 0 ? currentTotal : 1; 
  const progress = currentSeconds / safeTotal;
  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <View style={{ padding: 25, backgroundColor: colors.surface, borderRadius: 24, alignItems: 'center', marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 }}>
      
      {/* RUEDA DEL TEMPORIZADOR */}
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          {/* Círculo de fondo (Gris) */}
          <Circle
            stroke={inactiveColor}
            fill="none"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
          />
          {/* Círculo de progreso (Color dinámico) */}
          <Circle
            stroke={activeColor}
            fill="none"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </Svg>

        {/* TEXTOS CENTRALES */}
        <View style={{ alignItems: 'center', justifyContent: 'center', width: size - 40 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 }}>
            {currentTitle}
          </Text>
          <Text style={{ color: activeColor, fontSize: 64, fontWeight: '900', letterSpacing: -2 }}>
            {currentSeconds}
          </Text>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 4 }} numberOfLines={2}>
            {exName}
          </Text>
        </View>
      </View>
      
      {/* BOTONES DE CONTROL */}
      <View style={{ flexDirection: 'row', gap: 15, marginTop: 30 }}>
        {isWorking && (
          <TouchableOpacity 
            style={{ backgroundColor: colors.surfaceHighlight, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' }} 
            onPress={onToggleWork}
          >
            <Ionicons name="pause" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        {(isResting || isPrep) && (
          <TouchableOpacity 
            style={{ backgroundColor: activeColor, paddingHorizontal: 30, paddingVertical: 16, borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 8 }} 
            onPress={isPrep ? onStopPrep : onSkipRest}
          >
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 }}>Saltar</Text>
            <Ionicons name="play-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
