import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput, Alert, Platform, Modal, Dimensions,
  UIManager, LayoutAnimation, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import NetInfo from '@react-native-community/netinfo';

import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import { syncManager } from '../src/offline';
import UnifiedTimer from '../src/components/training/UnifiedTimer';
import HiitCard from '../src/components/training/HiitCard';

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
  const [hiitLogs, setHiitLogs] = useState<Record<string, {note?: string}>>({});
  
  const [recordedVideos, setRecordedVideos] = useState<Record<string, string>>({});
  const [videoUploading, setVideoUploading] = useState<string | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  
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

  const [globalSeconds, setGlobalSeconds] = useState(0);
  const globalTimerRef = useRef<any>(null);

  const [prepTargetTime, setPrepTargetTime] = useState<number | null>(null);
  const [prepSeconds, setPrepSeconds] = useState(0);
  const [isPrep, setIsPrep] = useState(false);
  const prepIntervalRef = useRef<any>(null);

  const [restTargetTime, setTargetTime] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(1);
  const [isResting, setIsWorkingRest] = useState(false); 
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

  useFocusEffect(
    useCallback(() => {
      const loadPreferences = async () => {
        try {
          const s = await AsyncStorage.getItem('timer_sounds_enabled');
          setTimerSoundsEnabled(s !== 'false'); 
        } catch (e) { console.log("⚠️ Error cargando preferencias:", e); }
      };
      loadPreferences();
    }, [])
  );

  // --- SINTETIZADOR WEB AUDIO API EXTREMO (CORTA LA MÚSICA) ---
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

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Función para crear sonidos "penetrantes" usando múltiples osciladores a la vez
      const playPiercingBeep = (baseFreq: number, typeStr: OscillatorType, startTime: number, duration: number, isSweep: boolean = false) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator(); // Segundo oscilador para crear "batido" o vibración
        const gainNode = ctx.createGain();

        osc1.type = typeStr;
        osc2.type = typeStr;

        if (isSweep) {
          // Efecto silbato/alarma: Hace un barrido rápido hacia arriba (imposible de ignorar)
          osc1.frequency.setValueAtTime(baseFreq - 300, ctx.currentTime + startTime);
          osc1.frequency.linearRampToValueAtTime(baseFreq + 300, ctx.currentTime + startTime + duration);
          osc2.frequency.setValueAtTime(baseFreq - 280, ctx.currentTime + startTime);
          osc2.frequency.linearRampToValueAtTime(baseFreq + 320, ctx.currentTime + startTime + duration);
        } else {
          // Desafinación intencionada para que el sonido no se camufle con la melodía de Spotify
          osc1.frequency.setValueAtTime(baseFreq, ctx.currentTime + startTime);
          osc2.frequency.setValueAtTime(baseFreq + 15, ctx.currentTime + startTime); 
        }

        // Volumen máximo instantáneo y corte abrupto
        gainNode.gain.setValueAtTime(0, ctx.currentTime + startTime);
        gainNode.gain.linearRampToValueAtTime(1.0, ctx.currentTime + startTime + 0.01);
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime + startTime + duration - 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(ctx.currentTime + startTime);
        osc2.start(ctx.currentTime + startTime);
        osc1.stop(ctx.currentTime + startTime + duration);
        osc2.stop(ctx.currentTime + startTime + duration);
      };

      if (type === 'short') {
        // 3, 2, 1: Agudo, cuadrado y disonante
        playPiercingBeep(1000, 'square', 0, 0.15);
      } else if (type === 'long') {
        // TRABAJO: Efecto silbato agudo (Sweep) con ondas de sierra (muy agresivo)
        playPiercingBeep(1400, 'sawtooth', 0, 0.5, true);
      } else if (type === 'double') {
        // DESCANSO: Dos pitidos graves y roncos (Buzzer de estadio)
        playPiercingBeep(300, 'sawtooth', 0, 0.15);
        playPiercingBeep(300, 'sawtooth', 0.25, 0.15);
      }
    } catch (e) {
      console.log("Error Web Audio API:", e);
    }
  };

  const togglePause = () => {
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
      playTimerSound('long'); // Comienza el trabajo
    }
    justFinishedRestRef.current = false;
  };

  const startWorkTimerAfterPrep = () => {
    setIsWorking(true); setIsPaused(false);
    if (workTotalSeconds > 0) { setWorkTargetTime(Date.now() + workTotalSeconds * 1000); } 
    else { setWorkTargetTime(null); }
    playTimerSound('long'); // Comienza el trabajo tras la prep
  };

  const startRestTimer = (seconds: number) => {
    stopAllTimers(); setTargetTime(Date.now() + seconds * 1000);
    setRestSeconds(seconds); setRestTotalSeconds(seconds); setIsResting(true);
    playTimerSound('double'); // Comienza el descanso
  };

  const resetWorkTimer = () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); setIsPaused(false); setWorkTargetTime(Date.now() + workTotalSeconds * 1000); setWorkSeconds(workTotalSeconds); setIsWorking(true); };
  const resetRestTimer = () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setIsPaused(false); setTargetTime(Date.now() + restTotalSeconds * 1000); setRestSeconds(restTotalSeconds); setIsResting(true); };

  const handleWorkComplete = () => { stopWorkTimer(); if (isHiit) advanceHiitLogic(); else completeSet(); };

  // --- DISPARADORES DE PITIDOS "3, 2, 1" ---
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
        const [allWorkouts, wellnessData] = await Promise.all([api.getWorkouts(), api.getWellnessHistory(user?.id).catch(() => [])]);
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
                  loadedLogs[idx] = { weight: res.logged_weight || '', reps: res.logged_reps || '', note: res.athlete_note || '' };
                  if (res.recorded_video_url) savedVideos[idx.toString()] = res.recorded_video_url;
                  if (res.set_details) {
                    loadedSets[idx] = res.set_details.map((sd: any) => sd.status);
                  } else {
                    loadedSets[idx] = Array(res.total_sets).fill('completed');
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
                    if (ex.athlete_note) hLogs[key] = { note: ex.athlete_note }; 
                    if (ex.skipped_rounds) hSkipped[key] = ex.skipped_rounds;
                  });
                });
                setHiitLogs(hLogs);
                setHiitSkipped(hSkipped);
              }
              setRecordedVideos(savedVideos);
            }
          } else {
            const today = new Date().toISOString().split('T')[0];
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
  }, [stableWorkoutId]);

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
    
    // Unilateral check (Lado 1 a Lado 2)
    if (!skipEx && ex.is_unilateral && hiitSide === 1) {
      setHiitSide(2);
      let dur = parseTimeToSeconds(ex?.duration);
      if (dur === 0) dur = parseTimeToSeconds(normalizeHiitReps(ex?.duration_reps));
      if (isFatigueMode && dur > 0) dur = Math.max(1, Math.floor(dur * 0.8));
      startPrepTimer(dur);
      return;
    }

    setHiitSide(1); // Reset para el siguiente 

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
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); 
    setHiitSkipped(prev => ({ ...prev, [`${hiitBlockIdx}-${hiitExIdx}`]: (prev[`${hiitBlockIdx}-${hiitExIdx}`] || 0) + 1 })); 
    advanceHiitLogic(true); 
  };
  
  const skipHiitRest = () => { stopAllTimers(); justFinishedRestRef.current = true; };
  const skipTradRest = () => { stopAllTimers(); justFinishedRestRef.current = true; };

  const updateSetStatus = (exIdx: number, setIdx: number, status: SetStatus) => { setSetsStatus(prev => { const updated = { ...prev }; updated[exIdx] = [...(prev[exIdx] || [])]; updated[exIdx][setIdx] = status; return updated; }); };
  const autoAdvance = (exIdx: number) => { stopAllTimers(); setTradSide(1); if (exIdx < (workout.exercises?.length || 0) - 1) setTimeout(() => setCurrentExIndex(exIdx + 1), 400); else { setTimeout(() => setFinished(true), 400); } };

  const completeSet = () => {
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

    setTradSide(1); // Reset
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

  const skipSet = () => { stopAllTimers(); setTradSide(1); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); const s = setsStatus[currentExIndex] || []; const next = s.findIndex(i => i === 'pending'); if (next === -1) return; updateSetStatus(currentExIndex, next, 'skipped'); if (s.filter((item, i) => i !== next && item === 'pending').length === 0) autoAdvance(currentExIndex); };
  const skipEntireExercise = () => { stopAllTimers(); setTradSide(1); setSetsStatus(prev => { const updated = { ...prev }; updated[currentExIndex] = (updated[currentExIndex] || []).map(item => item === 'pending' ? 'skipped' : item); return updated; }); autoAdvance(currentExIndex); };

  const handleRecordVideoOptions = (key: string) => { 
    if (Platform.OS === 'web') { 
      const useCamera = window.confirm("¿Quieres grabar un vídeo ahora?\n\n[Aceptar] = Abrir Cámara\n[Cancelar] = Abrir Galería");
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'video/*';
      if (useCamera) input.capture = 'environment'; 
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          setVideoUploading(key);
          const uploaded = await api.uploadFile(file);
          const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || URL.createObjectURL(file));
          setRecordedVideos(prev => ({ ...prev, [key]: finalUrl }));
        } catch (err) { console.error("Error subiendo video:", err); } 
        finally { setVideoUploading(null); }
      };
      input.click();
      return; 
    } 
    Alert.alert("Subir Técnica", "¿Cómo quieres subir el vídeo?", [ 
      { text: "Cancelar", style: "cancel" }, 
      { text: "Galería", onPress: () => launchVideoPicker('library', key) }, 
      { text: "Grabar", onPress: () => launchVideoPicker('camera', key) } 
    ]); 
  };
  const launchVideoPicker = async (source: 'camera' | 'library', key: string) => {
    try {
      let result;
      if (source === 'camera') {
        const cameraPerm = await ImagePicker.requestCameraPermissionsAsync(); 
        const micPerm = await ImagePicker.requestMicrophonePermissionsAsync(); 
        if (cameraPerm.status !== 'granted' || micPerm.status !== 'granted') {
          Alert.alert("Permisos insuficientes", "Se necesita acceso a la cámara y al micrófono para poder grabar tus series."); return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 60, quality: 0.7 });
      } else { 
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, quality: 0.7 }); 
      }
      if (result.canceled || !result.assets) return;
      setVideoUploading(key); const asset = result.assets[0]; const uploaded = await api.uploadFile(asset);
      const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || asset.uri);
      setRecordedVideos(prev => ({ ...prev, [key]: finalUrl }));
    } catch (e) { console.error(e); } finally { setVideoUploading(null); }
  };

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
        hiit_results: (workout.exercises || []).map((b: any, bIdx: number) => ({ ...b, hiit_exercises: b.hiit_exercises.map((ex: any, eIdx: number) => ({ ...ex, skipped_rounds: hiitSkipped[`${bIdx}-${eIdx}`] || 0, recorded_video_url: recordedVideos[`${bIdx}-${eIdx}`] || '', athlete_note: hiitLogs[`${bIdx}-${eIdx}`]?.note || '' })) })) 
      }; 
    }
    return { 
      ...common,
      exercise_results: (workout.exercises || []).map((ex: any, i: number) => { 
        const s = setsStatus[i] || []; 
        return { exercise_index: i, name: ex.name, total_sets: parseInt(ex.sets) || 1, completed_sets: s.filter(item => item === 'completed').length, skipped_sets: s.filter(item => item === 'skipped').length, set_details: s.map((status, si) => ({ set: si + 1, status })), logged_weight: logs[i]?.weight || '', logged_reps: logs[i]?.reps || '', athlete_note: logs[i]?.note || '', recorded_video_url: recordedVideos[i.toString()] || '' }; 
      }), 
    };
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
    if (workout.completed) { router.back(); return; }
    if (!stableWorkoutId) return;
    
    stopAllTimers();
    const data = buildCompletionData();
    
    try {
      const update: any = { completed: true, completion_data: data, title: workout.title, exercises: workout.exercises };
      if (observations.trim()) update.observations = observations.trim();
      await api.updateWorkout(stableWorkoutId, update);
      
      if (Platform.OS === 'web') {
        const send = window.confirm("¡Buen trabajo! ¿Quieres enviar el resumen de la sesión por WhatsApp a tu entrenador?");
        if (send) {
          await sendWhatsAppMessage(data);
        }
        router.back();
      } else {
        Alert.alert(
          "¡Buen trabajo!",
          "¿Quieres enviar el resumen de la sesión por WhatsApp a tu entrenador?",
          [
            { text: "No", style: "cancel", onPress: () => router.back() },
            { text: "Sí", onPress: async () => {
                await sendWhatsAppMessage(data);
                router.back();
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

  const renderFatigueToggle = () => (
    <TouchableOpacity
      style={[styles.fatigueToggle, isFatigueMode && styles.fatigueToggleActive]}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsFatigueMode(!isFatigueMode);
        
        if (!isFatigueMode && !fatigueModeTriggeredEx) {
           const exName = isHiit
             ? workout?.exercises?.[hiitBlockIdx]?.name || 'HIIT'
             : workout?.exercises?.[currentExIndex]?.name || 'Inicio';
           setFatigueModeTriggeredEx(exName);
        }
      }}
    >
      <Ionicons name={isFatigueMode ? "battery-dead" : "battery-half"} size={20} color={isFatigueMode ? "#EF4444" : colors.textSecondary} />
      <Text style={{ color: isFatigueMode ? "#EF4444" : colors.textSecondary, fontWeight: '800', marginLeft: 8, fontSize: 13 }}>
        {isFatigueMode ? "SUPERVIVENCIA ACTIVADO (-20% Volumen)" : "Activar Modo Supervivencia (Alta Fatiga)"}
      </Text>
    </TouchableOpacity>
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
                <TouchableOpacity onPress={() => setShowPlateCalculator(false)}>
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
                      keyboardType="numeric"
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
                          keyboardType="numeric" 
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
    <Modal visible={!!expandedVideo} transparent animationType="fade">
      <View style={styles.fullscreenVideoOverlay}>
        <TouchableOpacity style={styles.closeModalBtn} onPress={() => setExpandedVideo(null)}><Ionicons name="close-circle" size={40} color="#FFF" /></TouchableOpacity>
        {expandedVideo && <Video source={{ uri: expandedVideo }} style={styles.fullVideo} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />}
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
            const vid = recordedVideos[key];
            const skipped = hiitSkipped[key] || 0;
            return (
              <View key={eIdx} style={{ marginTop: 8, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{ex.name} {ex.is_unilateral && '(Unilateral)'}</Text>
                {skipped > 0 && <Text style={{ color: colors.error, fontSize: 13, marginTop: 2 }}>⏭ Rondas saltadas: {skipped}</Text>}
                {note ? <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginTop: 2 }}>📝 Nota: {note}</Text> : null}
                {vid ? <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700', marginTop: 2 }}>📹 Video técnico guardado</Text> : null}
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
        const vid = recordedVideos[i.toString()];
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
            {vid && <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 6 }}>📹 Video técnico guardado</Text>}
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
  if (!workout) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: colors.textPrimary }}>No encontrado.</Text></SafeAreaView>;

  let main;
  if (finished || workout.completed) {
    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}><TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity><Text style={[styles.topTitle, { color: colors.textPrimary }]}>Resumen</Text><View style={{ width: 26 }} /></View>
          <ScrollView contentContainerStyle={[styles.content, { alignItems: 'center', paddingVertical: 40 }]} keyboardShouldPersistTaps="handled">
            <View style={styles.finishedIconContainer}><Ionicons name="trophy" size={80} color={colors.warning || '#F59E0B'} /></View>
            <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>¡Entrenamiento completado!</Text>
            
            <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '900', marginTop: 10, marginBottom: 20 }}>
              ⏱ Tiempo Total: {formatGlobalTime(globalSeconds)}
            </Text>

            <Text style={[styles.finishedSubtitle, { color: colors.textSecondary }]}>¿Cómo te has sentido hoy?</Text>
            
            {!workout.completed && (
              <View style={{ width: '100%', gap: 24, marginTop: 10 }}>
                <View><Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>NIVEL DE ESFUERZO (RPE)</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => { const isSelected = rpe === num; let c = (num >= 8) ? (colors.error || '#EF4444') : (num >= 4) ? (colors.warning || '#F59E0B') : (colors.success || '#10B981'); return ( <TouchableOpacity key={num} onPress={() => setRpe(num)} style={[styles.rpeCircle, { borderColor: colors.border }, isSelected && { backgroundColor: c, borderColor: c }]}><Text style={[styles.rpeText, { color: isSelected ? '#FFF' : colors.textSecondary }]}>{num}</Text></TouchableOpacity> ); })}</View>
                </View>
                <View><Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>CALIDAD DEL SUEÑO</Text><View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>{[1, 2, 3, 4, 5].map(num => ( <TouchableOpacity key={num} onPress={() => setSleepQuality(num)} style={{ padding: 5 }}><Ionicons name={sleepQuality && sleepQuality >= num ? "star" : "star-outline"} size={36} color={colors.warning || '#F59E0B'} /></TouchableOpacity> ))}</View></View>
                
                <View>
                  <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>FATIGA O IMPACTO</Text>
                  <View style={{ width: '100%', backgroundColor: colors.surfaceHighlight, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: soreJoints.length > 0 ? (colors.error || '#EF4444') : colors.border }}>
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

            <View style={{ width: '100%', marginTop: 30 }}>
              <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 15, textAlign: 'center' }]}>RESUMEN DE EJERCICIOS</Text>
              {renderSessionSummary()}
            </View>

            {workout.completed && workout.completion_data && (
              <View style={{ width: '100%', marginTop: 20, backgroundColor: colors.surfaceHighlight, padding: 20, borderRadius: 16 }}>
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

    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => { stopAllTimers(); router.back(); }}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 10 }}>
              <Text style={[styles.topTitle, { color: colors.textPrimary }]} numberOfLines={1}>{workout.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {formatGlobalTime(globalSeconds)}
                </Text>
              </View>
            </View>
            <Text style={[styles.topProgress, { color: colors.textSecondary }]}>B{hiitBlockIdx + 1}/{workout.exercises.length}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {renderFatigueToggle()}
            
            <UnifiedTimer 
              isPrep={isPrep} isResting={isRestingStatus} isWorking={isWorking} isPaused={isPaused} 
              prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds} 
              restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds} 
              exName={timerExName} colors={colors} isHiit={isHiit} 
              reps={displayHiitReps} sets={currentEx?.sets} 
              onTogglePause={togglePause} onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }} 
              onSkipRest={skipHiitRest} onResetWork={resetWorkTimer} onResetRest={resetRestTimer} 
              onComplete={advanceHiit} onSkip={skipHiitEx} 
            />
            
            <HiitCard currentBlock={displayBlock} hiitRound={hiitRound} hiitPhase={hiitPhase} hiitExIdx={hiitExIdx} hiitBlockIdx={hiitBlockIdx} hiitExSet={hiitExSet} hiitSide={hiitSide} colors={colors} hiitLogs={hiitLogs} setHiitLogs={setHiitLogs} recordedVideos={recordedVideos} handleRecordVideoOptions={handleRecordVideoOptions} videoUploading={videoUploading} renderVideoPlayer={(u: string) => <MiniVideoPlayer url={u} onExpand={setExpandedVideo} />} onAdvanceHiit={advanceHiit} onSkipHiitEx={skipHiitEx} />
          </ScrollView>
          <TouchableOpacity style={[styles.floatingInfoBtn, { backgroundColor: colors.primary, bottom: 30 }]} onPress={() => setShowIndicationsModal(true)}>
            <Ionicons name="list" size={24} color="#FFF" />
          </TouchableOpacity>
        </KeyboardAvoidingView>
        {renderVideoModal()}{renderIndicationsModal()}
      </SafeAreaView>
    );
  } else {
    const ex = workout.exercises[currentExIndex];
    if (!ex) return <ActivityIndicator color={colors.primary} />;
    const s = setsStatus[currentExIndex] || []; const prog = ((currentExIndex) / workout.exercises.length) * 100;

    let displayExName = ex?.name;
    if (ex?.is_unilateral) displayExName += tradSide === 1 ? ' (Lado 1)' : ' (Lado 2)';
    if (isRestingStatus) {
      if (restType === 'exercise' && currentExIndex < workout.exercises.length - 1) { displayExName = `Siguiente: ${workout.exercises[currentExIndex + 1]?.name}`; } 
      else { const comp = s.filter(x => x === 'completed').length; displayExName = `Siguiente: ${ex?.name} (Serie ${comp + 1})`; }
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

    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => { stopAllTimers(); router.back(); }}>
              <Ionicons name="close" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 10 }}>
              <Text style={[styles.topTitle, { color: colors.textPrimary }]} numberOfLines={1}>{workout.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 }}>
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {formatGlobalTime(globalSeconds)}
                </Text>
              </View>
            </View>
            <Text style={[styles.topProgress, { color: colors.textSecondary }]}>{currentExIndex + 1}/{workout.exercises.length}</Text>
          </View>

          <View style={[styles.progressBar, { backgroundColor: colors.surfaceHighlight }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${prog}%` }]} /></View>
          
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {renderFatigueToggle()}
            
            <UnifiedTimer 
              isPrep={isPrep} isResting={isRestingStatus} isWorking={isWorking} isPaused={isPaused} 
              prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds} 
              restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds} 
              exName={displayExName} colors={colors} isHiit={false} 
              reps={displayReps} sets={ex.sets}
              onTogglePause={togglePause} onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }} 
              onSkipRest={skipTradRest} onResetWork={resetWorkTimer} onResetRest={resetRestTimer} 
              onComplete={completeSet} onSkip={skipSet} 
            />
            
            <View style={[styles.compactExerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.compactExHeader, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.compactExName, { color: colors.textPrimary }]}>{ex.name}</Text>{vidUrl && <TouchableOpacity onPress={() => Linking.openURL(vidUrl)}><Ionicons name="logo-youtube" size={28} color="#EF4444" /></TouchableOpacity>}</View>
              
              <View style={styles.compactDetailsGrid}>
                {['sets', 'reps', 'weight', 'duration', 'rest'].map(k => {
                  let val = ex[k];
                  if (!val) return null;
                  
                  if (isFatigueMode) {
                    if (k === 'reps') val = adjustReps(val);
                    if (k === 'duration') val = adjustDurationStr(val);
                  }
                  
                  return (
                    <View key={k} style={styles.compactDetailItem}>
                      <Text style={[styles.compactDetailLabel, { color: colors.textSecondary }]}>{k === 'sets' ? 'Series' : k === 'weight' ? 'Kg' : k === 'rest' ? 'Desc.' : k}</Text>
                      <Text style={[styles.compactDetailValue, { color: colors.textPrimary }]}>{val}</Text>
                    </View>
                  )
                })}
              </View>
              
              {notesText && (
                 <View style={{ padding: 16, paddingTop: 0, backgroundColor: colors.surface }}>
                    <View style={{ flexDirection: 'row', backgroundColor: colors.background, padding: 10, borderRadius: 8 }}>
                       <Ionicons name="information-circle" size={18} color={colors.textSecondary} />
                       <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginLeft: 8, flex: 1 }}>{notesText}</Text>
                    </View>
                 </View>
              )}
            </View>
            
            <View style={[styles.setsCard, { backgroundColor: colors.surface }]}>
              <View style={styles.setsGrid}>{s.map((st, i) => ( <View key={i} style={[styles.setCircle, { borderColor: colors.border }, st === 'completed' && { backgroundColor: colors.success, borderColor: colors.success }, st === 'skipped' && { backgroundColor: colors.error, borderColor: colors.error }]}>{st === 'completed' ? <Ionicons name="checkmark" size={18} color="#FFF" /> : <Text style={{ color: colors.textSecondary }}>{i + 1}</Text>}</View> ))}</View>
              <TouchableOpacity style={[styles.recordBtn, { marginTop: 20, borderColor: colors.border }]} onPress={() => handleRecordVideoOptions(currentExIndex.toString())}><Ionicons name="videocam" size={20} color={colors.primary} /><Text style={{ color: colors.primary, marginLeft: 8, fontWeight: '700' }}>Grabar técnica</Text></TouchableOpacity>
            </View>

            <View style={[styles.activeLogContainer, { backgroundColor: colors.surface, padding: 20, borderRadius: 16 }]}>
               <View style={{ flexDirection: 'row', width: '100%' }}>
                 <TextInput 
                    style={[styles.logInput, { borderColor: colors.border, flex: 1, backgroundColor: colors.background, color: colors.textPrimary, marginRight: 6 }]} 
                    placeholder="Kilos" 
                    placeholderTextColor={colors.textSecondary} 
                    keyboardType="numeric" 
                    value={logs[currentExIndex]?.weight || ''} 
                    onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], weight: t}}))} 
                 />
                 <TextInput 
                    style={[styles.logInput, { borderColor: colors.border, flex: 1, backgroundColor: colors.background, color: colors.textPrimary, marginLeft: 6 }]} 
                    placeholder="Reps" 
                    placeholderTextColor={colors.textSecondary} 
                    keyboardType="numeric" 
                    value={logs[currentExIndex]?.reps || ''} 
                    onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], reps: t}}))} 
                 />
               </View>
               <TextInput 
                  style={[styles.logInput, { borderColor: colors.border, marginTop: 12, minHeight: 60, backgroundColor: colors.background, color: colors.textPrimary, width: '100%' }]} 
                  multiline 
                  placeholder="Anotaciones de la serie..." 
                  placeholderTextColor={colors.textSecondary} 
                  value={logs[currentExIndex]?.note || ''} 
                  onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], note: t}}))} 
               />
            </View>
          </ScrollView>
          
          <View style={{ position: 'absolute', right: 20, bottom: 100, gap: 15 }}>
            {showCalculatorButton && (
              <TouchableOpacity style={[styles.floatingInfoBtn, { position: 'relative', right: 0, bottom: 0, backgroundColor: colors.textPrimary }]} onPress={() => openPlateCalculator(isLandmineExercise)}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: colors.background }}>?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.floatingInfoBtn, { position: 'relative', right: 0, bottom: 0, backgroundColor: colors.primary }]} onPress={() => setShowIndicationsModal(true)}>
              <Ionicons name="list" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}><TouchableOpacity onPress={() => { if(currentExIndex>0) { stopAllTimers(); setCurrentExIndex(currentExIndex-1); } }}><Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Anterior</Text></TouchableOpacity><TouchableOpacity onPress={() => { stopAllTimers(); setTradSide(1); if(currentExIndex < workout.exercises.length-1) setCurrentExIndex(currentExIndex+1); else { setFinished(true); } }}><Text style={{ color: colors.primary, fontWeight: '700' }}>{currentExIndex < workout.exercises.length - 1 ? 'Siguiente' : 'Terminar'}</Text></TouchableOpacity></View>
        </KeyboardAvoidingView>
        {renderVideoModal()}{renderIndicationsModal()}{renderPlateCalculatorModal()}
      </SafeAreaView>
    );
  }
  return main;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }, topTitle: { fontSize: 16, fontWeight: '700' }, topProgress: { fontSize: 14, fontWeight: '600' }, progressBar: { height: 4, marginHorizontal: 16, borderRadius: 2, backgroundColor: '#EEE' }, progressFill: { height: '100%', borderRadius: 2 }, content: { padding: 20, paddingBottom: 100, gap: 16 },
  compactExerciseCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' }, compactExHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }, compactExName: { fontSize: 18, fontWeight: '800', flex: 1 }, compactDetailsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 10 }, compactDetailItem: { minWidth: '28%' }, compactDetailLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 }, compactDetailValue: { fontSize: 17, fontWeight: '700' },
  setsCard: { borderRadius: 16, padding: 20 }, setsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, setCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' }, recordBtn: { borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderTopWidth: 0.5, paddingBottom: 35 },
  activeLogContainer: { width: '100%' }, logInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  finishedIconContainer: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.1)' }, finishedTitle: { fontSize: 26, fontWeight: '900', textAlign: 'center' }, finishedSubtitle: { fontSize: 15, textAlign: 'center', marginBottom: 20 }, finishWorkoutBtn: { padding: 18, borderRadius: 16, alignItems: 'center', width: '100%', marginTop: 20 }, finishWorkoutBtnText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }, rpeCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }, rpeText: { fontSize: 12, fontWeight: '700' }, sleepPill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 }, sleepPillText: { fontSize: 13, fontWeight: '600' }, obsInput: { borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 100, fontSize: 15, textAlignVertical: 'top' },
  summaryCard: { padding: 16, borderRadius: 16, marginBottom: 12, width: '100%' },
  miniVideoContainer: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }, miniVideo: { width: '100%', height: '100%' }, expandBtn: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', padding: 4, borderRadius: 10 }, fullscreenVideoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' }, fullVideo: { width: '100%', height: '80%' }, closeModalBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }, indicationsModalContent: { width: '85%', padding: 24, borderRadius: 24 },
  floatingInfoBtn: { position: 'absolute', right: 20, bottom: 100, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4.65, zIndex: 100 },
  painButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 }, painButtonText: { fontSize: 13, fontWeight: '600' },
  barTypeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderWidth: 2, borderRadius: 12 },
  barSleeveContainer: { height: 180, width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  barSleeve: { position: 'absolute', height: 20, width: '100%', borderRadius: 4 },
  stackedPlatesContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stackedPlate: { borderRadius: 4, marginHorizontal: 1, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 4 },
  legendPlate: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 },
  fatigueToggle: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', marginBottom: 10, justifyContent: 'center' },
  fatigueToggleActive: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#EF4444' }
});
