import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [athletes, setAthletes] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      if (user?.role === 'trainer') {
        const [ath, wk] = await Promise.all([api.getAthletes(), api.getWorkouts()]);
        setAthletes(ath);
        setWorkouts(wk.slice(0, 5));
      } else {
        const [wk, sum] = await Promise.all([api.getWorkouts(), api.getSummary()]);
        setWorkouts(wk.slice(0, 10));
        setSummary(sum);
      }
    } catch (e) {
      console.log('Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const TrainerView = () => (
    <FlatList
      testID="trainer-dashboard"
      data={athletes}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          <Text style={[styles.date, { color: colors.textSecondary }]}>{today}</Text>
          <Text style={[styles.greeting, { color: colors.textPrimary }]}>Hola, {user?.name?.split(' ')[0]}</Text>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{athletes.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Deportistas</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
