import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

type SetStatus = 'pending' | 'completed' | 'skipped';

export default function TrainingModeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  // Track each set's status per exercise: setsStatus[exerciseIndex][setIndex] = 'completed'|'skipped'|'pending'
  const [setsStatus, setSetsStatus] = useState<Record<number, SetStatus[]>>({});
  const [finished, setFinished] = useState(false);
  // Rest timer
  const [restSeconds, setRestSeconds] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const restIntervalRef = useRef<any>(null);
  // Post-workout observations
  const [observations, setObservations] = useState('');

  useEffect(() => {
    if (workoutId) {
      api.getWorkout(workoutId).then((w) => {
        setWorkout(w);
        // Initialize sets status
        const initial: Record<number, SetStatus[]> = {};
        (w.exercises || []).forEach((ex: any, i: number) => {
          const total = parseInt(ex.sets) || 1;
          initial[i] = Array(total).fill('pending');
        });
        setSetsStatus(initial);
      }).catch(console.log).finally(() => setLoading(false));
    }
  }, [workoutId]);

  // Rest timer countdown - MUST be before any early returns to follow Rules of Hooks
  useEffect(() => {
    if (isResting && restSeconds > 0) {
      restIntervalRef.current = setInterval(() => {
        setRestSeconds(prev => {
          if (prev <= 1) {
            clearInterval(restIntervalRef.current);
            setIsResting(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
  }, [isResting]);

  // Early return for loading state - AFTER all hooks
  if (loading || !workout) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const exercises = workout.exercises || [];
  const currentEx = exercises[currentExIndex];
  const totalSets = parseInt(currentEx?.sets) || 1;
  const currentSets = setsStatus[currentExIndex] || [];
  const doneSets = currentSets.filter(s => s === 'completed').length;
  const skippedSets = currentSets.filter(s => s === 'skipped').length;
  const nextPendingSet = currentSets.findIndex(s => s === 'pending');

  // Calculate progress
  const totalAllSets = exercises.reduce((sum: number, ex: any) => sum + (parseInt(ex.sets) || 1), 0);
  const doneAllSets = Object.values(setsStatus).flat().filter(s => s !== 'pending').length;
  const progress = totalAllSets > 0 ? (doneAllSets / totalAllSets) * 100 : 0;

  const updateSetStatus = (exIdx: number, setIdx: number, status: SetStatus) => {
    setSetsStatus(prev => {
      const updated = { ...prev };
      updated[exIdx] = [...(prev[exIdx] || [])];
      updated[exIdx][setIdx] = status;
      return updated;
    });
  };

  const skipRest = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setIsResting(false);
    setRestSeconds(0);
  };

  const startRestTimer = () => {
    const restTime = parseInt(currentEx?.rest) || 0;
    if (restTime > 0) {
      setRestSeconds(restTime);
      setIsResting(true);
    }
  };

  const autoAdvance = (exIdx: number) => {
    if (exIdx < exercises.length - 1) {
      setTimeout(() => setCurrentExIndex(exIdx + 1), 400);
    } else {
      setTimeout(() => setFinished(true), 400);
    }
  };

  const completeSet = () => {
    if (nextPendingSet === -1) return;
    updateSetStatus(currentExIndex, nextPendingSet, 'completed');
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) {
      autoAdvance(currentExIndex);
    } else {
      // Start rest timer between sets
      startRestTimer();
    }
  };

  const skipSet = () => {
    if (nextPendingSet === -1) return;
    if (isResting) skipRest();
    updateSetStatus(currentExIndex, nextPendingSet, 'skipped');
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) {
      autoAdvance(currentExIndex);
    }
  };

  const skipExercise = () => {
    if (isResting) skipRest();
    setSetsStatus(prev => {
      const updated = { ...prev };
      updated[currentExIndex] = (prev[currentExIndex] || []).map(s => s === 'pending' ? 'skipped' : s);
      return updated;
    });
    autoAdvance(currentExIndex);
  };

  const nextExercise = () => {
    if (isResting) skipRest();
    if (currentExIndex < exercises.length - 1) setCurrentExIndex(currentExIndex + 1);
  };
  const prevExercise = () => {
    if (isResting) skipRest();
    if (currentExIndex > 0) setCurrentExIndex(currentExIndex - 1);
  };

  const buildCompletionData = () => {
    return {
      exercise_results: exercises.map((ex: any, i: number) => {
        const sets = setsStatus[i] || [];
        return {
          exercise_index: i,
          name: ex.name,
          total_sets: parseInt(ex.sets) || 1,
          completed_sets: sets.filter(s => s === 'completed').length,
          skipped_sets: sets.filter(s => s === 'skipped').length,
          set_details: sets.map((status, si) => ({ set: si + 1, status })),
        };
      }),
    };
  };

  const handleFinish = async () => {
    const completionData = buildCompletionData();
    try {
      const updateData: any = {
        completed: true,
        completion_data: completionData,
      };
      if (observations.trim()) {
        updateData.observations = observations.trim();
      }
      await api.updateWorkout(workoutId!, updateData);
    } catch (e) { console.log(e); }
    router.back();
  };

  const handleExit = () => router.back();

  // Build finish summary
  if (finished) {
    const completionData = buildCompletionData();
    const totalCompleted = completionData.exercise_results.reduce((s: number, r: any) => s + r.completed_sets, 0);
    const totalSkipped = completionData.exercise_results.reduce((s: number, r: any) => s + r.skipped_sets, 0);
    const hasSkips = totalSkipped > 0;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.finishedContainer}>
          <View style={[styles.finishedIcon, { backgroundColor: hasSkips ? colors.warning + '15' : colors.success + '15' }]}>
            <Ionicons name={hasSkips ? 'alert-circle' : 'checkmark-circle'} size={64} color={hasSkips ? colors.warning : colors.success} />
          </View>
          <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>
            {hasSkips ? 'Entrenamiento finalizado' : 'Entrenamiento completado!'}
          </Text>
          <Text style={[styles.finishedSub, { color: colors.textSecondary }]}>
            {totalCompleted} series completadas · {totalSkipped} series saltadas
          </Text>

          {/* Per-exercise summary */}
          <View style={styles.summaryList}>
            {completionData.exercise_results.map((r: any, i: number) => {
              const allDone = r.skipped_sets === 0;
              const allSkipped = r.completed_sets === 0;
              return (
                <View key={i} style={[styles.summaryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.summaryIcon, { backgroundColor: allDone ? colors.success + '15' : allSkipped ? colors.error + '15' : colors.warning + '15' }]}>
                    <Ionicons
                      name={allDone ? 'checkmark-circle' : allSkipped ? 'close-circle' : 'remove-circle'}
                      size={22}
                      color={allDone ? colors.success : allSkipped ? colors.error : colors.warning}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.summaryName, { color: colors.textPrimary }]}>{r.name}</Text>
                    <View style={styles.summaryDots}>
                      {r.set_details.map((sd: any, si: number) => (
                        <View key={si} style={[
                          styles.miniDot,
                          sd.status === 'completed' && { backgroundColor: colors.success },
                          sd.status === 'skipped' && { backgroundColor: colors.error },
                          sd.status === 'pending' && { backgroundColor: colors.border },
                        ]} />
                      ))}
                    </View>
                  </View>
                  <Text style={[styles.summaryCount, { color: colors.textSecondary }]}>
                    {r.completed_sets}/{r.total_sets}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Post-workout observations */}
          <View style={[styles.observationsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.observationsLabel, { color: colors.textPrimary }]}>Observaciones de la sesion</Text>
            <TextInput
              testID="workout-observations-input"
              style={[styles.observationsInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]}
              value={observations}
              onChangeText={setObservations}
              placeholder="Como te sentiste? Algo a destacar..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
            />
          </View>

          <TouchableOpacity
            testID="finish-training-btn"
            style={[styles.finishBtn, { backgroundColor: colors.primary }]}
            onPress={handleFinish}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={20} color="#FFF" />
            <Text style={styles.finishBtnText}>Guardar y salir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exitLink} onPress={handleExit} activeOpacity={0.6}>
            <Text style={[styles.exitLinkText, { color: colors.textSecondary }]}>Volver sin guardar</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!currentEx) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Este entrenamiento no tiene ejercicios</Text>
          <TouchableOpacity onPress={handleExit} style={[styles.exitBtn, { borderColor: colors.border }]}>
            <Text style={[styles.exitBtnText, { color: colors.textPrimary }]}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleExit} testID="exit-training" activeOpacity={0.6}>
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
        <Text style={[styles.topProgress, { color: colors.textSecondary }]}>
          {currentExIndex + 1}/{exercises.length}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBar, { backgroundColor: colors.surfaceHighlight }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.min(progress, 100)}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Exercise card */}
        <View style={[styles.exerciseCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.exNumber, { backgroundColor: colors.primary + '12' }]}>
            <Text style={[styles.exNumberText, { color: colors.primary }]}>{currentExIndex + 1}</Text>
          </View>
          <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{currentEx.name}</Text>

          <View style={styles.detailsGrid}>
            {currentEx.sets && (
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.sets}</Text>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Series</Text>
              </View>
            )}
            {currentEx.reps && (
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.reps}</Text>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Reps</Text>
              </View>
            )}
            {currentEx.weight && (
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.weight}</Text>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Kg</Text>
              </View>
            )}
            {currentEx.rest && (
              <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.rest}</Text>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Desc (s)</Text>
              </View>
            )}
          </View>

          {currentEx.video_url ? (
            <TouchableOpacity
              testID="training-video-btn"
              style={[styles.videoBtn, { backgroundColor: colors.primary + '10', borderColor: colors.primary }]}
              onPress={() => Linking.openURL(currentEx.video_url)}
              activeOpacity={0.6}
            >
              <Ionicons name="play-circle" size={24} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.videoBtnTitle, { color: colors.primary }]}>Ver video del ejercicio</Text>
                <Text style={[styles.videoBtnUrl, { color: colors.textSecondary }]} numberOfLines={1}>{currentEx.video_url}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : null}

          {currentEx.exercise_notes ? (
            <View style={[styles.exerciseNotesBox, { backgroundColor: colors.surfaceHighlight }]}>
              <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
              <Text style={[styles.exerciseNotesText, { color: colors.textSecondary }]}>{currentEx.exercise_notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Sets tracker */}
        <View style={[styles.setsCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.setsTitle, { color: colors.textPrimary }]}>Series</Text>
          <View style={styles.setsGrid}>
            {currentSets.map((status, i) => (
              <View
                key={i}
                style={[
                  styles.setCircle,
                  { borderColor: colors.border },
                  status === 'completed' && { backgroundColor: colors.success, borderColor: colors.success },
                  status === 'skipped' && { backgroundColor: colors.error, borderColor: colors.error },
                ]}
              >
                {status === 'completed' ? (
                  <Ionicons name="checkmark" size={18} color="#FFF" />
                ) : status === 'skipped' ? (
                  <Ionicons name="close" size={18} color="#FFF" />
                ) : (
                  <Text style={[styles.setNum, { color: colors.textSecondary }]}>{i + 1}</Text>
                )}
              </View>
            ))}
          </View>

          {/* Rest Timer */}
          {isResting && (
            <View style={[styles.restTimerCard, { backgroundColor: colors.primary + '10' }]}>
              <Ionicons name="timer-outline" size={28} color={colors.primary} />
              <View style={styles.restTimerContent}>
                <Text style={[styles.restTimerLabel, { color: colors.textSecondary }]}>Descanso</Text>
                <Text style={[styles.restTimerValue, { color: colors.primary }]}>
                  {Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity
                testID="skip-rest-btn"
                style={[styles.skipRestBtn, { borderColor: colors.primary }]}
                onPress={skipRest}
                activeOpacity={0.7}
              >
                <Text style={[styles.skipRestText, { color: colors.primary }]}>Saltar</Text>
              </TouchableOpacity>
            </View>
          )}

          {nextPendingSet !== -1 && !isResting ? (
            <View style={styles.setActions}>
              <TouchableOpacity
                testID="complete-set-btn"
                style={[styles.completeSetBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={completeSet}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-circle-outline" size={22} color="#FFF" />
                <Text style={[styles.completeSetText, { color: '#FFF' }]}>
                  Completar serie {nextPendingSet + 1}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="skip-set-btn"
                style={[styles.skipSetBtn, { borderColor: colors.error }]}
                onPress={skipSet}
                activeOpacity={0.7}
              >
                <Ionicons name="play-skip-forward" size={18} color={colors.error} />
                <Text style={[styles.skipSetText, { color: colors.error }]}>Saltar</Text>
              </TouchableOpacity>
            </View>
          ) : nextPendingSet === -1 ? (
            <View style={[styles.allDoneBadge, { backgroundColor: doneSets === totalSets ? colors.success + '12' : colors.warning + '12' }]}>
              <Ionicons
                name={doneSets === totalSets ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={doneSets === totalSets ? colors.success : colors.warning}
              />
              <Text style={{ color: doneSets === totalSets ? colors.success : colors.warning, fontSize: 14, fontWeight: '600' }}>
                {doneSets === totalSets ? 'Todas completadas' : `${doneSets} de ${totalSets} completadas`}
              </Text>
            </View>
          ) : null}

          {/* Skip entire exercise */}
          {nextPendingSet !== -1 && (
            <TouchableOpacity
              testID="skip-exercise-btn"
              style={styles.skipExLink}
              onPress={skipExercise}
              activeOpacity={0.6}
            >
              <Text style={[styles.skipExText, { color: colors.textSecondary }]}>Saltar ejercicio completo</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Bottom navigation */}
      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          testID="prev-exercise-btn"
          style={[styles.navBtn, { opacity: currentExIndex === 0 ? 0.3 : 1 }]}
          onPress={prevExercise}
          disabled={currentExIndex === 0}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          <Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Anterior</Text>
        </TouchableOpacity>
        <View style={[styles.exCounter, { backgroundColor: colors.surfaceHighlight }]}>
          <Text style={[styles.exCounterText, { color: colors.textPrimary }]}>{currentExIndex + 1} / {exercises.length}</Text>
        </View>
        {currentExIndex < exercises.length - 1 ? (
          <TouchableOpacity testID="next-exercise-btn" style={styles.navBtn} onPress={nextExercise} activeOpacity={0.6}>
            <Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Siguiente</Text>
            <Ionicons name="arrow-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity testID="finish-all-btn" style={styles.navBtn} onPress={() => setFinished(true)} activeOpacity={0.6}>
            <Text style={[styles.navBtnText, { color: colors.success, fontWeight: '700' }]}>Finalizar</Text>
            <Ionicons name="flag" size={20} color={colors.success} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  topTitle: { fontSize: 16, fontWeight: '600' },
  topProgress: { fontSize: 14, fontWeight: '500' },
  progressBar: { height: 3, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  content: { padding: 20, paddingBottom: 100, gap: 16 },
  exerciseCard: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 },
  exNumber: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  exNumberText: { fontSize: 20, fontWeight: '800' },
  exerciseName: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  detailsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  detailBox: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', minWidth: 70 },
  detailValue: { fontSize: 22, fontWeight: '700' },
  detailLabel: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  videoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%',
    borderRadius: 12, padding: 14, borderWidth: 1,
  },
  videoBtnTitle: { fontSize: 14, fontWeight: '600' },
  videoBtnUrl: { fontSize: 12, marginTop: 2 },
  exerciseNotesBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, width: '100%', borderRadius: 10, padding: 12 },
  exerciseNotesText: { flex: 1, fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  // Rest timer styles
  restTimerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 12, padding: 16, marginTop: 14 },
  restTimerContent: { flex: 1 },
  restTimerLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  restTimerValue: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  skipRestBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  skipRestText: { fontSize: 14, fontWeight: '600' },
  // Observations styles
  observationsCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 16, gap: 10 },
  observationsLabel: { fontSize: 16, fontWeight: '700' },
  observationsInput: { borderRadius: 10, borderWidth: 1, padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: 'top' },
  setsCard: { borderRadius: 16, padding: 20, gap: 16 },
  setsTitle: { fontSize: 16, fontWeight: '600' },
  setsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  setCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  setNum: { fontSize: 15, fontWeight: '600' },
  setActions: { flexDirection: 'row', gap: 10 },
  completeSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 16,
  },
  completeSetText: { fontSize: 16, fontWeight: '600' },
  skipSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, borderWidth: 1.5,
  },
  skipSetText: { fontSize: 14, fontWeight: '600' },
  skipExLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  skipExText: { fontSize: 13 },
  allDoneBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 14 },
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28, borderTopWidth: 0.5,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  navBtnText: { fontSize: 15, fontWeight: '500' },
  exCounter: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  exCounterText: { fontSize: 14, fontWeight: '600' },
  finishedContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  finishedIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  finishedTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  finishedSub: { fontSize: 15, textAlign: 'center' },
  summaryList: { width: '100%', gap: 8, marginTop: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  summaryIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  summaryName: { fontSize: 15, fontWeight: '600' },
  summaryDots: { flexDirection: 'row', gap: 4, marginTop: 4 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  summaryCount: { fontSize: 14, fontWeight: '600' },
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, marginTop: 8, width: '100%',
  },
  finishBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  exitLink: { paddingVertical: 12 },
  exitLinkText: { fontSize: 15 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 16 },
  exitBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 24 },
  exitBtnText: { fontSize: 15, fontWeight: '500' },
});
