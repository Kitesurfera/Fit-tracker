import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput, Alert, Platform, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

type SetStatus = 'pending' | 'completed' | 'skipped';

export default function TrainingModeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  
  const params = useLocalSearchParams();
  const currentWorkoutId = typeof params.workoutId === 'string' ? params.workoutId : params.workoutId?.[0];
  
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [isHiit, setIsHiit] = useState(false);
  
  // --- ESTADOS: FUERZA TRADICIONAL ---
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [setsStatus, setSetsStatus] = useState<Record<number, SetStatus[]>>({});
  const [logs, setLogs] = useState<Record<number, {weight: string, reps: string, coach_note?: string}>>({});
  const [recordedVideos, setRecordedVideos] = useState<Record<number, string>>({});
  const [videoUploading, setVideoUploading] = useState<number | null>(null);

  // --- ESTADOS: CIRCUITO HIIT ---
  const [hiitBlockIdx, setHiitBlockIdx] = useState(0);
  const [hiitRound, setHiitRound] = useState(1);
  const [hiitExIdx, setHiitExIdx] = useState(0);
  const [hiitPhase, setHiitPhase] = useState<'work' | 'rest_ex' | 'rest_block'>('work');

  // --- ESTADOS COMPARTIDOS ---
  const [rpe, setRpe] = useState<number | null>(null);
  const [sleep, setSleep] = useState<'bien' | 'regular' | 'mal' | null>(null);
  const [observations, setObservations] = useState('');
  
  const [restSeconds, setRestSeconds] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [restType, setRestType] = useState<'set' | 'exercise' | null>(null);
  const restIntervalRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchWorkoutDetail = async () => {
      if (!currentWorkoutId) { if (isMounted) setLoading(false); return; }
      try {
        const allWorkouts = await api.getWorkouts();
        const currentWorkout = allWorkouts.find((w: any) => w.id === currentWorkoutId);
        if (currentWorkout && isMounted) {
          setWorkout(currentWorkout);
          
          // DETECTAMOS SI ES HIIT LEYENDO LA ETIQUETA OCULTA
          const isWorkoutHiit = currentWorkout.exercises && currentWorkout.exercises.length > 0 && currentWorkout.exercises[0].is_hiit_block === true;
          setIsHiit(isWorkoutHiit);

          if (currentWorkout.completed) {
            setFinished(true);
            setObservations(currentWorkout.observations || '');
            if (currentWorkout.completion_data) {
              setRpe(currentWorkout.completion_data.rpe || null);
              setSleep(currentWorkout.completion_data.sleep || null);
              if (!isWorkoutHiit) {
                const savedLogs: Record<number, {weight: string, reps: string, coach_note?: string}> = {};
                currentWorkout.completion_data.exercise_results?.forEach((res: any, idx: number) => {
                  savedLogs[idx] = { weight: res.logged_weight || '', reps: res.logged_reps || '', coach_note: res.coach_note || '' };
                });
                setLogs(savedLogs);
              }
            }
          } else {
            if (!isWorkoutHiit) {
              const initial: Record<number, SetStatus[]> = {};
              (currentWorkout.exercises || []).forEach((ex: any, i: number) => {
                const total = parseInt(ex.sets) || 1;
                initial[i] = Array(total).fill('pending');
              });
              setSetsStatus(initial);
            }
          }
        }
      } catch (e) { console.error("Error:", e); } 
      finally { if (isMounted) setLoading(false); }
    };
    fetchWorkoutDetail();
    return () => { isMounted = false; };
  }, [currentWorkoutId]);

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

  useEffect(() => {
    if (!isResting && workout) {
      if (isHiit) {
        if (hiitPhase === 'rest_ex') {
          setHiitPhase('work');
          setHiitExIdx(prev => prev + 1);
        } else if (hiitPhase === 'rest_block') {
          setHiitPhase('work');
          setHiitExIdx(0);
          setHiitRound(prev => prev + 1);
        }
      } else {
        if (restType === 'exercise') {
          autoAdvance(currentExIndex);
          setRestType(null);
        }
      }
    }
  }, [isResting]);

  const advanceHiit = () => {
    const currentBlock = workout.exercises[hiitBlockIdx];
    const totalExercises = currentBlock.hiit_exercises.length;
    const totalRounds = parseInt(currentBlock.sets) || 1;

    if (hiitExIdx < totalExercises - 1) {
      const restTime = parseInt(currentBlock.rest_exercise) || 0;
      if (restTime > 0) {
        setRestSeconds(restTime);
        setIsResting(true);
        setHiitPhase('rest_ex');
      } else {
        setHiitExIdx(hiitExIdx + 1);
      }
    } else {
      if (hiitRound < totalRounds) {
        const restTime = parseInt(currentBlock.rest_block) || 0;
        if (restTime > 0) {
          setRestSeconds(restTime);
          setIsResting(true);
          setHiitPhase('rest_block');
        } else {
          setHiitRound(hiitRound + 1);
          setHiitExIdx(0);
        }
      } else {
        if (hiitBlockIdx < workout.exercises.length - 1) {
          setHiitBlockIdx(hiitBlockIdx + 1);
          setHiitRound(1);
          setHiitExIdx(0);
          setHiitPhase('work');
        } else {
          setFinished(true);
        }
      }
    }
  };

  const skipHiitRest = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setIsResting(false);
    setRestSeconds(0);
  };

  const updateSetStatus = (exIdx: number, setIdx: number, status: SetStatus) => {
    setSetsStatus(prev => { const updated = { ...prev }; updated[exIdx] = [...(prev[exIdx] || [])]; updated[exIdx][setIdx] = status; return updated; });
  };
  const autoAdvance = (exIdx: number) => {
    if (exIdx < (workout.exercises?.length || 0) - 1) setTimeout(() => setCurrentExIndex(exIdx + 1), 400); else setTimeout(() => setFinished(true), 400);
  };

  const completeSet = () => {
    const exercises = workout.exercises || []; const currentEx = exercises[currentExIndex]; const currentSets = setsStatus[currentExIndex] || [];
    const nextPendingSet = currentSets.findIndex(s => s === 'pending'); if (nextPendingSet === -1) return;
    updateSetStatus(currentExIndex, nextPendingSet, 'completed');
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) {
      const restTimeExercise = parseInt(currentEx?.rest_exercise) || 0;
      if (restTimeExercise > 0 && currentExIndex < exercises.length - 1) { setRestSeconds(restTimeExercise); setIsResting(true); setRestType('exercise'); } else { autoAdvance(currentExIndex); }
    } else {
      const restTimeSet = parseInt(currentEx?.rest) || 0;
      if (restTimeSet > 0) { setRestSeconds(restTimeSet); setIsResting(true); setRestType('set'); }
    }
  };

  const skipSet = () => {
    const currentSets = setsStatus[currentExIndex] || []; const nextPendingSet = currentSets.findIndex(s => s === 'pending'); if (nextPendingSet === -1) return;
    if (isResting) { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setIsResting(false); setRestSeconds(0); }
    updateSetStatus(currentExIndex, nextPendingSet, 'skipped');
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) autoAdvance(currentExIndex);
  };

  const pickAndUploadVideo = async (exIndex: number) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: true, quality: 0.7 });
      if (result.canceled) return;
      setVideoUploading(exIndex);
      const asset = result.assets[0];
      const fileName = asset.uri.split('/').pop() || 'technique.mp4';
      const uploaded = await api.uploadFile(asset.uri, fileName, asset.mimeType || 'video/mp4');
      setRecordedVideos(prev => ({ ...prev, [exIndex]: uploaded.storage_path }));
    } catch (e: any) { if (Platform.OS !== 'web') Alert.alert('Error', 'No se pudo subir el vídeo'); } finally { setVideoUploading(null); }
  };

  const buildCompletionData = () => {
    if (isHiit) return { rpe, sleep, hiit_completed: true };
    return {
      rpe: rpe, sleep: sleep,
      exercise_results: (workout.exercises || []).map((ex: any, i: number) => {
        if (workout.completed && workout.completion_data) return workout.completion_data?.exercise_results?.[i] || {};
        const sets = setsStatus[i] || [];
        return {
          exercise_index: i, name: ex.name, total_sets: parseInt(ex.sets) || 1,
          completed_sets: sets.filter(s => s === 'completed').length, skipped_sets: sets.filter(s => s === 'skipped').length,
          set_details: sets.map((status, si) => ({ set: si + 1, status })),
          logged_weight: logs[i]?.weight || '', logged_reps: logs[i]?.reps || '', recorded_video_url: recordedVideos[i] || ''
        };
      }),
    };
  };

  const handleFinish = async () => {
    if (workout.completed) { router.back(); return; }
    if (!currentWorkoutId) return;

    const completionData = buildCompletionData();
    try {
      const updateData: any = { 
        completed: true, 
        completion_data: completionData, 
        title: workout.title, 
        exercises: workout.exercises // Devolvemos el array tal cual para no perder datos
      };
      if (observations.trim()) updateData.observations = observations.trim();

      await api.updateWorkout(currentWorkoutId, updateData);
      router.back();
    } catch (e) { 
      if (Platform.OS !== 'web') Alert.alert("Error", "Hubo un error al guardar.");
    }
  };

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;
  if (!workout) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={[styles.errorText, { color: colors.textPrimary }]}>Entrenamiento no encontrado.</Text><TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}><Text style={styles.backBtnText}>Volver</Text></TouchableOpacity></SafeAreaView>;

  if (finished || workout.completed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={26} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
          <View style={{ width: 26 }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.finishedContainer} keyboardShouldPersistTaps="handled">
            <View style={[styles.finishedIcon, { backgroundColor: colors.success + '15' }]}><Ionicons name="checkmark-circle" size={64} color={colors.success} /></View>
            <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>¡Entrenamiento completado!</Text>

            <View style={[styles.wellnessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.wellnessTitle, { color: colors.textPrimary }]}>Esfuerzo Percibido (RPE)</Text>
              {workout.completed ? (
                <View style={styles.readOnlyReportBox}>
                  <View style={[styles.rpeBtn, { backgroundColor: (rpe || 0) > 7 ? colors.error : (rpe || 0) > 4 ? colors.warning : colors.success, borderColor: 'transparent', width: 60, height: 60 }]}><Text style={{ color: '#FFF', fontSize: 28, fontWeight: '900' }}>{rpe || '-'}</Text></View>
                  <View style={{ marginLeft: 20 }}><Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>DESCANSO PREVIO:</Text><Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 }}>{sleep || 'NO REGISTRADO'}</Text></View>
                </View>
              ) : (
                <>
                  <View style={styles.rpeGrid}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                      const isSelected = rpe === num; let rpeColor = colors.success; if (num > 4) rpeColor = colors.warning; if (num > 7) rpeColor = colors.error;
                      return (<TouchableOpacity key={num} style={[styles.rpeBtn, { borderColor: colors.border }, isSelected && { backgroundColor: rpeColor, borderColor: rpeColor }]} onPress={() => setRpe(num)}><Text style={[styles.rpeText, { color: colors.textPrimary }, isSelected && { color: '#FFF' }]}>{num}</Text></TouchableOpacity>);
                    })}
                  </View>
                  <Text style={[styles.wellnessTitle, { color: colors.textPrimary, marginTop: 24 }]}>¿Cómo has descansado hoy?</Text>
                  <View style={styles.sleepGrid}>
                    {['bien', 'regular', 'mal'].map(opt => (
                       <TouchableOpacity key={opt} style={[styles.sleepBtn, { borderColor: colors.border }, sleep === opt && { backgroundColor: opt === 'bien' ? colors.success : opt === 'mal' ? colors.error : colors.warning, borderColor: opt === 'bien' ? colors.success : opt === 'mal' ? colors.error : colors.warning }]} onPress={() => setSleep(opt as any)}><Text style={[styles.sleepText, { color: colors.textPrimary }, sleep === opt && { color: '#FFF' }]}>{opt.toUpperCase()}</Text></TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>

            {!isHiit && (
              <>
                <Text style={[styles.finishedSub, { color: colors.textSecondary, marginTop: 10 }]}>Anota tus marcas de hoy</Text>
                <View style={styles.summaryList}>
                  {(workout.exercises || []).map((ex: any, i: number) => {
                    const statusData = workout.completed ? workout.completion_data?.exercise_results?.[i] : null;
                    const allSkipped = statusData ? statusData.completed_sets === 0 : setsStatus[i]?.every(s => s !== 'completed');
                    return (
                      <View key={i} style={[styles.summaryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={[styles.summaryIcon, { backgroundColor: allSkipped ? colors.error + '15' : colors.success + '15' }]}><Ionicons name={allSkipped ? 'close-circle' : 'checkmark-circle'} size={22} color={allSkipped ? colors.error : colors.success} /></View>
                          <Text style={[styles.summaryName, { color: colors.textPrimary, flex: 1 }]}>{ex.name}</Text>
                        </View>
                        {!allSkipped && (
                          <View style={styles.logRow}>
                            {workout.completed ? (
                              <View style={styles.readOnlyLogBox}>
                                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800' }}>Rendimiento Registrado:</Text>
                                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 4 }}>{logs[i]?.weight ? `${logs[i]?.weight} kg` : '- kg'} x {logs[i]?.reps ? `${logs[i]?.reps} reps` : '- reps'}</Text>
                                {logs[i]?.coach_note && (
                                  <View style={{ backgroundColor: colors.warning + '15', padding: 10, borderRadius: 8, marginTop: 10, width: '100%' }}><Text style={{ color: colors.warning, fontWeight: '800', fontSize: 11 }}>FEEDBACK COACH:</Text><Text style={{ color: colors.textPrimary, fontSize: 13, fontStyle: 'italic' }}>"{logs[i]?.coach_note}"</Text></View>
                                )}
                              </View>
                            ) : (
                              <><View style={styles.logInputWrapper}><Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Kilos reales</Text><TextInput style={[styles.logInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={logs[i]?.weight || ''} onChangeText={(w) => setLogs(prev => ({...prev, [i]: {...(prev[i]||{}), weight: w}}))} /></View><View style={styles.logInputWrapper}><Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Reps reales</Text><TextInput style={[styles.logInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={logs[i]?.reps || ''} onChangeText={(rep) => setLogs(prev => ({...prev, [i]: {...(prev[i]||{}), reps: rep}}))} /></View></>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <View style={[styles.observationsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.observationsLabel, { color: colors.textPrimary }]}>Observaciones de la sesión</Text>
              {workout.completed ? <Text style={{ color: colors.textPrimary, fontSize: 15, fontStyle: 'italic', marginTop: 10 }}>{observations || "Sin notas."}</Text> : <TextInput style={[styles.observationsInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={observations} onChangeText={setObservations} placeholder="¿Algo a destacar de hoy?" placeholderTextColor={colors.textSecondary} multiline numberOfLines={3} />}
            </View>

            {!workout.completed && (
              <TouchableOpacity testID="finish-training-btn" style={[styles.finishBtn, { backgroundColor: colors.primary }]} onPress={handleFinish} activeOpacity={0.7}><Ionicons name="checkmark" size={20} color="#FFF" /><Text style={styles.finishBtnText}>Guardar entreno</Text></TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- RENDERIZADO MODO HIIT ---
  if (isHiit) {
    const currentBlock = workout.exercises?.[hiitBlockIdx];
    if (!currentBlock) return null;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
          <Text style={[styles.topProgress, { color: colors.textSecondary }]}>Bloque {hiitBlockIdx + 1}/{workout.exercises.length}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.hiitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.hiitHeader, { backgroundColor: colors.error + '15' }]}>
              <Ionicons name="flame" size={24} color={colors.error} />
              <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ color: colors.error, fontWeight: '900', fontSize: 18, textTransform: 'uppercase' }}>{currentBlock.name}</Text><Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Vuelta {hiitRound} de {currentBlock.sets}</Text></View>
            </View>

            <View style={styles.hiitList}>
              {currentBlock.hiit_exercises.map((ex: any, idx: number) => {
                const isCurrent = hiitPhase === 'work' && idx === hiitExIdx;
                const isDone = hiitExIdx > idx;
                return (
                  <View key={idx} style={[styles.hiitExRow, isCurrent && { backgroundColor: colors.surfaceHighlight, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: colors.primary }]}>
                    <View style={[styles.hiitCheck, { backgroundColor: isDone ? colors.success : isCurrent ? colors.primary : colors.border }]}>
                      {isDone ? <Ionicons name="checkmark" size={12} color="#FFF" /> : <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{idx + 1}</Text>}
                    </View>
                    <Text style={[styles.hiitExName, { color: isCurrent ? colors.textPrimary : colors.textSecondary, fontWeight: isCurrent ? '800' : '600', flex: 1 }]}>{ex.name}</Text>
                    <Text style={[styles.hiitExDur, { color: isCurrent ? colors.primary : colors.textSecondary, fontWeight: '800' }]}>{ex.duration_reps}</Text>
                  </View>
                );
              })}
            </View>

            {isResting ? (
              <View style={[styles.restTimerCard, { backgroundColor: hiitPhase === 'rest_block' ? colors.warning + '15' : colors.primary + '15' }]}>
                <Ionicons name="timer" size={32} color={hiitPhase === 'rest_block' ? colors.warning : colors.primary} />
                <View style={styles.restTimerContent}>
                  <Text style={[styles.restTimerLabel, { color: colors.textSecondary }]}>{hiitPhase === 'rest_block' ? 'DESCANSO ENTRE VUELTAS' : 'PREPÁRATE PARA EL SIGUIENTE'}</Text>
                  <Text style={[styles.restTimerValue, { color: hiitPhase === 'rest_block' ? colors.warning : colors.primary }]}>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}</Text>
                </View>
                <TouchableOpacity style={[styles.skipRestBtn, { borderColor: hiitPhase === 'rest_block' ? colors.warning : colors.primary }]} onPress={skipHiitRest}><Text style={{ color: hiitPhase === 'rest_block' ? colors.warning : colors.primary, fontWeight: '700' }}>Saltar</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.completeSetBtn, { backgroundColor: colors.error, marginTop: 20 }]} onPress={advanceHiit}>
                <Ionicons name="play" size={22} color="#FFF" />
                <Text style={[styles.completeSetText, { color: '#FFF' }]}>Completar Ejercicio</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- RENDERIZADO FUERZA TRADICIONAL ---
  const exercises = workout.exercises || [];
  const currentEx = exercises[currentExIndex];
  const totalSets = parseInt(currentEx?.sets) || 1;
  const currentSets = setsStatus[currentExIndex] || [];
  const doneSets = currentSets.filter(s => s === 'completed').length;
  const nextPendingSet = currentSets.findIndex(s => s === 'pending');
  const progress = exercises.length > 0 ? ((currentExIndex) / exercises.length) * 100 : 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
        <Text style={[styles.topProgress, { color: colors.textSecondary }]}>{currentExIndex + 1}/{exercises.length}</Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: colors.surfaceHighlight }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.min(progress, 100)}%` }]} /></View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.exerciseCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.exNumber, { backgroundColor: colors.primary + '12' }]}><Text style={[styles.exNumberText, { color: colors.primary }]}>{currentExIndex + 1}</Text></View>
          <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{currentEx.name}</Text>

          <View style={styles.detailsGrid}>
            {currentEx.sets && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.sets}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Series</Text></View>}
            {currentEx.reps && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.reps}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Reps</Text></View>}
            {currentEx.weight && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.weight}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Kg</Text></View>}
            {currentEx.rest && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.rest}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Desc.S</Text></View>}
          </View>
        </View>

        <View style={[styles.setsCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.setsTitle, { color: colors.textPrimary }]}>Progreso de Series</Text>
          <View style={styles.setsGrid}>
            {currentSets.map((status, i) => (
              <View key={i} style={[styles.setCircle, { borderColor: colors.border }, status === 'completed' && { backgroundColor: colors.success, borderColor: colors.success }, status === 'skipped' && { backgroundColor: colors.error, borderColor: colors.error }]}>
                {status === 'completed' ? <Ionicons name="checkmark" size={18} color="#FFF" /> : status === 'skipped' ? <Ionicons name="close" size={18} color="#FFF" /> : <Text style={[styles.setNum, { color: colors.textSecondary }]}>{i + 1}</Text>}
              </View>
            ))}
          </View>

          {isResting && (
            <View style={[styles.restTimerCard, { backgroundColor: colors.primary + '10' }]}>
              <Ionicons name="timer-outline" size={28} color={colors.primary} />
              <View style={styles.restTimerContent}>
                <Text style={[styles.restTimerLabel, { color: colors.textSecondary }]}>{restType === 'exercise' ? 'DESCANSO (SIGUIENTE EJ. )' : 'DESCANSO'}</Text>
                <Text style={[styles.restTimerValue, { color: colors.primary }]}>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity style={[styles.skipRestBtn, { borderColor: colors.primary }]} onPress={() => { if(restIntervalRef.current) clearInterval(restIntervalRef.current); setIsResting(false); setRestSeconds(0); }}><Text style={{ color: colors.primary, fontWeight: '600' }}>Saltar</Text></TouchableOpacity>
            </View>
          )}

          {nextPendingSet !== -1 && !isResting ? (
            <View style={styles.setActions}>
              <TouchableOpacity style={[styles.completeSetBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={completeSet}><Ionicons name="checkmark-circle-outline" size={22} color="#FFF" /><Text style={[styles.completeSetText, { color: '#FFF' }]}>Completar serie {nextPendingSet + 1}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.skipSetBtn, { borderColor: colors.error }]} onPress={skipSet}><Ionicons name="play-skip-forward" size={18} color={colors.error} /><Text style={[styles.skipSetText, { color: colors.error }]}>Saltar</Text></TouchableOpacity>
            </View>
          ) : nextPendingSet === -1 ? (
            <View style={[styles.allDoneBadge, { backgroundColor: colors.success + '12' }]}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={{ color: colors.success, fontSize: 14, fontWeight: '600' }}>Todas completadas</Text></View>
          ) : null}

          {nextPendingSet === -1 && !isResting && (
            <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15 }}>
              {recordedVideos[currentExIndex] ? (
                 <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.success + '15', padding: 12, borderRadius: 10 }}><Ionicons name="checkmark-circle" size={20} color={colors.success} /><Text style={{ color: colors.success, marginLeft: 8, fontWeight: '700', flex: 1 }}>Vídeo de técnica subido</Text></View>
              ) : (
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHighlight, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }} onPress={() => pickAndUploadVideo(currentExIndex)} disabled={videoUploading === currentExIndex}>
                  {videoUploading === currentExIndex ? <ActivityIndicator color={colors.primary} size="small" /> : <><Ionicons name="videocam" size={20} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, marginLeft: 8, fontWeight: '700' }}>Grabar y subir técnica</Text></>}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.navBtn, { opacity: currentExIndex === 0 ? 0.3 : 1 }]} onPress={() => { if(currentExIndex>0) setCurrentExIndex(currentExIndex-1); }} disabled={currentExIndex === 0}><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Anterior</Text></TouchableOpacity>
        {currentExIndex < exercises.length - 1 ? (
          <TouchableOpacity style={styles.navBtn} onPress={() => setCurrentExIndex(currentExIndex+1)}><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Siguiente</Text><Ionicons name="arrow-forward" size={22} color={colors.textPrimary} /></TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.navBtn} onPress={() => setFinished(true)}><Text style={[styles.navBtnText, { color: colors.success, fontWeight: '700' }]}>Terminar</Text><Ionicons name="flag" size={20} color={colors.success} /></TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, errorText: { fontSize: 18, fontWeight: '700', marginTop: 15, textAlign: 'center' }, backBtn: { marginTop: 20, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 12 }, backBtnText: { color: '#FFF', fontWeight: '800' }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }, topTitle: { fontSize: 16, fontWeight: '600' }, topProgress: { fontSize: 14, fontWeight: '500' }, progressBar: { height: 3, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 2 }, content: { padding: 20, paddingBottom: 100, gap: 16 }, exerciseCard: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 }, exNumber: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }, exNumberText: { fontSize: 20, fontWeight: '800' }, exerciseName: { fontSize: 24, fontWeight: '700', textAlign: 'center' }, detailsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }, detailBox: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', minWidth: 65 }, detailValue: { fontSize: 22, fontWeight: '700' }, detailLabel: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' }, videoBtn: { flexDirection: 'row', alignItems: 'center', width: '100%', borderRadius: 12, padding: 14, borderWidth: 1 }, videoBtnTitle: { fontSize: 14, fontWeight: '600' }, setsCard: { borderRadius: 16, padding: 20, gap: 16 }, setsTitle: { fontSize: 16, fontWeight: '600' }, setsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, setCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' }, setNum: { fontSize: 15, fontWeight: '600' }, setActions: { flexDirection: 'row', gap: 10 }, completeSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16 }, completeSetText: { fontSize: 16, fontWeight: '600' }, skipSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, borderWidth: 1.5 }, skipSetText: { fontSize: 14, fontWeight: '600' }, allDoneBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 14 }, bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28, borderTopWidth: 0.5 }, navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }, navBtnText: { fontSize: 15, fontWeight: '500' },
  finishedContainer: { flexGrow: 1, padding: 24, gap: 12, alignItems: 'center' }, finishedIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' }, finishedTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' }, finishedSub: { fontSize: 15, textAlign: 'center', alignSelf: 'flex-start' }, wellnessCard: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 10 }, wellnessTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, textAlign: 'center' }, rpeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }, rpeBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }, rpeText: { fontSize: 16, fontWeight: '700' }, sleepGrid: { flexDirection: 'row', gap: 10, justifyContent: 'center' }, sleepBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' }, sleepText: { fontSize: 14, fontWeight: '700' }, summaryList: { width: '100%', gap: 8 }, summaryRow: { flexDirection: 'column', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 }, summaryIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }, summaryName: { fontSize: 15, fontWeight: '600' }, logRow: { flexDirection: 'row', gap: 12, marginTop: 10, borderTopWidth: 0.5, borderTopColor: '#CCC', paddingTop: 12 }, logInputWrapper: { flex: 1, gap: 4 }, logInputLabel: { fontSize: 12, fontWeight: '600', marginLeft: 2 }, logInput: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }, observationsCard: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 8, gap: 10 }, observationsLabel: { fontSize: 16, fontWeight: '700' }, observationsInput: { borderRadius: 10, borderWidth: 1, padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: 'top' }, finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: 8, width: '100%' }, finishBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' }, readOnlyReportBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10 }, readOnlyLogBox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 10, alignItems: 'center' },
  hiitCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', paddingBottom: 20 }, hiitHeader: { padding: 20, flexDirection: 'row', alignItems: 'center' }, hiitList: { padding: 20, gap: 12 }, hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }, hiitCheck: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, hiitExName: { fontSize: 16 }, hiitExDur: { fontSize: 14 }, restTimerCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 12, padding: 16, marginHorizontal: 20, marginTop: 10 }, restTimerContent: { flex: 1 }, restTimerLabel: { fontSize: 11, fontWeight: '800', marginBottom: 2 }, restTimerValue: { fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'] }, skipRestBtn: { borderWidth: 2, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
});
