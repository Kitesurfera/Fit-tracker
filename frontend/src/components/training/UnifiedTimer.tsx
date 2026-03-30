import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

export default function UnifiedTimer({ 
  isPrep, isResting, isWorking, isPaused, prepSeconds, restSeconds, workSeconds, 
  restTotalSeconds, workTotalSeconds, exName, colors, isHiit,
  onToggleWork, onStopPrep, onSkipRest, onResetWork, onResetRest,
  onComplete, onSkip
}: any) {
  
  if (!isPrep && !isResting && !isWorking) return null;

  // 1. Valores actuales
  const currentSeconds = isPrep ? prepSeconds : isResting ? restSeconds : workSeconds;
  const currentTotal = isPrep ? 5 : isResting ? restTotalSeconds : workTotalSeconds;
  const currentTitle = isPrep ? 'PREPÁRATE' : isResting ? 'DESCANSO' : (isPaused ? 'EN PAUSA' : '¡A TOPE!');
  
  // 2. Colores y estado de visualización
  const activeColor = isResting || isPrep ? (colors.success || '#10B981') : colors.primary;
  const inactiveColor = colors.surfaceHighlight || '#E5E7EB';
  const hasTime = isPrep || isResting || (isWorking && workTotalSeconds > 0);

  // 3. Cálculos de la rueda
  const size = 220; 
  const strokeWidth = 14; 
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const safeTotal = currentTotal > 0 ? currentTotal : 1; 
  const progress = currentSeconds / safeTotal;
  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      
      {/* ZONA VISUAL: RUEDA O TEXTO LIBRE */}
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        {hasTime ? (
          <>
            <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
              <Circle stroke={inactiveColor} fill="none" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
              <Circle
                stroke={isPaused ? colors.warning || '#F59E0B' : activeColor} fill="none" cx={size / 2} cy={size / 2} r={radius}
                strokeWidth={strokeWidth} strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset} strokeLinecap="round"
              />
            </Svg>

            <View style={{ alignItems: 'center', justifyContent: 'center', width: size - 40 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 }}>
                {currentTitle}
              </Text>
              <Text style={{ color: isPaused ? (colors.warning || '#F59E0B') : activeColor, fontSize: 64, fontWeight: '900', letterSpacing: -2 }}>
                {currentSeconds}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 4 }} numberOfLines={2}>
                {exName}
              </Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}>
            <Ionicons name="barbell" size={56} color={colors.primary} style={{ opacity: 0.8, marginBottom: 12 }} />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 }}>
              A TU RITMO
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' }} numberOfLines={3}>
              {exName}
            </Text>
          </View>
        )}
      </View>
      
      {/* BOTONES DE CONTROL UNIFICADOS */}
      <View style={{ width: '100%', marginTop: 25, gap: 12 }}>
        
        {/* Controles Secundarios */}
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
          
          {(isResting || isPrep) && (
            <>
              {isResting && (
                <TouchableOpacity style={[styles.roundBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onResetRest}>
                  <Ionicons name="refresh" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: activeColor, flex: 1 }]} onPress={isPrep ? onStopPrep : onSkipRest}>
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 15 }}>Saltar {isPrep ? 'Prep.' : 'Descanso'}</Text>
                <Ionicons name="play-forward" size={18} color="#FFF" />
              </TouchableOpacity>
            </>
          )}

          {isWorking && workTotalSeconds > 0 && (
            <>
              <TouchableOpacity style={[styles.roundBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onResetWork}>
                <Ionicons name="refresh" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roundBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onToggleWork}>
                <Ionicons name={isPaused ? "play" : "pause"} size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: (colors.error || '#EF4444') + '15', flex: 1, paddingVertical: 0 }]} onPress={onSkip}>
                <Ionicons name="play-skip-forward" size={18} color={colors.error || '#EF4444'} />
                <Text style={{ color: colors.error || '#EF4444', fontWeight: '800', fontSize: 14 }}>Saltar</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Botón de saltar ancho cuando NO hay tiempo de ejercicio */}
          {isWorking && workTotalSeconds === 0 && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: (colors.error || '#EF4444') + '15', flex: 1 }]} onPress={onSkip}>
              <Ionicons name="play-skip-forward" size={18} color={colors.error || '#EF4444'} />
              <Text style={{ color: colors.error || '#EF4444', fontWeight: '800', fontSize: 15 }}>Saltar Ejercicio</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Botón Principal (Completar) */}
        {isWorking && onComplete && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: activeColor, width: '100%' }]} onPress={onComplete}>
            <Ionicons name="checkmark-circle" size={22} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Completar {isHiit ? 'Ronda' : 'Serie'}</Text>
          </TouchableOpacity>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 25, borderRadius: 24, alignItems: 'center', marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  roundBtn: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 }
});
