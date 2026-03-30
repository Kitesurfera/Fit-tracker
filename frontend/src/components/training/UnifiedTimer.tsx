import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

interface UnifiedTimerProps {
  isPrep: boolean;
  isResting: boolean;
  isWorking: boolean;
  prepSeconds: number;
  restSeconds: number;
  workSeconds: number;
  restTotalSeconds: number;
  workTotalSeconds: number;
  exName: string;
  hiitPhase: string;
  restType: string | null;
  colors: any;
  isHiit: boolean;
  onToggleWork: () => void;
  onStopPrep: () => void;
  onSkipRest: () => void;
  onResetWork: () => void;
}

export default function UnifiedTimer({
  isPrep, isResting, isWorking, prepSeconds, restSeconds, workSeconds,
  restTotalSeconds, workTotalSeconds, exName, hiitPhase, restType,
  colors, isHiit, onToggleWork, onStopPrep, onSkipRest, onResetWork
}: UnifiedTimerProps) {
  
  const current = isPrep ? prepSeconds : (isResting ? restSeconds : workSeconds);
  const total = isPrep ? 5 : (isResting ? restTotalSeconds : workTotalSeconds);
  const isPaused = !isPrep && !isResting && !isWorking;

  if (!isPrep && !isResting && (current <= 0 && !isWorking)) return null;
  if (isResting && current <= 0) return null;

  const ringColor = isPrep ? '#3B82F6' : (isResting ? (colors.warning || '#F59E0B') : colors.primary);
  const progressPercent = total > 0 ? current / total : 0;
  
  let label = exName.toUpperCase();
  if (isPrep) {
    label = '¡PREPÁRATE!';
  } else if (isResting) {
    if (hiitPhase === 'rest_block') label = 'DESCANSO ENTRE VUELTAS';
    else if (hiitPhase === 'rest_next_block') label = 'PREPARA EL SIGUIENTE BLOQUE';
    else if (restType === 'exercise') label = 'DESCANSO (SIGUIENTE EJ.)';
    else label = 'DESCANSO';
  }

  const radius = 85;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent * circumference);

  return (
    <View style={styles.unifiedTimerContainer}>
      <Text style={[styles.workTimerTitle, { color: ringColor, textAlign: 'center', marginHorizontal: 20 }]}>{label}</Text>

      <View style={styles.timerCircleWrapper}>
        <Svg width="200" height="200" viewBox="0 0 200 200" style={{ position: 'absolute' }}>
          <Circle cx="100" cy="100" r={radius} stroke={ringColor} strokeWidth={strokeWidth} strokeOpacity={0.15} fill="none" />
          <Circle cx="100" cy="100" r={radius} stroke={ringColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} transform="rotate(-90 100 100)" />
        </Svg>

        <TouchableOpacity activeOpacity={0.8} onPress={() => !isPrep && !isResting && onToggleWork()} disabled={isPrep || isResting}>
          <View style={{ justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[styles.timerText, { color: isPaused ? colors.textSecondary : ringColor }]}>
              {isPrep ? current : `${Math.floor(current / 60)}:${String(current % 60).padStart(2, '0')}`}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '800', marginTop: -5 }}>SEG</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 15, marginTop: 25, justifyContent: 'center' }}>
        {isPrep ? (
          <TouchableOpacity style={[styles.skipRestBtnUnified, { borderColor: ringColor }]} onPress={onStopPrep}>
            <Text style={{ color: ringColor, fontWeight: '700', fontSize: 16 }}>Omitir Previo</Text>
          </TouchableOpacity>
        ) : isResting ? (
          <TouchableOpacity style={[styles.skipRestBtnUnified, { borderColor: ringColor }]} onPress={onSkipRest}>
            <Text style={{ color: ringColor, fontWeight: '700', fontSize: 16 }}>Saltar Descanso</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', gap: 15 }}>
            <TouchableOpacity style={[styles.playPauseBtn, { backgroundColor: isPaused ? (colors.warning || '#F59E0B') : colors.primary }]} onPress={onToggleWork}>
              <Ionicons name={isWorking ? "pause" : "play"} size={32} color="#FFF" />
            </TouchableOpacity>
            {!isHiit && (
              <TouchableOpacity style={[styles.playPauseBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onResetWork}>
                <Ionicons name="refresh" size={32} color={colors.textPrimary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  unifiedTimerContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
  timerCircleWrapper: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  workTimerTitle: { fontSize: 22, fontWeight: '900', marginBottom: 20, letterSpacing: 1 },
  timerText: { fontSize: 50, fontWeight: '900' },
  playPauseBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  skipRestBtnUnified: { paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30, borderWidth: 2 },
});
