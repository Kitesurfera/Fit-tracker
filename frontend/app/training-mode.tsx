import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput, Alert, Platform, KeyboardAvoidingView, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, Audio } from 'expo-av';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import { useKeepAwake } from 'expo-keep-awake';
import Svg, { Circle } from 'react-native-svg';

type SetStatus = 'pending' | 'completed' | 'skipped';

const SLEEP_HOURS_OPTIONS = ['<6', '6', '7', '8', '9+'];

const parseTimeToSeconds = (timeStr: string | number | undefined | null): number => {
  if (!timeStr) return 0;
  const str = String(timeStr).toLowerCase().trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  let totalSeconds = 0;
  const minMatch = str.match(/(\d+)\s*(m|min)/);
  if (minMatch) totalSeconds += parseInt(minMatch[1], 10) * 60;
  const secMatch = str.match(/(\d+)\s*(s|seg)/);
  if (secMatch) totalSeconds += parseInt(secMatch[1], 10);
  const colonMatch = str.match(/^(\d+):(\d{2})$/);
  if (colonMatch) {
    totalSeconds += parseInt(colonMatch[1], 10) * 60;
    totalSeconds += parseInt(colonMatch[2], 10);
  }
  return totalSeconds;
};

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
  const [stableWorkoutId] = useState(() => typeof params.workoutId === 'string' ? params.workoutId : params.workoutId?.[0]);
  
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [isHiit, setIsHiit] = useState(false);
  
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [setsStatus, setSetsStatus] = useState<Record<number, SetStatus[]>>({});
  
  const [logs, setLogs] = useState<Record<number, {weight: string, reps: string, note?: string, coach_note?: string}>>({});
  const [hiitLogs, setHiitLogs] = useState<Record<string, {note?: string}>>({});
  
  const [recordedVideos, setRecordedVideos] = useState<Record<string, string>>({});
  const [videoUploading, setVideoUploading] = useState<string | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const [hiitBlockIdx, setHiitBlockIdx] = useState(0);
  const [hiitRound, setHiitRound] = useState(1);
  const [hiitExIdx, setHiitExIdx] = useState(0);
  const [hiitPhase, setHiitPhase] = useState<'work' | 'rest_ex' | 'rest_block' | 'rest_next_block'>('work');
  const [hiitSkipped, setHiitSkipped] = useState<Record<string, number>>({}); 

  const [rpe, setRpe] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState<string>('');
  const [observations, setObservations] = useState('');
  
  const [restTargetTime, setRestTargetTime] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [restType, setRestType] = useState<'set' | 'exercise' | null>(null);
  const restIntervalRef = useRef<any>(null);

  const [workTargetTime, setWorkTargetTime] = useState<number | null>(null);
  const [workSeconds, setWorkSeconds] = useState(0);
  const [workTotalSeconds, setWorkTotalSeconds] = useState(1);
  const [isWorking, setIsWorking] = useState(false);
  const workIntervalRef = useRef<any>(null);

  // --- SISTEMA DE AUDIO LOCAL ---
  const playSound = async (type: 'beep' | 'end') => {
    try {
      // ⚠️ CAMBIA LOS NOMBRES AQUÍ SI TUS ARCHIVOS SE LLAMAN DIFERENTE ⚠️
      const soundAsset = type === 'beep'
        ? require('./assets/beep.mp3') 
        : require('./assets/finish.mp3'); 

      const { sound } = await Audio.Sound.createAsync(soundAsset, { shouldPlay: true });
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log(`Error al reproducir el sonido ${type}:`, error);
    }
  };

  // Efectos para la cuenta atrás (5, 4, 3, 2, 1)
  useEffect(() => {
    if (isWorking && workSeconds > 0 && workSeconds <= 5) playSound('beep');
  }, [workSeconds, isWorking]);

  useEffect(() => {
    if (isResting && restSeconds > 0 && restSeconds <= 5) playSound('beep');
  }, [restSeconds, isResting]);
  // ---------------------------------

  const startRestTimer = (seconds: number) => {
    stopWorkTimer();
    setRestTargetTime(Date.now() + seconds * 1000);
    setRestSeconds(seconds);
    setRestTotalSeconds(seconds); 
    setIsResting(true);
  };

  const stopRestTimer = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestTargetTime(null);
    setRestSeconds(0);
    setIsResting(false);
  };

  const toggleWorkTimer = () => {
    if (isWorking) {
      setIsWorking(false);
      if (workIntervalRef.current) clearInterval(workIntervalRef.current);
      setWorkTargetTime(null);
    } else {
      setIsWorking(true);
      setWorkTargetTime(Date.now() + workSeconds * 1000);
    }
  };

  const stopWorkTimer = () => {
    setIsWorking(false);
    setWorkSeconds(0);
    if (workIntervalRef.current) clearInterval(workIntervalRef.current);
    setWorkTargetTime(null);
  };

  const handleWorkComplete = () => {
    stopWorkTimer();
    if (isHiit) {
      advanceHiitLogic();
    } else {
      completeSet();
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchWorkoutDetail = async () => {
      if (!stableWorkoutId) { if (isMounted) setLoading(false); return; }
      try {
        const [allWorkouts, wellnessData] = await Promise.all([
           api.getWorkouts(),
           api.getWellnessHistory(user?.id).catch(() => [])
        ]);

        const currentWorkout = allWorkouts.find((w: any) => w.id === stableWorkoutId);
        
        if (currentWorkout && isMounted) {
          setWorkout(currentWorkout);
          const isWorkoutHiit = currentWorkout.exercises && currentWorkout.exercises.length > 0 && currentWorkout.exercises[0].is_hiit_block === true;
          setIsHiit(isWorkoutHiit);

          if (currentWorkout.completed) {
            setFinished(true);
            setObservations(currentWorkout.observations || '');
            if (currentWorkout.completion_data) {
              setRpe(currentWorkout.completion_data.rpe || null);
              setSleepQuality(currentWorkout.completion_data.sleep_quality || null);
              setSleepHours(currentWorkout.completion_data.sleep_hours || '');
              
              const savedVideos: Record<string, string> = {}; 
              
              if (!isWorkoutHiit) {
                const savedLogs: Record<number, {weight: string, reps: string, note?: string, coach_note?: string}> = {};
                currentWorkout.completion_data.exercise_results?.forEach((res: any, idx: number) => {
                  savedLogs[idx] = { 
                    weight: res.logged_weight || '', 
                    reps: res.logged_reps || '', 
                    note: res.athlete_note || '',
                    coach_note: res.coach_note || '' 
                  };
                  if (res.recorded_video_url) savedVideos[idx.toString()] = res.recorded_video_url;
                });
                setLogs(savedLogs);
              } else {
                const savedHiitLogs: Record<string, {note?: string}> = {};
                currentWorkout.completion_data.hiit_results?.forEach((block: any, bIdx: number) => {
                  block.hiit_exercises?.forEach((ex: any, eIdx: number) => {
                    const key = `${bIdx}-${eIdx}`;
                    if (ex.recorded_video_url) savedVideos[key] = ex.recorded_video_url;
                    if (ex.athlete_note) savedHiitLogs[key] = { note: ex.athlete_note };
                  });
                });
                setHiitLogs(savedHiitLogs);
              }
              setRecordedVideos(savedVideos);
            }
          } else {
            const todayStr = new Date().toISOString().split('T')[0];
            const todayWellness = Array.isArray(wellnessData) ? wellnessData.find((w: any) => w.date === todayStr) : null;
            if (todayWellness) {
                setSleepQuality(todayWellness.sleep_quality || null);
                setSleepHours(todayWellness.sleep_hours || '');
            }

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
  }, [stableWorkoutId]);

  // Efecto Temporizador Descanso
  useEffect(() => {
    if (isResting && restTargetTime) {
      restIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((restTargetTime - Date.now()) / 1000);
        if (remaining <= 0) {
          playSound('end'); // <--- SONIDO DE FINAL DE DESCANSO
          stopRestTimer();
        } else {
          setRestSeconds(remaining);
        }
      }, 1000);
    }
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
  }, [isResting, restTargetTime]);

  // Efecto Temporizador Trabajo
  useEffect(() => {
    if (isWorking && workTargetTime) {
      workIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((workTargetTime - Date.now()) / 1000);
        if (remaining <= 0) {
          playSound('end'); // <--- SONIDO DE FINAL DE TRABAJO
          handleWorkComplete();
        } else {
          setWorkSeconds(remaining);
        }
      }, 1000);
    }
    return () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); };
  }, [isWorking, workTargetTime]);

  useEffect(() => {
    if (!isHiit && workout && !isResting) {
      const currentSets = setsStatus[currentExIndex] || [];
      const nextPendingSet = currentSets.findIndex(s => s === 'pending');
      if (nextPendingSet !== -1) {
        const dur = parseTimeToSeconds(workout.exercises[currentExIndex]?.duration);
        if (dur > 0 && !isWorking && workTargetTime === null) {
          setWorkSeconds(dur);
          setWorkTotalSeconds(dur);
          setWorkTargetTime(Date.now() + dur * 1000);
          setIsWorking(true);
        }
      } else {
        stopWorkTimer();
      }
    }
  }, [currentExIndex, setsStatus, isResting, workout, isHiit]);

  useEffect(() => {
    if (isHiit && workout && hiitPhase === 'work' && !isResting) {
      const currentBlock = workout.exercises[hiitBlockIdx];
      if (!currentBlock) return;
      const currentEx = currentBlock.hiit_exercises[hiitExIdx];
      const dur = parseTimeToSeconds(currentEx?.duration);
      if (dur > 0 && !isWorking && workTargetTime === null) {
        setWorkSeconds(dur);
        setWorkTotalSeconds(dur);
        setWorkTargetTime(Date.now() + dur * 1000);
        setIsWorking(true);
      } else if (dur === 0) {
        stopWorkTimer();
      }
    }
  }, [hiitBlockIdx, hiitExIdx, hiitPhase, isResting, workout, isHiit]);

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

  const advanceHiitLogic = () => {
    stopWorkTimer();
    const currentBlock = workout.exercises[hiitBlockIdx];
    const totalExercises = currentBlock.hiit_exercises.length;
    const totalRounds = parseInt(currentBlock.sets) || 1;

    if (hiitExIdx < totalExercises - 1) {
      const restTime = parseTimeToSeconds(currentBlock.rest_exercise);
      if (restTime > 0) { startRestTimer(restTime); setHiitPhase('rest_ex'); } else { setHiitExIdx(hiitExIdx + 1); }
    } else {
      if (hiitRound < totalRounds) {
        const restTime = parseTimeToSeconds(currentBlock.rest_block);
        if (restTime > 0) { startRestTimer(restTime); setHiitPhase('rest_block'); } else { setHiitRound(hiitRound + 1); setHiitExIdx(0); }
      } else {
        if (hiitBlockIdx < workout.exercises.length - 1) {
          const restNextBlockTime = parseTimeToSeconds(currentBlock.rest_between_blocks);
          if (restNextBlockTime > 0) { startRestTimer(restNextBlockTime); setHiitPhase('rest_next_block'); } else { setHiitBlockIdx(hiitBlockIdx + 1); setHiitRound(1); setHiitExIdx(0); setHiitPhase('work'); }
        } else { setFinished(true); }
      }
    }
  };

  const advanceHiit = () => advanceHiitLogic();

  const skipHiitEx = () => {
    stopWorkTimer();
    const key = `${hiitBlockIdx}-${hiitExIdx}`;
    setHiitSkipped(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    advanceHiitLogic();
  };

  const skipHiitRest = () => { stopRestTimer(); };

  const updateSetStatus = (exIdx: number, setIdx: number, status: SetStatus) => {
    setSetsStatus(prev => { const updated = { ...prev }; updated[exIdx] = [...(prev[exIdx] || [])]; updated[exIdx][setIdx] = status; return updated; });
  };
  
  const autoAdvance = (exIdx: number) => {
    stopWorkTimer();
    if (exIdx < (workout.exercises?.length || 0) - 1) setTimeout(() => setCurrentExIndex(exIdx + 1), 400); else setTimeout(() => setFinished(true), 400);
  };

  const completeSet = () => {
    stopWorkTimer();
    const exercises = workout.exercises || []; const currentEx = exercises[currentExIndex]; const currentSets = setsStatus[currentExIndex] || [];
    const nextPendingSet = currentSets.findIndex(s => s === 'pending'); if (nextPendingSet === -1) return;
    updateSetStatus(currentExIndex, nextPendingSet, 'completed');
    
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) {
      const restTimeExercise = parseTimeToSeconds(currentEx?.rest_exercise);
      if (restTimeExercise > 0 && currentExIndex < exercises.length - 1) { startRestTimer(restTimeExercise); setRestType('exercise'); } else { autoAdvance(currentExIndex); }
    } else {
      const restTimeSet = parseTimeToSeconds(currentEx?.rest);
      if (restTimeSet > 0) { startRestTimer(restTimeSet); setRestType('set'); }
    }
  };

  const skipSet = () => {
    stopWorkTimer();
    const currentSets = setsStatus[currentExIndex] || []; const nextPendingSet = currentSets.findIndex(s => s === 'pending'); if (nextPendingSet === -1) return;
    if (isResting) { stopRestTimer(); }
    updateSetStatus(currentExIndex, nextPendingSet, 'skipped');
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) autoAdvance(currentExIndex);
  };

  const skipEntireExercise = () => {
    stopWorkTimer();
    setSetsStatus(prev => {
      const updated = { ...prev };
      updated[currentExIndex] = (updated[currentExIndex] || []).map(s => s === 'pending' ? 'skipped' : s);
      return updated;
    });
    if (isResting) { stopRestTimer(); }
    autoAdvance(currentExIndex);
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
        rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours, hiit_completed: true,
        hiit_results: (workout.exercises || []).map((block: any, bIdx: number) => ({
          ...block,
          hiit_exercises: block.hiit_exercises.map((ex: any, eIdx: number) => ({
            ...ex, 
            skipped_rounds: hiitSkipped[`${bIdx}-${eIdx}`] || 0,
            recorded_video_url: recordedVideos[`${bIdx}-${eIdx}`] || (workout.completed ? ex.recorded_video_url : '') || '',
            athlete_note: hiitLogs[`${bIdx}-${eIdx}`]?.note || ''
          }))
        }))
      };
    }
    return {
      rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours,
      exercise_results: (workout.exercises || []).map((ex: any, i: number) => {
        if (workout.completed && workout.completion_data) return workout.completion_data?.exercise_results?.[i] || {};
        const sets = setsStatus[i] || [];
        return {
          exercise_index: i, name: ex.name, total_sets: parseInt(ex.sets) || 1,
          completed_sets: sets.filter(s => s === 'completed').length, skipped_sets: sets.filter(s => s === 'skipped').length,
          set_details: sets.map((status, si) => ({ set: si + 1, status })),
          logged_weight: logs[i]?.weight || '', 
          logged_reps: logs[i]?.reps || '', 
          athlete_note: logs[i]?.note || '',
          recorded_video_url: recordedVideos[i.toString()] || ''
        };
      }),
    };
  };

  const handleFinish = async () => {
    if (workout.completed) { router.back(); return; }
    if (!stableWorkoutId) return;
    stopWorkTimer();
    stopRestTimer();
    const completionData = buildCompletionData();
    try {
      const updateData: any = { completed: true, completion_data: completionData, title: workout.title, exercises: workout.exercises };
      if (observations.trim()) updateData.observations = observations.trim();
      await api.updateWorkout(stableWorkoutId, updateData);
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

  const renderUnifiedTimerUI = (exName: string) => {
    const isRest = isResting;
    const current = isRest ? restSeconds : workSeconds;
    const total = isRest ? restTotalSeconds : workTotalSeconds;
    const isPaused = !isRest && !isWorking;

    if (!isRest && (current <= 0 && !isWorking)) return null;
    if (isRest && current <= 0) return null;

    const ringColor = isRest ? (colors.warning || '#F59E0B') : colors.primary;
    const progressPercent = total > 0 ? current / total : 0;
    
    let label = exName.toUpperCase();
    if (isRest) {
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
            <Circle
              cx="100" cy="100" r={radius}
              stroke={ringColor} strokeWidth={strokeWidth} fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 100 100)"
            />
          </Svg>

          <TouchableOpacity activeOpacity={0.8} onPress={() => !isRest && toggleWorkTimer()} disabled={isRest}>
            <View style={{ justifyContent: 'center', alignItems: 'center' }}>
              <Text style={[styles.timerText, { color: isPaused ? colors.textSecondary : ringColor }]}>
                {Math.floor(current / 60)}:{String(current % 60).padStart(2, '0')}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '800', marginTop: -5 }}>SEG</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 15, marginTop: 25, justifyContent: 'center' }}>
          {isRest ? (
            <TouchableOpacity style={[styles.skipRestBtnUnified, { borderColor: ringColor }]} onPress={isHiit ? skipHiitRest : stopRestTimer}>
              <Text style={{ color: ringColor, fontWeight: '700', fontSize: 16 }}>Saltar Descanso</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.playPauseBtn, { backgroundColor: isPaused ? (colors.warning || '#F59E0B') : colors.primary }]} onPress={toggleWorkTimer}>
              <Ionicons name={isWorking ? "pause" : "play"} size={32} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;
  if (!workout) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={[styles.errorText, { color: colors.textPrimary }]}>Entrenamiento no encontrado.</Text><TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}><Text style={styles.backBtnText}>Volver</Text></TouchableOpacity></SafeAreaView>;

  if (finished || workout.completed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Resumen</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.content, { alignItems: 'center', paddingVertical: 40 }]}>
          <View style={styles.finishedIconContainer}>
            <Ionicons name="trophy" size={80} color={colors.warning || '#F59E0B'} />
          </View>
          <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>¡Entrenamiento completado!</Text>
          <Text style={[styles.finishedSubtitle, { color: colors.textSecondary }]}>Gran trabajo. ¿Cómo te has sentido hoy?</Text>

          {!workout.completed && (
            <View style={{ width: '100%', gap: 24, marginTop: 20 }}>
              <View>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>NIVEL DE ESFUERZO (RPE)</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                    const isSelected = rpe === num;
                    let numColor = colors.success || '#10B981';
                    if (num >= 4 && num <= 7) numColor = colors.warning || '#F59E0B';
                    if (num >= 8) numColor = colors.error || '#EF4444';

                    return (
                      <TouchableOpacity key={num} onPress={() => setRpe(num)} style={[styles.rpeCircle, { borderColor: colors.border }, isSelected && { backgroundColor: numColor, borderColor: numColor }]}>
                        <Text style={[styles.rpeText, { color: isSelected ? '#FFF' : colors.textSecondary }]}>{num}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 5 }}>
                  <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '600' }}>Muy Suave</Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary, fontWeight: '600' }}>Máximo</Text>
                </View>
              </View>

              <View>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>CALIDAD DEL SUEÑO</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                  {[1, 2, 3, 4, 5].map(num => (
                    <TouchableOpacity key={num} onPress={() => setSleepQuality(num)} style={{ padding: 5 }}>
                      <Ionicons name={sleepQuality && sleepQuality >= num ? "star" : "star-outline"} size={36} color={colors.warning || '#F59E0B'} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>HORAS DE SUEÑO</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
                  {SLEEP_HOURS_OPTIONS.map(opt => (
                    <TouchableOpacity key={opt} onPress={() => setSleepHours(opt)} style={[styles.sleepPill, { borderColor: colors.border }, sleepHours === opt && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                      <Text style={[styles.sleepPillText, { color: sleepHours === opt ? '#FFF' : colors.textSecondary }]}>{opt}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12 }]}>OBSERVACIONES GENERALES</Text>
                <TextInput style={[styles.obsInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} multiline placeholder="¿Alguna molestia? ¿Mucha energía?..." placeholderTextColor={colors.textSecondary} value={observations} onChangeText={setObservations} />
              </View>
            </View>
          )}

          {workout.completed && workout.completion_data && (
            <View style={{ width: '100%', marginTop: 20, backgroundColor: colors.surfaceHighlight, padding: 20, borderRadius: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 15 }}>Datos guardados:</Text>
              {workout.completion_data.rpe && <Text style={{ color: colors.textPrimary, marginBottom: 5 }}>RPE: <Text style={{ fontWeight: '700' }}>{workout.completion_data.rpe}/10</Text></Text>}
              {workout.completion_data.sleep_quality && <Text style={{ color: colors.textPrimary, marginBottom: 5 }}>Calidad de sueño: <Text style={{ fontWeight: '700' }}>{workout.completion_data.sleep_quality}/5 estrellas</Text></Text>}
              {workout.completion_data.sleep_hours && <Text style={{ color: colors.textPrimary, marginBottom: 5 }}>Horas de sueño: <Text style={{ fontWeight: '700' }}>{workout.completion_data.sleep_hours}h</Text></Text>}
              {workout.observations && <Text style={{ color: colors.textPrimary, marginTop: 10, fontStyle: 'italic' }}>"{workout.observations}"</Text>}
            </View>
          )}

          {!workout.completed && (
            <TouchableOpacity style={[styles.finishWorkoutBtn, { backgroundColor: colors.primary }]} onPress={handleFinish}>
              <Text style={styles.finishWorkoutBtnText}>Guardar y Finalizar</Text>
              <Ionicons name="checkmark-done" size={24} color="#FFF" />
            </TouchableOpacity>
          )}

          {workout.completed && isTrainer && !isHiit && (
            <View style={{ width: '100%', marginTop: 30 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 20 }}>Feedback del Entrenador</Text>
              {workout.completion_data?.exercise_results?.map((ex: any, i: number) => (
                <View key={i} style={{ backgroundColor: colors.surface, padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 5 }}>{ex.name}</Text>
                  
                  {ex.recorded_video_url && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceHighlight, padding: 8, borderRadius: 8, marginBottom: 10 }}>
                      <MiniVideoPlayer url={ex.recorded_video_url} onExpand={setExpandedVideo} />
                      <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13, marginLeft: 10 }}>Vídeo del atleta adjunto</Text>
                    </View>
                  )}

                  {ex.athlete_note ? <Text style={{ color: colors.textSecondary, fontStyle: 'italic', marginBottom: 10 }}>Nota atleta: "{ex.athlete_note}"</Text> : null}
                  
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 5 }}>TU NOTA / CORRECCIÓN TÉCNICA:</Text>
                  <TextInput
                    style={{ backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderRadius: 8, padding: 10, minHeight: 60, textAlignVertical: 'top' }}
                    multiline
                    placeholder="Escribe un comentario..."
                    placeholderTextColor={colors.textSecondary}
                    value={draftNotes[i] !== undefined ? draftNotes[i] : (ex.coach_note || '')}
                    onChangeText={(t) => setDraftNotes({...draftNotes, [i]: t})}
                  />
                  <TouchableOpacity 
                    style={{ alignSelf: 'flex-end', marginTop: 10, backgroundColor: colors.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 }}
                    onPress={() => saveTrainerFeedbackFuerza(i, draftNotes[i] || '')}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Enviar Feedback</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {workout.completed && isTrainer && isHiit && (
            <View style={{ width: '100%', marginTop: 30 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 20 }}>Feedback del Entrenador (HIIT)</Text>
              {workout.completion_data?.hiit_results?.map((block: any, bIdx: number) => (
                <View key={bIdx} style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 }}>{block.name}</Text>
                  {block.hiit_exercises?.map((ex: any, eIdx: number) => {
                    const k = `${bIdx}-${eIdx}`;
                    return (
                      <View key={eIdx} style={{ backgroundColor: colors.surface, padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 5 }}>{ex.name}</Text>
                        
                        {ex.recorded_video_url && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceHighlight, padding: 8, borderRadius: 8, marginBottom: 10 }}>
                            <MiniVideoPlayer url={ex.recorded_video_url} onExpand={setExpandedVideo} />
                            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13, marginLeft: 10 }}>Vídeo del atleta adjunto</Text>
                          </View>
                        )}
                        
                        {ex.athlete_note ? <Text style={{ color: colors.textSecondary, fontStyle: 'italic', marginBottom: 10 }}>Nota atleta: "{ex.athlete_note}"</Text> : null}

                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 5 }}>TU NOTA:</Text>
                        <TextInput
                          style={{ backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderRadius: 8, padding: 10, minHeight: 60, textAlignVertical: 'top' }}
                          multiline placeholder="Escribe un comentario..." placeholderTextColor={colors.textSecondary}
                          value={draftNotes[k] !== undefined ? draftNotes[k] : (ex.coach_note || '')}
                          onChangeText={(t) => setDraftNotes({...draftNotes, [k]: t})}
                        />
                        <TouchableOpacity 
                          style={{ alignSelf: 'flex-end', marginTop: 10, backgroundColor: colors.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 }}
                          onPress={() => saveTrainerFeedbackHiit(bIdx, eIdx, draftNotes[k] || '')}
                        >
                          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Enviar Feedback</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

        </ScrollView>
        {renderVideoModal()}
      </SafeAreaView>
    );
  }

  if (isHiit) {
    const currentBlock = workout.exercises?.[hiitBlockIdx];
    if (!currentBlock) return null;

    const currentExInHiit = currentBlock.hiit_exercises[hiitExIdx];

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
          {(isResting || (hiitPhase === 'work' && currentExInHiit?.duration)) 
            ? renderUnifiedTimerUI(currentExInHiit?.name || 'EJERCICIO') 
            : null}

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
                      <Text style={[styles.hiitExDur, { fontSize: dynamicFontDur, color: isCurrent ? colors.primary : colors.textSecondary, fontWeight: '800' }]}>{ex.duration_reps || ex.duration}</Text>
                    </View>
                    
                    {isCurrent && (
                      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                        {ex.video_url && <TouchableOpacity style={[styles.hiitRefBtn, { backgroundColor: colors.primary + '15', marginBottom: 10 }]} onPress={() => Linking.openURL(ex.video_url)}><Ionicons name="logo-youtube" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Ver Vídeo de Referencia</Text></TouchableOpacity>}
                        {ex.exercise_notes && <View style={{ flexDirection: 'row', marginBottom: 10 }}><Ionicons name="information-circle" size={14} color={colors.textSecondary} /><Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginLeft: 4, flex: 1 }}>{ex.exercise_notes}</Text></View>}

                        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 5 }}>
                          <TextInput 
                            style={[styles.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, marginBottom: 12 }]}
                            placeholder="Comentarios rápidos (opcional)..."
                            placeholderTextColor={colors.textSecondary}
                            value={hiitLogs[videoKey]?.note || ''}
                            onChangeText={(t) => setHiitLogs(prev => ({...prev, [videoKey]: {...(prev[videoKey]||{}), note: t}}))}
                          />

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

            {!isResting && (
              <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 20, marginTop: 10 }}>
                <TouchableOpacity style={[styles.skipSetBtn, { borderColor: colors.error || '#EF4444', flex: 1, paddingVertical: 14 }]} onPress={skipHiitEx}>
                  <Ionicons name="play-skip-forward" size={18} color={colors.error || '#EF4444'} />
                  <Text style={{ color: colors.error || '#EF4444', fontWeight: '700', marginLeft: 6 }}>Saltar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.completeSetBtn, { backgroundColor: colors.primary, flex: 2, paddingVertical: 14, marginHorizontal: 0, marginBottom: 0, marginTop: 0 }]} onPress={advanceHiit}>
                  <Ionicons name="play" size={22} color="#FFF" />
                  <Text style={[styles.completeSetText, { color: '#FFF' }]}>{currentExInHiit?.duration ? 'Siguiente' : 'Completar'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
        {renderVideoModal()}
      </SafeAreaView>
    );
  }

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

        {(isResting || (nextPendingSet !== -1 && currentEx?.duration)) 
          ? renderUnifiedTimerUI(currentEx?.name || 'EJERCICIO') 
          : null}

        <View style={[styles.exerciseCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.exNumber, { backgroundColor: colors.primary + '12' }]}><Text style={[styles.exNumberText, { color: colors.primary }]}>{currentExIndex + 1}</Text></View>
          <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{currentEx.name}</Text>

          {currentEx.video_url && <TouchableOpacity style={[styles.referenceVideoBtn, { backgroundColor: (colors.error || '#EF4444') + '15' }]} onPress={() => Linking.openURL(currentEx.video_url)}><Ionicons name="logo-youtube" size={18} color={colors.error || '#EF4444'} /><Text style={{ color: colors.error || '#EF4444', fontSize: 13, fontWeight: '700' }}>Ver Vídeo de Referencia</Text></TouchableOpacity>}
          {currentEx.exercise_notes && <View style={[styles.coachNotesBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}><Ionicons name="information-circle" size={18} color={colors.primary} /><Text style={{ color: colors.textPrimary, flex: 1, fontSize: 13, fontStyle: 'italic', lineHeight: 18 }}>{currentEx.exercise_notes}</Text></View>}

          <View style={styles.detailsGrid}>
            {currentEx.sets && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.sets}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Series</Text></View>}
            {currentEx.reps && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.reps}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Reps</Text></View>}
            {currentEx.duration && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.duration}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Dur.</Text></View>}
            {currentEx.weight && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.weight}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Kg</Text></View>}
            {currentEx.rest && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.rest}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Desc.S.</Text></View>}
            {currentEx.rest_exercise && <View style={[styles.detailBox, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentEx.rest_exercise}</Text><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Desc.Ej.</Text></View>}
          </View>

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
              <Text style={[styles.logInputLabel, { color: colors.textSecondary }]}>Tus comentarios del ejercicio</Text>
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
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={[styles.setsTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Progreso de Series</Text>
            <TouchableOpacity onPress={skipEntireExercise} style={{ paddingHorizontal: 10, paddingVertical: 5 }}>
               <Text style={{ color: colors.error || '#EF4444', fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' }}>Saltar ejercicio entero</Text>
            </TouchableOpacity>
          </View>

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

          {nextPendingSet !== -1 && !isResting ? (
            <View style={[styles.setActions, { marginTop: 20 }]}>
              <TouchableOpacity style={[styles.skipSetBtn, { borderColor: colors.error || '#EF4444' }]} onPress={skipSet}><Ionicons name="play-skip-forward" size={18} color={colors.error || '#EF4444'} /><Text style={[styles.skipSetText, { color: colors.error || '#EF4444' }]}>Saltar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.completeSetBtn, { backgroundColor: colors.primary, flex: 1, marginHorizontal: 0, marginBottom: 0, marginTop: 0 }]} onPress={completeSet}><Ionicons name="checkmark-circle-outline" size={22} color="#FFF" /><Text style={[styles.completeSetText, { color: '#FFF' }]}>{currentEx?.duration ? 'Hecho' : `Completar serie ${nextPendingSet + 1}`}</Text></TouchableOpacity>
            </View>
          ) : nextPendingSet === -1 ? (
            <View style={[styles.allDoneBadge, { backgroundColor: (colors.success || '#10B981') + '12', marginTop: 20 }]}><Ionicons name="checkmark-circle" size={18} color={colors.success || '#10B981'} /><Text style={{ color: colors.success || '#10B981', fontSize: 14, fontWeight: '600' }}>Todas completadas o saltadas</Text></View>
          ) : null}

        </View>
      </ScrollView>

      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.navBtn, { opacity: currentExIndex === 0 ? 0.3 : 1 }]} onPress={() => { if(currentExIndex>0) { stopWorkTimer(); stopRestTimer(); setCurrentExIndex(currentExIndex-1); } }} disabled={currentExIndex === 0}><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Anterior</Text></TouchableOpacity>
        {currentExIndex < exercises.length - 1 ? (
          <TouchableOpacity style={styles.navBtn} onPress={() => { stopWorkTimer(); stopRestTimer(); setCurrentExIndex(currentExIndex+1); }}><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Siguiente</Text><Ionicons name="arrow-forward" size={22} color={colors.textPrimary} /></TouchableOpacity>
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
  activeLogContainer: { width: '100%', marginTop: 10, paddingTop: 15, borderTopWidth: 0.5 }, activeLogTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 }, logInputWrapper: { flex: 1 }, logInputLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' }, logInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, fontWeight: '600' },
  finishedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }, finishedIconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(245, 158, 11, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }, finishedTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8, textAlign: 'center' }, finishedSubtitle: { fontSize: 16, textAlign: 'center', marginBottom: 40 }, finishWorkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 32, borderRadius: 16, width: '100%', marginTop: 20 }, finishWorkoutBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' }, label: { fontSize: 12, fontWeight: '700', letterSpacing: 1 }, rpeCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }, rpeText: { fontSize: 12, fontWeight: '700' }, sleepPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 }, sleepPillText: { fontSize: 14, fontWeight: '600' }, obsInput: { borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 100, textAlignVertical: 'top', fontSize: 15 },
  hiitCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' }, hiitHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }, hiitList: { padding: 16, gap: 12 }, hiitExRowWrapper: { overflow: 'hidden' }, hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }, hiitCheck: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, hiitExName: { fontSize: 16, fontWeight: '600' }, hiitExDur: { fontSize: 16, fontWeight: '700' }, hiitRefBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 8, alignSelf: 'flex-start' }, feedbackInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60, textAlignVertical: 'top', fontSize: 14 },
  miniVideoContainer: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', position: 'relative' }, miniVideo: { width: '100%', height: '100%' }, expandBtn: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 }, fullscreenVideoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, fullVideo: { width: '100%', height: '100%' }, closeModalBtn: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  
  unifiedTimerContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
  timerCircleWrapper: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  workTimerTitle: { fontSize: 22, fontWeight: '900', marginBottom: 20, letterSpacing: 1 },
  timerText: { fontSize: 50, fontWeight: '900' },
  playPauseBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  skipRestBtnUnified: { paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30, borderWidth: 2 }
});
