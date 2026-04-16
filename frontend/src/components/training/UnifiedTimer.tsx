import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Svg, Circle } from 'react-native-svg';

const formatTime = (totalSeconds: number): string => {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

interface UnifiedTimerProps {
  isPrep: boolean;
  isResting: boolean;
  isWorking: boolean;
  isPaused: boolean;
  prepSeconds: number;
  restSeconds: number;
  workSeconds: number;
  restTotalSeconds: number;
  workTotalSeconds: number;
  exName?: string;
  colors: any;
  isHiit: boolean;
  reps?: string;
  sets?: string;
  onTogglePause: () => void;
  onStopPrep: () => void;
  onSkipRest: () => void;
  onResetWork: () => void;
  onResetRest: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

export default function UnifiedTimer({
  isPrep, isResting, isWorking, isPaused,
  prepSeconds, restSeconds, workSeconds,
  restTotalSeconds, workTotalSeconds,
  exName, colors, isHiit,
  reps, sets,
  onTogglePause, onStopPrep, onSkipRest,
  onResetWork, onResetRest, onComplete, onSkip
}: UnifiedTimerProps) {
  
  const size = 260;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  let stateColor = colors.primary;
  let statusText = isHiit ? 'MODO CIRCUITO' : 'SERIE';
  let timeText = "00:00";
  let progress = 1;
  let showProgress = false;

  const isTimeBased = workTotalSeconds > 0;

  if (isPrep) {
    stateColor = colors.warning || '#F59E0B';
    statusText = 'PREPARACIÓN';
    timeText = formatTime(prepSeconds);
    progress = prepSeconds / 5;
    showProgress = true;
  } else if (isResting) {
    stateColor = colors.success || '#10B981';
    statusText = 'DESCANSO';
    timeText = formatTime(restSeconds);
    progress = restTotalSeconds > 0 ? restSeconds / restTotalSeconds : 0;
    showProgress = true;
  } else if (isWorking && isTimeBased) {
    stateColor = colors.error || '#EF4444';
    statusText = 'EN CURSO';
    timeText = formatTime(workSeconds);
    progress = workTotalSeconds > 0 ? workSeconds / workTotalSeconds : 0;
    showProgress = true;
  }

  const strokeDashoffset = circumference - (progress * circumference);

  return (
    <View style={[styles.timerContainer, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="barbell" size={24} color={stateColor} />
          <Text style={[styles.exName, { color: colors.textPrimary }]} numberOfLines={2}>
            {exName || 'Preparación'}
          </Text>
        </View>
        <Text style={[styles.statusBadge, { backgroundColor: stateColor + '20', color: stateColor }]}>
          {statusText}
        </Text>
      </View>

      <View style={styles.circleContainer}>
        {showProgress ? (
          <>
            <Svg width={size} height={size}>
              <Circle stroke={colors.border} fill="none" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
              <Circle
                stroke={stateColor}
                fill="none"
                cx={size / 2}
                cy={size / 2}
                r={radius}
                strokeWidth={strokeWidth}
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            </Svg>
            <View style={styles.timeWrapper}>
              <Text style={[styles.timeText, { color: colors.textPrimary }]}>{timeText}</Text>
              {isPaused && <Text style={[styles.pausedText, { color: colors.textSecondary }]}>PAUSADO</Text>}
            </View>
          </>
        ) : (
          <View style={[styles.repsDisplay, { borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}>
            <View style={styles.repsRow}>
              <View style={styles.repItem}>
                 <Text style={[styles.repLabel, { color: colors.textSecondary }]}>Series</Text>
                 <Text style={[styles.repValue, { color: colors.textPrimary }]}>{sets || '-'}</Text>
              </View>
              <View style={[styles.repDivider, { backgroundColor: colors.border }]} />
              <View style={styles.repItem}>
                 <Text style={[styles.repLabel, { color: colors.textSecondary }]}>Reps</Text>
                 <Text style={[styles.repValue, { color: colors.textPrimary }]}>{reps || '-'}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.controlsRow}>
        {(isPrep || isWorking || isResting) ? (
          <>
            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onTogglePause}>
              <Ionicons name={isPaused ? "play" : "pause"} size={28} color={colors.textPrimary} />
            </TouchableOpacity>
            
            {isPrep && (
              <TouchableOpacity style={[styles.mainBtn, { backgroundColor: stateColor }]} onPress={onStopPrep}>
                <Text style={styles.mainBtnText}>EMPEZAR YA</Text>
                <Ionicons name="flash" size={20} color="#FFF" />
              </TouchableOpacity>
            )}

            {isResting && (
              <>
                <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onResetRest}>
                  <Ionicons name="refresh" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mainBtn, { backgroundColor: stateColor }]} onPress={onSkipRest}>
                  <Text style={styles.mainBtnText}>SALTAR</Text>
                  <Ionicons name="play-forward" size={20} color="#FFF" />
                </TouchableOpacity>
              </>
            )}

            {isWorking && (
              <>
                <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={onResetWork}>
                  <Ionicons name="refresh" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mainBtn, { backgroundColor: stateColor }]} onPress={onComplete}>
                  <Text style={styles.mainBtnText}>{isHiit ? 'SIGUIENTE' : 'HECHO'}</Text>
                  <Ionicons name="checkmark-done" size={20} color="#FFF" />
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
           <View style={{ flexDirection: 'row', width: '100%', gap: 15 }}>
             {!isHiit && (
               <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.surfaceHighlight, flex: 1 }]} onPress={onSkip}>
                 <Ionicons name="play-skip-forward" size={24} color={colors.textPrimary} />
                 <Text style={{color: colors.textPrimary, fontWeight: '700', marginLeft: 8}}>Saltar Serie</Text>
               </TouchableOpacity>
             )}
             <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.success || '#10B981', flex: isHiit ? 1 : 1.5 }]} onPress={onComplete}>
               <Text style={styles.mainBtnText}>{isHiit ? 'SIGUIENTE' : 'COMPLETAR'}</Text>
               <Ionicons name="checkmark-done" size={20} color="#FFF" />
             </TouchableOpacity>
           </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timerContainer: { borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, marginBottom: 16 },
  header: { width: '100%', alignItems: 'center', marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12, paddingHorizontal: 10 },
  exName: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginLeft: 10, flexShrink: 1 },
  statusBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  circleContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  timeWrapper: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  timeText: { fontSize: 56, fontWeight: '900', fontVariant: ['tabular-nums'] },
  pausedText: { fontSize: 14, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15, marginTop: 20, width: '100%' },
  controlBtn: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  mainBtn: { flex: 1, height: 60, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, gap: 10 },
  mainBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  
  // Estilos para la visualización de Repeticiones/Series
  repsDisplay: { width: 220, height: 220, borderRadius: 110, borderWidth: 8, justifyContent: 'center', alignItems: 'center' },
  repsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  repItem: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  repLabel: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  repValue: { fontSize: 42, fontWeight: '900' },
  repDivider: { width: 2, height: 60, opacity: 0.2, marginHorizontal: 5 }
});
