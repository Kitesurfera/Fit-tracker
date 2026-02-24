import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function TrainingModeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [completedSets, setCompletedSets] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (workoutId) {
      api.getWorkout(workoutId).then(setWorkout).catch(console.log).finally(() => setLoading(false));
    }
  }, [workoutId]);

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
  const doneSets = completedSets[currentExIndex] || 0;
  const progress = exercises.length > 0 ? ((currentExIndex + (doneSets / totalSets)) / exercises.length) * 100 : 0;

  const completeSet = () => {
    const newDone = doneSets + 1;
    setCompletedSets({ ...completedSets, [currentExIndex]: newDone });
    if (newDone >= totalSets) {
      // Auto-advance after completing all sets
      if (currentExIndex < exercises.length - 1) {
        setTimeout(() => nextExercise(), 500);
      } else {
        setFinished(true);
      }
    }
  };

  const nextExercise = () => {
    if (currentExIndex < exercises.length - 1) {
      setCurrentExIndex(currentExIndex + 1);
    }
  };

  const prevExercise = () => {
    if (currentExIndex > 0) {
      setCurrentExIndex(currentExIndex - 1);
    }
  };

  const handleFinish = async () => {
    try {
      await api.updateWorkout(workoutId!, { completed: true });
    } catch (e) {
      console.log(e);
    }
    router.back();
  };

  const handleExit = () => {
    router.back();
  };

  if (finished) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.finishedContainer}>
          <View style={[styles.finishedIcon, { backgroundColor: colors.success + '15' }]}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={[styles.finishedTitle, { color: colors.textPrimary }]}>Entrenamiento completado!</Text>
          <Text style={[styles.finishedSub, { color: colors.textSecondary }]}>
            Has completado {exercises.length} ejercicios
          </Text>
          <TouchableOpacity
            testID="finish-training-btn"
            style={[styles.finishBtn, { backgroundColor: colors.success }]}
            onPress={handleFinish}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={20} color="#FFF" />
            <Text style={styles.finishBtnText}>Marcar como completado</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exitLink} onPress={handleExit} activeOpacity={0.6}>
            <Text style={[styles.exitLinkText, { color: colors.textSecondary }]}>Volver sin marcar</Text>
          </TouchableOpacity>
        </View>
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

          {/* Details grid */}
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

          {/* Video link */}
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
                <Text style={[styles.videoBtnUrl, { color: colors.textSecondary }]} numberOfLines={1}>
                  {currentEx.video_url}
                </Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Sets tracker */}
        <View style={[styles.setsCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.setsTitle, { color: colors.textPrimary }]}>Series completadas</Text>
          <View style={styles.setsGrid}>
            {Array.from({ length: totalSets }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.setCircle,
                  { borderColor: colors.border },
                  i < doneSets && { backgroundColor: colors.success, borderColor: colors.success },
                ]}
              >
                {i < doneSets ? (
                  <Ionicons name="checkmark" size={18} color="#FFF" />
                ) : (
                  <Text style={[styles.setNum, { color: colors.textSecondary }]}>{i + 1}</Text>
                )}
              </View>
            ))}
          </View>
          <TouchableOpacity
            testID="complete-set-btn"
            style={[
              styles.completeSetBtn,
              { backgroundColor: doneSets >= totalSets ? colors.surfaceHighlight : colors.primary },
            ]}
            onPress={completeSet}
            disabled={doneSets >= totalSets}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle-outline" size={22} color={doneSets >= totalSets ? colors.textSecondary : '#FFF'} />
            <Text style={[styles.completeSetText, { color: doneSets >= totalSets ? colors.textSecondary : '#FFF' }]}>
              {doneSets >= totalSets ? 'Todas completadas' : `Completar serie ${doneSets + 1}`}
            </Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            testID="finish-all-btn"
            style={[styles.navBtn]}
            onPress={() => setFinished(true)}
            activeOpacity={0.6}
          >
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
  // Sets
  setsCard: { borderRadius: 16, padding: 20, gap: 16 },
  setsTitle: { fontSize: 16, fontWeight: '600' },
  setsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  setCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  setNum: { fontSize: 15, fontWeight: '600' },
  completeSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 16,
  },
  completeSetText: { fontSize: 16, fontWeight: '600' },
  // Bottom nav
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28, borderTopWidth: 0.5,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  navBtnText: { fontSize: 15, fontWeight: '500' },
  exCounter: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  exCounterText: { fontSize: 14, fontWeight: '600' },
  // Finished
  finishedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  finishedIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  finishedTitle: { fontSize: 24, fontWeight: '700' },
  finishedSub: { fontSize: 16 },
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, marginTop: 8,
  },
  finishBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  exitLink: { paddingVertical: 12 },
  exitLinkText: { fontSize: 15 },
  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 16 },
  exitBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 24 },
  exitBtnText: { fontSize: 15, fontWeight: '500' },
});
