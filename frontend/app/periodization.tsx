import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

export default function PeriodizationScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [data, setData] = useState<{macros: any[], unassigned: any[]}>({macros: [], unassigned: []});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTree = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      
      if (!params.athlete_id) {
        setErrorMessage("Falta el ID del deportista en la URL.");
        return;
      }

      const res = await api.getPeriodizationTree(params.athlete_id);
      
      // Si el servidor mandó un error capturado
      if (res.error) {
        setErrorMessage(`Error del Servidor: ${res.error}`);
        return;
      }

      setData({
        macros: res.macros || [],
        unassigned: res.unassigned_workouts || []
      });
    } catch (e: any) {
      console.error(e);
      setErrorMessage(`Error de Conexión: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTree(); }, []);

  if (errorMessage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', padding: 20 }]}>
        <Ionicons name="alert-circle" size={60} color={colors.error} style={{ alignSelf: 'center' }} />
        <Text style={{ color: colors.textPrimary, textAlign: 'center', fontSize: 18, fontWeight: '800', marginTop: 10 }}>Algo salió mal</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 10 }}>{errorMessage}</Text>
        <TouchableOpacity style={[styles.mainBtn, { backgroundColor: colors.primary, marginTop: 20 }]} onPress={loadTree}>
          <Text style={{ color: '#FFF', fontWeight: '800' }}>REINTENTAR</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

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
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Calendario - {params.name}</Text>
        <TouchableOpacity onPress={loadTree}><Ionicons name="sync" size={24} color={colors.primary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {data.macros.length === 0 && data.unassigned.length === 0 ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>No hay entrenamientos planificados todavía.</Text>
        ) : (
          <>
            {data.macros.map((macro) => (
              <View key={macro.id || Math.random()} style={[styles.macroCard, { borderColor: macro.color || colors.border }]}>
                <View style={[styles.macroHeader, { backgroundColor: (macro.color || colors.primary) + '20' }]}>
                  <Text style={[styles.macroTitle, { color: macro.color }]}>{macro.nombre}</Text>
                </View>
                
                <View style={{ padding: 12 }}>
                  {macro.microciclos?.map((micro: any) => (
                    <View key={micro.id || Math.random()} style={styles.microBox}>
                      <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{micro.nombre}</Text>
                      {micro.workouts?.map((wk: any) => (
                        <TouchableOpacity 
                          key={wk.id || Math.random()} 
                          style={styles.workoutRow}
                          onPress={() => router.push({ pathname: '/edit-workout', params: { workoutId: wk.id } })}
                        >
                          <Ionicons name="barbell-outline" size={16} color={colors.primary} />
                          <Text style={{ color: colors.textPrimary, flex: 1 }}>{wk.title}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{wk.date}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {data.unassigned.length > 0 && (
              <View style={styles.macroCard}>
                <View style={styles.macroHeader}><Text style={styles.macroTitle}>SIN ASIGNAR</Text></View>
                <View style={{ padding: 12 }}>
                  {data.unassigned.map((wk: any) => (
                    <TouchableOpacity key={wk.id} style={styles.workoutRow}>
                      <Text style={{ color: colors.textPrimary }}>{wk.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  macroCard: { borderWidth: 1, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  macroHeader: { padding: 12 },
  macroTitle: { fontWeight: '900', fontSize: 14, textTransform: 'uppercase' },
  microBox: { marginBottom: 12, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#EEE' },
  workoutRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  mainBtn: { padding: 15, borderRadius: 12, alignItems: 'center' }
});
