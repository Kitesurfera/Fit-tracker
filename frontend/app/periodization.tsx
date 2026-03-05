import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function PeriodizationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [tree, setTree] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTree = async () => {
    try {
      const data = await api.getPeriodizationTree(params.athlete_id!);
      setTree(data);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Calendario - {params.name}</Text>
        <TouchableOpacity onPress={() => {/* Abrir modal nuevo macrociclo */}}>
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
        {tree.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No hay planificación estructurada aún. Comienza creando un Macrociclo.
          </Text>
        ) : (
          tree.map((macro, i) => (
            <View key={i} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
              {/* CABECERA MACROCICLO */}
              <View style={[styles.macroHeader, { backgroundColor: macro.color + '20' }]}>
                <View>
                  <Text style={[styles.macroTitle, { color: macro.color }]}>{macro.nombre}</Text>
                  <Text style={styles.dateText}>{macro.fecha_inicio} al {macro.fecha_fin}</Text>
                </View>
                <TouchableOpacity style={styles.addMicroBtn} onPress={() => {/* Modal microciclo */}}>
                  <Ionicons name="add" size={18} color={macro.color} />
                  <Text style={{ color: macro.color, fontSize: 12, fontWeight: '700' }}>Microciclo</Text>
                </TouchableOpacity>
              </View>

              {/* LISTA DE MICROCICLOS */}
              <View style={styles.microContainer}>
                {macro.microciclos?.map((micro: any, j: number) => (
                  <View key={j} style={[styles.microCard, { borderLeftColor: micro.color }]}>
                    <Text style={styles.microTitle}>{micro.nombre} ({micro.tipo})</Text>
                    <Text style={styles.dateText}>{micro.fecha_inicio} al {micro.fecha_fin}</Text>
                    
                    {/* ENTRENAMIENTOS DEL MICROCICLO */}
                    <View style={styles.workoutList}>
                      {micro.workouts?.map((wk: any, k: number) => (
                        <View key={k} style={styles.workoutItem}>
                          <Ionicons name={wk.completed ? "checkmark-circle" : "barbell"} size={16} color={wk.completed ? colors.success : colors.textSecondary} />
                          <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{wk.title} ({wk.date})</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  
  macroCard: { borderWidth: 2, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  macroHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroTitle: { fontSize: 18, fontWeight: '800', textTransform: 'uppercase' },
  dateText: { fontSize: 12, color: '#666', marginTop: 4 },
  addMicroBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  
  microContainer: { padding: 12, backgroundColor: '#FAFAFA' },
  microCard: { backgroundColor: '#FFF', padding: 12, borderRadius: 8, borderLeftWidth: 6, marginBottom: 10, elevation: 1 },
  microTitle: { fontSize: 15, fontWeight: '700' },
  
  workoutList: { marginTop: 10, gap: 6 },
  workoutItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  workoutTitle: { fontSize: 13, fontWeight: '500' }
});
