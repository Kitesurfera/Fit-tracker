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

  useEffect(() => {
    AsyncStorage.getItem('voice_enabled').then(v => if (v === 'false') setVoiceEnabled(false));
    AsyncStorage.getItem('sounds_enabled').then(s => if (s === 'false') setSoundsEnabled(false));
  }, []);

  const announce = async (text: string) => {
    // CRÍTICO: Si el entrenamiento ha terminado, no hablar más
    if (!voiceEnabled || finished || workout?.completed) return; 
    try {
      Speech.stop(); 
      Speech.speak(text, { language: 'es-ES', rate: 0.95 });
    } catch (e) { console.log(e); }
  };

  useEffect(() => {
    async function initAudio() {
      try {
        const { sound: beep } = await Audio.Sound.createAsync(require('../assets/beep.mp3'));
        const { sound: finish } = await Audio.Sound.createAsync(require('../assets/finish.mp3'));
        beepSoundRef.current = beep;
        finishSoundRef.current = finish;
      } catch (e) { console.log(e); }
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
      await soundObj?.replayAsync(); 
    } catch (error) { console.log(error); }
  };

  const stopAllTimers = () => {
    clearInterval(prepIntervalRef.current);
    clearInterval(workIntervalRef.current);
    clearInterval(restIntervalRef.current);
    setIsPrep(false); setIsWorking(false); setIsResting(false);
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
        const rem = Math.ceil((prepTargetTime - Date.now()) / 1000);
        if (rem <= 0) { playSound('finish'); stopAllTimers(); setIsWorking(true); setWorkTargetTime(Date.now() + workTotalSeconds * 1000); } 
        else { setPrepSeconds(rem); if (rem <= 3) playSound('beep'); }
      }, 1000);
    }
    return () => clearInterval(prepIntervalRef.current);
  }, [isPrep, prepTargetTime]);

  useEffect(() => {
    if (isWorking && workTargetTime) {
      workIntervalRef.current = setInterval(() => {
        const rem = Math.ceil((workTargetTime - Date.now()) / 1000);
        if (rem <= 0) { playSound('finish'); handleWorkComplete(); } 
        else { setWorkSeconds(rem); if (rem <= 5) playSound('beep'); }
      }, 1000);
    }
    return () => clearInterval(workIntervalRef.current);
  }, [isWorking, workTargetTime]);

  useEffect(() => {
    if (isResting && restTargetTime) {
      restIntervalRef.current = setInterval(() => {
        const rem = Math.ceil((restTargetTime - Date.now()) / 1000);
        if (rem <= 0) { playSound('finish'); stopAllTimers(); justFinishedRestRef.current = true; } 
        else { setRestSeconds(rem); if (rem <= 5) playSound('beep'); }
      }, 1000);
    }
    return () => clearInterval(restIntervalRef.current);
  }, [isResting, restTargetTime]);

  // Carga de datos inicial
  useEffect(() => {
    let isMounted = true;
    api.getWorkouts().then(all => {
      const current = all.find((w: any) => w.id === stableWorkoutId);
      if (current && isMounted) {
        setWorkout(current);
        const hiit = current.exercises?.[0]?.is_hiit_block === true;
        setIsHiit(hiit);
        if (current.completed) setFinished(true);
        else {
          const init: Record<number, SetStatus[]> = {};
          current.exercises.forEach((ex: any, i: number) => init[i] = Array(parseInt(ex.sets) || 1).fill('pending'));
          setSetsStatus(init);
        }
      }
      setLoading(false);
    });
    return () => { isMounted = false; };
  }, [stableWorkoutId]);

  const completeSet = () => {
    const s = setsStatus[currentExIndex] || [];
    const next = s.findIndex(i => i === 'pending');
    if (next === -1) return;
    
    const updated = {...setsStatus};
    updated[currentExIndex] = [...s];
    updated[currentExIndex][next] = 'completed';
    setSetsStatus(updated);

    const rem = updated[currentExIndex].filter(item => item === 'pending').length;
    if (rem === 0) {
      if (currentExIndex < workout.exercises.length - 1) {
        const rest = parseTimeToSeconds(workout.exercises[currentExIndex].rest_exercise);
        if (rest > 0) {
           stopAllTimers(); setRestTargetTime(Date.now() + rest * 1000); setIsResting(true); setRestTotalSeconds(rest);
           announce(`Descanso. Siguiente: ${workout.exercises[currentExIndex+1].name}`);
        } else { setCurrentExIndex(currentExIndex + 1); }
      } else { setFinished(true); announce("¡Entrenamiento terminado!"); }
    } else {
      const rest = parseTimeToSeconds(workout.exercises[currentExIndex].rest);
      if (rest > 0) {
        stopAllTimers(); setRestTargetTime(Date.now() + rest * 1000); setIsResting(true); setRestTotalSeconds(rest);
        announce("Descanso.");
      }
    }
  };

  const advanceHiitLogic = () => {
    const b = workout.exercises[hiitBlockIdx];
    const totalEx = b.hiit_exercises.length;
    const totalRounds = parseInt(b.sets) || 1;

    if (hiitExIdx < totalEx - 1) {
      const rest = parseTimeToSeconds(b.rest_exercise);
      if (rest > 0) {
        setHiitPhase('rest_ex'); stopAllTimers(); setRestTargetTime(Date.now() + rest * 1000); setIsResting(true);
      } else { setHiitExIdx(hiitExIdx + 1); }
    } else if (hiitRound < totalRounds) {
      const rest = parseTimeToSeconds(b.rest_block);
      setHiitPhase('rest_block'); stopAllTimers(); setRestTargetTime(Date.now() + rest * 1000); setIsResting(true);
    } else if (hiitBlockIdx < workout.exercises.length - 1) {
      const rest = parseTimeToSeconds(b.rest_between_blocks);
      setHiitPhase('rest_next_block'); stopAllTimers(); setRestTargetTime(Date.now() + rest * 1000); setIsResting(true);
    } else { setFinished(true); announce("¡Entrenamiento terminado!"); }
  };

  const handleFinish = async () => {
    if (workout.completed) { router.back(); return; }
    stopAllTimers();
    setLoading(true); // Evitar doble clic
    
    const data = buildCompletionData();
    try {
      const update: any = { 
        completed: true, 
        completion_data: data, 
        observations: observations.trim() 
      };
      
      const net = await NetInfo.fetch();
      if (net.isConnected) {
        await api.updateWorkout(stableWorkoutId, update);
      } else {
        await syncManager.savePendingWorkout(stableWorkoutId, update);
      }
      router.replace('/(tabs)/calendar'); // Usar replace para limpiar stack
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el entrenamiento.");
    } finally {
      setLoading(false);
    }
  };

  const toggleJoint = (part: any) => {
    if (!part?.slug) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSoreJoints(prev => prev.includes(part.slug) ? prev.filter(j => j !== part.slug) : [...prev, part.slug]);
  };

  // Vistas y Modales
  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => { stopAllTimers(); router.back(); }}><Ionicons name="close" size={26} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{workout?.title}</Text>
        <View style={{ width: 26 }} />
      </View>

      {!finished ? (
        <ScrollView contentContainerStyle={styles.content}>
           <UnifiedTimer 
             isPrep={isPrep} isResting={isResting} isWorking={isWorking} 
             prepSeconds={prepSeconds} restSeconds={restSeconds} workSeconds={workSeconds}
             restTotalSeconds={restTotalSeconds} workTotalSeconds={workTotalSeconds}
             exName={isHiit ? workout.exercises[hiitBlockIdx].hiit_exercises[hiitExIdx].name : workout.exercises[currentExIndex].name}
             colors={colors} onComplete={handleWorkComplete}
           />
           {/* Aquí irían las cards de ejercicios HIIT o Tradicional */}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>¡Buen trabajo!</Text>
          <View style={styles.rpeContainer}>
             <Text style={[styles.label, { color: colors.textSecondary }]}>ESFUERZO RPE (1-10)</Text>
             <View style={styles.rpeGrid}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <TouchableOpacity key={n} onPress={() => setRpe(n)} style={[styles.rpeCircle, rpe === n && { backgroundColor: colors.primary }]}>
                    <Text style={{ color: rpe === n ? '#FFF' : colors.textPrimary }}>{n}</Text>
                  </TouchableOpacity>
                ))}
             </View>
          </View>

          <TouchableOpacity style={styles.bodyMapBtn} onPress={() => setShowBodyMap(true)}>
             <Ionicons name="body" size={24} color={colors.primary} />
             <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
               {soreJoints.length > 0 ? `${soreJoints.length} zonas marcadas` : "Marcar molestias"}
             </Text>
          </TouchableOpacity>

          <TextInput 
            style={[styles.obsInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            placeholder="Notas finales..." placeholderTextColor="#888" multiline
            value={observations} onChangeText={setObservations}
          />

          <TouchableOpacity style={[styles.finishBtn, { backgroundColor: colors.primary }]} onPress={handleFinish}>
            <Text style={styles.finishBtnText}>FINALIZAR SESIÓN</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* MODAL MAPA CORPORAL */}
      <Modal visible={showBodyMap} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800' }}>Mapa de Fatiga</Text>
            <TouchableOpacity onPress={() => setShowBodyMap(false)}><Ionicons name="close" size={30} color={colors.textPrimary} /></TouchableOpacity>
          </View>
          <View style={styles.bodyContainer}>
             <Body
               data={soreJoints.map(s => ({ slug: s, intensity: 1 }))}
               gender="female"
               scale={1.4}
               colors={[colors.border, colors.error]}
               onBodyPartPress={toggleJoint}
             />
          </View>
          <TouchableOpacity style={[styles.confirmBodyBtn, { backgroundColor: colors.primary }]} onPress={() => setShowBodyMap(false)}>
            <Text style={{ color: '#FFF', fontWeight: '800' }}>CONFIRMAR</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  topTitle: { fontSize: 16, fontWeight: '700' },
  content: { padding: 20, gap: 20 },
  finishedTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginVertical: 20 },
  rpeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 10 },
  rpeCircle: { width: 45, height: 45, borderRadius: 23, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  bodyMapBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ccc', justifyContent: 'center' },
  obsInput: { borderRadius: 10, padding: 15, minHeight: 100, textAlignVertical: 'top' },
  finishBtn: { padding: 18, borderRadius: 12, alignItems: 'center' },
  finishBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  bodyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confirmBodyBtn: { margin: 20, padding: 18, borderRadius: 12, alignItems: 'center' }
});

