import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput, Alert, Platform, Modal, Dimensions,
  UIManager, LayoutAnimation
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, Audio } from 'expo-av';
import * as Speech from 'expo-speech';
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

// Activar animaciones de Layout en Android
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
  
  const [globalSeconds, setGlobalSeconds] = useState(0);
  const globalTimerRef = useRef<any>(null);

  const [prepTargetTime, setPrepTargetTime] = useState<number | null>(null);
  const [prepSeconds, setPrepSeconds] = useState(0);
  const [isPrep, setIsPrep] = useState(false);
  const prepIntervalRef = useRef<any>(null);

  const [restTargetTime, setTargetTime] = useState<number | null>(null);
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

  const beepSoundRef = useRef<Audio.Sound | null>(null);
  const finishSoundRef = useRef<Audio.Sound | null>(null);
  
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);

  const lastAnnouncedRef = useRef<string>('');
  const justFinishedRestRef = useRef(false);

  // --- ESTADOS DE LA CALCULADORA DE DISCOS ---
  const [showPlateCalculator, setShowPlateCalculator] = useState(false);
  const [platesOnBar, setPlatesOnBar] = useState<number[]>([]);
  const [barWeight, setBarWeight] = useState(20);
  const [isLandmineMode, setIsLandmineMode] = useState(false);
  const [athleteHeight, setAthleteHeight] = useState('170'); // en cm

  useFocusEffect(
    useCallback(() => {
      const loadPreferences = async () => {
        try {
          const [v, s] = await Promise.all([ AsyncStorage.getItem('voice_enabled'), AsyncStorage.getItem('sounds_enabled') ]);
          setVoiceEnabled(v !== 'false'); 
          setSoundsEnabled(s !== 'false'); 
        } catch (e) { console.log("⚠️ Error cargando preferencias:", e); }
      };
      loadPreferences();
    }, [])
  );

  const announce = async (text: string) => {
    if (!voiceEnabled || finished || workout?.completed) return; 
    try {
      Speech.stop(); 
      Speech.speak(text, { language: 'es-ES', rate: 0.95 });
    } catch (e) { console.log("⚠️ Error Speech:", e); }
  };

  useEffect(() => {
    let beepSound: Audio.Sound | null = null;
    let finishSound: Audio.Sound | null = null;

    async function initAudio() {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
        const { sound: beep } = await Audio.Sound.createAsync(require('../assets/beep.mp3'));
        const { sound: finish } = await Audio.Sound.createAsync(require('../assets/finish.mp3'));
        beepSoundRef.current = beep; finishSoundRef.current = finish;
        beepSound = beep; finishSound = finish;
      } catch (e) { console.log("Error cargando audios:", e); }
    }
    initAudio();

    return () => {
      if (beepSound) beepSound.unloadAsync();
      if (finishSound) finishSound.unloadAsync();
      try { Speech.stop(); } catch(e) {} 
    };
  }, []);

  const playSound = async (type: 'beep' | 'finish') => {
    if (!soundsEnabled || finished) return;
    try {
      if (Platform.OS !== 'web') {
        if (type === 'beep') { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } 
        else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
      }
      const soundObj = type === 'beep' ? beepSoundRef.current : finishSoundRef.current;
      if (soundObj) {
        await soundObj.setPositionAsync(0);
        await soundObj.playAsync(); 
      }
    } catch (error) { console.log("Error al reproducir audio:", error); }
  };

  const togglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      if (isPrep && prepSeconds > 0) setPrepTargetTime(Date.now() + prepSeconds * 1000);
      if (isResting && restSeconds > 0) setTargetTime(Date.now() + restSeconds * 1000);
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

  const startPrepTimer = (workDur: number, exName?: string) => {
    stopAllTimers(); setIsPrep(true); setPrepSeconds(5); setPrepTargetTime(Date.now() + 5000);
    setWorkTotalSeconds(workDur); setWorkSeconds(workDur);
    if (exName) announce(`Siguiente: ${exName}. Prepárate.`);
    else announce("Prepárate.");
  };

  const handleStartWork = (dur: number, name?: string) => {
    const isFirst = (!isHiit && currentExIndex === 0 && setsStatus[0]?.findIndex(s => s === 'pending') === 0) ||
                    (isHiit && hiitBlockIdx === 0 && hiitExIdx === 0 && hiitRound === 1 && hiitExSet === 1);

    if (isFirst || !justFinishedRestRef.current) {
      startPrepTimer(dur, name);
    } else {
      stopAllTimers();
      setIsWorking(true);
      setWorkTotalSeconds(dur);
      setWorkSeconds(dur);
      if (dur > 0) setWorkTargetTime(Date.now() + dur * 1000);
      else setWorkTargetTime(null);
      if (name) announce(`A por ello: ${name}`);
    }
    justFinishedRestRef.current = false;
  };

  const startWorkTimerAfterPrep = () => {
    setIsWorking(true); setIsPaused(false);
    if (workTotalSeconds > 0) { setWorkTargetTime(Date.now() + workTotalSeconds * 1000); } 
    else { setWorkTargetTime(null); }
  };

  const startRestTimer = (seconds: number, nextExName?: string) => {
    stopAllTimers(); setTargetTime(Date.now() + seconds * 1000);
    setRestSeconds(seconds); setRestTotalSeconds(seconds); setIsResting(true);
    if (nextExName) announce(`Descanso. Siguiente: ${nextExName}`);
    else announce("Descanso.");
  };

  const resetWorkTimer = () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); setIsPaused(false); setWorkTargetTime(Date.now() + workTotalSeconds * 1000); setWorkSeconds(workTotalSeconds); setIsWorking(true); };
  const resetRestTimer = () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); setIsPaused(false); setTargetTime(Date.now() + restTotalSeconds * 1000); setRestSeconds(restTotalSeconds); setIsResting(true); };

  const handleWorkComplete = () => { stopWorkTimer(); if (isHiit) advanceHiitLogic(); else completeSet(); };

  useEffect(() => { if (isPrep && prepSeconds > 0 && prepSeconds <= 3 && !isPaused) playSound('beep'); }, [prepSeconds, isPrep, isPaused]);
  useEffect(() => { if (isWorking && workSeconds > 0 && workSeconds <= 5 && !isPaused) playSound('beep'); }, [workSeconds, isWorking, isPaused]);
  useEffect(() => { if (isResting && restSeconds > 0 && restSeconds <= 5 && !isPaused) playSound('beep'); }, [restSeconds, isResting, isPaused]);

  useEffect(() => {
    if (showIndicationsModal || !workout || isResting || finished || workout.completed || isPrep) return;
    let text = ""; let id = "";
    if (isHiit) {
      const b = workout.exercises[hiitBlockIdx]; const ex = b?.hiit_exercises?.[hiitExIdx];
      if (ex) { 
        id = `hiit-${hiitBlockIdx}-${hiitRound}-${hiitExIdx}-${hiitExSet}`; 
        text = ex.name + (parseInt(ex.sets) > 1 ? ` serie ${hiitExSet}` : ''); 
      }
    } else {
      const ex = workout.exercises[currentExIndex];
      if (ex) { const s = setsStatus[currentExIndex] || []; const next = s.findIndex(i => i === 'pending'); if (next !== -1) { id = `trad-${currentExIndex}`; text = ex.name; } }
    }
    if (text && lastAnnouncedRef.current !== id) { announce(text); lastAnnouncedRef.current = id; }
  }, [currentExIndex, hiitBlockIdx, hiitExIdx, hiitRound, hiitExSet, isResting, isPrep, showIndicationsModal, setsStatus, workout, isHiit, finished]);

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
              
              if (currentWorkout.completion_data.duration_seconds) {
                setGlobalSeconds(currentWorkout.completion_data.duration_seconds);
              }

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
    };
  }, [workout, finished, isPaused]);

  useEffect(() => {
    if (isPrep && prepTargetTime) {
      prepIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((prepTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { playSound('finish'); stopPrepTimer(); startWorkTimerAfterPrep(); } 
        else { setPrepSeconds(remaining); }
      }, 1000);
    }
    return () => { if (prepIntervalRef.current) clearInterval(prepIntervalRef.current); };
  }, [isPrep, prepTargetTime]);

  useEffect(() => {
    if (isResting && restTargetTime) {
      restIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((restTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { 
          playSound('finish'); 
          justFinishedRestRef.current = true;
          stopRestTimer(); 
        } 
        else { setRestSeconds(remaining); }
      }, 1000);
    }
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
  }, [isResting, restTargetTime]);

  useEffect(() => {
    if (isWorking && workTargetTime) {
      workIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((workTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { playSound('finish'); handleWorkComplete(); } 
        else { setWorkSeconds(remaining); }
      }, 1000);
    }
    return () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); };
  }, [isWorking, workTargetTime]);

  useEffect(() => {
    if (finished || workout?.completed) return;
    if (!isHiit && workout && !isResting && !isPrep && !showIndicationsModal) {
      const s = setsStatus[currentExIndex] || []; const next = s.findIndex(i => i === 'pending');
      if (next !== -1) {
        const ex = workout.exercises[currentExIndex]; const dur = parseTimeToSeconds(ex?.duration);
        if (!isWorking && workTargetTime === null && workSeconds === 0) { 
          handleStartWork(dur, ex.name); 
        }
      } else { stopWorkTimer(); }
    }
  }, [currentExIndex, setsStatus, isResting, workout, isHiit, isPrep, isWorking, workTargetTime, workSeconds, showIndicationsModal, finished]);

  useEffect(() => {
    if (finished || workout?.completed) return;
    if (isHiit && workout && hiitPhase === 'work' && !isResting && !isPrep && !showIndicationsModal) {
      const b = workout.exercises[hiitBlockIdx]; if (!b) return;
      const ex = b.hiit_exercises[hiitExIdx]; const dur = parseTimeToSeconds(ex?.duration_reps || ex?.duration);
      if (!isWorking && workTargetTime === null && workSeconds === 0) { 
         handleStartWork(dur, ex.name); 
      }
    }
  }, [hiitBlockIdx, hiitExIdx, hiitExSet, hiitPhase, isResting, workout, isHiit, isPrep, isWorking, workTargetTime, workSeconds, showIndicationsModal, finished]);

  useEffect(() => {
    if (finished || workout?.completed) return;
    if (!isResting && workout && !showIndicationsModal && !isPaused) {
      if (isHiit) {
        if (hiitPhase === 'rest_set') { setHiitPhase('work'); setHiitExSet(prev => prev + 1); }
        else if (hiitPhase === 'rest_ex') { setHiitPhase('work'); setHiitExIdx(prev => prev + 1); setHiitExSet(1); } 
        else if (hiitPhase === 'rest_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitExSet(1); setHiitRound(prev => prev + 1); } 
        else if (hiitPhase === 'rest_next_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitExSet(1); setHiitRound(1); setHiitBlockIdx(prev => prev + 1); }
      } else { if (restType === 'exercise') { autoAdvance(currentExIndex); setRestType(null); } }
    }
  }, [isResting, showIndicationsModal, finished, workout, isPaused]);

  const advanceHiitLogic = (skipEx = false) => {
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const b = workout.exercises[hiitBlockIdx]; 
    const ex = b.hiit_exercises[hiitExIdx];
    const totalEx = b.hiit_exercises.length; 
    const totalRounds = parseInt(b.sets) || 1;
    const totalExSets = parseInt(ex?.sets) || 1;

    if (!skipEx && hiitExSet < totalExSets) {
      const rest = parseTimeToSeconds(b.rest_exercise);
      if (rest > 0) { startRestTimer(rest, `${ex.name} (Serie ${hiitExSet + 1})`); setHiitPhase('rest_set'); }
      else { setHiitExSet(hiitExSet + 1); setHiitPhase('work'); }
    } else if (hiitExIdx < totalEx - 1) {
      const rest = parseTimeToSeconds(b.rest_exercise);
      if (rest > 0) { startRestTimer(rest, b.hiit_exercises[hiitExIdx + 1].name); setHiitPhase('rest_ex'); } 
      else { setHiitExIdx(hiitExIdx + 1); setHiitExSet(1); setHiitPhase('work'); }
    } else {
      if (hiitRound < totalRounds) {
        const rest = parseTimeToSeconds(b.rest_block);
        if (rest > 0) { startRestTimer(rest, b.hiit_exercises[0].name); setHiitPhase('rest_block'); } 
        else { setHiitRound(hiitRound + 1); setHiitExIdx(0); setHiitExSet(1); setHiitPhase('work'); }
      } else {
        if (hiitBlockIdx < workout.exercises.length - 1) {
          const rest = parseTimeToSeconds(b.rest_between_blocks);
          if (rest > 0) { startRestTimer(rest, workout.exercises[hiitBlockIdx + 1].hiit_exercises[0].name); setHiitPhase('rest_next_block'); } 
          else { setHiitBlockIdx(hiitBlockIdx + 1); setHiitRound(1); setHiitExIdx(0); setHiitExSet(1); setHiitPhase('work'); }
        } else { Speech.stop(); setFinished(true); }
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
  const autoAdvance = (exIdx: number) => { stopAllTimers(); if (exIdx < (workout.exercises?.length || 0) - 1) setTimeout(() => setCurrentExIndex(exIdx + 1), 400); else { Speech.stop(); setTimeout(() => setFinished(true), 400); } };

  const completeSet = () => {
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const exercises = workout.exercises || []; const currentEx = exercises[currentExIndex]; const s = setsStatus[currentExIndex] || [];
    const next = s.findIndex(i => i === 'pending'); if (next === -1) return;
    updateSetStatus(currentExIndex, next, 'completed');
    const rem = s.filter((item, i) => i !== next && item === 'pending').length;
    if (rem === 0) {
      const rest = parseTimeToSeconds(currentEx?.rest_exercise);
      if (rest > 0 && currentExIndex < exercises.length - 1) { startRestTimer(rest, exercises[currentExIndex + 1].name); setRestType('exercise'); } 
      else { autoAdvance(currentExIndex); }
    } else {
      const rest = parseTimeToSeconds(currentEx?.rest);
      if (rest > 0) { startRestTimer(rest, currentEx.name); setRestType('set'); }
    }
  };

  const skipSet = () => { stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); const s = setsStatus[currentExIndex] || []; const next = s.findIndex(i => i === 'pending'); if (next === -1) return; updateSetStatus(currentExIndex, next, 'skipped'); if (s.filter((item, i) => i !== next && item === 'pending').length === 0) autoAdvance(currentExIndex); };
  const skipEntireExercise = () => { stopAllTimers(); setSetsStatus(prev => { const updated = { ...prev }; updated[currentExIndex] = (updated[currentExIndex] || []).map(item => item === 'pending' ? 'skipped' : item); return updated; }); autoAdvance(currentExIndex); };

  const handleRecordVideoOptions = (key: string) => { if (Platform.OS === 'web') { launchVideoPicker('library', key); return; } Alert.alert("Subir Técnica", "¿Cómo quieres subir el vídeo?", [ { text: "Cancelar", style: "cancel" }, { text: "Galería", onPress: () => launchVideoPicker('library', key) }, { text: "Grabar", onPress: () => launchVideoPicker('camera', key) } ]); };
  const launchVideoPicker = async (source: 'camera' | 'library', key: string) => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync(); if (status !== 'granted') return;
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 60, quality: 0.7 });
      } else { result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, quality: 0.7 }); }
      if (result.canceled || !result.assets) return;
      setVideoUploading(key); const asset = result.assets[0]; const uploaded = await api.uploadFile(asset);
      const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || asset.uri);
      setRecordedVideos(prev => ({ ...prev, [key]: finalUrl }));
    } catch (e) { console.error(e); } finally { setVideoUploading(null); }
  };

  const buildCompletionData = () => {
    if (isHiit) { return { duration_seconds: globalSeconds, rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours, sore_joints: soreJoints, hiit_completed: true, hiit_results: (workout.exercises || []).map((b: any, bIdx: number) => ({ ...b, hiit_exercises: b.hiit_exercises.map((ex: any, eIdx: number) => ({ ...ex, skipped_rounds: hiitSkipped[`${bIdx}-${eIdx}`] || 0, recorded_video_url: recordedVideos[`${bIdx}-${eIdx}`] || '', athlete_note: hiitLogs[`${bIdx}-${eIdx}`]?.note || '' })) })) }; }
    return { duration_seconds: globalSeconds, rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours, sore_joints: soreJoints, exercise_results: (workout.exercises || []).map((ex: any, i: number) => { const s = setsStatus[i] || []; return { exercise_index: i, name: ex.name, total_sets: parseInt(ex.sets) || 1, completed_sets: s.filter(item => item === 'completed').length, skipped_sets: s.filter(item => item === 'skipped').length, set_details: s.map((status, si) => ({ set: si + 1, status })), logged_weight: logs[i]?.weight || '', logged_reps: logs[i]?.reps || '', athlete_note: logs[i]?.note || '', recorded_video_url: recordedVideos[i.toString()] || '' }; }), };
  };

  const handleFinish = async () => { if (workout.completed) { router.back(); return; } if (!stableWorkoutId) return; stopAllTimers(); const data = buildCompletionData(); try { const update: any = { completed: true, completion_data: data, title: workout.title, exercises: workout.exercises }; if (observations.trim()) update.observations = observations.trim(); const net = await NetInfo.fetch(); if (net.isConnected) { await api.updateWorkout(stableWorkoutId, update); syncManager.syncPendingWorkouts(); } else { await syncManager.savePendingWorkout(stableWorkoutId, update); } router.back(); } catch (e) { console.error(e); } };

  // --- LÓGICA DE LA CALCULADORA DE DISCOS ---
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
    
    // Comprobamos si es landmine manual o auto-detectado
    const currentEx = workout?.exercises?.[currentExIndex];
    const isAutoLandmine = /landmine|t-bar|t bar|mina/i.test(currentEx?.name || '');
    const activeLandmine = isLandmineMode || isAutoLandmine;
    
    if (!activeLandmine) {
      return barWeight + (platesTotal * 2);
    } else {
      // Trigonometría Landmine
      const L = 220; // Longitud barra en cm
      const h_athlete = parseInt(athleteHeight) || 170;
      const h_grip = h_athlete * 0.8; // Asumimos agarre al 80% de la altura
      
      let effectiveWeight = 0;
      if (h_grip < L) {
        const theta_rad = Math.asin(h_grip / L);
        const forceFactor = Math.cos(theta_rad);
        const actualLoad = (barWeight / 2) + platesTotal;
        effectiveWeight = actualLoad * forceFactor;
      } else {
        effectiveWeight = (barWeight / 2) + platesTotal; // Tope
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
    setBarWeight(20);
    setShowPlateCalculator(true);
  };

const renderPlateCalculatorModal = () => {
    // Detectamos automáticamente si el ejercicio actual es de tipo Landmine
    const currentEx = workout?.exercises?.[currentExIndex];
    const isAutoLandmine = /landmine|t-bar|t bar|mina/i.test(currentEx?.name || '');

    return (
      <Modal visible={showPlateCalculator} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.indicationsModalContent, { backgroundColor: colors.surface, maxHeight: '90%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>Calculadora de Carga</Text>
              <TouchableOpacity onPress={() => setShowPlateCalculator(false)}>
                <Ionicons name="close" size={28} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Opciones de Barra */}
              <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 10 }]}>TIPO DE BARRA</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {[20, 15].map(w => (
                  <TouchableOpacity 
                    key={w} 
                    onPress={() => setBarWeight(w)}
                    style={[styles.barTypeBtn, { borderColor: barWeight === w ? colors.primary : colors.border, flex: 1, alignItems: 'center' }]}
                  >
                    <Text style={{ color: barWeight === w ? colors.primary : colors.textSecondary, fontWeight: '800' }}>{w}kg</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Modo Landmine Inteligente */}
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

              {/* Muestra los cálculos si es Landmine (ya sea manual o auto-detectado) */}
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

              {/* Representación Visual de la Barra */}
              <View style={{ alignItems: 'center', marginVertical: 30 }}>
                 <Text style={{ fontSize: 40, fontWeight: '900', color: colors.primary, marginBottom: 5 }}>
                   {calculateTotalWeight().toFixed(1)} <Text style={{ fontSize: 20, color: colors.textSecondary }}>kg</Text>
                 </Text>
                 {(isLandmineMode || isAutoLandmine) && <Text style={{ color: colors.warning, fontWeight: '700', fontSize: 12, marginBottom: 15 }}>CARGA EFECTIVA</Text>}

                 <View style={styles.barSleeveContainer}>
                    {/* Manga de la barra */}
                    <View style={[styles.barSleeve, { backgroundColor: '#CBD5E1' }]} />
                    {/* Topes si no hay discos */}
                    {platesOnBar.length === 0 && <Text style={{ position: 'absolute', color: '#94A3B8', fontSize: 12, top: -25 }}>Vacía</Text>}
                    
                    {/* Discos Apilados */}
                    <View style={styles.stackedPlatesContainer}>
                      {platesOnBar.map((weight, index) => {
                        const height = 120 + (weight * 2);
                        const width = weight > 10 ? 25 : 15;
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
                 <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 15 }}>Toca un disco en la barra para quitarlo</Text>
              </View>

              {/* Leyenda de Discos (Tap to Add) */}
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
            return (
              <View key={eIdx} style={{ paddingLeft: 10, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '500' }}>• {ex.name}</Text>
                  <Text style={{ color: colors.primary, fontWeight: '800', marginLeft: 10 }}>
                    {hasSets ? `${ex.sets}x ` : ''}{ex.duration_reps || ex.duration || '-'}
                  </Text>
                </View>
                {ex.exercise_notes ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 2, marginLeft: 10 }}>
                    Nota: {ex.exercise_notes}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      ));
    } else {
      return workout.exercises.map((ex: any, idx: number) => (
        <View key={idx} style={{ marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.textPrimary, flex: 1, fontWeight: '600', paddingRight: 10 }}>
              <Text style={{ color: colors.textSecondary }}>{idx + 1}.</Text> {ex.name}
            </Text>
            <View style={{ alignItems: 'flex-end' }}>
              {(ex.sets && ex.reps) ? (
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{ex.sets} x {ex.reps}</Text>
              ) : null}
              {ex.duration ? (
                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{ex.duration}</Text>
              ) : null}
            </View>
          </View>
          {ex.exercise_notes && <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>Nota: {ex.exercise_notes}</Text>}
        </View>
      ));
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
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{ex.name}</Text>
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
            <Text style={{ fontWeight: '900', color: colors.textPrimary, fontSize: 15 }}>{i + 1}. {ex.name}</Text>
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
            {log?.note && (
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontStyle: 'italic', marginTop: 6 }}>📝 Nota: {log.note}</Text>
            )}
            {vid && (
              <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 6 }}>📹 Video técnico guardado</Text>
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
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); 
    }
    setSoreJoints(prev => prev.includes(slug) ? prev.filter(j => j !== slug) : [...prev, slug]); 
  };

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;
  if (!workout) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: colors.textPrimary }}>No encontrado.</Text></SafeAreaView>;

  let main;
  if (finished || workout.completed) {
    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}><TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity><Text style={[styles.topTitle, { color: colors.textPrimary }]}>Resumen</Text><View style={{ width: 26 }} /></View>
        <ScrollView contentContainerStyle={[styles.content, { alignItems: 'center', paddingVertical: 40 }]}>
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
        {renderVideoModal()}
      </SafeAreaView>
    );
  } else if (isHiit) {
    const b = workout.exercises?.[hiitBlockIdx];
    if (!b) return <ActivityIndicator color={colors.primary} />;
    
    const currentEx = b.hiit_exercises[hiitExIdx];
    const hasMultipleSets = parseInt(currentEx?.sets) > 1;
    
    let timerExName = hasMultipleSets ? `${currentEx?.name} (Serie ${hiitExSet}/${currentEx?.sets})` : currentEx?.name || 'HIIT';
    
    if (isResting) {
      if (hiitPhase === 'rest_set') {
        timerExName = `Siguiente: ${currentEx?.name} (Serie ${hiitExSet + 1})`;
      } else if (hiitPhase === 'rest_ex') {
        timerExName = `Siguiente: ${b.hiit_exercises[hiitExIdx + 1]?.name}`;
      } else if (hiitPhase === 'rest_block') {
        timerExName = `Siguiente: ${b.hiit_exercises[0]?.name} (Vuelta ${hiitRound + 1})`;
      } else if (hiitPhase === 'rest_next_block') {
        const nextBlock = workout.exercises[hiitBlockIdx + 1];
        timerExName = `Siguiente: ${nextBlock?.name}`;
      }
    } else if (isPrep) {
      timerExName = `Prep: ${currentEx?.name}`;
    }

    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        
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

        <ScrollView contentContainerStyle={styles.content}>
          <UnifiedTimer isPrep={isPrep} isResting={isResting} isWorking={isWorking} isPaused={isPaused} prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds} restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds} exName={timerExName} colors={colors} isHiit={isHiit} onTogglePause={togglePause} onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }} onSkipRest={skipHiitRest} onResetWork={resetWorkTimer} onResetRest={resetRestTimer} onComplete={advanceHiit} onSkip={skipHiitEx} />
          
          <HiitCard currentBlock={b} hiitRound={hiitRound} hiitPhase={hiitPhase} hiitExIdx={hiitExIdx} hiitBlockIdx={hiitBlockIdx} hiitExSet={hiitExSet} colors={colors} hiitLogs={hiitLogs} setHiitLogs={setHiitLogs} recordedVideos={recordedVideos} handleRecordVideoOptions={handleRecordVideoOptions} videoUploading={videoUploading} renderVideoPlayer={(u: string) => <MiniVideoPlayer url={u} onExpand={setExpandedVideo} />} onAdvanceHiit={advanceHiit} onSkipHiitEx={skipHiitEx} />
        </ScrollView>
        <TouchableOpacity style={[styles.floatingInfoBtn, { backgroundColor: colors.primary, bottom: 30 }]} onPress={() => setShowIndicationsModal(true)}>
          <Ionicons name="list" size={24} color="#FFF" />
        </TouchableOpacity>
        {renderVideoModal()}{renderIndicationsModal()}
      </SafeAreaView>
    );
  } else {
    const ex = workout.exercises[currentExIndex];
    if (!ex) return <ActivityIndicator color={colors.primary} />;
    const s = setsStatus[currentExIndex] || []; const prog = ((currentExIndex) / workout.exercises.length) * 100;

    let displayExName = ex?.name;
    if (isResting) {
      if (restType === 'exercise' && currentExIndex < workout.exercises.length - 1) {
        displayExName = `Siguiente: ${workout.exercises[currentExIndex + 1]?.name}`;
      } else {
        const comp = s.filter(x => x === 'completed').length;
        displayExName = `Siguiente: ${ex?.name} (Serie ${comp + 1})`;
      }
    } else if (isPrep) {
      displayExName = `Prep: ${ex?.name}`;
    }

    // NUEVO: Lógica de Detección de Ejercicios con Barra
    const isBarbellLift = /barra|barbell|sentadilla|squat|peso muerto|deadlift|press|snatch|clean|jerk|landmine/i.test(ex?.name || '');
    const isLandmineExercise = /landmine/i.test(ex?.name || '');

    main = (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        
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
        <ScrollView contentContainerStyle={styles.content}>
          <UnifiedTimer isPrep={isPrep} isResting={isResting} isWorking={isWorking} isPaused={isPaused} prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds} restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds} exName={displayExName} colors={colors} isHiit={false} onTogglePause={togglePause} onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }} onSkipRest={skipTradRest} onResetWork={resetWorkTimer} onResetRest={resetRestTimer} onComplete={completeSet} onSkip={skipSet} />
          
          <View style={[styles.compactExerciseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.compactExHeader, { backgroundColor: colors.surfaceHighlight }]}><Text style={[styles.compactExName, { color: colors.textPrimary }]}>{ex.name}</Text>{ex.video_url && <TouchableOpacity onPress={() => Linking.openURL(ex.video_url)}><Ionicons name="logo-youtube" size={28} color="#EF4444" /></TouchableOpacity>}</View>
            <View style={styles.compactDetailsGrid}>{['sets', 'reps', 'weight', 'duration', 'rest'].map(k => ex[k] && ( <View key={k} style={styles.compactDetailItem}><Text style={[styles.compactDetailLabel, { color: colors.textSecondary }]}>{k === 'sets' ? 'Series' : k === 'weight' ? 'Kg' : k === 'rest' ? 'Desc.' : k}</Text><Text style={[styles.compactDetailValue, { color: colors.textPrimary }]}>{ex[k]}</Text></View> ))}</View>
            
            {ex.exercise_notes && (
               <View style={{ padding: 16, paddingTop: 0, backgroundColor: colors.surface }}>
                  <View style={{ flexDirection: 'row', backgroundColor: colors.background, padding: 10, borderRadius: 8 }}>
                     <Ionicons name="information-circle" size={18} color={colors.textSecondary} />
                     <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic', marginLeft: 8, flex: 1 }}>{ex.exercise_notes}</Text>
                  </View>
               </View>
            )}
          </View>
          
          <View style={[styles.setsCard, { backgroundColor: colors.surface }]}>
            <View style={styles.setsGrid}>{s.map((st, i) => ( <View key={i} style={[styles.setCircle, { borderColor: colors.border }, st === 'completed' && { backgroundColor: colors.success, borderColor: colors.success }, st === 'skipped' && { backgroundColor: colors.error, borderColor: colors.error }]}>{st === 'completed' ? <Ionicons name="checkmark" size={18} color="#FFF" /> : <Text style={{ color: colors.textSecondary }}>{i + 1}</Text>}</View> ))}</View>
            <TouchableOpacity style={[styles.recordBtn, { marginTop: 20, borderColor: colors.border }]} onPress={() => handleRecordVideoOptions(currentExIndex.toString())}><Ionicons name="videocam" size={20} color={colors.primary} /><Text style={{ color: colors.primary, marginLeft: 8, fontWeight: '700' }}>Grabar técnica</Text></TouchableOpacity>
          </View>
          <View style={[styles.activeLogContainer, { backgroundColor: colors.surface, padding: 20, borderRadius: 16 }]}>
             <View style={{ flexDirection: 'row', gap: 10 }}>
               <TextInput style={[styles.logInput, { borderColor: colors.border, flex: 1, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder="Kilos" placeholderTextColor={colors.textSecondary} keyboardType="numeric" value={logs[currentExIndex]?.weight} onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], weight: t}}))} />
               <TextInput style={[styles.logInput, { borderColor: colors.border, flex: 1, backgroundColor: colors.background, color: colors.textPrimary }]} placeholder="Reps" placeholderTextColor={colors.textSecondary} keyboardType="numeric" value={logs[currentExIndex]?.reps} onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], reps: t}}))} />
             </View>
             <TextInput style={[styles.logInput, { borderColor: colors.border, marginTop: 10, minHeight: 60, backgroundColor: colors.background, color: colors.textPrimary }]} multiline placeholder="Anotaciones de la serie..." placeholderTextColor={colors.textSecondary} value={logs[currentExIndex]?.note} onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], note: t}}))} />
          </View>
        </ScrollView>
        
        {/* BOTONES FLOTANTES */}
        <View style={{ position: 'absolute', right: 20, bottom: 100, gap: 15 }}>
          {/* Calculadora de Discos (Sólo ejercicios de barra) */}
          {isBarbellLift && (
            <TouchableOpacity style={[styles.floatingInfoBtn, { position: 'relative', right: 0, bottom: 0, backgroundColor: colors.textPrimary }]} onPress={() => openPlateCalculator(isLandmineExercise)}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: colors.background }}>?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.floatingInfoBtn, { position: 'relative', right: 0, bottom: 0, backgroundColor: colors.primary }]} onPress={() => setShowIndicationsModal(true)}>
            <Ionicons name="list" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}><TouchableOpacity onPress={() => { if(currentExIndex>0) { stopAllTimers(); setCurrentExIndex(currentExIndex-1); } }}><Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Anterior</Text></TouchableOpacity><TouchableOpacity onPress={() => { stopAllTimers(); if(currentExIndex < workout.exercises.length-1) setCurrentExIndex(currentExIndex+1); else { Speech.stop(); setFinished(true); } }}><Text style={{ color: colors.primary, fontWeight: '700' }}>{currentExIndex < workout.exercises.length - 1 ? 'Siguiente' : 'Terminar'}</Text></TouchableOpacity></View>
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
  
  /* ESTILOS CALCULADORA DE DISCOS */
  barTypeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderWidth: 2, borderRadius: 12 },
  barSleeveContainer: { height: 60, width: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  barSleeve: { position: 'absolute', height: 20, width: '100%', borderRadius: 4 },
  stackedPlatesContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  stackedPlate: { borderRadius: 4, marginHorizontal: 1, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  legendPlate: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 }
});
