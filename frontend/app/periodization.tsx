import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function PeriodizationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [macros, setMacros] = useState<any[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTree = async () => {
    try {
      setLoading(true);
      if (!params.athlete_id) {
        console.error("No athlete_id provided");
        return;
      }
      const data = await api.getPeriodizationTree(params.athlete_id);
      setMacros(data?.macros || []);
      setUnassigned(data?.unassigned_workouts || []);
    } catch (e) {
      console.log("Error en calendario:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, [params.athlete_id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Calendario - {params.name}</Text>
        <TouchableOpacity onPress={loadTree}>
          <Ionicons name="sync" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {macros.length === 0 && unassigned.length === 0 ? (
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary }}>No hay planificación aún.</Text>
            <TouchableOpacity 
              style={{ marginTop: 20, padding: 10, backgroundColor: colors.primary, borderRadius: 8 }}
              onPress={() => Alert.alert("Nuevo", "Función para crear macro disponible en breve")}
            >
              <Text style={{ color: '#FFF' }}>Crear primer macrociclo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          macros.map((macro) => (
            <View key={macro.id} style={[styles.card, { borderColor: macro.color || colors.border }]}>
              <Text style={[styles.cardTitle, { color: macro.color }]}>{macro.nombre}</Text>
              {macro.microciclos?.map((micro: any) => (
                <View key={micro.id} style={styles.microRow}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{micro.nombre}</Text>
                  {micro.workouts?.map((wk: any) => (
                    <TouchableOpacity 
                      key={wk.id} 
                      style={styles.workoutItem}
                      onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } })}
                    >
                      <Text style={{ color: colors.textSecondary }}>• {wk.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  card: { borderWidth: 2, borderRadius: 12, padding: 16, marginBottom: 15 },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },
  microRow: { marginTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#eee' },
  workoutItem: { paddingVertical: 4, paddingLeft: 10 }
});
