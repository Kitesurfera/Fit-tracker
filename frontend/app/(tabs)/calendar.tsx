import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';

// Configuración en español
LocaleConfig.locales['es'] = {
  monthNames: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  monthNamesShort: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
  dayNames: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
  dayNamesShort: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
  today: 'Hoy'
};
LocaleConfig.defaultLocale = 'es';

export default function CalendarScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  
  const [athletes, setAthletes] = useState<any[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<any>(null);
  const [periodization, setPeriodization] = useState<any[]>([]);
  const [markedDates, setMarkedDates] = useState<any>({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  const isTrainer = user?.role === 'trainer';

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(data);
        if (data.length > 0) {
          handleSelectAthlete(data[0]);
        }
      } else {
        handleSelectAthlete(user);
      }
    } catch (e) {
      console.log("Error inicializando calendario:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAthlete = async (athlete: any) => {
    setSelectedAthlete(athlete);
    setShowPicker(false);
    setLoading(true);
    try {
      const tree = await api.getPeriodizationTree(athlete.id);
      setPeriodization(tree);
      generateMarkedDates(tree);
    } catch (e) {
      console.log("Error cargando planificación:", e);
    } finally {
      setLoading(false);
    }
  };

  const generateMarkedDates = (tree: any[]) => {
    const marks: any = {};
    tree.forEach(macro => {
      macro.microciclos?.forEach((micro: any) => {
        // Marcamos el rango del microciclo con el color asignado
        let start = new Date(micro.fecha_inicio);
        let end = new Date(micro.fecha_fin);
        
        for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          marks[dateStr] = {
            color: micro.color || colors.primary,
            textColor: 'white',
            startingDay: dateStr === micro.fecha_inicio,
            endingDay: dateStr === micro.fecha_fin,
            periodType: micro.tipo // Guardamos el tipo para el detalle
          };
        }
      });
    });
    setMarkedDates(marks);
  };

  // Encontrar qué microciclo corresponde al día seleccionado
  const activeDetail = useMemo(() => {
    for (const macro of periodization) {
      const micro = macro.microciclos?.find((m: any) => 
        selectedDate >= m.fecha_inicio && selectedDate <= m.fecha_fin
      );
      if (micro) return { macro, micro };
    }
    return null;
  }, [selectedDate, periodization]);

  if (loading && athletes.length === 0) {
    return <View style={{flex:1, justifyContent:'center', backgroundColor:colors.background}}><ActivityIndicator size="large" color={colors.primary}/></View>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* SELECTOR DE DEPORTISTA (Solo para Andreina) */}
      {isTrainer && (
        <TouchableOpacity 
          style={[styles.athleteSelector, { backgroundColor: colors.surface }]}
          onPress={() => setShowPicker(true)}
        >
          <View style={styles.selectorInfo}>
            <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700' }}>DEPORTISTA</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '800' }}>
              {selectedAthlete?.name || 'Seleccionar...'}
            </Text>
          </View>
          <Ionicons name="people-circle" size={24} color={colors.primary} />
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Calendar
          markingType={'period'}
          markedDates={markedDates}
          onDayPress={day => setSelectedDate(day.dateString)}
          theme={{
            calendarBackground: colors.background,
            textSectionTitleColor: colors.textSecondary,
            dayTextColor: colors.textPrimary,
            todayTextColor: colors.primary,
            monthTextColor: colors.textPrimary,
            textDayFontWeight: '600',
            textMonthFontWeight: '800',
          }}
        />

        {/* DETALLE DEL CICLO SELECCIONADO */}
        <View style={styles.detailContainer}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>PLANIFICACIÓN</Text>
          
          {activeDetail ? (
            <View style={[styles.cycleCard, { borderLeftColor: activeDetail.micro.color || colors.primary }]}>
              <View style={styles.cycleHeader}>
                <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>MACROCICLO: {activeDetail.macro.nombre}</Text>
                <View style={[styles.badge, { backgroundColor: activeDetail.micro.color + '20' }]}>
                  <Text style={{ color: activeDetail.micro.color, fontWeight: '800', fontSize: 10 }}>{activeDetail.micro.tipo}</Text>
                </View>
              </View>
              <Text style={[styles.microName, { color: colors.textPrimary }]}>{activeDetail.micro.nombre}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                Del {activeDetail.micro.fecha_inicio} al {activeDetail.micro.fecha_fin}
              </Text>
              {activeDetail.micro.notas && (
                <Text style={[styles.cycleNotes, { color: colors.textPrimary }]}>"{activeDetail.micro.notas}"</Text>
              )}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="information-circle-outline" size={24} color={colors.border} />
              <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Sin ciclos definidos para este día</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* MODAL SELECTOR DE DEPORTISTAS */}
      <Modal visible={showPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Selecciona un deportista</Text>
            <FlatList
              data={athletes}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.athleteItem} 
                  onPress={() => handleSelectAthlete(item)}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
                  {selectedAthlete?.id === item.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowPicker(false)}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  athleteSelector: { flexDirection: 'row', alignItems: 'center', padding: 15, margin: 20, borderRadius: 15, elevation: 2 },
  selectorInfo: { flex: 1 },
  detailContainer: { padding: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 15 },
  cycleCard: { padding: 20, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 20, borderLeftWidth: 6 },
  cycleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  macroLabel: { fontSize: 10, fontWeight: '700' },
  microName: { fontSize: 20, fontWeight: '900' },
  cycleNotes: { marginTop: 15, fontStyle: 'italic', fontSize: 13, opacity: 0.8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  emptyState: { alignItems: 'center', marginTop: 20, opacity: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '70%' },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  athleteItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  closeBtn: { marginTop: 20, alignItems: 'center', padding: 10 }
});
