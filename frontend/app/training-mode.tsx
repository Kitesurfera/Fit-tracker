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
import NetInfo from '@react-native-community/netinfo';
import Body from 'react-native-body-highlighter';

// IMPORTACIONES
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import { useAuth } from '../src/context/AuthContext';
import { syncManager } from '../src/offline';
import UnifiedTimer from '../src/components/training/UnifiedTimer';
import HiitCard from '../src/components/training/HiitCard';

const { width, height: screenHeight } = Dimensions.get('window');

type SetStatus = 'pending' | 'completed' | 'skipped';

const SLUG_TRANSLATIONS: Record<string, string> = {
  'chest': 'Pecho', 'upper-back': 'Espalda Alta', 'lower-back': 'Lumbar',
  'quadriceps': 'Cuádriceps', 'hamstring': 'Isquiotibiales', 'gluteal': 'Glúteos',
  'gluteus': 'Glúteos', 'front-deltoids': 'Hombro Frontal', 'back-deltoids': 'Hombro Trasero',
  'deltoids': 'Hombros', 'shoulders': 'Hombros', 'biceps': 'Bíceps', 'triceps': 'Tríceps',
  'abs': 'Abdomen', 'obliques': 'Oblicuos', 'calves': 'Gemelos', 'forearm': 'Antebrazo',
  'adductor': 'Aductores', 'abductors': 'Abductores', 'adductors': 'Aductores',
  'neck': 'Cuello', 'trapezius': 'Trapecio', 'head': 'Cabeza', 'hands': 'Manos', 'feet': 'Pies',
  'knees': 'Rodillas', 'ankles': 'Tobillos'
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
  const [logs, setLogs] = useState<Record<number, {weight: string, reps: string, note?: string}>>({});
  const [hiitLogs, setHiitLogs] = useState<Record<string, {note?: string}>>({});
  const [recordedVideos, setRecordedVideos] = useState<Record<string, string>>({});
  const [videoUploading, setVideoUploading] = useState<string | null>(null);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  
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

  const [prepSeconds, setPrepSeconds] = useState(0);
  const [isPrep, setIsPrep] = useState(false);
  const prepIntervalRef = useRef<any>(null);
  const [prepTargetTime, setPrepTargetTime] = useState<number | null>(null);

  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [restType, setRestType] = useState<'set' | 'exercise' | null>(null);
  const restIntervalRef = useRef<any>(null);
  const [restTargetTime, setRestTargetTime] = useState<number | null>(null);

  const [workSeconds, setWorkSeconds] = useState(0);
  const [workTotalSeconds, setWorkTotalSeconds] = useState(1);
  const [isWorking, setIsWorking] = useState(false);
  const workIntervalRef = useRef<any>(null);
  const [workTargetTime, setWorkTargetTime] = useState<number | null>(null);

  const beepSoundRef = useRef<Audio.Sound | null>(null);
  const finishSoundRef = useRef<Audio.Sound | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const lastAnnouncedRef = useRef<string>('');
  const justFinishedRestRef = useRef(false);

  // CORRECCIÓN SINTAXIS ASYNCSTORAGE
  useEffect(() => {
    AsyncStorage.getItem('voice_enabled').then(v => {
      if (v === 'false') setVoiceEnabled(false);
    });
    AsyncStorage.getItem('sounds_enabled').then(s => {
      if (s === 'false') setSoundsEnabled(false);
    });
  }, []);

  const announce = async (text: string) => {
    // CORRECCIÓN: Si el entrenamiento ha terminado, mutear voz completamente
    if (!voiceEnabled || finished || (workout && workout.completed)) return; 
    try {
      Speech.stop(); 
      Speech.speak(text, { language: 'es-ES', rate: 0.95 });
    } catch (e) { console.log("Speech Error:", e); }
  };

  useEffect(() => {
    async function initAudio() {
      try {
        await Audio.setAudioModeAsync({ 
          playsInSilentModeIOS: true, 
          staysActiveInBackground: true,
          interruptionModeIOS: Audio.InterruptionModeIOS.DuckOthers,
          interruptionModeAndroid: Audio.InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false
        });
        const { sound: beep } = await Audio.Sound.createAsync(require('../assets/beep.mp3'));
        const { sound: finish } = await Audio.Sound.createAsync(require('../assets/finish.mp3'));
        beepSoundRef.current = beep;
        finishSoundRef.current = finish;
      } catch (e) { console.log("Audio Error:", e); }
    }
    initAudio();
    return () => {
      beepSoundRef.current?.unloadAsync();
      finishSoundRef.current?.unloadAsync();
    };
  }, []);

  const playSound = async (type: 'beep' | 'finish') => {
    if (!soundsEnabled || finished) return;
    try {
      if (type === 'beep') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const soundObj = type === 'beep' ? beepSoundRef.current : finishSoundRef.current;
      if (soundObj) await soundObj.replayAsync(); 
    } catch (error) { console.log(error); }
  };

  const stopAllTimers = () => {
    clearInterval(prepIntervalRef.current);
    clearInterval(workIntervalRef.current);
    clearInterval(restIntervalRef.current);
    setIsPrep(false); setIsWorking(false); setIsResting(false);
    setPrepTargetTime(null); setWorkTargetTime(null); setRestTargetTime(null);
  };

  const handleStartWork = (dur: number, name?: string) => {
    if (finished) return;
    const isFirst = (!isHiit && currentExIndex === 0 && setsStatus[0]?.findIndex(s => s === 'pending') === 0) ||
                    (isHiit && hiitBlockIdx === 0 && hiitExIdx === 0 && hiitRound === 1);

    if (isFirst || !justFinishedRestRef.current) {
      stopAllTimers(); setIsPrep(true); setPrepSeconds(5); setPrepTargetTime(Date.now() + 5000);
      setWorkTotalSeconds(dur); setWorkSeconds(dur);
      announce(name ? `Siguiente: ${name}. Prepárate.` : "Prepárate.");
    } else {
      stopAllTimers(); setIsWorking(true); setWorkTotalSeconds(dur); setWorkSeconds(dur);
      if (dur > 0) setWorkTargetTime(Date.now() + dur * 1000);
      if (name) announce(`A por ello: ${name}`);
    }
    justFinishedRestRef.current = false;
  };

  const handleWorkComplete = () => { stopAllTimers(); if (isHiit) advanceHiitLogic(); else completeSet(); };

  useEffect(() => {
    if (isPrep && prepTargetTime) {
      prepIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((prepTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { playSound('finish'); stopAllTimers(); setIsWorking(true); setWorkTargetTime(Date.now() + workTotalSeconds * 1000); } 
        else { setPrepSeconds(remaining); if (remaining <= 3) playSound('beep'); }
      }, 1000);
    }
    return () => clearInterval(prepIntervalRef.current);
  }, [isPrep, prepTargetTime]);

  useEffect(() => {
    if (isWorking && workTargetTime) {
      workIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((workTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { playSound('finish'); handleWorkComplete(); } 
        else { setWorkSeconds(remaining); if (remaining <= 5) playSound('beep'); }
      }, 1000);
    }
    return () => clearInterval(workIntervalRef.current);
  }, [isWorking, workTargetTime]);

  useEffect(() => {
    if (isResting && restTargetTime) {
      restIntervalRef.current = setInterval(() => {
        const remaining = Math.ceil((restTargetTime - Date.now()) / 1000);
        if (remaining <= 0) { playSound('finish'); stopAllTimers(); justFinishedRestRef.current = true; } 
        else { setRestSeconds(remaining); if (remaining <= 5) playSound('beep'); }
      }, 1000);
    }
    return () => clearInterval(restIntervalRef.current);
  }, [isResting, restTargetTime]);

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
          if (currentWorkout.completed) setFinished(true);
          else {
            const initial: Record<number, SetStatus[]> = {};
            currentWorkout.exercises.forEach((ex: any, i: number) => { initial[i] = Array(parseInt(ex.sets) || 1).fill('pending'); });
            setSetsStatus(initial);
          }
        }
      } catch (e) { console.error(e); } finally { if (isMounted) setLoading(false); }
    };
    fetchWorkoutDetail();
    return () => { isMounted = false; };
  }, [stableWorkoutId]);

  const completeSet = () => {
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const exercises = workout.exercises || [];
    const currentEx = exercises[currentExIndex];
    const s = setsStatus[currentExIndex] || [];
    const next = s.findIndex(i => i === 'pending');
    if (next === -1) return;

    setSetsStatus(prev => {
      const updated = { ...prev };
      updated[currentExIndex] = [...(prev[currentExIndex] || [])];
      updated[currentExIndex][next] = 'completed';
      return updated;
    });

    const rem = s.filter((item, i) => i !== next && item === 'pending').length;
    if (rem === 0) {
      if (currentExIndex < exercises.length - 1) {
        const rest = parseTimeToSeconds(currentEx?.rest_exercise);
        if (rest > 0) { startRestTimer(rest, exercises[currentExIndex + 1].name); setRestType('exercise'); } 
        else { setCurrentExIndex(currentExIndex + 1); }
      } else { setFinished(true); }
    } else {
      const rest = parseTimeToSeconds(currentEx?.rest);
      if (rest > 0) { startRestTimer(rest, currentEx.name); setRestType('set'); }
    }
  };

  const advanceHiitLogic = () => {
    stopAllTimers(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const b = workout.exercises[hiitBlockIdx];
    const totalEx = b.hiit_exercises.length;
    const totalRounds = parseInt(b.sets) || 1;

    if (hiitExIdx < totalEx - 1) {
      const rest = parseTimeToSeconds(b.rest_exercise);
      if (rest > 0) { startRestTimer(rest, b.hiit_exercises[hiitExIdx + 1].name); setHiitPhase('rest_ex'); } 
      else { setHiitExIdx(hiitExIdx + 1); }
    } else if (hiitRound < totalRounds) {
      const rest = parseTimeToSeconds(b.rest_block);
      if (rest > 0) { startRestTimer(rest, b.hiit_exercises[0].name); setHiitPhase('rest_block'); } 
      else { setHiitRound(hiitRound + 1); setHiitExIdx(0); }
    } else if (hiitBlockIdx < workout.exercises.length - 1) {
      const rest = parseTimeToSeconds(b.rest_between_blocks);
      if (rest > 0) { startRestTimer(rest, workout.exercises[hiitBlockIdx + 1].hiit_exercises[0].name); setHiitPhase('rest_next_block'); } 
      else { setHiitBlockIdx(hiitBlockIdx + 1); setHiitRound(1); setHiitExIdx(0); }
    } else { setFinished(true); }
  };

  const buildCompletionData = () => {
    if (isHiit) {
      return {
        rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours, sore_joints: soreJoints,
        hiit_completed: true,
        hiit_results: (workout.exercises || []).map((b: any, bIdx: number) => ({
          ...b,
          hiit_exercises: b.hiit_exercises.map((ex: any, eIdx: number) => ({
            ...ex,
            skipped_rounds: hiitSkipped[`${bIdx}-${eIdx}`] || 0,
            recorded_video_url: recordedVideos[`${bIdx}-${eIdx}`] || '',
            athlete_note: hiitLogs[`${bIdx}-${eIdx}`]?.note || ''
          }))
        }))
      };
    }
    return {
      rpe, sleep_quality: sleepQuality, sleep_hours: sleepHours, sore_joints: soreJoints,
      exercise_results: (workout.exercises || []).map((ex: any, i: number) => ({
        exercise_index: i, name: ex.name,
        total_sets: parseInt(ex.sets) || 1,
        completed_sets: (setsStatus[i] || []).filter(item => item === 'completed').length,
        logged_weight: logs[i]?.weight || '',
        logged_reps: logs[i]?.reps || '',
        athlete_note: logs[i]?.note || '',
        recorded_video_url: recordedVideos[i.toString()] || ''
      }))
    };
  };

  const handleFinish = async () => {
    if (workout.completed) { router.back(); return; }
    stopAllTimers();
    const data = buildCompletionData();
    try {
      const update: any = { completed: true, completion_data: data, title: workout.title, exercises: workout.exercises };
      if (observations.trim()) update.observations = observations.trim();
      const net = await NetInfo.fetch();
      if (net.isConnected) { await api.updateWorkout(stableWorkoutId, update); } 
      else { await syncManager.savePendingWorkout(stableWorkoutId, update); }
      router.back();
    } catch (e) { console.error("Error saving:", e); Alert.alert("Error", "No se pudo guardar."); }
  };

  const toggleJoint = (part: any) => { 
    if (!part?.slug) return; 
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); 
    setSoreJoints(prev => prev.includes(part.slug) ? prev.filter(j => j !== part.slug) : [...prev, part.slug]); 
  };

  const renderBodyMapModal = () => {
    const errorColor = colors.error || '#EF4444';
    const data = soreJoints.map(slug => ({ slug, intensity: 1 }));

    return (
      <Modal visible={showBodyMap} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.bodyMapModalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary }}>Registrar Fatiga</Text>
              <TouchableOpacity onPress={() => setShowBodyMap(false)}><Ionicons name="close" size={28} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            <View style={styles.bodyContainer}>
                <Body 
                  data={data} gender="female" scale={1.4} 
                  colors={['#E2E8F0', errorColor]} 
                  onBodyPartPress={toggleJoint} 
                />
            </View>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={() => setShowBodyMap(false)}>
              <Text style={styles.confirmBtnText}>Confirmar Selección</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  if (finished || (workout && workout.completed)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}><TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity><Text style={[styles.topTitle, { color: colors.textPrimary }]}>Resumen</Text><View style={{ width: 26 }} /></View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={{ alignItems: 'center', marginVertical: 20 }}><Ionicons name="trophy" size={80} color={colors.warning || '#F59E0B'} /><Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>¡Sesión terminada!</Text></View>
          
          <View style={styles.summarySection}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>ESFUERZO RPE (1-10)</Text>
            <View style={styles.rpeGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <TouchableOpacity key={num} onPress={() => setRpe(num)} style={[styles.rpeCircle, rpe === num && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={{ color: rpe === num ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={[styles.bodyMapTrigger, { borderColor: colors.border }]} onPress={() => setShowBodyMap(true)}>
             <Ionicons name="body" size={24} color={colors.primary} />
             <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{soreJoints.length > 0 ? `${soreJoints.length} zonas marcadas` : "Marcar molestias corporales"}</Text>
          </TouchableOpacity>

          <View style={styles.summarySection}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>OBSERVACIONES</Text>
            <TextInput style={[styles.obsInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]} multiline placeholder="¿Cómo te has sentido?" value={observations} onChangeText={setObservations} />
          </View>

          <TouchableOpacity style={[styles.finishBtn, { backgroundColor: colors.primary }]} onPress={handleFinish}><Text style={styles.finishBtnText}>FINALIZAR ENTRENAMIENTO</Text></TouchableOpacity>
        </ScrollView>
        {renderBodyMapModal()}
      </SafeAreaView>
    );
  }

  // MODO ENTRENAMIENTO (TIMER + CARDS)
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => { stopAllTimers(); router.back(); }}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout.title}</Text>
          <View style={{ width: 26 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <UnifiedTimer 
            isPrep={isPrep} isResting={isResting} isWorking={isWorking} 
            prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds}
            restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds}
            exName={isHiit ? workout.exercises[hiitBlockIdx].hiit_exercises[hiitExIdx].name : workout.exercises[currentExIndex].name}
            colors={colors} onComplete={handleWorkComplete}
          />
          {isHiit ? (
            <HiitCard 
              currentBlock={workout.exercises[hiitBlockIdx]} hiitRound={hiitRound} hiitPhase={hiitPhase} 
              hiitExIdx={hiitExIdx} hiitBlockIdx={hiitBlockIdx} colors={colors} hiitLogs={hiitLogs} 
              setHiitLogs={setHiitLogs} recordedVideos={recordedVideos}
            />
          ) : (
            <View style={[styles.tradCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
               <Text style={[styles.tradExName, { color: colors.textPrimary }]}>{workout.exercises[currentExIndex].name}</Text>
               <View style={styles.setsGrid}>
                  {(setsStatus[currentExIndex] || []).map((st, i) => (
                    <View key={i} style={[styles.setCircle, st === 'completed' && { backgroundColor: colors.success, borderColor: colors.success }]}>
                      {st === 'completed' ? <Ionicons name="checkmark" size={20} color="#FFF" /> : <Text style={{ color: colors.textSecondary }}>{i+1}</Text>}
                    </View>
                  ))}
               </View>
               <View style={styles.logRow}>
                  <TextInput style={[styles.logInput, { borderColor: colors.border, color: colors.textPrimary }]} placeholder="Kg" keyboardType="numeric" value={logs[currentExIndex]?.weight} onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], weight: t}}))} />
                  <TextInput style={[styles.logInput, { borderColor: colors.border, color: colors.textPrimary }]} placeholder="Reps" keyboardType="numeric" value={logs[currentExIndex]?.reps} onChangeText={t => setLogs(p => ({...p, [currentExIndex]: {...p[currentExIndex], reps: t}}))} />
               </View>
            </View>
          )}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
           <TouchableOpacity onPress={() => { if(currentExIndex > 0) setCurrentExIndex(currentExIndex-1); }}><Text style={{ color: colors.textPrimary }}>Anterior</Text></TouchableOpacity>
           <TouchableOpacity onPress={() => { if(currentExIndex < workout.exercises.length-1) setCurrentExIndex(currentExIndex+1); else setFinished(true); }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Siguiente</Text></TouchableOpacity>
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  topTitle: { fontSize: 16, fontWeight: '700' }, content: { padding: 20, gap: 20 },
  finishedTitle: { fontSize: 24, fontWeight: '900', marginTop: 10 },
  summarySection: { width: '100%', gap: 10 }, label: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  rpeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  rpeCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  bodyMapTrigger: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  obsInput: { borderRadius: 12, borderWidth: 1, padding: 15, minHeight: 100, textAlignVertical: 'top' },
  finishBtn: { padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 10 }, finishBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  bodyMapModalContent: { width: '95%', height: '85%', padding: 20, borderRadius: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  bodyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confirmBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 15 }, confirmBtnText: { color: '#FFF', fontWeight: '700' },
  tradCard: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 15 }, tradExName: { fontSize: 20, fontWeight: '800' },
  setsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, setCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  logRow: { flexDirection: 'row', gap: 10 }, logInput: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderTopWidth: 1, paddingBottom: 40 },
  miniVideoContainer: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden' }, expandBtn: { position: 'absolute', right: 5, bottom: 5, backgroundColor: 'rgba(0,0,0,0.5)', padding: 4, borderRadius: 10 }
});
