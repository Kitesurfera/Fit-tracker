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

  const currentSeconds = isPrep ? prepSeconds : isResting ? restSeconds : workSeconds;
  const currentTotal = isPrep ? 5 : isResting ? restTotalSeconds : workTotalSeconds;
  const currentTitle = isPrep ? 'PREPÁRATE' : isResting ? 'DESCANSO' : (isPaused ? 'EN PAUSA' : '¡A TOPE!');
  
  const activeColor = isResting || isPrep ? (colors.success || '#10B981') : colors.primary;
  const inactiveColor = colors.surfaceHighlight || '#E5E7EB';
  const hasTime = isPrep || isResting || (isWorking && workTotalSeconds > 0);

  const size = 240; // Rueda un poquito más grande
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
              {/* Sombra sutil para la barra base */}
              <Circle stroke="rgba(0,0,0,0.03)" fill="none" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth + 4} />
              
              <Circle stroke={inactiveColor} fill="none" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
              <Circle
                stroke={isPaused ? colors.warning || '#F59E0B' : activeColor} fill="none" cx={size / 2} cy={size / 2} r={radius}
                strokeWidth={strokeWidth} strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset} strokeLinecap="round"
              />
            </Svg>

            <View style={{ alignItems: 'center', justifyContent: 'center', width: size - 50 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 2 }}>
                {currentTitle}
              </Text>
              <Text style={{ color: isPaused ? (colors.warning || '#F59E0B') : activeColor, fontSize: 72, fontWeight: '900', letterSpacing: -3 }}>
                {currentSeconds}
              </Text>
              <Text 
                style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800', textAlign: 'center', marginTop: 2 }} 
                numberOfLines={2} 
                adjustsFontSizeToFit
              >
                {exName}
              </Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}>
            <Ionicons name="barbell" size={64} color={colors.primary} style={{ opacity: 0.9, marginBottom: 12 }} />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '900', letterSpacing: 2, marginBottom: 6 }}>
              A TU RITMO
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '900', textAlign: 'center' }} numberOfLines={3}>
              {exName}
            </Text>
          </View>
        )}
      </View>
      
      {/* BOTONES DE CONTROL UNIFICADOS */}
      <View style={{ width: '100%', marginTop: 30, gap: 12 }}>
        
        {/* Controles Secundarios */}
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
          
          {(isResting || isPrep) && (
            <>
              {isResting && (
                <TouchableOpacity style={[styles.roundBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onResetRest}>
                  <Ionicons name="refresh" size={26} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: activeColor, flex: 1 }]} onPress={isPrep ? onStopPrep : onSkipRest}>
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Saltar {isPrep ? 'Prep.' : 'Descanso'}</Text>
                <Ionicons name="play-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            </>
          )}

          {isWorking && workTotalSeconds > 0 && (
            <>
              <TouchableOpacity style={[styles.roundBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onResetWork}>
                <Ionicons name="refresh" size={26} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.roundBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onToggleWork}>
                <Ionicons name={isPaused ? "play" : "pause"} size={26} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: (colors.error || '#EF4444') + '15', flex: 1, paddingVertical: 0 }]} onPress={onSkip}>
                <Ionicons name="play-skip-forward" size={20} color={colors.error || '#EF4444'} />
                <Text style={{ color: colors.error || '#EF4444', fontWeight: '800', fontSize: 15 }}>Saltar</Text>
              </TouchableOpacity>
            </>
          )}

          {isWorking && workTotalSeconds === 0 && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: (colors.error || '#EF4444') + '15', flex: 1 }]} onPress={onSkip}>
              <Ionicons name="play-skip-forward" size={20} color={colors.error || '#EF4444'} />
              <Text style={{ color: colors.error || '#EF4444', fontWeight: '800', fontSize: 16 }}>Saltar Ejercicio</Text>
            </TouchableOpacity>
          )}
        </View>

        {isWorking && onComplete && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: activeColor, width: '100%', paddingVertical: 18 }]} onPress={onComplete}>
            <Ionicons name="checkmark-circle" size={24} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 17 }}>Completar {isHiit ? 'Ronda' : 'Serie'}</Text>
          </TouchableOpacity>
        )}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 25, borderRadius: 24, alignItems: 'center', marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 15, elevation: 5 },
  roundBtn: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 }
});
