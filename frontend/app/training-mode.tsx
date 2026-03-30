import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking, TextInput, Alert, Platform, Modal, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode, Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import Svg, { Circle, Path, G, Text as SvgText } from 'react-native-svg';
import NetInfo from '@react-native-community/netinfo';

// IMPORTACIONES CORREGIDAS PARA app/training-mode.tsx (solo un ../)
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import { syncManager } from '../src/offline';
import UnifiedTimer from '../src/components/training/UnifiedTimer';
import HiitCard from '../src/components/training/HiitCard';

const { width } = Dimensions.get('window');

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
  
  const [showBodyMap, setShowBodyMap] = useState(false);
  const [soreJoints, setSoreJoints] = useState<string[]>([]);
  
  const [showIndicationsModal, setShowIndicationsModal] = useState(false);
  const hasShownIndicationsRef = useRef(false);

  const forceSwipeableRef = useRef<Swipeable>(null);

  const [prepTargetTime, setPrepTargetTime] = useState<number | null>(null);
  const [prepSeconds, setPrepSeconds] = useState(0);
  const [isPrep, setIsPrep] = useState(false);
  const prepIntervalRef = useRef<any>(null);

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

  const beepSoundRef = useRef<Audio.Sound | null>(null);
  const finishSoundRef = useRef<Audio.Sound | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const lastAnnouncedRef = useRef<string>('');

  useEffect(() => {
    const loadVoicePreference = async () => {
      try {
        const val = await AsyncStorage.getItem('voice_enabled');
        if (val === 'false') setVoiceEnabled(false);
      } catch (e) {
        console.log("⚠️ Error cargando preferencia de voz:", e);
      }
    };
    loadVoicePreference();
  }, []);

  const announce = async (text: string) => {
    if (!voiceEnabled) return; 
    try {
      Speech.stop(); 
      Speech.speak(text, { language: 'es-ES', rate: 0.95 });
    } catch (e) {
      console.log("⚠️ Error ejecutando Speech:", e);
    }
  };

  useEffect(() => {
    async function initAudio() {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
        const { sound: beep } = await Audio.Sound.createAsync(require('../assets/beep.mp3'));
        const { sound: finish } = await Audio.Sound.createAsync(require('../assets/finish.mp3'));
        beepSoundRef.current = beep;
        finishSoundRef.current = finish;
      } catch (e) {
        console.log("Error cargando audios locales:", e);
      }
    }
    initAudio();
    return () => {
      if (beepSoundRef.current) beepSoundRef.current.unloadAsync();
      if (finishSoundRef.current) finishSoundRef.current.unloadAsync();
      try { Speech.stop(); } catch(e) {} 
    };
  }, []);

  const playSound = async (type: 'beep' | 'finish') => {
    try {
      if (type === 'beep') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      const soundObj = type === 'beep' ? beepSoundRef.current : finishSoundRef.current;
      if (soundObj) await soundObj.replayAsync(); 
    } catch (error) {
      console.log(`Error al reproducir el sonido ${type}:`, error);
    }
  };

  const stopPrepTimer = () => {
    if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
    setIsPrep(false);
    setPrepSeconds(0);
    setPrepTargetTime(null);
  };

  const stopWorkTimer = () => {
    if (workIntervalRef.current) clearInterval(workIntervalRef.current);
    setIsWorking(false);
    setWorkSeconds(0);
    setWorkTargetTime(null);
  };

  const stopRestTimer = () => {
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    setRestTargetTime(null);
    setRestSeconds(0);
    setIsResting(false);
  };

  const stopAllTimers = () => {
    stopPrepTimer();
    stopWorkTimer();
    stopRestTimer();
  };

  const startPrepTimer = (workDur: number, exName?: string) => {
    stopAllTimers();
    setIsPrep(true);
    setPrepSeconds(5);
    setPrepTargetTime(Date.now() + 5000);
    setWorkTotalSeconds(workDur);
    setWorkSeconds(workDur);
    
    if (exName) announce(`Siguiente: ${exName}. Prepárate.`);
    else announce("Prepárate.");
  };

  const startWorkTimerAfterPrep = () => {
    setIsWorking(true);
    setWorkTargetTime(Date.now() + workTotalSeconds * 1000);
  };

  const startRestTimer = (seconds: number, nextExName?: string) => {
    stopAllTimers();
    setRestTargetTime(Date.now() + seconds * 1000);
    setRestSeconds(seconds);
    setRestTotalSeconds(seconds); 
    setIsResting(true);

    if (nextExName) announce(`Descanso. Siguiente: ${nextExName}`);
    else announce("Descanso.");
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

  const resetWorkTimer = () => {
    setIsWorking(false);
    if (workIntervalRef.current) clearInterval(workIntervalRef.current);
    setWorkTargetTime(null);
    setWorkSeconds(workTotalSeconds);
  };

  const handleWorkComplete = () => {
    stopWorkTimer();
    if (isHiit) advanceHiitLogic();
    else completeSet();
  };

  useEffect(() => { if (isPrep && prepSeconds > 0 && prepSeconds <= 3) playSound('beep'); }, [prepSeconds, isPrep]);
  useEffect(() => { if (isWorking && workSeconds > 0 && workSeconds <= 5) playSound('beep'); }, [workSeconds, isWorking]);
  useEffect(() => { if (isResting && restSeconds > 0 && restSeconds <= 5) playSound('beep'); }, [restSeconds, isResting]);

  useEffect(() => {
    if (showIndicationsModal || !workout || isResting || finished || workout.completed || isPrep) return;

    let textToAnnounce = "";
    let idToTrack = "";

    if (isHiit) {
      const currentBlock = workout.exercises[hiitBlockIdx];
      const currentEx = currentBlock?.hiit_exercises?.[hiitExIdx];
      if (currentEx) {
        idToTrack = `hiit-${hiitBlockIdx}-${hiitRound}-${hiitExIdx}`;
        textToAnnounce = currentEx.name;
      }
    } else {
      const currentEx = workout.exercises[currentExIndex];
      if (currentEx) {
        const currentSets = setsStatus[currentExIndex] || [];
        const nextPendingSet = currentSets.findIndex(s => s === 'pending');
        if (nextPendingSet !== -1) {
          idToTrack = `trad-${currentExIndex}`;
          textToAnnounce = currentEx.name;
        }
      }
    }

    if (textToAnnounce && lastAnnouncedRef.current !== idToTrack) {
      announce(textToAnnounce);
      lastAnnouncedRef.current = idToTrack;
    }
  }, [currentExIndex, hiitBlockIdx, hiitExIdx, hiitRound, isResting, isPrep, showIndicationsModal, setsStatus, workout, isHiit, finished]);

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
              if (currentWorkout.completion_data.sore_joints) setSoreJoints(currentWorkout.completion_data.sore_joints);
              
              const savedVideos: Record<string, string> = {}; 
              
              if (!isWorkoutHiit) {
                const savedLogs: Record<number, {weight: string, reps: string, note?: string, coach_note?: string}> = {};
                currentWorkout.completion_data.exercise_results?.forEach((res: any, idx: number) => {
                  savedLogs[idx] = { weight: res.logged_weight || '', reps: res.logged_reps || '', note: res.athlete_note || '', coach_note: res.coach_note || '' };
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

            if (currentWorkout.notes && currentWorkout.notes.trim() !== '' && !hasShownIndicationsRef.current) {
               setShowIndicationsModal(true);
               hasShownIndicationsRef.current = true;
            }
          }
        }
      } catch (e) { console.error("Error:", e); } 
      finally { if (isMounted) setLoading(false); }
    };
    fetchWorkoutDetail();
    return () => { isMounted = false; };
  }, [stableWorkoutId]);

  useEffect(() => {
    if (isPrep && prepTargetTime) {
      prepIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((prepTargetTime - Date.now()) / 1000);
        if (remaining <= 0) {
          playSound('finish');
          stopPrepTimer();
          startWorkTimerAfterPrep();
        } else {
          setPrepSeconds(remaining);
        }
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
          stopRestTimer();
        } else {
          setRestSeconds(remaining);
        }
      }, 1000);
    }
    return () => { if (restIntervalRef.current) clearInterval(restIntervalRef.current); };
  }, [isResting, restTargetTime]);

  useEffect(() => {
    if (isWorking && workTargetTime) {
      workIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((workTargetTime - Date.now()) / 1000);
        if (remaining <= 0) {
          playSound('finish');
          handleWorkComplete();
        } else {
          setWorkSeconds(remaining);
        }
      }, 1000);
    }
    return () => { if (workIntervalRef.current) clearInterval(workIntervalRef.current); };
  }, [isWorking, workTargetTime]);

  useEffect(() => {
    if (!isHiit && workout && !isResting && !isPrep && !showIndicationsModal) {
      const currentSets = setsStatus[currentExIndex] || [];
      const nextPendingSet = currentSets.findIndex(s => s === 'pending');
      if (nextPendingSet !== -1) {
        const currentEx = workout.exercises[currentExIndex];
        const dur = parseTimeToSeconds(currentEx?.duration);
        if (dur > 0 && !isWorking && workTargetTime === null && workSeconds === 0) {
          startPrepTimer(dur, currentEx.name);
        }
      } else {
        stopWorkTimer();
      }
    }
  }, [currentExIndex, setsStatus, isResting, workout, isHiit, isPrep, isWorking, workTargetTime, workSeconds, showIndicationsModal]);

  useEffect(() => {
    if (isHiit && workout && hiitPhase === 'work' && !isResting && !isPrep && !showIndicationsModal) {
      const currentBlock = workout.exercises[hiitBlockIdx];
      if (!currentBlock) return;
      const currentEx = currentBlock.hiit_exercises[hiitExIdx];
      const dur = parseTimeToSeconds(currentEx?.duration_reps || currentEx?.duration);
      if (dur > 0 && !isWorking && workTargetTime === null && workSeconds === 0) {
        startPrepTimer(dur, currentEx.name);
      } else if (dur === 0) {
        stopWorkTimer();
      }
    }
  }, [hiitBlockIdx, hiitExIdx, hiitPhase, isResting, workout, isHiit, isPrep, isWorking, workTargetTime, workSeconds, showIndicationsModal]);

  useEffect(() => {
    if (!isResting && workout && !showIndicationsModal) {
      if (isHiit) {
        if (hiitPhase === 'rest_ex') { setHiitPhase('work'); setHiitExIdx(prev => prev + 1); } 
        else if (hiitPhase === 'rest_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitRound(prev => prev + 1); } 
        else if (hiitPhase === 'rest_next_block') { setHiitPhase('work'); setHiitExIdx(0); setHiitRound(1); setHiitBlockIdx(prev => prev + 1); }
      } else {
        if (restType === 'exercise') { autoAdvance(currentExIndex); setRestType(null); }
      }
    }
  }, [isResting, showIndicationsModal]);

  const advanceHiitLogic = () => {
    stopAllTimers();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const currentBlock = workout.exercises[hiitBlockIdx];
    const totalExercises = currentBlock.hiit_exercises.length;
    const totalRounds = parseInt(currentBlock.sets) || 1;

    if (hiitExIdx < totalExercises - 1) {
      const restTime = parseTimeToSeconds(currentBlock.rest_exercise);
      if (restTime > 0) { 
        const nextEx = currentBlock.hiit_exercises[hiitExIdx + 1];
        startRestTimer(restTime, nextEx.name); 
        setHiitPhase('rest_ex'); 
      } else { 
        setHiitExIdx(hiitExIdx + 1); 
      }
    } else {
      if (hiitRound < totalRounds) {
        const restTime = parseTimeToSeconds(currentBlock.rest_block);
        if (restTime > 0) { 
          const nextEx = currentBlock.hiit_exercises[0];
          startRestTimer(restTime, nextEx.name); 
          setHiitPhase('rest_block'); 
        } else { 
          setHiitRound(hiitRound + 1); setHiitExIdx(0); 
        }
      } else {
        if (hiitBlockIdx < workout.exercises.length - 1) {
          const restNextBlockTime = parseTimeToSeconds(currentBlock.rest_between_blocks);
          if (restNextBlockTime > 0) { 
            const nextBlock = workout.exercises[hiitBlockIdx + 1];
            const nextEx = nextBlock.hiit_exercises[0];
            startRestTimer(restNextBlockTime, nextEx.name); 
            setHiitPhase('rest_next_block'); 
          } else { 
            setHiitBlockIdx(hiitBlockIdx + 1); setHiitRound(1); setHiitExIdx(0); setHiitPhase('work'); 
          }
        } else { setFinished(true); }
      }
    }
  };

  const advanceHiit = () => advanceHiitLogic();

  const skipHiitEx = () => {
    stopAllTimers();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const key = `${hiitBlockIdx}-${hiitExIdx}`;
    setHiitSkipped(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    advanceHiitLogic();
  };

  const skipHiitRest = () => { stopAllTimers(); };

  const updateSetStatus = (exIdx: number, setIdx: number, status: SetStatus) => {
    setSetsStatus(prev => { const updated = { ...prev }; updated[exIdx] = [...(prev[exIdx] || [])]; updated[exIdx][setIdx] = status; return updated; });
  };
  
  const autoAdvance = (exIdx: number) => {
    stopAllTimers();
    if (exIdx < (workout.exercises?.length || 0) - 1) setTimeout(() => setCurrentExIndex(exIdx + 1), 400); else setTimeout(() => setFinished(true), 400);
  };

  const completeSet = () => {
    stopAllTimers();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    forceSwipeableRef.current?.close();

    const exercises = workout.exercises || []; const currentEx = exercises[currentExIndex]; const currentSets = setsStatus[currentExIndex] || [];
    const nextPendingSet = currentSets.findIndex(s => s === 'pending'); if (nextPendingSet === -1) return;
    updateSetStatus(currentExIndex, nextPendingSet, 'completed');
    
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) {
      const restTimeExercise = parseTimeToSeconds(currentEx?.rest_exercise);
      if (restTimeExercise > 0 && currentExIndex < exercises.length - 1) { 
        const nextEx = exercises[currentExIndex + 1];
        startRestTimer(restTimeExercise, nextEx.name); 
        setRestType('exercise'); 
      } else { autoAdvance(currentExIndex); }
    } else {
      const restTimeSet = parseTimeToSeconds(currentEx?.rest);
      if (restTimeSet > 0) { 
        startRestTimer(restTimeSet, currentEx.name); 
        setRestType('set'); 
      }
    }
  };

  const skipSet = () => {
    stopAllTimers();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    forceSwipeableRef.current?.close();

    const currentSets = setsStatus[currentExIndex] || []; const nextPendingSet = currentSets.findIndex(s => s === 'pending'); if (nextPendingSet === -1) return;
    updateSetStatus(currentExIndex, nextPendingSet, 'skipped');
    const remaining = currentSets.filter((s, i) => i !== nextPendingSet && s === 'pending').length;
    if (remaining === 0) autoAdvance(currentExIndex);
  };

  const skipEntireExercise = () => {
    stopAllTimers();
    setSetsStatus(prev => {
      const updated = { ...prev };
      updated[currentExIndex] = (updated[currentExIndex] || []).map(s => s === 'pending' ? 'skipped' : s);
      return updated;
    });
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
        rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours, sore_joints: soreJoints, hiit_completed: true,
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
      rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours, sore_joints: soreJoints,
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
    stopAllTimers();
    
    const completionData = buildCompletionData();
    
    try {
      const updateData: any = { completed: true, completion_data: completionData, title: workout.title, exercises: workout.exercises };
      if (observations.trim()) updateData.observations = observations.trim();

      const netState = await NetInfo.fetch();
      
      if (netState.isConnected) {
        await api.updateWorkout(stableWorkoutId, updateData);
        syncManager.syncPendingWorkouts(); 
      } else {
        await syncManager.savePendingWorkout(stableWorkoutId, updateData);
        if (Platform.OS !== 'web') {
          Alert.alert("Guardado Local", "Estás sin conexión. El entrenamiento se ha guardado en tu móvil y se subirá automáticamente cuando vuelvas a tener internet.");
        } else {
          window.alert("Estás sin conexión. El entrenamiento se guardará y se subirá cuando haya internet.");
        }
      }
      router.back();
    } catch (e) { 
      if (Platform.OS !== 'web') Alert.alert("Error", "Hubo un error al guardar."); 
    }
  };

  const renderVideoModal = () => (
    <Modal visible={!!expandedVideo} transparent animationType="fade">
      <View style={styles.fullscreenVideoOverlay}>
        <TouchableOpacity style={styles.closeModalBtn} onPress={() => setExpandedVideo(null)}><Ionicons name="close-circle" size={40} color="#FFF" /></TouchableOpacity>
        {expandedVideo && <Video source={{ uri: expandedVideo }} style={styles.fullVideo} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />}
      </View>
    </Modal>
  );

  const renderIndicationsModal = () => (
    <Modal visible={showIndicationsModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.indicationsModalContent, { backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 }}>
            <Ionicons name="warning" size={28} color={colors.primary} />
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary, flex: 1 }}>Indicaciones</Text>
          </View>
          <ScrollView style={{ maxHeight: 300, marginBottom: 20 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}>{workout?.notes}</Text>
          </ScrollView>
          <TouchableOpacity 
            style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' }} 
            onPress={() => setShowIndicationsModal(false)}
          >
            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>¡A por ello!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const toggleJoint = (joint: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSoreJoints(prev => prev.includes(joint) ? prev.filter(j => j !== joint) : [...prev, joint]);
  };

  const isJointSelected = (joint: string) => soreJoints.includes(joint);

  const renderBodyMapModal = () => {
    const primaryColor = colors.primary;
    const errorColor = colors.error || '#EF4444';
    const bodyOutlineColor = colors.textSecondary;
    
    const frontPoints = [
      { id: 'Hombro Izq', cx: 130, cy: 120, r: 15 }, { id: 'Hombro Der', cx: 270, cy: 120, r: 15 },
      { id: 'Codo Izq', cx: 100, cy: 200, r: 15 }, { id: 'Codo Der', cx: 300, cy: 200, r: 15 },
      { id: 'Muñeca Izq', cx: 80, cy: 280, r: 12 }, { id: 'Muñeca Der', cx: 320, cy: 280, r: 12 },
      { id: 'Costillas', cx: 200, cy: 190, r: 25 }, { id: 'Cadera', cx: 200, cy: 260, r: 25 },
      { id: 'Rodilla Izq', cx: 160, cy: 380, r: 18 }, { id: 'Rodilla Der', cx: 240, cy: 380, r: 18 },
      { id: 'Tobillo Izq', cx: 150, cy: 490, r: 15 }, { id: 'Tobillo Der', cx: 250, cy: 490, r: 15 },
    ];

    const backPoints = [
      { id: 'Cuello', cx: 200, cy: 90, r: 18 }, { id: 'Escápula Izq', cx: 160, cy: 140, r: 18 },
      { id: 'Escápula Der', cx: 240, cy: 140, r: 18 }, { id: 'Lumbares', cx: 200, cy: 240, r: 28 },
      { id: 'Tendón Izq', cx: 150, cy: 470, r: 15 }, { id: 'Tendón Der', cx: 250, cy: 470, r: 15 },
    ];

    return (
      <Modal visible={showBodyMap} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.bodyMapModalContent, { backgroundColor: colors.background }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Registrar Dolor / Impacto</Text>
              <TouchableOpacity onPress={() => setShowBodyMap(false)}>
                <Ionicons name="close" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>
              Toca las articulaciones que hayas sentido sobrecargadas por las botas o los aterrizajes.
            </Text>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
              <View style={{ width: width * 0.85, alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', color: colors.textPrimary, marginBottom: 10 }}>VISTA FRONTAL</Text>
                <Svg height="550" width="400" viewBox="0 0 400 550">
                  <Path d="M200 20 C 180 20, 180 60, 200 80 C 220 60, 220 20, 200 20 Z" stroke={bodyOutlineColor} strokeWidth="3" fill="none" /> 
                  <Path d="M200 80 L 200 100 L 140 120 L 100 200 L 80 280" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  <Path d="M200 80 L 200 100 L 260 120 L 300 200 L 320 280" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  <Path d="M140 120 L 160 260 L 240 260 L 260 120 Z" stroke={bodyOutlineColor} strokeWidth="3" fill="none" /> 
                  <Path d="M170 260 L 160 380 L 150 490 L 130 510" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  <Path d="M230 260 L 240 380 L 250 490 L 270 510" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  <Path d="M170 260 L 200 280 L 230 260" stroke={bodyOutlineColor} strokeWidth="3" fill="none" /> 
                  {frontPoints.map(point => (
                    <G key={point.id} onPress={() => toggleJoint(point.id)}>
                      <Circle cx={point.cx} cy={point.cy} r={point.r + 10} fill="transparent" />
                      <Circle cx={point.cx} cy={point.cy} r={point.r} fill={isJointSelected(point.id) ? errorColor : primaryColor} opacity={isJointSelected(point.id) ? 0.9 : 0.3} />
                      {isJointSelected(point.id) && <SvgText x={point.cx} y={point.cy - point.r - 5} fill={errorColor} fontSize="12" fontWeight="bold" textAnchor="middle">{point.id}</SvgText>}
                    </G>
                  ))}
                </Svg>
              </View>
              <View style={{ width: width * 0.85, alignItems: 'center' }}>
                <Text style={{ fontWeight: '700', color: colors.textPrimary, marginBottom: 10 }}>VISTA TRASERA</Text>
                <Svg height="550" width="400" viewBox="0 0 400 550">
                  <Path d="M200 20 C 180 20, 180 60, 200 80 C 220 60, 220 20, 200 20 Z" stroke={bodyOutlineColor} strokeWidth="3" fill="none" /> 
                  <Path d="M200 80 L 200 100 L 140 120 L 100 200 L 80 280" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  <Path d="M200 80 L 200 100 L 260 120 L 300 200 L 320 280" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  <Path d="M140 120 L 160 260 L 240 260 L 260 120 Z" stroke={bodyOutlineColor} strokeWidth="3" fill="none" /> 
                  <Path d="M200 100 L 200 260" stroke={bodyOutlineColor} strokeWidth="2" strokeDasharray="5,5" fill="none" /> 
                  <Path d="M170 260 L 160 380 L 150 490 L 130 510" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  <Path d="M230 260 L 240 380 L 250 490 L 270 510" stroke={bodyOutlineColor} strokeWidth="4" fill="none" /> 
                  {backPoints.map(point => (
                    <G key={point.id} onPress={() => toggleJoint(point.id)}>
                      <Circle cx={point.cx} cy={point.cy} r={point.r + 10} fill="transparent" />
                      <Circle cx={point.cx} cy={point.cy} r={point.r} fill={isJointSelected(point.id) ? errorColor : primaryColor} opacity={isJointSelected(point.id) ? 0.9 : 0.3} />
                      {isJointSelected(point.id) && <SvgText x={point.cx} y={point.cy - point.r - 5} fill={errorColor} fontSize="12" fontWeight="bold" textAnchor="middle">{point.id}</SvgText>}
                    </G>
                  ))}
                </Svg>
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10, marginBottom: 20 }}>
               <Text style={{ fontSize: 12, color: colors.textSecondary }}>Desliza para ver la parte trasera</Text>
            </View>
            <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', width: '100%' }} onPress={() => setShowBodyMap(false)}>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Confirmar Selección</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderForceLeftActions = () => (
    <View style={[styles.swipeActionForce, { backgroundColor: colors.success || '#10B981', alignItems: 'flex-start', paddingLeft: 30 }]}>
      <Ionicons name="checkmark-circle" size={32} color="#FFF" />
      <Text style={styles.swipeTextForce}>Completar</Text>
    </View>
  );

  const renderForceRightActions = () => (
    <View style={[styles.swipeActionForce, { backgroundColor: colors.error || '#EF4444', alignItems: 'flex-end', paddingRight: 30 }]}>
      <Ionicons name="play-skip-forward" size={32} color="#FFF" />
      <Text style={styles.swipeTextForce}>Saltar</Text>
    </View>
  );

  if (loading) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;
  if (!workout) return <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={[styles.errorText, { color: colors.textPrimary }]}>Entrenamiento no encontrado.</Text><TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}><Text style={styles.backBtnText}>Volver</Text></TouchableOpacity></SafeAreaView>;

  let mainContent;

  if (finished || workout.completed) {
    mainContent = (
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
                <Text style={[styles.label, { color: colors.textSecondary, marginBottom: 12, textAlign: 'center' }]}>FATIGA ARTICULAR O IMPACTO (Opcional)</Text>
                <TouchableOpacity 
                  style={{ 
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, 
                    backgroundColor: soreJoints.length > 0 ? (colors.error || '#EF4444') + '15' : colors.surfaceHighlight, 
                    padding: 16, borderRadius: 12, borderWidth: 1, 
                    borderColor: soreJoints.length > 0 ? (colors.error || '#EF4444') : colors.border 
                  }}
                  onPress={() => setShowBodyMap(true)}
                >
                  <Ionicons name="body" size={24} color={soreJoints.length > 0 ? (colors.error || '#EF4444') : colors.primary} />
                  <Text style={{ fontWeight: '700', color: soreJoints.length > 0 ? (colors.error || '#EF4444') : colors.textPrimary }}>
                    {soreJoints.length > 0 ? `${soreJoints.length} Zonas Marcadas` : 'Abrir Mapa Corporal'}
                  </Text>
                </TouchableOpacity>
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
              {workout.completion_data.sore_joints && workout.completion_data.sore_joints.length > 0 && (
                <Text style={{ color: colors.textPrimary, marginBottom: 5 }}>
                  Impacto Articular: <Text style={{ fontWeight: '700', color: colors.error || '#EF4444' }}>{workout.completion_data.sore_joints.join(', ')}</Text>
                </Text>
              )}
              {workout.observations && <Text style={{ color: colors.textPrimary, marginTop: 10, fontStyle: 'italic' }}>"{workout.observations}"</Text>}
            </View>
          )}

          {!workout.completed && (
            <TouchableOpacity style={[styles.finishWorkoutBtn, { backgroundColor: colors.primary }]} onPress={handleFinish}>
              <Text style={styles.finishWorkoutBtnText}>Guardar y Finalizar</Text>
              <Ionicons name="checkmark-done" size={24} color="#FFF" />
            </TouchableOpacity>
          )}
        </ScrollView>
        {renderVideoModal()}
        {renderBodyMapModal()}
      </SafeAreaView>
    );

  } else if (isHiit) {
    const currentBlock = workout.exercises?.[hiitBlockIdx];
    if (!currentBlock) {
      mainContent = <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={[styles.errorText, { color: colors.textPrimary }]}>Cargando bloque HIIT...</Text></SafeAreaView>;
    } else {
      const currentExInHiit = currentBlock.hiit_exercises[hiitExIdx];

      mainContent = (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => { stopAllTimers(); router.back(); }}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
            <Text style={[styles.topProgress, { color: colors.textSecondary }]}>Bloque {hiitBlockIdx + 1}/{workout.exercises.length}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <UnifiedTimer
              isPrep={isPrep} isResting={isResting} isWorking={isWorking} prepSeconds={prepSeconds}
              restSeconds={restSeconds} workSeconds={workSeconds} restTotalSeconds={restTotalSeconds}
              workTotalSeconds={workTotalSeconds} exName={currentExInHiit?.name || 'EJERCICIO'}
              colors={colors} isHiit={isHiit}
              onToggleWork={toggleWorkTimer} 
              onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }}
              onSkipRest={skipHiitRest} 
              onResetWork={resetWorkTimer}
              onResetRest={() => setRestSeconds(restTotalSeconds)}
              onComplete={advanceHiit}
              onSkip={skipHiitEx}
            />

            {/* PISTA VISUAL DE DESLIZAMIENTO PARA HIIT */}
            {!isResting && !isPrep && (
              <View style={{ marginBottom: 12, alignItems: 'center', backgroundColor: colors.surfaceHighlight, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, alignSelf: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', opacity: 0.9 }}>
                  💡 Desliza la lista inferior a los lados para saltar/completar
                </Text>
              </View>
            )}

            <HiitCard
              currentBlock={currentBlock} hiitRound={hiitRound} hiitPhase={hiitPhase}
              hiitExIdx={hiitExIdx} hiitBlockIdx={hiitBlockIdx} colors={colors}
              hiitLogs={hiitLogs} setHiitLogs={setHiitLogs} recordedVideos={recordedVideos}
              handleRecordVideoOptions={handleRecordVideoOptions} videoUploading={videoUploading}
              renderVideoPlayer={(url: string) => <MiniVideoPlayer url={url} onExpand={setExpandedVideo} />}
              onAdvanceHiit={advanceHiit} onSkipHiitEx={skipHiitEx}
            />
          </ScrollView>

          {workout?.notes && !finished && (
            <TouchableOpacity style={[styles.fabIndications, { backgroundColor: colors.primary }]} onPress={() => setShowIndicationsModal(true)}>
              <Ionicons name="warning" size={26} color="#FFF" />
            </TouchableOpacity>
          )}

          {renderVideoModal()}
          {renderIndicationsModal()}
        </SafeAreaView>
      );
    }
  } else {
    // RENDERIZADO FUERZA
    const exercises = workout.exercises || [];
    const currentEx = exercises[currentExIndex];
    
    if (!currentEx) {
      mainContent = <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}><Text style={[styles.errorText, { color: colors.textPrimary }]}>Cargando ejercicio...</Text></SafeAreaView>;
    } else {
      const currentSets = setsStatus[currentExIndex] || [];
      const nextPendingSet = currentSets.findIndex(s => s === 'pending');
      const progress = exercises.length > 0 ? ((currentExIndex) / exercises.length) * 100 : 0;

      mainContent = (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => { stopAllTimers(); router.back(); }}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
            <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
            <Text style={[styles.topProgress, { color: colors.textSecondary }]}>{currentExIndex + 1}/{exercises.length}</Text>
          </View>

          <View style={[styles.progressBar, { backgroundColor: colors.surfaceHighlight }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.min(progress, 100)}%` }]} /></View>

          <ScrollView contentContainerStyle={styles.content}>

            <UnifiedTimer
              isPrep={isPrep} isResting={isResting} isWorking={isWorking} prepSeconds={prepSeconds}
              restSeconds={restSeconds} workSeconds={workSeconds} restTotalSeconds={restTotalSeconds}
              workTotalSeconds={workTotalSeconds} exName={currentEx?.name || 'EJERCICIO'}
              colors={colors} isHiit={false}
              onToggleWork={toggleWorkTimer} 
              onStopPrep={() => { stopPrepTimer(); startWorkTimerAfterPrep(); }}
              onSkipRest={stopRestTimer} 
              onResetWork={resetWorkTimer}
              onResetRest={() => setRestSeconds(restTotalSeconds)}
              onComplete={completeSet}
              onSkip={skipSet}
            />

            {/* PISTA VISUAL DE DESLIZAMIENTO PARA FUERZA */}
            {nextPendingSet !== -1 && !isResting && !isPrep && (
              <View style={{ marginBottom: 12, alignItems: 'center', backgroundColor: colors.surfaceHighlight, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, alignSelf: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '700', opacity: 0.9 }}>
                  💡 Desliza la tarjeta inferior hacia los lados para saltar/completar serie
                </Text>
              </View>
            )}

            <Swipeable
              ref={forceSwipeableRef}
              renderLeftActions={renderForceLeftActions}
              renderRightActions={renderForceRightActions}
              onSwipeableLeftOpen={completeSet}
              onSwipeableRightOpen={skipSet}
              enabled={nextPendingSet !== -1 && !isResting && !isPrep}
            >
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
              </View>
            </Swipeable>

            <View style={[styles.setsCard, { backgroundColor: colors.surface, marginTop: 16 }]}>
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

              {nextPendingSet === -1 ? (
                <View style={[styles.allDoneBadge, { backgroundColor: (colors.success || '#10B981') + '12', marginTop: 20 }]}><Ionicons name="checkmark-circle" size={18} color={colors.success || '#10B981'} /><Text style={{ color: colors.success || '#10B981', fontSize: 14, fontWeight: '600' }}>Todas completadas o saltadas</Text></View>
              ) : null}

            </View>

            <View style={[styles.activeLogContainer, { backgroundColor: colors.surface, padding: 20, borderRadius: 16 }]}>
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

          </ScrollView>

          {workout?.notes && !finished && (
            <TouchableOpacity style={[styles.fabIndications, { backgroundColor: colors.primary }]} onPress={() => setShowIndicationsModal(true)}>
              <Ionicons name="warning" size={26} color="#FFF" />
            </TouchableOpacity>
          )}

          <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity style={[styles.navBtn, { opacity: currentExIndex === 0 ? 0.3 : 1 }]} onPress={() => { if(currentExIndex>0) { stopAllTimers(); setCurrentExIndex(currentExIndex-1); } }} disabled={currentExIndex === 0}><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Anterior</Text></TouchableOpacity>
            {currentExIndex < exercises.length - 1 ? (
              <TouchableOpacity style={styles.navBtn} onPress={() => { stopAllTimers(); setCurrentExIndex(currentExIndex+1); }}><Text style={[styles.navBtnText, { color: colors.textPrimary }]}>Siguiente</Text><Ionicons name="arrow-forward" size={22} color={colors.textPrimary} /></TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.navBtn} onPress={() => { stopAllTimers(); setFinished(true); }}><Text style={[styles.navBtnText, { color: colors.success || '#10B981', fontWeight: '700' }]}>Terminar</Text><Ionicons name="flag" size={20} color={colors.success || '#10B981'} /></TouchableOpacity>
            )}
          </View>
          
          {renderVideoModal()}
          {renderIndicationsModal()}
        </SafeAreaView>
      );
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {mainContent}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, errorText: { fontSize: 18, fontWeight: '700', marginTop: 15, textAlign: 'center' }, backBtn: { marginTop: 20, paddingHorizontal: 25, paddingVertical: 12, borderRadius: 12 }, backBtnText: { color: '#FFF', fontWeight: '800' }, topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }, topTitle: { fontSize: 16, fontWeight: '600' }, topProgress: { fontSize: 14, fontWeight: '500' }, progressBar: { height: 3, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 2 }, content: { padding: 20, paddingBottom: 100, gap: 16 }, 
  exerciseCard: { borderRadius: 16, padding: 24, alignItems: 'center', gap: 16 }, exNumber: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' }, exNumberText: { fontSize: 20, fontWeight: '800' }, exerciseName: { fontSize: 24, fontWeight: '700', textAlign: 'center' }, 
  referenceVideoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginTop: -4 },
  coachNotesBox: { flexDirection: 'row', padding: 12, borderRadius: 10, borderWidth: 1, gap: 8, width: '100%' },
  detailsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }, detailBox: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', minWidth: 60 }, detailValue: { fontSize: 20, fontWeight: '700' }, detailLabel: { fontSize: 10, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' }, setsCard: { borderRadius: 16, padding: 20 }, setsTitle: { fontSize: 16, fontWeight: '600', marginBottom: 16 }, setsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, setCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' }, setNum: { fontSize: 15, fontWeight: '600' }, setActions: { flexDirection: 'row', gap: 10 }, completeSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 16 }, completeSetText: { fontSize: 16, fontWeight: '600' }, skipSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, borderWidth: 1.5 }, skipSetText: { fontSize: 14, fontWeight: '600' }, allDoneBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 14 }, bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28, borderTopWidth: 0.5 }, navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 }, navBtnText: { fontSize: 15, fontWeight: '500' },
  activeLogContainer: { width: '100%', marginTop: 0 }, activeLogTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 }, logInputWrapper: { flex: 1 }, logInputLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' }, logInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, fontWeight: '600' },
  finishedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }, finishedIconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(245, 158, 11, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }, finishedTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8, textAlign: 'center' }, finishedSubtitle: { fontSize: 16, textAlign: 'center', marginBottom: 40 }, finishWorkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 32, borderRadius: 16, width: '100%', marginTop: 20 }, finishWorkoutBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' }, label: { fontSize: 12, fontWeight: '700', letterSpacing: 1 }, rpeCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, justifyContent: 'center', alignItems: 'center' }, rpeText: { fontSize: 12, fontWeight: '700' }, sleepPill: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1 }, sleepPillText: { fontSize: 14, fontWeight: '600' }, obsInput: { borderWidth: 1, borderRadius: 12, padding: 16, minHeight: 100, textAlignVertical: 'top', fontSize: 15 },
  miniVideoContainer: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', position: 'relative' }, miniVideo: { width: '100%', height: '100%' }, expandBtn: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 }, fullscreenVideoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, fullVideo: { width: '100%', height: '100%' }, closeModalBtn: { position: 'absolute', top: 40, right: 20, zIndex: 10 },
  fabIndications: { position: 'absolute', bottom: 100, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, zIndex: 99 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  indicationsModalContent: { width: '85%', padding: 24, borderRadius: 20, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
  swipeActionForce: { justifyContent: 'center', flex: 1, borderRadius: 16, marginBottom: 0 },
  swipeTextForce: { color: '#FFF', fontWeight: '800', fontSize: 14, marginTop: 4 },
  bodyMapModalContent: { width: '95%', padding: 20, borderRadius: 20, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, maxHeight: '90%' },
});
