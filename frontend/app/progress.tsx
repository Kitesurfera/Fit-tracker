import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';

const screenWidth = Dimensions.get('window').width;

export default function ProgressScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ athlete_id: string; name: string }>();
  
  const [progressData, setProgressData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        if (params.athlete_id) {
          const data = await api.getProgress(params.athlete_id);
          setProgressData(data);
        }
      } catch (e) {
        console.log("Error cargando el progreso:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [params.athlete_id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const tests = progressData ? Object.keys(progressData) : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Evolución - {params.name}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 50 }}>
        {tests.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Aún no hay suficientes test físicos registrados para mostrar tu evolución.
          </Text>
        ) : (
          tests.map((testName, index) => {
            const data = progressData[testName];
            const history = data.history || [];
            
            // Si solo hay 1 dato, no dibujamos curva, mostramos el valor inicial
            if (history.length < 2) {
              return (
                <View key={index} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.testName, { color: colors.textPrimary }]}>{testName}</Text>
                  <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 10, textAlign: 'left' }]}>
                    Necesitamos al menos 2 registros para dibujar la gráfica. (Marca actual: {history[0]?.value} {history[0]?.unit})
                  </Text>
                </View>
              );
            }

            // Mapeamos los datos de Y (valores) y X (fechas)
            const labels = history.map((h: any) => {
              const d = new Date(h.date);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            });
            const values = history.map((h: any) => h.value);
            const unit = history[0].unit;
            
            const change = data.change_percent;
            const isPositive = change >= 0;
            const changeColor = isPositive ? colors.success : colors.error;

            return (
              <View key={index} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={[styles.testName, { color: colors.textPrimary }]}>{testName}</Text>
                    <Text style={[styles.unitText, { color: colors.textSecondary }]}>Medido en {unit}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: changeColor + '20' }]}>
                    <Ionicons name={isPositive ? "trending-up" : "trending-down"} size={14} color={changeColor} />
                    <Text style={[styles.badgeText, { color: changeColor }]}>
                      {isPositive ? '+' : ''}{change}%
                    </Text>
                  </View>
                </View>

                <LineChart
                  data={{ labels: labels, datasets: [{ data: values }] }}
                  width={screenWidth - 65} // Ajuste para los márgenes del móvil
                  height={220}
                  yAxisSuffix={` ${unit}`}
                  chartConfig={{
                    backgroundColor: colors.surface,
                    backgroundGradientFrom: colors.surface,
                    backgroundGradientTo: colors.surface,
                    decimalPlaces: 1,
                    color: (opacity = 1) => colors.primary,
                    labelColor: (opacity = 1) => colors.textSecondary,
                    style: { borderRadius: 16 },
                    propsForDots: { r: "5", strokeWidth: "2", stroke: colors.primary }
                  }}
                  bezier
                  style={{ marginVertical: 8, borderRadius: 16, alignSelf: 'center' }}
                />
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerBtn: { width: 40 },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16 },
  emptyText: { textAlign: 'center', fontSize: 14, marginTop: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  testName: { fontSize: 18, fontWeight: '800', textTransform: 'capitalize' },
  unitText: { fontSize: 12, marginTop: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  badgeText: { fontSize: 13, fontWeight: '800' }
});
