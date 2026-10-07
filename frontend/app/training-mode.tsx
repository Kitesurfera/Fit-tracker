import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput, Alert, Platform, Modal, Dimensions,
  UIManager, LayoutAnimation, KeyboardAvoidingView, AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Video, ResizeMode, Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import TimerRing from '../src/components/training/TimerRing';
import TimerControls from '../src/components/training/TimerControls';
import VideoUploader from '../src/components/VideoUploader';
import { localDateStr } from '../src/utils/dates';
import { goBack } from '../src/utils/navigation';
import { installWebAudioUnlock, unlockWebAudio, playWebBeep, setIgnoreSilentSwitch, SILENT_MODE_KEY } from '../src/utils/webAudio';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { height: screenHeight } = Dimensions.get('window');

type SetStatus = 'pending' | 'completed' | 'skipped';

const SLUG_TRANSLATIONS: Record<string, string> = {
  'chest-left': 'Pecho Izquierdo', 'chest-right': 'Pecho Derecho',
  'upper-back-left': 'Espalda Alta Izq.', 'upper-back-right': 'Espalda Alta Der.',
  'lower-back-left': 'Lumbar Izquierdo', 'lower-back-right': 'Lumbar Derecho',
  'quadriceps-left': 'Cuádriceps Izq.', 'quadriceps-right': 'Cuádriceps Der.',
  'hamstring-left': 'Isquio Izquierdo', 'hamstring-right': 'Isquio Derecho',
  'gluteal-left': 'Glúteo Izquierdo', 'gluteal-right': 'Glúteo Derecho',
  'shoulders-left': 'Hombro Izquierdo', 'shoulders-right': 'Hombro Derecho',
  'biceps-left': 'Bíceps Izquierdo', 'biceps-right': 'Bíceps Derecho',
  'triceps-left': 'Tríceps Izquierdo', 'triceps-right': 'Tríceps Derecho',
  'forearm-left': 'Antebrazo Izquierdo', 'forearm-right': 'Antebrazo Derecho',
  'calves-left': 'Gemelo Izquierdo', 'calves-right': 'Gemelo Derecho',
  'knees-left': 'Rodilla Izquierda', 'knees-right': 'Rodilla Derecha',
  'ankles-left': 'Tobillo Izquierdo', 'ankles-right': 'Tobillo Derecho',
  'feet-left': 'Pie Izquierdo', 'feet-right': 'Pie Derecho',
  'abs': 'Abdomen Central', 'neck': 'Cuello / Trapecio'
};

const AVAILABLE_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATE_COLORS: Record<number, string> = {
  25: '#EF4444', 20: '#3B82F6', 15: '#F59E0B', 10: '#10B981', 
  5: '#FFFFFF', 2.5: '#000000', 1.25: '#6B7280'
};

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

const formatGlobalTime = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const normalizeHiitReps = (val: string | number | undefined | null) => {
  if (!val) return '';
  let str = String(val).trim();
  if (/^\d+$/.test(str)) return str + 'r';
  return str;
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
  const [tradSide, setTradSide] = useState<1 | 2>(1); 
  
  const [logs, setLogs] = useState<Record<number, {weight: string, reps: string, note?: string, coach_note?: string}>>({});
  
  // Estados temporales para los inputs de registro
  const [tempWeight, setTempWeight] = useState('');
  const [tempReps, setTempReps] = useState('');
  const [tempNote, setTempNote] = useState('');

  const [hiitLogs, setHiitLogs] = useState<Record<string, {note?: string, coach_note?: string}>>({});
  
  const [recordedVideos, setRecordedVideos] = useState<Record<string, string>>({});
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const displayVideos = recordedVideos;
  
  const [hiitBlockIdx, setHiitBlockIdx] = useState(0);
  const [hiitRound, setHiitRound] = useState(1);
  const [hiitExIdx, setHiitExIdx] = useState(0);
  const [hiitExSet, setHiitExSet] = useState(1);
  const [hiitPhase, setHiitPhase] = useState<'work' | 'rest_set' | 'rest_ex' | 'rest_block' | 'rest_next_block'>('work');
  const [hiitSide, setHiitSide] = useState<1 | 2>(1); 
  const [hiitSkipped, setHiitSkipped] = useState<Record<string, number>>({}); 

  const [rpe, setRpe] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState<string>('');
  const [observations, setObservations] = useState('');
  
  const [isPainSelectorOpen, setIsPainSelectorOpen] = useState(false);
  const [soreJoints, setSoreJoints] = useState<string[]>([]);
  
  const [showIndicationsModal, setShowIndicationsModal] = useState(false);
  const hasShownIndicationsRef = useRef(false);

  const [isPaused, setIsPaused] = useState(false);
  const [isFatigueMode, setIsFatigueMode] = useState(false);
  const [fatigueModeTriggeredEx, setFatigueModeTriggeredEx] = useState<string | null>(null);

  // Diseño de una sola pantalla: tamaño del círculo según el espacio libre y ventanas de nota y vídeo
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showVideoSheet, setShowVideoSheet] = useState(false);
  const hiitStripRef = useRef<ScrollView>(null);

  // La tira de ejercicios del bloque HIIT se desplaza sola hasta el ejercicio actual
  useEffect(() => {
    hiitStripRef.current?.scrollTo({ x: Math.max(0, hiitExIdx - 1) * 150, animated: true });
  }, [hiitExIdx, hiitBlockIdx]);

  useEffect(() => { setNotesExpanded(false); }, [currentExIndex, hiitExIdx, hiitBlockIdx]);

  const [globalSeconds, setGlobalSeconds] = useState(0);
  const globalTimerRef = useRef<any>(null);

  const [prepTargetTime, setPrepTargetTime] = useState<number | null>(null);
  const [prepSeconds, setPrepSeconds] = useState(0);
  const [isPrep, setIsPrep] = useState(false);
  const prepIntervalRef = useRef<any>(null);

  const [restTargetTime, setTargetTime] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(1);
  const [isRestingStatus, setIsResting] = useState(false);
  const [restType, setRestType] = useState<'set' | 'exercise' | null>(null);
  const restIntervalRef = useRef<any>(null);

  const [workTargetTime, setWorkTargetTime] = useState<number | null>(null);
  const [workSeconds, setWorkSeconds] = useState(0);
  const [workTotalSeconds, setWorkTotalSeconds] = useState(1);
  const [isWorking, setIsWorking] = useState(false);
  const workIntervalRef = useRef<any>(null);

  const [timerSoundsEnabled, setTimerSoundsEnabled] = useState(true);
  const justFinishedRestRef = useRef(false);

  const appState = useRef(AppState.currentState);
  const backgroundTimeRef = useRef<number | null>(null);

  const [showPlateCalculator, setShowPlateCalculator] = useState(false);
  const [platesOnBar, setPlatesOnBar] = useState<number[]>([]);
  const [barWeight, setBarWeight] = useState(20);
  const [showCustomBarInput, setShowCustomBarInput] = useState(false); 
  const [isLandmineMode, setIsLandmineMode] = useState(false);
  const [athleteHeight, setAthleteHeight] = useState('170'); 

  const adjustReps = (reps: string | number | undefined | null) => {
    if (!reps) return null;
    return String(reps).replace(/\d+/g, (match) => {
      const num = parseInt(match, 10);
      if (num <= 3) return match; 
      return Math.max(1, Math.floor(num * 0.8)).toString();
    });
  };

  const adjustDurationStr = (durStr: string | number | undefined | null) => {
    if (!durStr) return null;
    const secs = parseTimeToSeconds(durStr);
    if (secs === 0) return String(durStr);
    const reduced = Math.max(1, Math.floor(secs * 0.8));
    return `${reduced}s`;
  };

  // Limpiar inputs temporales al cambiar de ejercicio
  useEffect(() => {
    setTempWeight('');
    setTempReps('');
    setTempNote('');
  }, [currentExIndex]);

  // Función para guardar los datos de los text inputs al presionar el botón
  const handleSaveActiveLogs = () => {
    if (!tempWeight && !tempReps && !tempNote) return;
    
    setLogs(p => {
      const current = p[currentExIndex] || {};
      return {
        ...p,
        [currentExIndex]: {
          ...current,
          weight: tempWeight !== '' ? tempWeight : current.weight || '',
          reps: tempReps !== '' ? tempReps : current.reps || '',
          note: tempNote !== '' ? tempNote : current.note || '',
        }
      };
    });
    
    // Limpiamos la escritura para que no se salga de la pantalla vertical y la caja quede vacía
    setTempWeight('');
    setTempReps('');
    setTempNote('');
    
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
    }
  };

  useFocusEffect(
    useCallback(() => {
      const loadPreferences = async () => {
        try {
          const s = await AsyncStorage.getItem('timer_sounds_enabled');
          setTimerSoundsEnabled(s !== 'false'); 
          const silent = await AsyncStorage.getItem(SILENT_MODE_KEY);
          setIgnoreSilentSwitch(silent !== 'false');
        } catch (e) { console.log("⚠️ Error cargando preferencias:", e); }
      };
      loadPreferences();
      
      if (Platform.OS !== 'web') {
        Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        }).catch(() => {});
      }
      
      if (Platform.OS === 'web') {
        // Desbloquea y despierta el audio en cada toque mientras estás en el entrenamiento
        return installWebAudioUnlock();
      }
    }, [])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (backgroundTimeRef.current && !isPaused && !finished) {
          const timeAway = Math.floor((Date.now() - backgroundTimeRef.current) / 1000);
          setGlobalSeconds(prev => prev + timeAway);

          if (isPrep && prepSeconds > 0) {
            setPrepSeconds(prev => Math.max(1, prev - timeAway));
          } else if (isWorking && workSeconds > 0) {
            setWorkSeconds(prev => Math.max(1, prev - timeAway));
          } else if (isRestingStatus && restSeconds > 0) {
            setRestSeconds(prev => Math.max(1, prev - timeAway));
          }
        }
      } else if (nextAppState === 'background') {
        backgroundTimeRef.current = Date.now();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isPaused, finished, isPrep, prepSeconds, isWorking, workSeconds, isRestingStatus, restSeconds]);

  const playTimerSound = (type: 'short' | 'long' | 'double') => {
    if (!timerSoundsEnabled || finished) return;

    if (Platform.OS !== 'web') {
      if (type === 'double') {
         Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(()=>{});
      } else if (type === 'long') {
         Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
      } else {
         Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
      }
      return;
    }

    playWebBeep(type);
  };

  const togglePause = () => {
    if (Platform.OS === 'web') unlockWebAudio();
    
    if (isPaused) {
      setIsPaused(false);
      if (isPrep && prepSeconds > 0) setPrepTargetTime(Date.now() + prepSeconds * 1000);
      if (isRestingStatus && restSeconds > 0) setTargetTime(Date.now() + restSeconds * 1000);
      if (isWorking && workTotalSeconds > 0 && workSeconds > 0) setWorkTargetTime(Date.now() + workSeconds * 1000);
    } else {
      setIsPaused(true);
      setPrepTargetTime(null);
      setTargetTime(null);
      setWorkTargetTime(null);
    }
  };

  const stopPrepTimer = () => { if (prepIntervalRef.current) clearInterval(prepIntervalRef.current); setIsPrep(false); setPrepSeconds(0); setPrepTargetTime(null); setIsPaused(false); };
  const stopWorkTimer = () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); setIsWorking(false); setWorkSeconds(0); setWorkTargetTime(null); setIsPaused(false); };
  const stopRestTimer = () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setTargetTime(null); setRestSeconds(0); setIsResting(false); setIsPaused(false); };
  const stopAllTimers = () => { stopPrepTimer(); stopWorkTimer(); stopRestTimer(); setIsPaused(false); };

  const startPrepTimer = (workDur: number) => {
    stopAllTimers(); setIsPrep(true); setPrepSeconds(5); setPrepTargetTime(Date.now() + 5000);
    setWorkTotalSeconds(workDur); setWorkSeconds(workDur);
  };

  const handleStartWork = (dur: number) => {
    const isFirst = (!isHiit && currentExIndex === 0 && setsStatus[0]?.findIndex(s => s === 'pending') === 0 && tradSide === 1) ||
                    (isHiit && hiitBlockIdx === 0 && hiitExIdx === 0 && hiitRound === 1 && hiitExSet === 1 && hiitSide === 1);

    if (isFirst || !justFinishedRestRef.current) {
      startPrepTimer(dur);
    } else {
      stopAllTimers();
      setIsWorking(true);
      setWorkTotalSeconds(dur);
      setWorkSeconds(dur);
      if (dur > 0) setWorkTargetTime(Date.now() + dur * 1000);
      else setWorkTargetTime(null);
      playTimerSound('long'); 
    }
    justFinishedRestRef.current = false;
  };

  const startWorkTimerAfterPrep = () => {
    setIsWorking(true); setIsPaused(false);
    if (workTotalSeconds > 0) { setWorkTargetTime(Date.now() + workTotalSeconds * 1000); } 
    else { setWorkTargetTime(null); }
    playTimerSound('long'); 
  };

  const startRestTimer = (seconds: number) => {
    stopAllTimers(); setTargetTime(Date.now() + seconds * 1000);
    setRestSeconds(seconds); setRestTotalSeconds(seconds); setIsResting(true);
    playTimerSound('double'); 
  };

  const resetWorkTimer = () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); setIsPaused(false); setWorkTargetTime(Date.now() + workTotalSeconds * 1000); setWorkSeconds(workTotalSeconds); setIsWorking(true); };
  const resetRestTimer = () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setIsPaused(false); setTargetTime(Date.now() + restTotalSeconds * 1000); setRestSeconds(restTotalSeconds); setIsResting(true); };

  const handleWorkComplete = () => { 
    if (Platform.OS === 'web') unlockWebAudio(); 
    stopWorkTimer(); 
    if (isHiit) advanceHiitLogic(); 
    else completeSet(); 
  };

  useEffect(() => { 
    if (isPrep && prepSeconds > 0 && prepSeconds <= 3 && !isPaused) {
      playTimerSound('short');
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } 
  }, [prepSeconds, isPrep, isPaused]);

  useEffect(() => { 
    if (isWorking && workSeconds > 0 && workSeconds <= 3 && !isPaused) {
      playTimerSound('short');
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } 
  }, [workSeconds, isWorking, isPaused]);

  useEffect(() => { 
    if (isRestingStatus && restSeconds > 0 && restSeconds <= 3 && !isPaused) {
      playTimerSound('short');
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } 
  }, [restSeconds, isRestingStatus, isPaused]);

  useEffect(() => {
    let isMounted = true;
    const fetchWorkoutDetail = async () => {
      if (!stableWorkoutId) { if (isMounted) setLoading(false); return; }
      try {
        const [allWorkouts, wellnessData] = await Promise.all([api.getWorkouts(), user?.id ? api.getWellnessHistory(user.id).catch(() => []) : Promise.resolve([])]);
        const currentWorkout = allWorkouts.find((w: any) => w.id === stableWorkoutId);
        if (currentWorkout && isMounted) {
          setWorkout(currentWorkout);
          const isWorkoutHiit = currentWorkout.exercises?.length > 0 && currentWorkout.exercises[0].is_hiit_block === true;
          setIsHiit(isWorkoutHiit);
          if (currentWorkout.completed) {
            setFinished(true); setObservations(currentWorkout.observations || '');
            if (currentWorkout.completion_data) {
              setRpe(currentWorkout.completion_data.rpe || null); setSleepQuality(currentWorkout.completion_data.sleep_quality || null);
              setSleepHours(currentWorkout.completion_data.sleep_hours || ''); if (currentWorkout.completion_data.sore_joints) setSoreJoints(currentWorkout.completion_data.sore_joints);
              if (currentWorkout.completion_data.duration_seconds) setGlobalSeconds(currentWorkout.completion_data.duration_seconds);
              const savedVideos: Record<string, string> = {}; 
              if (!isWorkoutHiit) {
                const loadedLogs: Record<number, any> = {};
                const loadedSets: Record<number, SetStatus[]> = {};
                currentWorkout.completion_data.exercise_results?.forEach((res: any, idx: number) => {
                  const exIdx = res.exercise_index !== undefined ? res.exercise_index : idx;
                  loadedLogs[exIdx] = { weight: res.logged_weight || '', reps: res.logged_reps || '', note: res.athlete_note || '', coach_note: res.coach_note || '' };
                  if (res.recorded_video_url) savedVideos[exIdx.toString()] = res.recorded_video_url;
                  if (res.set_details) {
                    loadedSets[exIdx] = res.set_details.map((sd: any) => sd.status);
                  } else {
                    loadedSets[exIdx] = Array(res.total_sets).fill('completed');
                  }
                });
                setLogs(loadedLogs);
                setSetsStatus(loadedSets);
              } else {
                const hLogs: Record<string, any> = {};
                const hSkipped: Record<string, number> = {};
                currentWorkout.completion_data.hiit_results?.forEach((block: any, bIdx: number) => {
                  block.hiit_exercises?.forEach((ex: any, eIdx: number) => { 
                    const key = `${bIdx}-${eIdx}`; 
                    if (ex.recorded_video_url) savedVideos[key] = ex.recorded_video_url; 
                    if (ex.athlete_note || ex.coach_note) hLogs[key] = { note: ex.athlete_note || '', coach_note: ex.coach_note || '' }; 
                    if (ex.skipped_rounds) hSkipped[key] = ex.skipped_rounds;
                  });
                });
                setHiitLogs(hLogs);
                setHiitSkipped(hSkipped);
              }
              setRecordedVideos(savedVideos);
            }
          } else {
            const today = localDateStr();
            const wellness = Array.isArray(wellnessData) ? wellnessData.find((w: any) => w.date === today) : null;
            if (wellness) { setSleepQuality(wellness.sleep_quality || null); setSleepHours(wellness.sleep_hours || ''); }
            if (!isWorkoutHiit) {
              const initial: Record<number, SetStatus[]> = {};
              (currentWorkout.exercises || []).forEach((ex: any, i: number) => { initial[i] = Array(parseInt(ex.sets) || 1).fill('pending'); });
              setSetsStatus(initial);
            }
            if (!hasShownIndicationsRef.current) { 
                setShowIndicationsModal(true); 
                hasShownIndicationsRef.current = true; 
            }
          }
        }
      } catch (e) { console.error(e); } finally { if (isMounted) setLoading(false); }
    };
    fetchWorkoutDetail();
    return () => { isMounted = false; };
  }, [stableWorkoutId, user?.id]);

  useEffect(() => {
    if (workout && !workout.completed && !finished && !isPaused) {
      globalTimerRef.current = setInterval(() => {
        setGlobalSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (globalTimerRef.current) clearInterval(globalTimerRef.current);
    }
    return () => {
      if (globalTimerRef.current) clearInterval(globalTimerRef.current);
    }
  }, [workout, finished, isPaused]);

  useEffect(() => {
    if (isPrep && prepTargetTime) {
      prepIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((prepTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { 
          stopPrepTimer(); startWorkTimerAfterPrep(); 
        } 
        else { setPrepSeconds(remaining); }
      }, 1000);
    }
    return () => { if (prepIntervalRef.current) clearInterval(prepIntervalRef.current); };
  }, [isPrep, prepTargetTime]);

  useEffect(() => {
    if (isRestingStatus && restTargetTime) {
      restIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((restTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { 
          justFinishedRestRef.current = true;
          stopRestTimer(); 
        } 
        else { setRestSeconds(remaining); }
      }, 1000);
    }
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
  }, [isRestingStatus, restTargetTime]);

  useEffect(() => {
    if (isWorking && workTargetTime) {
      workIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((workTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { 
          handleWorkComplete(); 
        } 
        else { setWorkSeconds(remaining); }
      }, 1000);
    }
    return () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); };
  }, [isWorking, workTargetTime]);

  useEffect(() => {
    if (finished || workout?.completed) return;
    if (!isHiit && workout && !isRestingStatus && !isPrep && !showIndicationsModal) {
      const s = setsStatus[currentExIndex] || []; const next = s.findIndex(i => i === 'pending');
      if (next !== -1) {
        const ex = workout.exercises[currentExIndex]; 
        let dur = parseTimeToSeconds(ex?.duration);
        if (isFatigueMode && dur > 0) dur = Math.max(1, Math.floor(dur * 0.8));
        
        if (!isWorking && workTargetTime === null && workSeconds === 0) { 
          handleStartWork(dur); 
        }
      } else { stopWorkTimer(); }
    }
  }, [currentExIndex, setsStatus, isRestingStatus, workout, isHiit, isPrep, isWorking, workTargetTime, workSeconds, showIndicationsModal, finished, isFatigueMode, tradSide]);

  useEffect(() => {
    if (finished || workout?.completed) return;
    if (isHiit && workout && hiitPhase === 'work' && !isRestingStatus && !isPrep && !showIndicationsModal) {
      const b = workout.exercises[hiitBlockIdx]; if (!b) return;
      const ex = b.hiit_exercises[hiitExIdx]; 
      
      let dur = parseTimeToSeconds(ex?.duration);
      if (dur === 0) dur = parseTimeToSeconds(normalizeHiitReps(ex?.duration_reps));
      if (isFatigueMode && dur > 0) dur = Math.max(1, Math.floor(dur * 0.8));

      if (!isWorking && workTargetTime === null && workSeconds === 0) { 
         handleStartWork(dur); 
      }
    }
  }, [hiitBlockIdx, hiitExIdx, hiitExSet, hiitSide, hiitPhase, isRestingStatus, workout, isHiit, isPrep, isWorking, workTargetTime, workSeconds, showIndicationsModal, finished, isFatigueMode]);

  useEffect(() => {
    if (finished || workout?.completed) return;
    if (!isRestingStatus && workout && !showIndicationsModal && !isPaused) {
      if (isHiit) {
        if (hiitPhase === 'rest_set') { setHiitPhase('work'); setHiitExSet(prev => prev + 1); setHiitSide(1); }
        else if (hiitPhase === 'rest_ex') { setHiitPhase('work'); setHiitExIdx(prev => prev + 1); setHiitExSet(1); setHiitSide(1); } 
        else if (hiitPhase === 'rest_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitExSet(1); setHiitSide(1); setHiitRound(prev => prev + 1); } 
        else if (hiitPhase === 'rest_next_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitExSet(1); setHiitSide(1); setHiitRound(1); setHiitBlockIdx(prev => prev + 1); }
      } else { if (restType === 'exercise') { autoAdvance(currentExIndex); setRestType(null); } }
    }
  }, [isRestingStatus, showIndicationsModal, finished, workout, isPaused]);

  const advanceHiitLogic = (skipEx = false) => {
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const b = workout.exercises[hiitBlockIdx]; 
    const ex = b.hiit_exercises[hiitExIdx];
    
    if (!skipEx && ex.is_unilateral && hiitSide === 1) {
      setHiitSide(2);
      let dur = parseTimeToSeconds(ex?.duration);
      if (dur === 0) dur = parseTimeToSeconds(normalizeHiitReps(ex?.duration_reps));
      if (isFatigueMode && dur > 0) dur = Math.max(1, Math.floor(dur * 0.8));
      startPrepTimer(dur);
      return;
    }

    setHiitSide(1);

    const totalEx = b.hiit_exercises.length; 
    const totalRounds = parseInt(b.sets) || 1;
    const totalExSets = parseInt(ex?.sets) || 1;

    if (!skipEx && hiitExSet < totalExSets) {
      const rest = parseTimeToSeconds(b.rest_exercise);
      if (rest > 0) { startRestTimer(rest); setHiitPhase('rest_set'); }
      else { setHiitExSet(hiitExSet + 1); setHiitPhase('work'); }
    } else if (hiitExIdx < totalEx - 1) {
      const rest = parseTimeToSeconds(b.rest_exercise);
      if (rest > 0) { startRestTimer(rest); setHiitPhase('rest_ex'); } 
      else { setHiitExIdx(hiitExIdx + 1); setHiitExSet(1); setHiitPhase('work'); }
    } else {
      if (hiitRound < totalRounds) {
        const rest = parseTimeToSeconds(b.rest_block);
        if (rest > 0) { startRestTimer(rest); setHiitPhase('rest_block'); } 
        else { setHiitRound(hiitRound + 1); setHiitExIdx(0); setHiitExSet(1); setHiitPhase('work'); }
      } else {
        if (hiitBlockIdx < workout.exercises.length - 1) {
          const rest = parseTimeToSeconds(b.rest_between_blocks);
          if (rest > 0) { startRestTimer(rest); setHiitPhase('rest_next_block'); } 
          else { setHiitBlockIdx(hiitBlockIdx + 1); setHiitRound(1); setHiitExIdx(0); setHiitExSet(1); setHiitPhase('work'); }
        } else { setFinished(true); }
      }
    }
  };

  const advanceHiit = () => advanceHiitLogic(false);
  const skipHiitEx = () => { 
    if (Platform.OS === 'web') unlockWebAudio();
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); 
    setHiitSkipped(prev => ({ ...prev, [`${hiitBlockIdx}-${hiitExIdx}`]: (prev[`${hiitBlockIdx}-${hiitExIdx}`] || 0) + 1 })); 
    advanceHiitLogic(true); 
  };
  
  const skipHiitRest = () => { if (Platform.OS === 'web') unlockWebAudio(); stopAllTimers(); justFinishedRestRef.current = true; };
  const skipTradRest = () => { if (Platform.OS === 'web') unlockWebAudio(); stopAllTimers(); justFinishedRestRef.current = true; };

  const updateSetStatus = (exIdx: number, setIdx: number, status: SetStatus) => { setSetsStatus(prev => { const updated = { ...prev }; updated[exIdx] = [...(prev[exIdx] || [])]; updated[exIdx][setIdx] = status; return updated; }); };
  const autoAdvance = (exIdx: number) => { stopAllTimers(); setTradSide(1); if (exIdx < (workout.exercises?.length || 0) - 1) setTimeout(() => setCurrentExIndex(exIdx + 1), 400); else { setTimeout(() => setFinished(true), 400); } };

  const completeSet = () => {
    if (Platform.OS === 'web') unlockWebAudio();
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const exercises = workout.exercises || []; const currentEx = exercises[currentExIndex]; const s = setsStatus[currentExIndex] || [];
    const next = s.findIndex(i => i === 'pending'); if (next === -1) return;

    if (currentEx?.is_unilateral && tradSide === 1) {
      setTradSide(2);
      let dur = parseTimeToSeconds(currentEx?.duration);
      if (isFatigueMode && dur > 0) dur = Math.max(1, Math.floor(dur * 0.8));
      startPrepTimer(dur);
      return;
    }

    setTradSide(1);
    updateSetStatus(currentExIndex, next, 'completed');
    const rem = s.filter((item, i) => i !== next && item === 'pending').length;
    if (rem === 0) {
      const rest = parseTimeToSeconds(currentEx?.rest_exercise);
      if (rest > 0 && currentExIndex < exercises.length - 1) { startRestTimer(rest); setRestType('exercise'); } 
      else { autoAdvance(currentExIndex); }
    } else {
      const rest = parseTimeToSeconds(currentEx?.rest);
      if (rest > 0) { startRestTimer(rest); setRestType('set'); }
    }
  };

  const skipSet = () => { if (Platform.OS === 'web') unlockWebAudio(); stopAllTimers(); setTradSide(1); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); const s = setsStatus[currentExIndex] || []; const next = s.findIndex(i => i === 'pending'); if (next === -1) return; updateSetStatus(currentExIndex, next, 'skipped'); if (s.filter((item, i) => i !== next && item === 'pending').length === 0) autoAdvance(currentExIndex); };
  const skipEntireExercise = () => { if (Platform.OS === 'web') unlockWebAudio(); stopAllTimers(); setTradSide(1); setSetsStatus(prev => { const updated = { ...prev }; updated[currentExIndex] = (updated[currentExIndex] || []).map(item => item === 'pending' ? 'skipped' : item); return updated; }); autoAdvance(currentExIndex); };

  const buildCompletionData = () => {
    const common = {
      duration_seconds: globalSeconds,
      rpe,
      sleep_quality: sleepQuality,
      sleep_hours: sleepHours,
      sore_joints: soreJoints,
      fatigue_mode_used: isFatigueMode || !!fatigueModeTriggeredEx,
      fatigue_mode_start_ex: fatigueModeTriggeredEx,
    };

    if (isHiit) { 
      return { 
        ...common,
        hiit_completed: true, 
        hiit_results: (workout.exercises || []).map((b: any, bIdx: number) => ({ 
          ...b, 
          hiit_exercises: b.hiit_exercises.map((ex: any, eIdx: number) => ({ 
            ...ex, 
            skipped_rounds: hiitSkipped[`${bIdx}-${eIdx}`] || 0,
            recorded_video_url: recordedVideos[`${bIdx}-${eIdx}`] || '', 
            athlete_note: hiitLogs[`${bIdx}-${eIdx}`]?.note || '',
            coach_note: hiitLogs[`${bIdx}-${eIdx}`]?.coach_note || ''
          })) 
        })) 
      }; 
    }
    return { 
      ...common,
      exercise_results: (workout.exercises || []).map((ex: any, i: number) => { 
        const s = setsStatus[i] || []; 
        return { 
          exercise_index: i, 
          name: ex.name, 
          total_sets: parseInt(ex.sets) || 1, 
          completed_sets: s.filter(item => item === 'completed').length, 
          skipped_sets: s.filter(item => item === 'skipped').length, 
          set_details: s.map((status, si) => ({ set: si + 1, status })), 
          logged_weight: logs[i]?.weight || '', 
          logged_reps: logs[i]?.reps || '', 
          athlete_note: logs[i]?.note || '', 
          coach_note: logs[i]?.coach_note || '',
          recorded_video_url: recordedVideos[i.toString()] || '' 
        }; 
      }), 
    };
  };

  const handleSaveTrainerFeedback = async () => {
    if (!stableWorkoutId) return;
    try {
       const data = buildCompletionData();
       await api.updateWorkout(stableWorkoutId, { completion_data: data });
       Alert.alert("Guardado", "Feedback técnico guardado correctamente.");
    } catch(e) { 
       Alert.alert("Error", "No se pudo guardar el feedback."); 
    }
  };

  const sendWhatsAppMessage = async (cd: any) => {
    const firstName = user?.name?.split(' ')[0] || 'Atleta';
    const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    let fatigue = '?';
    let sleep = '?';
    let soreness = '?';
    let discomfortsText = '';

    try {
      const summary = await api.getSummary();
      const latestWellness = summary?.latest_wellness || {};
      fatigue = latestWellness.fatigue || '?';
      sleep = latestWellness.sleep_quality || '?';
      soreness = latestWellness.soreness || '?';
      
      const discomfortsObj = latestWellness.discomforts || {};
      const discomfortsEntries = Object.entries(discomfortsObj);
      if (discomfortsEntries.length > 0) {
        discomfortsText = '\n\n  🤕 *Molestias Diarias:*\n' + discomfortsEntries.map(([k, v]) => `     - ${k}: ${String(v).toUpperCase()}`).join('\n');
      }
    } catch (e) {
      console.log(e);
    }

    const trained = '✅ Completada';
    const workoutName = ` (${workout.title})`;

    let trainingDetails = '';
    if (cd.duration_seconds) {
      const m = Math.floor(cd.duration_seconds / 60);
      const s = cd.duration_seconds % 60;
      trainingDetails += `\n   - ⏱ Tiempo: ${m}m ${s}s`;
    }
    if (cd.rpe) trainingDetails += `\n   - 📊 RPE: ${cd.rpe}/10`;
    if (cd.fatigue_mode_used) trainingDetails += `\n   - ⚠️ Supervivencia: Activado (desde ${cd.fatigue_mode_start_ex || 'inicio'})`;

    let totalSkipped = 0;
    let hasVideos = false;
    let hasExerciseNotes = false;

    if (cd.exercise_results) {
      cd.exercise_results.forEach((ex: any) => {
        totalSkipped += (ex.skipped_sets || 0);
        if (ex.recorded_video_url) hasVideos = true;
        if (ex.athlete_note && String(ex.athlete_note).trim() !== '') hasExerciseNotes = true;
      });
    }

    if (cd.hiit_results) {
      cd.hiit_results.forEach((b: any) => {
        b.hiit_exercises?.forEach((ex:any) => {
          totalSkipped += (ex.skipped_rounds || 0);
          if (ex.recorded_video_url) hasVideos = true;
          if (ex.athlete_note && String(ex.athlete_note).trim() !== '') hasExerciseNotes = true;
        });
      });
    }

    if (totalSkipped > 0) trainingDetails += `\n   - ⏭ Saltos: ${totalSkipped} series/rondas omitidas`;
    if (hasVideos) trainingDetails += `\n   - 📹 Vídeos de técnica guardados`;
    if (hasExerciseNotes) trainingDetails += `\n   - 📝 Notas por ejercicio añadidas`;
    if (observations) trainingDetails += `\n   - 📋 Obs: "${observations}"`;

    const sessionSoreJoints = cd.sore_joints || [];
    let sessionDiscomfortsText = sessionSoreJoints.length > 0
      ? `\n\n  ⚠️ *Sobrecarga Post-Sesión:*\n     - Zonas: ${sessionSoreJoints.map((j: string) => SLUG_TRANSLATIONS[j] || j).join(', ')}`
      : `\n\n  ✅ *Sin molestias tras el entreno.*`;

    const message = `🏋️‍♀️ *Status Diario de ${firstName}*\n📅 ${todayLabel}\n\n🔋 *Estado Wellness:*\n   - Fatiga: ${fatigue}/5\n   - Sueño: ${sleep}/5\n   - Agujetas: ${soreness}/5\n` +
                    discomfortsText +
                    `\n🏋️‍♀️ *Entrenamiento:*\n   - Hoy: ${trained}${workoutName}` +
                    trainingDetails +
                    sessionDiscomfortsText;

    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
  };

    const handleFinish = async () => {
      if (workout.completed) { goBack(router); return; }
      if (!stableWorkoutId) return;
      
      stopAllTimers();
      const data = buildCompletionData();
      
      try {
        const update: any = { completed: true, completion_data: data, title: workout.title, exercises: workout.exercises };
        if (observations.trim()) update.observations = observations.trim();
        
        const res = await api.updateWorkout(stableWorkoutId, update);
        
        // ✅ DETECTAMOS SI SE GUARDÓ OFFLINE
        if (res?.offline) {
          if (Platform.OS === 'web') {
             window.alert("Guardado Offline 📶. Tu sesión se ha guardado en el dispositivo y se sincronizará cuando recuperes la conexión.");
             goBack(router);
          } else {
             Alert.alert(
               "Guardado Offline 📶",
               "No hay conexión. Tu sesión se ha guardado localmente y se sincronizará automáticamente cuando recuperes la cobertura.",
               [{ text: "Entendido", onPress: () => goBack(router) }]
             );
          }
          return; 
        }
  
        // Si todo fue online, flujo normal con WhatsApp
        if (Platform.OS === 'web') {
          const send = window.confirm("¡Buen trabajo! ¿Quieres enviar el resumen de la sesión por WhatsApp a tu entrenador?");
          if (send) {
            await sendWhatsAppMessage(data);
          }
          goBack(router);
        } else {
          Alert.alert(
            "¡Buen trabajo!",
            "¿Quieres enviar el resumen de la sesión por WhatsApp a tu entrenador?",
            [
              { text: "No", style: "cancel", onPress: () => goBack(router) },
              { text: "Sí", onPress: async () => {
                  await sendWhatsAppMessage(data);
                  goBack(router);
              }}
            ]
          );
        }
      } catch (e) { 
        Alert.alert("Error", "No se pudo guardar el entrenamiento."); 
      }
    };

  const addPlate = (weight: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlatesOnBar(prev => [...prev, weight].sort((a,b) => b-a));
  };

  const removePlate = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlatesOnBar(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotalWeight = () => {
    const platesTotal = platesOnBar.reduce((sum, w) => sum + w, 0);
    const currentEx = workout?.exercises?.[currentExIndex];
    const isAutoLandmine = /landmine|t-bar|t bar|mina/i.test(currentEx?.name || '');
    const activeLandmine = isLandmineMode || isAutoLandmine;
    
    if (!activeLandmine) {
      return barWeight + (platesTotal * 2);
    } else {
      const L = 220; 
      const h_athlete = parseInt(athleteHeight) || 170;
      const h_grip = h_athlete * 0.8; 
      
      let effectiveWeight = 0;
      if (h_grip < L) {
        const theta_rad = Math.asin(h_grip / L);
        const forceFactor = Math.cos(theta_rad);
        const actualLoad = (barWeight / 2) + platesTotal;
        effectiveWeight = actualLoad * forceFactor;
      } else {
        effectiveWeight = (barWeight / 2) + platesTotal; 
      }
      return effectiveWeight;
    }
  };

  const saveCalculatedWeight = () => {
    const total = calculateTotalWeight().toFixed(1);
    setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], weight: total}}));
    setShowPlateCalculator(false);
  };

  const openPlateCalculator = (isLandmine: boolean) => {
    setIsLandmineMode(isLandmine);
    setPlatesOnBar([]);
    setShowCustomBarInput(false); 

    const exName = workout?.exercises?.[currentExIndex]?.name || '';
    if (/hex|trap|hexagonal/i.test(exName)) {
      setBarWeight(25); 
    } else if (/smith|multipower/i.test(exName)) {
      setBarWeight(0); 
    } else {
      setBarWeight(20); 
    }
    setShowPlateCalculator(true);
  };

  // --- PIEZAS DEL DISEÑO DE UNA SOLA PANTALLA ---
  const toggleFatigueMode = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsFatigueMode(!isFatigueMode);

    if (!isFatigueMode && !fatigueModeTriggeredEx) {
       const exName = isHiit
         ? workout?.exercises?.[hiitBlockIdx]?.name || 'HIIT'
         : workout?.exercises?.[currentExIndex]?.name || 'Inicio';
       setFatigueModeTriggeredEx(exName);
    }
  };

  const renderFatiguePill = () => (
    <TouchableOpacity
      accessibilityRole="switch"
      accessibilityState={{ checked: isFatigueMode }}
      accessibilityLabel="Modo supervivencia por alta fatiga: reduce un 20 % el volumen"
      onPress={toggleFatigueMode}
      style={[styles.fatiguePill, { borderColor: isFatigueMode ? '#EF4444' : colors.border, backgroundColor: isFatigueMode ? 'rgba(239, 68, 68, 0.12)' : colors.background }]}
    >
      <Ionicons name={isFatigueMode ? 'battery-dead' : 'battery-half'} size={18} color={isFatigueMode ? '#EF4444' : colors.textSecondary} />
      <Text style={{ color: isFatigueMode ? '#EF4444' : colors.textSecondary, fontWeight: '800', fontSize: 12 }} numberOfLines={1}>
        {isFatigueMode ? 'Supervivencia −20%' : 'Supervivencia'}
      </Text>
    </TouchableOpacity>
  );

  // El círculo ocupa el espacio libre del centro (mínimo 130 y máximo 300 px)
  const onStageLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - stageSize.width) > 2 || Math.abs(height - stageSize.height) > 2) setStageSize({ width, height });
  };
  const ringSizeFor = (reservedBelow: number) =>
    Math.round(Math.max(130, Math.min(stageSize.width - 24, stageSize.height - reservedBelow, 300)));

  const renderTopBar = (progressText: string) => (
    <View style={styles.tmTopBar}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.tmTopBtn} onPress={() => { stopAllTimers(); goBack(router); }}>
        <Ionicons name="close" size={26} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{workout.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
          <Ionicons name="time-outline" size={13} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatGlobalTime(globalSeconds)}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>· {progressText}</Text>
        </View>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver la sesión completa" style={[styles.tmTopBtn, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowIndicationsModal(true)}>
        <Ionicons name="list" size={22} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderSegments = (total: number, current: number) => (
    <View style={styles.segments} accessibilityLabel={`Parte ${current + 1} de ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.segment, { backgroundColor: i < current ? colors.primary : i === current ? colors.primary + '66' : colors.surfaceHighlight }]} />
      ))}
    </View>
  );

  const renderChip = (key: string, label: string, value: string, highlight = false) => (
    <View key={key} style={[styles.chip, { backgroundColor: colors.surface, borderColor: highlight ? '#EF4444' : colors.border }]}>
      <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.chipValue, { color: highlight ? '#EF4444' : colors.textPrimary }]}>{value}</Text>
    </View>
  );

  const renderNoteLine = (text: string) => (
    <TouchableOpacity
      accessibilityRole="button" accessibilityLabel={notesExpanded ? 'Ocultar nota del entrenador' : 'Ver nota del entrenador completa'}
      onPress={() => setNotesExpanded(!notesExpanded)}
      style={[styles.noteLine, { backgroundColor: colors.surfaceHighlight }]}
    >
      <Ionicons name="information-circle" size={16} color={colors.primary} />
      <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', flex: 1 }} numberOfLines={notesExpanded ? undefined : 1}>{text}</Text>
      <Ionicons name={notesExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  // Anotación: en fuerza va con el registro de la serie (se guarda con "Guardar"); en HIIT, con el ejercicio
  const renderNoteModal = (hiitKey?: string) => {
    const value = hiitKey ? (hiitLogs[hiitKey]?.note || '') : tempNote;
    const setValue = (t: string) => hiitKey
      ? setHiitLogs(prev => ({ ...prev, [hiitKey]: { ...(prev[hiitKey] || {}), note: t } }))
      : setTempNote(t);
    return (
      <Modal visible={showNoteModal} transparent animationType="fade" onRequestClose={() => setShowNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{hiitKey ? 'Anotación del ejercicio' : 'Anotaciones de la serie'}</Text>
            <TextInput
              autoFocus multiline
              style={[styles.sheetInput, { borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]}
              placeholder={hiitKey ? 'Anotaciones para ti o el entrenador...' : 'Anotaciones de la serie...'}
              placeholderTextColor={colors.textSecondary}
              value={value} onChangeText={setValue}
            />
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.sheetPrimary, { backgroundColor: colors.primary }]}
              onPress={() => { if (!hiitKey) handleSaveActiveLogs(); setShowNoteModal(false); }}
            >
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>{hiitKey ? 'Hecho' : 'Guardar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderVideoSheet = (key: string) => (
    <Modal visible={showVideoSheet} transparent animationType="fade" onRequestClose={() => setShowVideoSheet(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Vídeo de tu ejecución</Text>
          <VideoUploader
            currentVideo={displayVideos[key]}
            onUploadSuccess={(url) => setRecordedVideos(prev => ({ ...prev, [key]: url }))}
            colors={colors}
            onPlay={() => { setShowVideoSheet(false); setExpandedVideo(displayVideos[key]); }}
          />
          <TouchableOpacity accessibilityRole="button" style={[styles.sheetPrimary, { backgroundColor: colors.surfaceHighlight }]} onPress={() => setShowVideoSheet(false)}>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 16 }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderPlateCalculatorModal = () => {
    const currentEx = workout?.exercises?.[currentExIndex];
    const isAutoLandmine = /landmine|t-bar|t bar|mina/i.test(currentEx?.name || '');

    return (
      <Modal visible={showPlateCalculator} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.indicationsModalContent, { backgroundColor: colors.surface, maxHeight: '90%', width: '90%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Calculadora de Carga</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => setShowPlateCalculator(false)}>
                  <Ionicons name="close" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 10 }]}>PESO DE LA BARRA BASE</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                  {[20, 15].map(w => (
                    <TouchableOpacity 
                      key={w} 
                      onPress={() => { setBarWeight(w); setShowCustomBarInput(false); }}
                      style={[styles.barTypeBtn, { borderColor: barWeight === w && !showCustomBarInput ? colors.primary : colors.border, flex: 1, alignItems: 'center' }]}
                    >
                      <Text style={{ color: barWeight === w && !showCustomBarInput ? colors.primary : colors.textSecondary, fontWeight: '800' }}>{w}kg</Text>
                    </TouchableOpacity>
                  ))}

                  {showCustomBarInput ? (
                    <TextInput
                      style={[styles.barTypeBtn, { flex: 1, borderColor: colors.primary, color: colors.textPrimary, textAlign: 'center', fontWeight: '800', paddingVertical: 0 }]}
                      keyboardType="decimal-pad"
                      autoFocus
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      onChangeText={t => {
                        const val = parseFloat(t);
                        setBarWeight(isNaN(val) ? 0 : val);
                      }}
                    />
                  ) : (
                    <TouchableOpacity 
                      onPress={() => setShowCustomBarInput(true)}
                      style={[styles.barTypeBtn, { borderColor: (![20, 15].includes(barWeight)) ? colors.primary : colors.border, width: 60, alignItems: 'center', justifyContent: 'center' }]}
                    >
                      {![20, 15].includes(barWeight) ? (
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>{barWeight}kg</Text>
                      ) : (
                        <Ionicons name="pencil" size={18} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                   <Text style={[styles.label, { color: colors.textSecondary }]}>MODO LANDMINE</Text>
                   {isAutoLandmine ? (
                     <View style={{ backgroundColor: colors.success + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="flash" size={14} color={colors.success} />
                        <Text style={{ color: colors.success, fontSize: 12, fontWeight: '900' }}>AUTO-DETECTADO</Text>
                     </View>
                   ) : (
                     <TouchableOpacity 
                        onPress={() => setIsLandmineMode(!isLandmineMode)}
                        style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: isLandmineMode ? colors.primary : colors.border, justifyContent: 'center', alignItems: isLandmineMode ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }}
                     >
                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' }} />
                     </TouchableOpacity>
                   )}
                </View>

                {(isLandmineMode || isAutoLandmine) && (
                  <View style={{ marginBottom: 20, backgroundColor: colors.surfaceHighlight, padding: 15, borderRadius: 12 }}>
                     <Text style={{ color: colors.textPrimary, fontSize: 13, marginBottom: 10 }}>
                       Calculando carga real compensada por trigonometría (Ángulo de palanca).
                     </Text>
                     <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ color: colors.textSecondary, fontWeight: '700' }}>Tu altura (cm):</Text>
                        <TextInput 
                          style={[styles.logInput, { flex: 1, padding: 8, borderColor: colors.border, backgroundColor: colors.background, color: colors.textPrimary }]} 
                          keyboardType="decimal-pad" 
                          value={athleteHeight} 
                          onChangeText={setAthleteHeight} 
                        />
                     </View>
                  </View>
                )}

                <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 40 }}>
                   <Text style={{ fontSize: 48, fontWeight: '900', color: colors.primary, marginBottom: 5 }}>
                     {calculateTotalWeight().toFixed(1)} <Text style={{ fontSize: 24, color: colors.textSecondary }}>kg</Text>
                   </Text>
                   {(isLandmineMode || isAutoLandmine) && <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 12, marginBottom: 20 }}>CARGA EFECTIVA</Text>}

                   <View style={[styles.barSleeveContainer, { marginTop: 20 }]}>
                      <View style={{ position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', zIndex: 1 }}>
                         <View style={{ height: 16, width: '10%', backgroundColor: '#64748B' }} />
                         <View style={{ height: 32, width: 14, backgroundColor: '#475569', borderRadius: 3 }} />
                         <View style={{ height: 22, width: '60%', backgroundColor: '#CBD5E1', borderTopRightRadius: 6, borderBottomRightRadius: 6, overflow: 'hidden' }}>
                            <View style={{ width: '100%', height: 2, backgroundColor: '#FFFFFF', opacity: 0.6, marginTop: 3 }} />
                            <View style={{ width: '100%', height: 2, backgroundColor: '#000000', opacity: 0.1, marginTop: 12 }} />
                         </View>
                      </View>

                      {platesOnBar.length === 0 && <Text style={{ position: 'absolute', color: '#64748B', fontSize: 13, top: -30, fontWeight: '700', zIndex: 0 }}>Barra vacía</Text>}
                      
                      <View style={[styles.stackedPlatesContainer, { zIndex: 2, marginLeft: '5%' }]}>
                        {platesOnBar.map((weight, index) => {
                          const height = 120 + (weight * 2);
                          const width = weight > 10 ? 24 : 16;
                          return (
                            <TouchableOpacity 
                              key={`${weight}-${index}`} 
                              onPress={() => removePlate(index)}
                              style={[styles.stackedPlate, { height, width, backgroundColor: PLATE_COLORS[weight] || '#333' }]}
                            >
                               <Text style={{ color: weight === 5 ? '#000' : '#FFF', fontSize: 10, fontWeight: '900', transform: [{ rotate: '-90deg' }] }}>
                                 {weight}
                               </Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                   </View>
                   <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 30 }}>Toca un disco en la barra para quitarlo</Text>
                </View>

                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 10 }]}>TOCA PARA AÑADIR DISCOS (1 LADO)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                  {AVAILABLE_PLATES.map(w => (
                    <TouchableOpacity 
                      key={w} 
                      onPress={() => addPlate(w)}
                      style={[styles.legendPlate, { backgroundColor: PLATE_COLORS[w] || '#333' }]}
                    >
                      <Text style={{ color: w === 5 ? '#000' : '#FFF', fontWeight: '900' }}>{w}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

              </ScrollView>

              <TouchableOpacity style={[styles.finishWorkoutBtn, { backgroundColor: colors.primary, marginTop: 20 }]} onPress={saveCalculatedWeight}>
                <Text style={styles.finishWorkoutBtnText}>Guardar Peso</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderVideoModal = () => (
    <Modal visible={!!expandedVideo} transparent animationType="fade" onRequestClose={() => setExpandedVideo(null)}>
      <View style={styles.fullscreenVideoOverlay}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.closeModalBtn} onPress={() => setExpandedVideo(null)}>
          <Ionicons name="close-circle" size={40} color="#FFF" />
        </TouchableOpacity>
        {expandedVideo && (
          <Video 
            source={{ uri: expandedVideo }} 
            style={styles.fullVideo} 
            resizeMode={ResizeMode.CONTAIN} 
            useNativeControls={true}
            shouldPlay={true}
          />
        )}
      </View>
    </Modal>
  );

  const renderExerciseList = () => {
    if (!workout?.exercises) return null;
    if (isHiit) {
      return workout.exercises.map((block: any, bIdx: number) => (
        <View key={bIdx} style={{ marginBottom: 15 }}>
          <Text style={{ fontWeight: '800', color: colors.error || '#EF4444', marginBottom: 8 }}>
            {block.name} <Text style={{color: colors.textSecondary, fontSize: 12}}>({block.sets} Vueltas)</Text>
          </Text>
          {block.hiit_exercises?.map((ex: any, eIdx: number) => {
            const hasSets = ex.sets && parseInt(ex.sets) > 1;
            const normReps = normalizeHiitReps(ex.duration_reps);
            let finalTime = ex.duration;
            if (isFatigueMode && finalTime) finalTime = adjustDurationStr(finalTime);
            let displayDur = '';
            if (normReps && finalTime) displayDur = `${normReps} / ${finalTime}`;
            else displayDur = normReps || finalTime || '-';
            const notesText = ex.exercise_notes || ex.notes || ex.observations || ex.observaciones;
            return (
              <View key={eIdx} style={{ paddingLeft: 10, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '500' }}>• {ex.name} {ex.is_unilateral && '(Unilateral)'}</Text>
                  <Text style={{ color: colors.primary, fontWeight: '800', marginLeft: 10 }}>
                    {hasSets ? `${ex.sets}x ` : ''}{displayDur}
                  </Text>
                </View>
                {notesText ? <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2, marginLeft: 10 }}>Nota: {notesText}</Text> : null}
              </View>
            )
          })}
        </View>
      ));
    } else {
      return workout.exercises.map((ex: any, idx: number) => {
        let displayReps = ex.reps;
        if (isFatigueMode) displayReps = adjustReps(displayReps);

        let displayDur = ex.duration;
        if (isFatigueMode) displayDur = adjustDurationStr(displayDur);

        const notesText = ex.exercise_notes || ex.notes || ex.observations || ex.observaciones;
        return (
          <View key={idx} style={{ marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '600', paddingRight: 10 }}>
                <Text style={{ color: colors.textSecondary }}>{idx + 1}.</Text> {ex.name} {ex.is_unilateral && '(Uni)'}
              </Text>
              <View style={{ alignItems: 'flex-end' }}>
                {(ex.sets && displayReps) ? <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{ex.sets} x {displayReps}</Text> : null}
                {displayDur ? <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{displayDur}</Text> : null}
              </View>
            </View>
            {notesText && <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>Nota: {notesText}</Text>}
          </View>
        );
      });
    }
  };

  const renderSessionSummary = () => {
    if (!workout?.exercises) return null;
    if (isHiit) {
      return workout.exercises.map((block: any, bIdx: number) => (
        <View key={bIdx} style={[styles.summaryCard, { backgroundColor: colors.surfaceHighlight }]}>
          <Text style={{ fontWeight: '900', color: colors.textPrimary, marginBottom: 5 }}>{block.name}</Text>
          {block.hiit_exercises?.map((ex: any, eIdx: number) => {
            const key = `${bIdx}-${eIdx}`;
            const note = hiitLogs[key]?.note;
            const cNote = hiitLogs[key]?.coach_note || '';
            const vid = displayVideos[key];
            const skipped = hiitSkipped[key] || 0;
            return (
              <View key={eIdx} style={{ marginTop: 8, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{ex.name} {ex.is_unilateral && '(Unilateral)'}</Text>
                {skipped > 0 && <Text style={{ color: colors.error, fontSize: 13, marginTop: 2 }}>⏭ Rondas saltadas: {skipped}</Text>}
                {note ? <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 2 }}>📝 Nota: {note}</Text> : null}
                
                {vid && (
                  <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
                    <VideoUploader 
                      currentVideo={vid} 
                      onUploadSuccess={() => {}} 
                      colors={colors} 
                      readOnly={true} 
                      onPlay={() => setExpandedVideo(vid)} 
                    />
                  </View>
                )}
                
                {isTrainer ? (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      style={[styles.coachNoteInput, { borderColor: colors.border, color: colors.textPrimary }]}
                      placeholder="Añadir feedback técnico del entrenador..."
                      placeholderTextColor={colors.textSecondary}
                      value={cNote}
                      onChangeText={t => setHiitLogs(p => ({...p, [key]: {...(p[key] || {}), coach_note: t}}))}
                      multiline
                    />
                    <TouchableOpacity style={[styles.saveFeedbackBtn, { backgroundColor: colors.primary }]} onPress={handleSaveTrainerFeedback}>
                      <Text style={styles.saveFeedbackBtnText}>Guardar Feedback</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  cNote ? (
                    <View style={{ marginTop: 10, backgroundColor: colors.primary + '10', padding: 10, borderRadius: 8 }}>
                      <Text style={{ color: colors.primary, fontWeight: '800', marginBottom: 4 }}>Feedback del Entrenador:</Text>
                      <Text style={{ color: colors.textPrimary, fontStyle: 'italic' }}>{cNote}</Text>
                    </View>
                  ) : null
                )}
              </View>
            );
          })}
        </View>
      ));
    } else {
      return workout.exercises.map((ex: any, i: number) => {
        const s = setsStatus[i] || [];
        const comp = s.filter(x => x === 'completed').length;
        const skip = s.filter(x => x === 'skipped').length;
        const tot = parseInt(ex.sets) || 1;
        const log = logs[i];
        const vid = displayVideos[i.toString()];
        const cNote = log?.coach_note || '';

        return (
          <View key={i} style={[styles.summaryCard, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={{ fontWeight: '900', color: colors.textPrimary, fontSize: 15 }}>{i + 1}. {ex.name} {ex.is_unilateral && '(Uni)'}</Text>
            <View style={{ flexDirection: 'row', gap: 15, marginTop: 8, flexWrap: 'wrap' }}>
              <Text style={{ color: colors.success, fontSize: 14, fontWeight: '700' }}>✓ {comp} series</Text>
              {skip > 0 && <Text style={{ color: colors.error, fontSize: 14, fontWeight: '700' }}>⏭ {skip} saltadas</Text>}
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '700' }}>/ {tot} total</Text>
            </View>
            {(log?.weight || log?.reps) && (
              <Text style={{ color: colors.textPrimary, fontSize: 14, marginTop: 6, fontWeight: '600' }}>
                Registro: {log.weight ? `${log.weight}kg ` : ''}{log.reps ? `x ${log.reps} reps` : ''}
              </Text>
            )}
            {log?.note && <Text style={{ color: colors.textSecondary, fontSize: 14, fontStyle: 'italic', marginTop: 6 }}>📝 Nota: {log.note}</Text>}
            
            {vid && (
              <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
                <VideoUploader 
                  currentVideo={vid} 
                  onUploadSuccess={() => {}} 
                  colors={colors} 
                  readOnly={true} 
                  onPlay={() => setExpandedVideo(vid)} 
                />
              </View>
            )}

            {isTrainer ? (
              <View style={{ marginTop: 10 }}>
                <TextInput
                  style={[styles.coachNoteInput, { borderColor: colors.border, color: colors.textPrimary }]}
                  placeholder="Añadir feedback técnico del entrenador..."
                  placeholderTextColor={colors.textSecondary}
                  value={cNote}
                  onChangeText={t => setLogs(p => ({...p, [i]: {...p[i], coach_note: t}}))}
                  multiline
                />
                <TouchableOpacity style={[styles.saveFeedbackBtn, { backgroundColor: colors.primary }]} onPress={handleSaveTrainerFeedback}>
                  <Text style={styles.saveFeedbackBtnText}>Guardar Feedback</Text>
                </TouchableOpacity>
              </View>
            ) : (
              cNote ? (
                <View style={{ marginTop: 10, backgroundColor: colors.primary + '10', padding: 10, borderRadius: 8 }}>
                  <Text style={{ color: colors.primary, fontWeight: '800', marginBottom: 4 }}>Feedback del Entrenador:</Text>
                  <Text style={{ color: colors.textPrimary, fontStyle: 'italic' }}>{cNote}</Text>
                </View>
              ) : null
            )}
          </View>
        );
      });
    }
  };

  const renderIndicationsModal = () => (
    <Modal visible={showIndicationsModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.indicationsModalContent, { backgroundColor: colors.surface, maxHeight: screenHeight * 0.85 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 }}>
            <Ionicons name="list" size={28} color={colors.primary} />
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, flex: 1 }}>Detalles de Sesión</Text>
          </View>
          <ScrollView style={{ marginBottom: 20 }} showsVerticalScrollIndicator={false}>
            {workout?.notes ? (
              <View style={{ marginBottom: 20, padding: 15, backgroundColor: colors.surfaceHighlight, borderRadius: 12 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '800', marginBottom: 5 }}>INDICACIONES DEL ENTRENADOR:</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22, fontStyle: 'italic' }}>"{workout.notes}"</Text>
              </View>
            ) : null}
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '800', marginBottom: 10, letterSpacing: 1 }}>LISTA DE EJERCICIOS</Text>
            {renderExerciseList()}
          </ScrollView>
          <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' }} onPress={() => setShowIndicationsModal(false)}>
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Entendido / Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const toggleJoint = (slug: string) => { 
    if (!slug) return; 
    if (Platform.OS !== 'web') { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); }
    setSoreJoints(prev => prev.includes(slug) ? prev.filter(j => j !== slug) : [...prev, slug]); 
  };

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;
  if (!workout) return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 16 }]}>
      <Ionicons name="calendar-clear-outline" size={48} color={colors.textSecondary} />
      <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>No encontramos esta sesión</Text>
      <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Puede que tu entrenador la haya cambiado o eliminado.</Text>
      <TouchableOpacity onPress={() => router.replace('/home')} style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 }} accessibilityRole="button">
        <Text style={{ color: '#FFF', fontWeight: '800' }}>Volver al inicio</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  let main;
  if (finished || workout.completed) {
    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => goBack(router)}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Resumen de Sesión</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView contentContainerStyle={[styles.content, { alignItems: 'center', paddingVertical: 40 }]} keyboardShouldPersistTaps="handled">
            <View style={styles.finishedIconContainer}><Ionicons name="trophy" size={80} color={colors.warning || '#F59E0B'} /></View>
            <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>¡Entrenamiento completado!</Text>
            
            <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '900', marginTop: 10, marginBottom: 20 }}>
              ⏱ Tiempo Total: {formatGlobalTime(globalSeconds)}
            </Text>

            <Text style={[styles.finishedSubtitle, { color: colors.textSecondary }]}>¿Cómo te has sentido hoy?</Text>
            
            {!workout.completed && (
              <View style={{ alignSelf: 'stretch', gap: 24, marginTop: 10 }}>
                <View><Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>NIVEL DE ESFUERZO (RPE)</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => { const isSelected = rpe === num; let c = (num >= 8) ? (colors.error || '#EF4444') : (num >= 4) ? (colors.warning || '#F59E0B') : (colors.success || '#10B981'); return ( <TouchableOpacity key={num} onPress={() => setRpe(num)} style={[styles.rpeCircle, { borderColor: colors.border }, isSelected && { backgroundColor: c, borderColor: c }]}><Text style={[styles.rpeText, { color: isSelected ? '#FFF' : colors.textSecondary }]}>{num}</Text></TouchableOpacity> ); })}</View>
                </View>
                <View><Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>CALIDAD DEL SUEÑO</Text><View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>{[1, 2, 3, 4, 5].map(num => ( <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Puntuar ${num} de 5`} key={num} onPress={() => setSleepQuality(num)} style={{ padding: 5 }}><Ionicons name={sleepQuality && sleepQuality >= num ? "star" : "star-outline"} size={36} color={colors.warning || '#F59E0B'} /></TouchableOpacity> ))}</View></View>
                
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>FATIGA O IMPACTO</Text>
                  <View style={{ backgroundColor: colors.surfaceHighlight, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: soreJoints.length > 0 ? (colors.error || '#EF4444') : colors.border }}>
                    <TouchableOpacity
                      style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      onPress={() => setIsPainSelectorOpen(!isPainSelectorOpen)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="body" size={24} color={soreJoints.length > 0 ? (colors.error || '#EF4444') : colors.primary} />
                        <Text style={{ fontWeight: '700', color: soreJoints.length > 0 ? (colors.error || '#EF4444') : colors.textPrimary }}>
                          {soreJoints.length > 0 ? `${soreJoints.length} Zonas Marcadas` : 'Registrar Molestias / Fatiga'}
                        </Text>
                      </View>
                      <Ionicons name={isPainSelectorOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {isPainSelectorOpen && (
                      <View style={{ padding: 16, paddingTop: 0, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10 }}>
                         <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                          {Object.entries(SLUG_TRANSLATIONS).map(([slug, name]) => {
                            const isSelected = soreJoints.includes(slug);
                            const activeColor = colors.error || '#EF4444';
                            return (
                              <TouchableOpacity
                                key={slug}
                                style={[
                                  styles.painButton, 
                                  { borderColor: colors.border, backgroundColor: colors.background },
                                  isSelected && { backgroundColor: activeColor, borderColor: activeColor }
                                ]}
                                onPress={() => toggleJoint(slug)}
                              >
                                <Text style={[
                                  styles.painButtonText, 
                                  { color: colors.textSecondary },
                                  isSelected && { color: '#FFF', fontWeight: '800' }
                                ]}>
                                  {name}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                </View>

                <View><Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12 }]}>OBSERVACIONES</Text><TextInput style={[styles.obsInput, { backgroundColor: colors.surfaceHighlight, color: colors.textPrimary, borderColor: colors.border }]} multiline placeholder="¿Algo a destacar?..." placeholderTextColor={colors.textSecondary} value={observations} onChangeText={setObservations} /></View>
              </View>
            )}

            <View style={{ alignSelf: 'stretch', marginTop: 30 }}>
              <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 15, textAlign: 'center' }]}>RESUMEN DE EJERCICIOS</Text>
              {renderSessionSummary()}
            </View>

            {workout.completed && workout.completion_data && (
              <View style={{ alignSelf: 'stretch', marginTop: 20, backgroundColor: colors.surfaceHighlight, padding: 20, borderRadius: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 }}>Feedback General:</Text>
                {workout.completion_data.duration_seconds && (
                  <Text style={{ color: colors.textPrimary, marginBottom: 4 }}>⏱ Tiempo Activo: {formatGlobalTime(workout.completion_data.duration_seconds)}</Text>
                )}
                <Text style={{ color: colors.textPrimary }}>RPE: {workout.completion_data.rpe}/10</Text>
                {workout.completion_data.sore_joints?.length > 0 && <Text style={{ color: colors.error, marginTop: 5, fontWeight: '600' }}>Molestias: {workout.completion_data.sore_joints.map((j: string) => SLUG_TRANSLATIONS[j] || j).join(', ')}</Text>}
                {workout.observations && <Text style={{ color: colors.textSecondary, marginTop: 10, fontStyle: 'italic' }}>"{workout.observations}"</Text>}
              </View>
            )}
            {!workout.completed && ( <TouchableOpacity style={[styles.finishWorkoutBtn, { backgroundColor: colors.primary }]} onPress={handleFinish}><Text style={styles.finishWorkoutBtnText}>Finalizar Entrenamiento</Text></TouchableOpacity> )}
          </ScrollView>
        </KeyboardAvoidingView>
        {renderVideoModal()}
      </SafeAreaView>
    );
  } else if (isHiit) {
    const b = workout.exercises?.[hiitBlockIdx];
    if (!b) return <ActivityIndicator color={colors.primary} />;
    
    let displayBlock = b;
    if (isFatigueMode) {
      displayBlock = {
        ...b,
        hiit_exercises: b.hiit_exercises.map((e: any) => ({
          ...e,
          duration: adjustDurationStr(e.duration),
          duration_reps: normalizeHiitReps(e.duration_reps)
        }))
      };
    }

    const currentEx = displayBlock.hiit_exercises[hiitExIdx];
    const hasMultipleSets = parseInt(currentEx?.sets) > 1;
    let timerExName = currentEx?.name || 'HIIT';
    
    if (currentEx?.is_unilateral) timerExName += hiitSide === 1 ? ' (Lado 1)' : ' (Lado 2)';
    if (hasMultipleSets) timerExName += ` (Serie ${hiitExSet}/${currentEx?.sets})`;
    
    if (isRestingStatus) {
      if (hiitPhase === 'rest_set') { timerExName = `Siguiente: ${currentEx?.name} (Serie ${hiitExSet + 1})`; } 
      else if (hiitPhase === 'rest_ex') { timerExName = `Siguiente: ${displayBlock.hiit_exercises[hiitExIdx + 1]?.name}`; } 
      else if (hiitPhase === 'rest_block') { timerExName = `Siguiente: ${displayBlock.hiit_exercises[0]?.name} (Vuelta ${hiitRound + 1})`; } 
      else if (hiitPhase === 'rest_next_block') { const nextBlock = workout.exercises[hiitBlockIdx + 1]; timerExName = `Siguiente: ${nextBlock?.name}`; }
    } else if (isPrep) { 
      timerExName = `Prep: ${currentEx?.name}`; 
      if (currentEx?.is_unilateral) timerExName += hiitSide === 1 ? ' (Lado 1)' : ' (Lado 2)';
    }

    const normReps = normalizeHiitReps(currentEx?.duration_reps);
    let displayHiitReps = '';
    if (normReps && currentEx?.duration) displayHiitReps = `${normReps} / ${currentEx.duration}`;
    else displayHiitReps = normReps || currentEx?.duration;

    const hiitKey = `${hiitBlockIdx}-${hiitExIdx}`;
    const hiitTotalExs = displayBlock.hiit_exercises.length;
    const currentExSets = parseInt(currentEx?.sets) || 1;
    const hiitRingSize = ringSizeFor(58);

    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {renderTopBar(`Bloque ${hiitBlockIdx + 1}/${workout.exercises.length}`)}
          {renderSegments(workout.exercises.length, hiitBlockIdx)}

          <View style={styles.exInfo}>
            <View style={styles.blockRow}>
              <Ionicons name="flame" size={16} color={colors.error || '#EF4444'} />
              <Text style={{ color: colors.error || '#EF4444', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>{displayBlock.name}</Text>
              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13 }}>Vuelta {hiitRound} de {displayBlock.sets}</Text>
            </View>
            <View style={styles.exTitleRow}>
              <Text style={[styles.exTitle, { color: colors.textPrimary }]} numberOfLines={2}>{currentEx?.name}</Text>
              {!!currentEx?.video_url && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver vídeo de referencia" style={[styles.toolBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => Linking.openURL(currentEx.video_url)}>
                  <Ionicons name="logo-youtube" size={22} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.chipsRow}>
              {!!displayHiitReps && renderChip('obj', 'Objetivo', displayHiitReps, isFatigueMode)}
              {currentExSets > 1 && renderChip('serie', 'Serie', `${hiitExSet} de ${currentExSets}`)}
              {!!currentEx?.is_unilateral && renderChip('lado', 'Lado', String(hiitSide))}
              {renderChip('ej', 'Ejercicio', `${hiitExIdx + 1} de ${hiitTotalExs}`)}
            </View>
            {currentEx?.exercise_notes ? renderNoteLine(currentEx.exercise_notes) : null}
          </View>

          <View style={styles.stage} onLayout={onStageLayout}>
            <TimerRing
              size={hiitRingSize}
              isPrep={isPrep} isResting={isRestingStatus} isWorking={isWorking} isPaused={isPaused}
              prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds}
              restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds}
              label={timerExName} reps={normReps || currentEx?.duration}
              idleProgress={hiitTotalExs ? hiitExIdx / hiitTotalExs : 0}
              idleCaption={`Ejercicio ${hiitExIdx + 1} de ${hiitTotalExs}`}
              colors={colors}
            />
            <ScrollView ref={hiitStripRef} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, alignSelf: 'stretch' }} contentContainerStyle={styles.hiitStrip}>
              {displayBlock.hiit_exercises.map((hx: any, idx: number) => {
                const isCurrent = (hiitPhase === 'work' || hiitPhase === 'rest_set') && idx === hiitExIdx;
                const isDone = hiitExIdx > idx;
                return (
                  <View key={idx} style={[styles.hiitPill, { borderColor: isCurrent ? colors.primary : colors.border, backgroundColor: isCurrent ? colors.primary + '18' : colors.surface }]}>
                    <View style={[styles.hiitPillDot, { backgroundColor: isDone ? (colors.success || '#10B981') : isCurrent ? colors.primary : colors.border }]}>
                      {isDone ? <Ionicons name="checkmark" size={12} color="#FFF" /> : <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{idx + 1}</Text>}
                    </View>
                    <Text style={{ color: isCurrent ? colors.textPrimary : colors.textSecondary, fontWeight: isCurrent ? '800' : '600', fontSize: 13 }} numberOfLines={1}>{hx.name}</Text>
                    {!!(hx.duration_reps || hx.duration) && (
                      <Text style={{ color: isCurrent ? colors.primary : colors.textSecondary, fontWeight: '800', fontSize: 12 }}>{hx.duration_reps || hx.duration}</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.controlsArea}>
            <TimerControls
              isPrep={isPrep} isResting={isRestingStatus} isWorking={isWorking} isPaused={isPaused}
              workTotalSeconds={workTotalSeconds} isHiit colors={colors}
              onTogglePause={togglePause} onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }}
              onSkipRest={skipHiitRest} onResetWork={resetWorkTimer} onResetRest={resetRestTimer}
              onComplete={advanceHiit} onSkip={skipHiitEx}
            />
          </View>

          <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Anotación del ejercicio" style={styles.bottomTool} onPress={() => setShowNoteModal(true)}>
              <Ionicons name={hiitLogs[hiitKey]?.note ? 'document-text' : 'document-text-outline'} size={22} color={hiitLogs[hiitKey]?.note ? colors.primary : colors.textPrimary} />
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>Nota</Text>
            </TouchableOpacity>
            {renderFatiguePill()}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Vídeo de tu ejecución" style={styles.bottomTool} onPress={() => setShowVideoSheet(true)}>
              <Ionicons name={displayVideos[hiitKey] ? 'videocam' : 'videocam-outline'} size={22} color={displayVideos[hiitKey] ? (colors.success || '#10B981') : colors.textPrimary} />
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>Vídeo</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        {renderNoteModal(hiitKey)}{renderVideoSheet(hiitKey)}
        {renderVideoModal()}{renderIndicationsModal()}
      </SafeAreaView>
    );
  } else {
    const ex = workout.exercises[currentExIndex];
    if (!ex) return <ActivityIndicator color={colors.primary} />;
    const s = setsStatus[currentExIndex] || [];
    const completedSets = s.filter(x => x === 'completed').length;
    const doneSets = s.filter(x => x !== 'pending').length;
    const nextPending = s.findIndex(x => x === 'pending');

    let displayExName = ex?.name;
    if (ex?.is_unilateral) displayExName += tradSide === 1 ? ' (Lado 1)' : ' (Lado 2)';
    if (isRestingStatus) {
      if (restType === 'exercise' && currentExIndex < workout.exercises.length - 1) { displayExName = `Siguiente: ${workout.exercises[currentExIndex + 1]?.name}`; } 
      else { displayExName = `Siguiente: ${ex?.name} (Serie ${completedSets + 1})`; }
    } else if (isPrep) { displayExName = `Prep: ${ex?.name}`; }

    const isBarbellLift = /barra|barbell|sentadilla|squat|peso muerto|deadlift|press|snatch|clean|jerk|landmine|hex|hexagonal|trap|smith|multipower/i.test(ex?.name || '');
    const isDumbbellOrKettlebell = /dumbell|dumbbell|mancuerna|kettlebell|hex|pesa rusa/i.test(ex?.name || '');
    const showCalculatorButton = isBarbellLift && !isDumbbellOrKettlebell;
    const isLandmineExercise = /landmine/i.test(ex?.name || '');

    let displayReps = ex.reps;
    if (isFatigueMode) displayReps = adjustReps(displayReps);

    let displayDur = ex.duration;
    if (isFatigueMode) displayDur = adjustDurationStr(displayDur);

    const vidUrl = ex.video_url || ex.link || ex.url;
    const notesText = ex.exercise_notes || ex.notes || ex.observations || ex.observaciones;
    const savedLog = logs[currentExIndex];
    const hasSavedLog = !!(savedLog?.weight || savedLog?.reps || savedLog?.note);
    const exKey = currentExIndex.toString();
    const isLastExercise = currentExIndex >= workout.exercises.length - 1;
    const setCaption = s.length ? (nextPending === -1 ? 'Series completadas' : `Serie ${nextPending + 1} de ${s.length}`) : '';
    const details = [
      { k: 'sets', label: 'Series', value: ex.sets, fatigue: false },
      { k: 'reps', label: 'Reps', value: displayReps, fatigue: isFatigueMode },
      { k: 'weight', label: 'Kg', value: ex.weight, fatigue: false },
      { k: 'duration', label: 'Tiempo', value: displayDur, fatigue: isFatigueMode },
      { k: 'rest', label: 'Desc.', value: ex.rest, fatigue: false },
    ].filter(d => d.value);
    const ringSize = ringSizeFor(44);

    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {renderTopBar(`Ejercicio ${currentExIndex + 1}/${workout.exercises.length}`)}
          {renderSegments(workout.exercises.length, currentExIndex)}

          <View style={styles.exInfo}>
            <View style={styles.exTitleRow}>
              <Text style={[styles.exTitle, { color: colors.textPrimary }]} numberOfLines={2}>{ex.name}</Text>
              {!!ex?.is_unilateral && (
                <View style={[styles.sideBadge, { backgroundColor: (colors.warning || '#F59E0B') + '22' }]}>
                  <Text style={{ color: colors.warning || '#F59E0B', fontWeight: '900', fontSize: 12 }}>Lado {tradSide}</Text>
                </View>
              )}
              {!!vidUrl && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver vídeo de referencia" style={[styles.toolBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => Linking.openURL(vidUrl)}>
                  <Ionicons name="logo-youtube" size={22} color="#EF4444" />
                </TouchableOpacity>
              )}
              {showCalculatorButton && (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Calculadora de discos" style={[styles.toolBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => openPlateCalculator(isLandmineExercise)}>
                  <Ionicons name="calculator-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
            </View>
            {details.length > 0 && (
              <View style={styles.chipsRow}>
                {details.map(d => renderChip(d.k, d.label, String(d.value), d.fatigue))}
              </View>
            )}
            {notesText ? renderNoteLine(notesText) : null}
          </View>

          <View style={styles.stage} onLayout={onStageLayout}>
            <TimerRing
              size={ringSize}
              isPrep={isPrep} isResting={isRestingStatus} isWorking={isWorking} isPaused={isPaused}
              prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds}
              restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds}
              label={displayExName} reps={displayReps ? String(displayReps) : undefined}
              idleProgress={s.length ? doneSets / s.length : 0} idleCaption={setCaption}
              colors={colors}
            />
            {s.length > 0 && (
              <View style={styles.setsRow} accessibilityLabel={`${completedSets} de ${s.length} series completadas`}>
                {s.map((st, i) => (
                  <View
                    key={i}
                    style={[
                      styles.setDot,
                      { borderColor: i === nextPending ? colors.primary : colors.border, borderWidth: i === nextPending ? 2 : 1.5 },
                      st === 'completed' && { backgroundColor: colors.success, borderColor: colors.success },
                      st === 'skipped' && { backgroundColor: colors.error, borderColor: colors.error },
                    ]}
                  >
                    {st === 'completed' ? <Ionicons name="checkmark" size={15} color="#FFF" />
                      : st === 'skipped' ? <Ionicons name="close" size={15} color="#FFF" />
                      : <Text style={{ color: i === nextPending ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>{i + 1}</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.controlsArea}>
            <TimerControls
              isPrep={isPrep} isResting={isRestingStatus} isWorking={isWorking} isPaused={isPaused}
              workTotalSeconds={workTotalSeconds} isHiit={false} colors={colors}
              onTogglePause={togglePause} onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }}
              onSkipRest={skipTradRest} onResetWork={resetWorkTimer} onResetRest={resetRestTimer}
              onComplete={completeSet} onSkip={skipSet}
            />
          </View>

          <View style={styles.logArea}>
            {hasSavedLog && (
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: '800', marginBottom: 6 }} numberOfLines={1}>
                ✓ Guardado: {savedLog?.weight ? `${savedLog.weight} kg` : ''}{savedLog?.reps ? ` × ${savedLog.reps} reps` : ''}{savedLog?.note ? ` · "${savedLog.note}"` : ''}
              </Text>
            )}
            <View style={styles.logRow}>
              <TextInput
                key={`weight-${currentExIndex}`}
                accessibilityLabel="Kilos"
                style={[styles.logInputCompact, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
                placeholder="Kg" placeholderTextColor={colors.textSecondary} keyboardType="decimal-pad"
                value={tempWeight} onChangeText={setTempWeight}
              />
              <TextInput
                key={`reps-${currentExIndex}`}
                accessibilityLabel="Repeticiones"
                style={[styles.logInputCompact, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
                placeholder="Reps" placeholderTextColor={colors.textSecondary} keyboardType="decimal-pad"
                value={tempReps} onChangeText={setTempReps}
              />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Anotaciones de la serie" style={[styles.toolBtn, { borderColor: tempNote ? colors.primary : colors.border, backgroundColor: colors.surface }]} onPress={() => setShowNoteModal(true)}>
                <Ionicons name={tempNote ? 'document-text' : 'document-text-outline'} size={20} color={tempNote ? colors.primary : colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Vídeo de tu ejecución" style={[styles.toolBtn, { borderColor: displayVideos[exKey] ? (colors.success || '#10B981') : colors.border, backgroundColor: colors.surface }]} onPress={() => setShowVideoSheet(true)}>
                <Ionicons name={displayVideos[exKey] ? 'videocam' : 'videocam-outline'} size={20} color={displayVideos[exKey] ? (colors.success || '#10B981') : colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Guardar registro" style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveActiveLogs}>
                <Ionicons name="save-outline" size={18} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel="Ejercicio anterior" disabled={currentExIndex === 0}
              style={[styles.navBtn, { opacity: currentExIndex === 0 ? 0.35 : 1 }]}
              onPress={() => { if (currentExIndex > 0) { stopAllTimers(); setCurrentExIndex(currentExIndex - 1); } }}
            >
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 15 }}>Anterior</Text>
            </TouchableOpacity>
            {renderFatiguePill()}
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel={isLastExercise ? 'Terminar entrenamiento' : 'Siguiente ejercicio'}
              style={[styles.navBtn, { justifyContent: 'flex-end' }]}
              onPress={() => { stopAllTimers(); setTradSide(1); if (currentExIndex < workout.exercises.length - 1) setCurrentExIndex(currentExIndex + 1); else { setFinished(true); } }}
            >
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>{isLastExercise ? 'Terminar' : 'Siguiente'}</Text>
              <Ionicons name={isLastExercise ? 'flag' : 'chevron-forward'} size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        {renderNoteModal()}{renderVideoSheet(exKey)}
        {renderVideoModal()}{renderIndicationsModal()}{renderPlateCalculatorModal()}
      </SafeAreaView>
    );
  }
  return main;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }, topTitle: { fontSize: 16, fontWeight: '700' }, content: { padding: 20, paddingBottom: 100, gap: 16 },
  recordBtn: { borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  logInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  finishedIconContainer: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.1)' }, finishedTitle: { fontSize: 26, fontWeight: '900', textAlign: 'center' }, finishedSubtitle: { fontSize: 15, textAlign: 'center', marginBottom: 20 }, finishWorkoutBtn: { padding: 18, borderRadius: 16, alignItems: 'center', alignSelf: 'stretch', marginTop: 20 }, finishWorkoutBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }, rpeCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }, rpeText: { fontSize: 12, fontWeight: '700' }, sleepPill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 }, sleepPillText: { fontSize: 13, fontWeight: '600' }, obsInput: { borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 100, fontSize: 15, textAlignVertical: 'top' },
  summaryCard: { padding: 16, borderRadius: 16, marginBottom: 12, alignSelf: 'stretch' },
  fullscreenVideoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' }, fullVideo: { width: '100%', height: '80%' }, closeModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }, indicationsModalContent: { width: '85%', padding: 24, borderRadius: 24 },
  painButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 }, painButtonText: { fontSize: 13, fontWeight: '600' },
  barTypeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderWidth: 2, borderRadius: 12 },
  barSleeveContainer: { height: 180, width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  barSleeve: { position: 'absolute', height: 20, width: '100%', borderRadius: 4 },
  stackedPlatesContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stackedPlate: { borderRadius: 4, marginHorizontal: 1, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 4 },
  legendPlate: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 },
  coachNoteInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top', marginTop: 8 },
  saveFeedbackBtn: { padding: 10, borderRadius: 8, marginTop: 8, alignItems: 'center' },
  saveFeedbackBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  // --- Diseño de una sola pantalla ---
  tmTopBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 6 },
  tmTopBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  segments: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 8 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  exInfo: { paddingHorizontal: 16, gap: 8 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exTitle: { fontSize: 22, fontWeight: '900', flex: 1, letterSpacing: -0.3 },
  sideBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  toolBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  chipLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  chipValue: { fontSize: 15, fontWeight: '800' },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 6 },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  setDot: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  hiitStrip: { gap: 8, paddingHorizontal: 4 },
  hiitPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1.5 },
  hiitPillDot: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  controlsArea: { paddingHorizontal: 16, paddingBottom: 10 },
  logArea: { paddingHorizontal: 16, paddingBottom: 10 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logInputCompact: { flex: 1, minWidth: 0, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  saveBtn: { height: 44, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: 0.5, gap: 6 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 6, minWidth: 92 },
  bottomTool: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 12, minWidth: 72, gap: 2 },
  fatiguePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, borderWidth: 1, flexShrink: 1 },
  sheet: { width: '90%', maxWidth: 420, padding: 20, borderRadius: 20, gap: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '900' },
  sheetInput: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 110, fontSize: 15, textAlignVertical: 'top' },
  sheetPrimary: { padding: 14, borderRadius: 12, alignItems: 'center' },
});
