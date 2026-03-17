import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput, Alert, Platform, KeyboardAvoidingView, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import { useKeepAwake } from 'expo-keep-awake';

type SetStatus = 'pending' | 'completed' | 'skipped';

const MiniVideoPlayer = ({ url, onExpand }: { url: string, onExpand: (u: string) => void }) => {
  if (!url) return null;
  return (
    <View style={styles.miniVideoContainer}>
      <Video source={{ uri: url }} style={styles.miniVideo} resizeMode={ResizeMode.CONTAIN} shouldPlay isLooping isMuted playsInLine />
      <TouchableOpacity style={styles.expandBtn} onPress={() => onExpand(url)}><Ionicons name="expand" size={16} color="#FFF" /></TouchableOpacity>
    </View>
  );
};

export default function TrainingModeScreen() {
  useKeepAwake();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const isTrainer = user?.role === 'trainer';
  
  const params = useLocalSearchParams();
  const currentWorkoutId = typeof params.workoutId === 'string' ? params.workoutId : params.workoutId?.[0];
  
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [isHiit, setIsHiit] = useState(false);
  
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [setsStatus, setSetsStatus] = useState<Record<number, SetStatus[]>>({});
  
  // AÑADIDO: 'note' para las observaciones del deportista por ejercicio
  const [logs, setLogs] = useState<Record<number, {weight: string, reps: string, note?: string, coach_note?: string}>>({});
  
  const [recordedVideos, setRecordedVideos] = useState<Record<string, string>>({});
  const [videoUploading, setVideoUploading] = useState<string | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const [hiitBlockIdx, setHiitBlockIdx] = useState(0);
  const [hiitRound, setHiitRound] = useState(1);
  const [hiitExIdx, setHiitExIdx] = useState(0);
  const [hiitPhase, setHiitPhase] = useState<'work' | 'rest_ex' | 'rest_block' | 'rest_next_block'>('work');

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
          const isWorkoutHiit = currentWorkout.exercises && currentWorkout.exercises.length > 0 && currentWorkout.exercises[0].is_hiit_block === true;
          setIsHiit(isWorkoutHiit);

          if (currentWorkout.completed) {
            setFinished(true);
            setObservations(currentWorkout.observations || '');
            if (currentWorkout.completion_data) {
              setRpe(currentWorkout.completion_data.rpe || null);
              setSleep(currentWorkout.completion_data.sleep || null);
              
              const savedVideos: Record<string, string> = {}; 
              if (!isWorkoutHiit) {
                const savedLogs: Record<number, {weight: string, reps: string, note?: string, coach_note?: string}> = {};
                currentWorkout.completion_data.exercise_results?.forEach((res: any, idx: number) => {
                  savedLogs[idx] = { 
                    weight: res.logged_weight || '', 
                    reps: res.logged_reps || '', 
                    note: res.athlete_note || '', // Recuperamos la nota del atleta
                    coach_note: res.coach_note || '' 
                  };
                  if (res.recorded_video_url) savedVideos[idx.toString()] = res.recorded_video_url;
                });
                setLogs(savedLogs);
              } else {
                currentWorkout.completion_data.hiit_results?.forEach((block: any, bIdx: number) => {
                  block.hiit_exercises?.forEach((ex: any, eIdx: number) => {
                    if (ex.recorded_video_url) savedVideos[`${bIdx}-${eIdx}`] = ex.recorded_video_url;
                  });
                });
              }
              setRecordedVideos(savedVideos);
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
          if (prev <= 1) { clearInterval(restIntervalRef.current); setIsResting(false); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
  }, [isResting]);

  useEffect(() => {
    if (!isResting && workout) {
      if (isHiit) {
        if (hiitPhase === 'rest_ex') { setHiitPhase('work'); setHiitExIdx(prev => prev + 1); } 
        else if (hiitPhase === 'rest_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitRound(prev => prev + 1); } 
        else if (hiitPhase === 'rest_next_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitRound(1); setHiitBlockIdx(prev => prev + 1); }
      } else {
        if (restType === 'exercise') { autoAdvance(currentExIndex); setRestType(null); }
      }
    }
  }, [isResting]);

  const advanceHiit = () => {
    const currentBlock = workout.exercises[hiitBlockIdx];
    const totalExercises = currentBlock.hiit_exercises.length;
    const totalRounds = parseInt(currentBlock.sets) || 1;

    if (hiitExIdx < totalExercises - 1) {
      const restTime = parseInt(currentBlock.rest_exercise) || 0;
      if (restTime > 0) { setRestSeconds(restTime); setIsResting(true); setHiitPhase('rest_ex'); } else { setHiitExIdx(hiitExIdx + 1); }
    } else {
      if (hiitRound < totalRounds) {
        const restTime = parseInt(currentBlock.rest_block) || 0;
        if (restTime > 0) { setRestSeconds(restTime); setIsResting(true); setHiitPhase('rest_block'); } else { setHiitRound(hiitRound + 1); setHiitExIdx(0); }
      } else {
        if (hiitBlockIdx < workout.exercises.length - 1) {
          const restNextBlockTime = parseInt(currentBlock.rest_between_blocks) || 0;
          if (restNextBlockTime > 0) { setRestSeconds(restNextBlockTime); setIsResting(true); setHiitPhase('rest_next_block'); } else { setHiitBlockIdx(hiitBlockIdx + 1); setHiitRound(1); setHiitExIdx(0); setHiitPhase('work'); }
        } else { setFinished(true); }
      }
    }
  };

  const skipHiitRest = () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setIsResting(false); setRestSeconds(0); };

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

  const handleRecordVideoOptions = (key: string) => {
    if (Platform.OS === 'web') { launchVideoPicker('library', key); return; }
    Alert.alert("Subir Técnica", "¿Cómo quieres subir el vídeo?", [ { text: "Cancelar", style: "cancel" }, { text: "Elegir de la Galería", onPress: () => launchVideoPicker('library', key) }, { text: "Grabar ahora", onPress: () => launchVideoPicker('camera', key) } ]);
  };

  const launchVideoPicker = async (source: 'camera' | 'library', key: string) => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert("Permiso denegado", "Necesitamos acceso a la cámara para grabar."); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 60, quality: 0.7 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, quality: 0.7 });
      }

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      
      setVideoUploading(key);
      const asset = result.assets[0];
      const uploaded = await api.uploadFile(asset);
      const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || uploaded?.publicUrl || uploaded?.storage_path || uploaded?.file_url || asset.uri);

      setRecordedVideos(prev => ({ ...prev, [key]: finalUrl }));
      if (Platform.OS === 'web') window.alert('✅ ¡Vídeo de técnica subido y guardado!');
      else Alert.alert('Éxito', '¡Vídeo de técnica subido y guardado!');
    } catch (e: any) { 
      if (Platform.OS === 'web') window.alert(`❌ Error al subir: ${e.message}`);
      else Alert.alert('Error', `No se pudo subir el vídeo: ${e.message}`); 
    } finally { setVideoUploading(null); }
  };

  const buildCompletionData = () => {
    if (isHiit) {
      return { 
        rpe, sleep, hiit_completed: true,
        hiit_results: (workout.exercises || []).map((block: any, bIdx: number) => ({
          ...block,
          hiit_exercises: block.hiit_exercises.map((ex: any, eIdx: number) => ({
            ...ex, recorded_video_url: recordedVideos[`${bIdx}-${eIdx}`] || (workout.completed ? ex.recorded_video_url : '') || ''
          }))
        }))
      };
    }
    return {
      rpe, sleep,
      exercise_results: (workout.exercises || []).map((ex: any, i: number) => {
        if (workout.completed && workout.completion_data) return workout.completion_data?.exercise_results?.[i] || {};
        const sets = setsStatus[i] || [];
        return {
          exercise_index: i, name: ex.name, total_sets: parseInt(ex.sets) || 1,
          completed_sets: sets.filter(s => s === 'completed').length, skipped_sets: sets.filter(s => s === 'skipped').length,
          set_details: sets.map((status, si) => ({ set: si + 1, status })),
          logged_weight: logs[i]?.weight || '', 
          logged_reps: logs[i]?.reps || '', 
          athlete_note: logs[i]?.note || '', // Guardamos la observación específica
          recorded_video_url: recordedVideos[i.toString()] || ''
        };
      }),
    };
  };

  const handleFinish = async () => {
    if (workout.completed) { router.back(); return; }
    if (!currentWorkoutId) return;
    const completionData = buildCompletionData();
    try {
      const updateData: any = { completed: true, completion_data: completionData, title: workout.title, exercises: workout.exercises };
      if (observations.trim()) updateData.observations = observations.trim();
      await api.updateWorkout(currentWorkoutId, updateData);
      router.back();
    } catch (e) { if (Platform.OS !== 'web') Alert.alert("Error", "Hubo un error al guardar."); }
  };

  const saveTrainerFeedbackFuerza = async (exerciseIndex: number, noteText: string) => {
    try {
      const updatedExerciseResults = (workout.completion_data?.exercise_results || []).map((ex: any, i: number) => {
        if (i !== exerciseIndex) return ex;
        return { ...ex, coach_note: noteText };
      });
      const payload = { ...workout, completion_data: { ...workout.completion_data, exercise_results: updatedExerciseResults } };
      await api.updateWorkout(workout.id, payload);
      setWorkout(payload);
      setLogs(prev => ({...prev, [exerciseIndex]: {...(prev[exerciseIndex]||{}), coach_note: noteText}}));
      if (Platform.OS !== 'web') Alert.alert("¡Enviado!", "Feedback guardado correctamente.");
    } catch (e) { console.log("Error guardando nota:", e); }
  };

  const saveTrainerFeedbackHiit = async (blockIndex: number, exIndex: number, noteText: string) => {
    try {
      const updatedHiitResults = (workout.completion_data?.hiit_results || []).map((block: any, bIdx: number) => {
        if (bIdx !== blockIndex) return block;
        return {
          ...block,
          hiit_exercises: (block.hiit_exercises || []).map((ex: any, eIdx: number) => {
            if (eIdx !== exIndex) return ex;
            return { ...ex, coach_note: noteText };
          })
        };
      });
      const payload = { ...workout, completion_data: { ...workout.completion_data, hiit_results: updatedHiitResults } };
      await api.updateWorkout(workout.id, payload);
      setWorkout(payload);
      if (Platform.OS !== 'web') Alert.alert("¡Enviado!", "Feedback guardado correctamente.");
    } catch (e) { console.log("Error guardando nota HIIT:", e); }
  };

  const renderVideoModal = () => (
    <Modal visible={!!expandedVideo} transparent animationType="fade">
      <View style={styles.fullscreenVideoOverlay}>
        <TouchableOpacity style={styles.closeModalBtn} onPress={() => setExpandedVideo(null)}><Ionicons name="close-circle" size={40} color="#FFF" /></TouchableOpacity>
        {expandedVideo && <Video source={{ uri: expandedVideo }} style={styles.fullVideo} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />}
      </View>
    </Modal>
  );

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;
  if (!workout) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={[styles.errorText, { color: colors.textPrimary }]}>Entrenamiento no encontrado.</Text><TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}><Text style={styles.backBtnText}>Volver</Text></TouchableOpacity></SafeAreaView>;

  // --- PANTALLA DE RESUMEN / COMPLETADO ---
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
            <View style={[styles.finishedIcon, { backgroundColor: (colors.success || '#10B981') + '15' }]}><Ionicons name="checkmark-circle" size={64} color={colors.success || '#10B981'} /></View>
            <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>¡Entrenamiento completado!</Text>

            <View style={[styles.wellnessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.wellnessTitle, { color: colors.textPrimary }]}>Esfuerzo Percibido (RPE)</Text>
              {workout.completed ? (
                <View style={styles.readOnlyReportBox}>
                  <View style={{ width: 60, height: 60, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: (rpe || 0) > 7 ? (colors.error || '#EF4444') : (rpe || 0) > 4 ? (colors.warning || '#F59E0B') : (colors.success || '#10B981') }}>
                    <Text style={{ color: (rpe || 0) > 4 && (rpe || 0) < 8 ? '#000' : '#FFF', fontSize: 28, fontWeight: '900' }}>{rpe || '-'}</Text>
                  </View>
                  <View style={{ marginLeft: 20 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>DESCANSO PREVIO:</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 }}>{sleep || 'NO REGISTRADO'}</Text>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.rpeGrid}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                      const isSelected = rpe === num; 
                      let rpeColor = colors.success || '#10B981'; if (num > 4) rpeColor = colors.warning || '#F59E0B'; if (num > 7) rpeColor = colors.error || '#EF4444';
                      const bgColor = isSelected ? rpeColor : colors.surface; const textColor = isSelected ? ((num > 4 && num < 8) ? '#000' : '#FFF') : rpeColor;
                      return (
                        <TouchableOpacity key={num} style={[styles.rpeBtn, { borderColor: rpeColor, borderWidth: 1.5, backgroundColor: bgColor }]} onPress={() => setRpe(num)}>
                          <Text style={[styles.rpeText, { color: textColor }]}>{num}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={[styles.wellnessTitle, { color: colors.textPrimary, marginTop: 24 }]}>¿Cómo has descansado hoy?</Text>
                  <View style={styles.sleepGrid}>
                    {['bien', 'regular', 'mal'].map(opt => {
                      const isSelected = sleep === opt;
                      let sleepColor = colors.border;
                      if (isSelected) { if (opt === 'bien') sleepColor = colors.success || '#10B981'; else if (opt === 'mal') sleepColor = colors.error || '#EF4444'; else sleepColor = colors.warning || '#F59E0B'; }
                      return (
                        <TouchableOpacity key={opt} style={[styles.sleepBtn, { borderColor: isSelected ? sleepColor : colors.border }, isSelected && { backgroundColor: sleepColor }]} onPress={() => setSleep(opt as any)}>
                          <Text style={[styles.sleepText, { color: colors.textPrimary }, isSelected && { color: opt === 'regular' ? '#000' : '#FFF' }]}>{opt.toUpperCase()}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>

            {isHiit ? (
              <>
                <Text style={[styles.finishedSub, { color: colors.textSecondary, marginTop: 10 }]}>Resumen del Circuito</Text>
                <View style={styles.summaryList}>
                  {(workout.exercises || []).map((block: any, bIdx: number) => (
                    <View key={bIdx} style={[styles.summaryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10, marginBottom: 10 }}>
                        <Ionicons name="flame" size={20} color={colors.error || '#EF4444'} />
                        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }}>{block.name}</Text>
                      </View>
                      
                      {block.hiit_exercises.map((ex: any, eIdx: number) => {
                        const videoKey = `${bIdx}-${eIdx}`;
                        const videoUrl = recordedVideos[videoKey] || (workout.completed ? ex.recorded_video_url : null);
                        const savedNote = workout.completed ? (workout.completion_data?.hiit_results?.[bIdx]?.hiit_exercises?.[eIdx]?.coach_note || '') : (ex.coach_note || '');
                        const noteKey = `hiit-${bIdx}-${eIdx}`;
                        const currentNote = draftNotes[noteKey] !== undefined ? draftNotes[noteKey] : savedNote;
                        const isSaved = currentNote === savedNote && !!savedNote;
                        
                        return (
                          <View key={eIdx} style={{ marginBottom: 15 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>• {ex.name}</Text>
                            {videoUrl && <View style={{ marginTop: 8, marginLeft: 10 }}><MiniVideoPlayer url={videoUrl} onExpand={setExpandedVideo} /></View>}
                            
                            {isTrainer ? (
                              <View style={[styles.feedbackRow, { marginLeft: 10 }]}>
                                <TextInput 
                                  style={[styles.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                                  placeholder="Añadir feedback..." placeholderTextColor={colors.textSecondary} 
                                  value={currentNote} onChangeText={(t) => setDraftNotes(prev => ({...prev, [noteKey]: t}))}
                                />
                                <TouchableOpacity style={[styles.sendBtn, { backgroundColor: isSaved ? (colors.success || '#10B981') : colors.primary }]} onPress={() => saveTrainerFeedbackHiit(bIdx, eIdx, currentNote)}>
                                  <Ionicons name={isSaved ? "checkmark-done" : "send"} size={16} color="#FFF" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              savedNote ? (
                                <View style={[styles.feedbackCoachBox, { marginLeft: 10, width: '95%' }]}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}><Ionicons name="chatbubble-ellipses" size={16} color={colors.warning || '#F59E0B'} /><Text style={{ color: colors.warning || '#F59E0B', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 }}>EL COACH DICE:</Text></View>
                                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontStyle: 'italic' }}>"{savedNote}"</Text>
                                </View>
                              ) : null
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.finishedSub, { color: colors.textSecondary, marginTop: 10 }]}>Anota tus marcas de hoy</Text>
                <View style={styles.summaryList}>
                  {(workout.exercises || []).map((ex: any, i: number) => {
                    const statusData = workout.completed ? workout.completion_data?.exercise_results?.[i] : null;
                    const allSkipped = statusData ? statusData.completed_sets === 0 : setsStatus[i]?.every(s => s !== 'completed');
                    const videoUrl = recordedVideos[i.toString()] || statusData?.recorded_video_url;
                    
                    const savedNote = statusData?.coach_note || logs[i]?.coach_note || '';
                    const noteKey = `force-${i}`;
                    const currentNote = draftNotes[noteKey] !== undefined ? draftNotes[noteKey] : savedNote;
                    const isSaved = currentNote === savedNote && !!savedNote;

                    return (
                      <View key={i} style={[styles.summaryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <View style={[styles.summaryIcon, { backgroundColor: allSkipped ? (colors.error || '#EF4444') + '15' : (colors.success || '#10B981') + '15' }]}><Ionicons name={allSkipped ? 'close-circle' : 'checkmark-circle'} size={22} color={allSkipped ? (colors.error || '#EF4444') : (colors.success || '#10B981')} /></View>
                          <Text style={[styles.summaryName, { color: colors.textPrimary, flex: 1 }]}>{ex.name}</Text>
                        </View>
                        {!allSkipped && (
                          <View style={styles.logRow}>
                            {workout.completed ? (
                              <View style={styles.readOnlyLogBox}>
                                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800' }}>Rendimiento Registrado:</Text>
                                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 4 }}>{logs[i]?.weight ? `${logs[i]?.weight} kg` : '- kg'} x {logs[i]?.reps ? `${logs[i]?.reps} reps` : '- reps'}</Text>
                                
                                {logs[i]?.note ? (
                                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 8 }}>"{logs[i]?.note}"</Text>
                                ) : null}

                                {videoUrl && <View style={{ marginTop: 12, width: '100%', alignItems: 'center' }}><MiniVideoPlayer url={videoUrl} onExpand={setExpandedVideo} /></View>}

                                {isTrainer ? (
                                  <View style={[styles.feedbackRow, { width: '100%', marginTop: 10 }]}>
                                    <TextInput 
                                      style={[styles.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                                      placeholder="Añadir feedback..." placeholderTextColor={colors.textSecondary} 
                                      value={currentNote} onChangeText={(t) => setDraftNotes(prev => ({...prev, [noteKey]: t}))}
                                    />
                                    <TouchableOpacity style={[styles.sendBtn, { backgroundColor: isSaved ? (colors.success || '#10B981') : colors.primary }]} onPress={() => saveTrainerFeedbackFuerza(i, currentNote)}>
                                      <Ionicons name={isSaved ? "checkmark-done" : "send"} size={16} color="#FFF" />
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  savedNote ? (
                                    <View style={styles.feedbackCoachBox}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}><Ionicons name="chatbubble-ellipses" size={16} color={colors.warning || '#F59E0B'} /><Text style={{ color: colors.warning || '#F59E0B', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 }}>EL COACH DICE:</Text></View>
                                      <Text style={{ color: colors.textPrimary, fontSize: 14, fontStyle: 'italic' }}>"{savedNote}"</Text>
                                    </View>
                                  ) : null
                                )}
                              </View>
                            ) : (
                              <View style={{flex: 1}}>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                  <View style={styles.logInputWrapper}><Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Kilos reales</Text><TextInput style={[styles.logInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={logs[i]?.weight || ''} onChangeText={(w) => setLogs(prev => ({...prev, [i]: {...(prev[i]||{}), weight: w}}))} /></View>
                                  <View style={styles.logInputWrapper}><Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Reps reales</Text><TextInput style={[styles.logInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} keyboardType="numeric" value={logs[i]?.reps || ''} onChangeText={(rep) => setLogs(prev => ({...prev, [i]: {...(prev[i]||{}), reps: rep}}))} /></View>
                                </View>

                                {/* AÑADIDO: Campo para sincronizar la observación del ejercicio en la vista final */}
                                <View style={[styles.logInputWrapper, { marginTop: 12 }]}>
                                  <Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Observaciones del ejercicio</Text>
                                  <TextInput 
                                    style={[styles.logInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border, minHeight: 60, textAlignVertical: 'top' }]} 
                                    multiline 
                                    value={logs[i]?.note || ''} 
                                    onChangeText={(text) => setLogs(prev => ({...prev, [i]: {...(prev[i]||{}), note: text}}))} 
                                  />
                                </View>

                                {recordedVideos[i.toString()] && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (colors.success || '#10B981') + '15', padding: 10, borderRadius: 8, marginTop: 12 }}>
                                    <MiniVideoPlayer url={recordedVideos[i.toString()]} onExpand={setExpandedVideo} />
                                    <Text style={{ color: colors.success || '#10B981', marginLeft: 12, fontWeight: '700', fontSize: 12, flex: 1 }}>Vídeo adjuntado</Text>
                                  </View>
                                )}
                              </View>
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
              <Text style={[styles.observationsLabel, { color: colors.textPrimary }]}>Observaciones generales</Text>
              {workout.completed ? <Text style={{ color: colors.textPrimary, fontSize: 15, fontStyle: 'italic', marginTop: 10 }}>{observations || "Sin notas."}</Text> : <TextInput style={[styles.observationsInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} value={observations} onChangeText={setObservations} placeholder="¿Algo general a destacar de hoy?" placeholderTextColor={colors.textSecondary} multiline numberOfLines={3} />}
            </View>

            {!workout.completed && <TouchableOpacity testID="finish-training-btn" style={[styles.finishBtn, { backgroundColor: colors.primary }]} onPress={handleFinish} activeOpacity={0.7}><Ionicons name="checkmark" size={20} color="#FFF" /><Text style={styles.finishBtnText}>Guardar entreno</Text></TouchableOpacity>}
          </ScrollView>
        </KeyboardAvoidingView>
        {renderVideoModal()}
      </SafeAreaView>
    );
  }

  // --- MODO CIRCUITO HIIT (VISTA ACTIVA) ---
  if (isHiit) {
    const currentBlock = workout.exercises?.[hiitBlockIdx];
    if (!currentBlock) return null;

    const totalExs = currentBlock.hiit_exercises.length;
    const dynamicPadding = totalExs <= 3 ? 18 : totalExs <= 5 ? 12 : 8;
    const dynamicFontName = totalExs <= 3 ? 20 : totalExs <= 5 ? 18 : 15;
    const dynamicFontDur = totalExs <= 3 ? 18 : totalExs <= 5 ? 16 : 14;

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
          <Text style={[styles.topProgress, { color: colors.textSecondary }]}>Bloque {hiitBlockIdx + 1}/{workout.exercises.length}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.hiitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.hiitHeader, { backgroundColor: (colors.error || '#EF4444') + '15' }]}>
              <Ionicons name="flame" size={24} color={colors.error || '#EF4444'} />
              <View style={{ flex: 1, marginLeft: 10 }}><Text style={{ color: colors.error || '#EF4444', fontWeight: '900', fontSize: 18, textTransform: 'uppercase' }}>{currentBlock.name}</Text><Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Vuelta {hiitRound} de {currentBlock.sets}</Text></View>
            </View>

            <View style={styles.hiitList}>
              {currentBlock.hiit_exercises.map((ex: any, idx: number) => {
                const isCurrent = hiitPhase === 'work' && idx === hiitExIdx;
                const isDone = hiitExIdx > idx;
                const videoKey = `${hiitBlockIdx}-${idx}`;

                return (
                  <View key={idx} style={[styles.hiitExRowWrapper, isCurrent && { backgroundColor: colors.surfaceHighlight, borderRadius: 10, borderWidth: 1, borderColor: colors.primary }]}>
                    <View style={[styles.hiitExRow, { paddingVertical: dynamicPadding }]}>
                      <View style={[styles.hiitCheck, { backgroundColor: isDone ? (colors.success || '#10B981') : isCurrent ? colors.primary : colors.border }]}><Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{isDone ? <Ionicons name="checkmark" size={12} color="#FFF" /> : idx + 1}</Text></View>
                      <Text style={[styles.hiitExName, { fontSize: dynamicFontName, color: isCurrent ? colors.textPrimary : colors.textSecondary, fontWeight: isCurrent ? '800' : '600', flex: 1 }]}>{ex.name}</Text>
                      <Text style={[styles.hiitExDur, { fontSize: dynamicFontDur, color: isCurrent ? colors.primary : colors.textSecondary, fontWeight: '800' }]}>{ex.duration_reps}</Text>
                    </View>
                    
                    {isCurrent && (
                      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                        {ex.video_url && <TouchableOpacity style={[styles.hiitRefBtn, { backgroundColor: colors.primary + '15', marginBottom: 10 }]} onPress={() => Linking.openURL(ex.video_url)}><Ionicons name="logo-youtube" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Ver Vídeo de Referencia</Text></TouchableOpacity>}
                        {ex.exercise_notes && <View style={{ flexDirection: 'row', marginBottom: 10 }}><Ionicons name="information-circle" size={14} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginLeft: 4, flex: 1 }}>{ex.exercise_notes}</Text></View>}

                        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 5 }}>
                          {recordedVideos[videoKey] ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (colors.success || '#10B981') + '15', padding: 10, borderRadius: 8 }}>
                              <MiniVideoPlayer url={recordedVideos[videoKey]} onExpand={setExpandedVideo} />
                              <View style={{ marginLeft: 12, flex: 1 }}>
                                <Text style={{ color: colors.success || '#10B981', fontWeight: '700', fontSize: 12, marginBottom: 4 }}>Vídeo subido</Text>
                                <TouchableOpacity onPress={() => handleRecordVideoOptions(videoKey)}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12, textDecorationLine: 'underline' }}>Cambiar</Text></TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' }} onPress={() => handleRecordVideoOptions(videoKey)} disabled={videoUploading === videoKey}>
                              {videoUploading === videoKey ? <ActivityIndicator color={colors.primary} size="small" /> : <><Ionicons name="videocam" size={18} color={colors.primary} /><Text style={{ color: colors.primary, marginLeft: 6, fontWeight: '700', fontSize: 12 }}>Grabar técnica</Text></>}
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {isResting ? (
              <View style={[styles.restTimerCard, { backgroundColor: hiitPhase === 'rest_block' || hiitPhase === 'rest_next_block' ? (colors.warning || '#F59E0B') + '15' : colors.primary + '15' }]}>
                <Ionicons name="timer" size={32} color={hiitPhase === 'rest_block' || hiitPhase === 'rest_next_block' ? (colors.warning || '#F59E0B') : colors.primary} />
                <View style={styles.restTimerContent}>
                  <Text style={[styles.restTimerLabel, { color: colors.textSecondary }]}>{hiitPhase === 'rest_block' ? 'DESCANSO ENTRE VUELTAS' : hiitPhase === 'rest_next_block' ? 'DESCANSO PARA SIGUIENTE BLOQUE' : 'PREPÁRATE PARA EL SIGUIENTE'}</Text>
                  <Text style={[styles.restTimerValue, { color: hiitPhase === 'rest_block' || hiitPhase === 'rest_next_block' ? (colors.warning || '#F59E0B') : colors.primary }]}>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}</Text>
                </View>
                <TouchableOpacity style={[styles.skipRestBtn, { borderColor: hiitPhase === 'rest_block' || hiitPhase === 'rest_next_block' ? (colors.warning || '#F59E0B') : colors.primary }]} onPress={skipHiitRest}><Text style={{ color: hiitPhase === 'rest_block' || hiitPhase === 'rest_next_block' ? (colors.warning || '#F59E0B') : colors.primary, fontWeight: '700' }}>Saltar</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.completeSetBtn, { backgroundColor: colors.error || '#EF4444', marginTop: 10, marginHorizontal: 20, marginBottom: 20 }]} onPress={advanceHiit}><Ionicons name="play" size={22} color="#FFF" /><Text style={[styles.completeSetText, { color: '#FFF' }]}>Completar Ejercicio</Text></TouchableOpacity>
            )}
          </View>
        </ScrollView>
        {renderVideoModal()}
      </SafeAreaView>
    );
  }

  // --- MODO FUERZA TRADICIONAL (VISTA ACTIVA) ---
  const exercises = workout.exercises || [];
  const currentEx = exercises[currentExIndex];
  const currentSets = setsStatus[currentExIndex] || [];
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

          {currentEx.video_url && <TouchableOpacity style={[styles.referenceVideoBtn, { backgroundColor: (colors.error || '#EF4444') + '15' }]} onPress={() => Linking.openURL(currentEx.video_url)}><Ionicons name="logo-youtube" size={18} color={colors.error || '#EF4444'} /><Text style={{ color: colors.error || '#EF4444', fontSize: 13, fontWeight: '700' }}>Ver Vídeo de Referencia</Text></TouchableOpacity>}
          {currentEx.exercise_notes && <View style={[styles.coachNotesBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}><Ionicons name="information-circle" size={18} color={colors.primary} /><Text style={{ color: colors.textPrimary, flex: 1, fontSize: 13, fontStyle: 'italic', lineHeight: 18 }}>{currentEx.exercise_notes}</Text></View>}

          <View style={styles.detailsGrid}>
            {currentEx.sets && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.sets}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Series</Text></View>}
            {currentEx.reps && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.reps}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Reps</Text></View>}
            {currentEx.weight && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.weight}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Kg</Text></View>}
            {currentEx.rest && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.rest}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Desc.S.</Text></View>}
            {currentEx.rest_exercise && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.rest_exercise}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Desc.Ej.</Text></View>}
          </View>

          {/* AÑADIDO: Formulario integrado en la vista activa de entrenamiento */}
          <View style={[styles.activeLogContainer, { borderTopColor: colors.border }]}>
            <Text style={[styles.activeLogTitle, { color: colors.textPrimary }]}>Anota tus marcas de hoy:</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={styles.logInputWrapper}>
                <Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Kilos</Text>
                <TextInput 
                  style={[styles.logInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} 
                  keyboardType="numeric" 
                  placeholder="Ej: 60"
                  placeholderTextColor={colors.textSecondary}
                  value={logs[currentExIndex]?.weight || ''} 
                  onChangeText={(w) => setLogs(prev => ({...prev, [currentExIndex]: {...(prev[currentExIndex]||{}), weight: w}}))} 
                />
              </View>
              <View style={styles.logInputWrapper}>
                <Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Reps</Text>
                <TextInput 
                  style={[styles.logInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]} 
                  keyboardType="numeric" 
                  placeholder="Ej: 10"
                  placeholderTextColor={colors.textSecondary}
                  value={logs[currentExIndex]?.reps || ''} 
                  onChangeText={(rep) => setLogs(prev => ({...prev, [currentExIndex]: {...(prev[currentExIndex]||{}), reps: rep}}))} 
                />
              </View>
            </View>
            <View style={[styles.logInputWrapper, { marginTop: 12 }]}>
              <Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Observaciones del ejercicio</Text>
              <TextInput 
                style={[styles.logInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, minHeight: 60, textAlignVertical: 'top' }]} 
                multiline 
                placeholder="¿Algo a destacar? (Técnica, molestias...)"
                placeholderTextColor={colors.textSecondary}
                value={logs[currentExIndex]?.note || ''} 
                onChangeText={(text) => setLogs(prev => ({...prev, [currentExIndex]: {...(prev[currentExIndex]||{}), note: text}}))} 
              />
            </View>
          </View>

        </View>

        <View style={[styles.setsCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.setsTitle, { color: colors.textPrimary }]}>Progreso de Series</Text>
          <View style={styles.setsGrid}>
            {currentSets.map((status, i) => (
              <View key={i} style={[styles.setCircle, { borderColor: colors.border }, status === 'completed' && { backgroundColor: colors.success || '#10B981', borderColor: colors.success || '#10B981' }, status === 'skipped' && { backgroundColor: colors.error || '#EF4444', borderColor: colors.error || '#EF4444' }]}>
                {status === 'completed' ? <Ionicons name="checkmark" size={18} color="#FFF" /> : status === 'skipped' ? <Ionicons name="close" size={18} color="#FFF" /> : <Text style={[styles.setNum, { color: colors.textSecondary }]}>{i + 1}</Text>}
              </View>
            ))}
          </View>

          <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15 }}>
            {recordedVideos[currentExIndex.toString()] ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (colors.success || '#10B981') + '15', padding: 12, borderRadius: 10 }}>
                  <MiniVideoPlayer url={recordedVideos[currentExIndex.toString()]} onExpand={setExpandedVideo} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ color: colors.success || '#10B981', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>Vídeo subido</Text>
                    <TouchableOpacity onPress={() => handleRecordVideoOptions(currentExIndex.toString())}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12, textDecorationLine: 'underline' }}>Cambiar vídeo</Text></TouchableOpacity>
                  </View>
                </View>
            ) : (
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHighlight, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' }} onPress={() => handleRecordVideoOptions(currentExIndex.toString())} disabled={videoUploading === currentExIndex.toString()}>
                {videoUploading === currentExIndex.toString() ? <ActivityIndicator color={colors.primary} size="small" /> : <><Ionicons name="videocam" size={20} color={colors.primary} /><Text style={{ color: colors.primary, marginLeft: 8, fontWeight: '700' }}>Grabar y subir técnica</Text></>}
              </TouchableOpacity>
            )}
          </View>

          {isResting && (
            <View style={[styles.restTimerCard, { backgroundColor: colors.primary + '10', marginTop: 20 }]}>
              <Ionicons name="timer-outline" size={28} color={colors.primary} />
              <View style={styles.restTimerContent}>
                <Text style={[styles.restTimerLabel, { color: colors.textSecondary }]}>{restType === 'exercise' ? 'DESCANSO (SIGUIENTE EJ. )' : 'DESCANSO'}</Text>
                <Text style={[styles.restTimerValue, { color: colors.primary }]}>{Math.floor(restSeconds / 60)}:{String(restSeconds % 60).padStart(2, '0')}</Text>
              </View>
              <TouchableOpacity style={[styles.skipRestBtn, { borderColor: colors.primary }]} onPress={() => { if(restIntervalRef.current) clearInterval(restIntervalRef.current); setIsResting(false); setRestSeconds(0); }}><Text style={{ color: colors.primary, fontWeight: '600' }}>Saltar</Text></TouchableOpacity>
            </View>
          )}

          {nextPendingSet !== -1 && !isResting ? (
            <View style={[styles.setActions, { marginTop: 20 }]}>
              <TouchableOpacity style={[styles.completeSetBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={completeSet}><Ionicons name="checkmark-circle-outline" size={22} color="#FFF" /><Text style={[styles.completeSetText, { color: '#FFF' }]}>Completar serie {nextPendingSet + 1}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.skipSetBtn, { borderColor: colors.error || '#EF4444' }]} onPress={skipSet}><Ionicons name="play-skip-forward" size={18} color={colors.error || '#EF4444'} /><Text style={[styles.skipSetText, { color: colors.error || '#EF4444' }]}>Saltar</Text></TouchableOpacity>
            </View>
          ) : nextPendingSet === -1 ? (
            <View style={[styles.allDoneBadge, { backgroundColor: (colors.success || '#10B981') + '12', marginTop: 20 }]}><Ionicons name="checkmark-circle" size={18} color={colors.success || '#10B981'} /><Text style={{ color: colors.success || '#10B981', fontSize: 14, fontWeight: '600' }}>Todas completadas</Text></View>
          ) : null}

        </View>
      </ScrollView>

      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.navBtn, { opacity: currentExIndex === 0 ? 0.3 : 1 }]} onPress={() => { if(currentExIndex>0) setCurrentExIndex(currentExIndex-1); }} disabled={currentExIndex === 0}><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Anterior</Text></TouchableOpacity>
        {currentExIndex < exercises.length - 1 ? (
          <TouchableOpacity style={styles.navBtn} onPress={() => setCurrentExIndex(currentExIndex+1)}><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Siguiente</Text><Ionicons name="arrow-forward" size={22} color={colors.textPrimary} /></TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.navBtn} onPress={() => setFinished(true)}><Text style={[styles.navBtnText, { color: colors.success || '#10B981', fontWeight: '700' }]}>Terminar</Text><Ionicons name="flag" size={20} color={colors.success || '#10B981'} /></TouchableOpacity>
        )}
      </View>
      {renderVideoModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, errorText: { fontSize: 18, fontWeight: '700', marginTop: 15, textAlign: 'center' }, backBtn: { marginTop: 20, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 12 }, backBtnText: { color: '#FFF', fontWeight: '800' }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }, topTitle: { fontSize: 16, fontWeight: '600' }, topProgress: { fontSize: 14, fontWeight: '500' }, progressBar: { height: 3, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 2 }, content: { padding: 20, paddingBottom: 100, gap: 16 }, 
  exerciseCard: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 }, exNumber: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }, exNumberText: { fontSize: 20, fontWeight: '800' }, exerciseName: { fontSize: 24, fontWeight: '700', textAlign: 'center' }, 
  referenceVideoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginTop: -4 },
  coachNotesBox: { flexDirection: 'row', padding: 12, borderRadius: 10, borderWidth: 1, gap: 8, width: '100%' },
  detailsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }, detailBox: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', minWidth: 60 }, detailValue: { fontSize: 20, fontWeight: '700' }, detailLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' }, setsCard: { borderRadius: 16, padding: 20 }, setsTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 }, setsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, setCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' }, setNum: { fontSize: 15, fontWeight: '600' }, setActions: { flexDirection: 'row', gap: 10 }, completeSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16 }, completeSetText: { fontSize: 16, fontWeight: '600' }, skipSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, borderWidth: 1.5 }, skipSetText: { fontSize: 14, fontWeight: '600' }, allDoneBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 14 }, bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28, borderTopWidth: 0.5 }, navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }, navBtnText: { fontSize: 15, fontWeight: '500' },
  finishedContainer: { flexGrow: 1, padding: 24, gap: 12, alignItems: 'center' }, finishedIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' }, finishedTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' }, finishedSub: { fontSize: 15, textAlign: 'center', alignSelf: 'flex-start' }, wellnessCard: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 10 }, wellnessTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, textAlign: 'center' }, rpeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }, rpeBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, rpeText: { fontSize: 16, fontWeight: '700' }, sleepGrid: { flexDirection: 'row', gap: 10, justifyContent: 'center' }, sleepBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' }, sleepText: { fontSize: 14, fontWeight: '700' }, summaryList: { width: '100%', gap: 8 }, summaryRow: { flexDirection: 'column', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 }, summaryIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }, summaryName: { fontSize: 15, fontWeight: '600' }, logRow: { flexDirection: 'row', gap: 12, marginTop: 10, borderTopWidth: 0.5, borderTopColor: '#CCC', paddingTop: 12 }, logInputWrapper: { flex: 1, gap: 4 }, logInputLabel: { fontSize: 12, fontWeight: '600', marginLeft: 2 }, logInput: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }, observationsCard: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 8, gap: 10 }, observationsLabel: { fontSize: 16, fontWeight: '700' }, observationsInput: { borderRadius: 10, borderWidth: 1, padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: 'top' }, finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: 8, width: '100%' }, finishBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' }, readOnlyReportBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10 }, readOnlyLogBox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 10, alignItems: 'center' },
  hiitCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', paddingBottom: 20 }, hiitHeader: { padding: 20, flexDirection: 'row', alignItems: 'center' }, hiitList: { padding: 20, gap: 0 }, hiitExRowWrapper: { marginBottom: 12 }, hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }, hiitCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden', paddingBottom: 20 },
  hiitHeader: { padding: 20, flexDirection: 'row', alignItems: 'center' },
  hiitList: { padding: 20, gap: 0 },
  hiitExRowWrapper: { marginBottom: 12 },
  hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  hiitCheck: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  hiitExName: { flex: 1 },
  hiitExDur: { width: 60, textAlign: 'right' },
  hiitRefBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 8 },
  restTimerCard: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 15, marginHorizontal: 20, gap: 15 },
  restTimerContent: { flex: 1 },
  restTimerLabel: { fontSize: 10, fontWeight: '800' },
  restTimerValue: { fontSize: 24, fontWeight: '900' },
  skipRestBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  activeLogContainer: { borderTopWidth: 1, paddingTop: 20, marginTop: 20, width: '100%' },
  activeLogTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  feedbackRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  feedbackInput: { flex: 1, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  feedbackCoachBox: { backgroundColor: '#FFFBEB', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FEF3C7', marginTop: 10 },
  fullscreenVideoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  closeModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  fullVideo: { width: '100%', height: '80%' },
  miniVideoContainer: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  miniVideo: { width: '100%', height: '100%' },
  expandBtn: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 2 }
});
