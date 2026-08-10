import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ActivityIndicator, ScrollView, TextInput, Alert, Platform,
  KeyboardAvoidingView, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/api';
import * as ImagePicker from 'expo-image-picker';

export default function TestModeScreen() {
  const { workoutId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [workout, setWorkout] = useState<any>(null);
  const [athleteName, setAthleteName] = useState<string>('Deportista');
  const [results, setResults] = useState<Record<string, any>>({});
  
  // Estados para la pantalla final de revisión
  const [showSummary, setShowSummary] = useState(false);
  const [testCategories, setTestCategories] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchWorkoutAndAthlete = async () => {
      try {
        const res = await api.getWorkouts({}); 
        const wks = Array.isArray(res) ? res : (res.data || []);
        const currentWorkout = wks.find((w: any) => String(w.id || w._id) === String(workoutId));
        
        if (currentWorkout) {
          setWorkout(currentWorkout);
          
          // Buscar el nombre del atleta
          if (user?.role === 'trainer') {
             const athletesRes = await api.getAthletes();
             const athletesList = Array.isArray(athletesRes) ? athletesRes : (athletesRes?.data || []);
             const ath = athletesList.find((a: any) => String(a.id) === String(currentWorkout.athlete_id));
             if (ath) setAthleteName(ath.name);
          } else if (user?.name) {
             setAthleteName(user.name);
          }
          
          // Inicializar campos de resultados
          const initialResults: Record<string, any> = {};
          currentWorkout.exercises?.forEach((ex: any) => {
             initialResults[ex.test_key] = {
               valL: '', valR: '', 
               flightTime: '', contactTime: '',
               videoUri: null
             };
          });
          setResults(initialResults);
        } else {
          Alert.alert("Error", "No se encontró la batería de tests.");
          router.back();
        }
      } catch (e) {
        console.error("Error cargando batería:", e);
      } finally {
        setLoading(false);
      }
    };
    if (workoutId) fetchWorkoutAndAthlete();
  }, [workoutId]);

  const updateResult = (testKey: string, field: string, value: string) => {
    setResults(prev => ({
      ...prev,
      [testKey]: { ...prev[testKey], [field]: value }
    }));
  };

  const captureVideo = async (testKey: string) => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permiso Denegado", "Se necesita acceso a la cámara para grabar el test.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      updateResult(testKey, 'videoUri', result.assets[0].uri);
    }
  };

  const calculateRSI = (flightMs: string, contactMs: string) => {
    const f = parseFloat(flightMs);
    const c = parseFloat(contactMs);
    if (!isNaN(f) && !isNaN(c) && c > 0) return (f / c).toFixed(2);
    return '0.00';
  };

  // 1. Botón "Revisar" abre la pantalla de guardado
  const handleReviewTests = () => {
    // Autodetectar categorías basadas en el grupo o nombre del test
    const initialCats: Record<string, string> = {};
    workout.exercises.forEach((ex: any) => {
       const str = `${ex.group || ''} ${ex.name || ''}`.toLowerCase();
       if (str.includes('fuerza') || str.includes('rm') || str.includes('sentadilla') || str.includes('deadlift')) {
         initialCats[ex.test_key] = 'strength';
       } else if (str.includes('plio') || str.includes('salto') || str.includes('cmj') || str.includes('dj') || str.includes('pop')) {
         initialCats[ex.test_key] = 'plyometrics';
       } else if (str.includes('max')) {
         initialCats[ex.test_key] = 'max_force';
       } else {
         initialCats[ex.test_key] = 'custom';
       }
    });
    setTestCategories(initialCats);
    setShowSummary(true);
  };

  // 2. Guardar definitivamente en la BD y redirigir al Tab de Tests
  const executeSave = async () => {
    setSaving(true);
    try {
      const exercisesToSave = workout.exercises.map((ex: any) => {
        const res = results[ex.test_key];
        let finalVal = 0;
        
        if (ex.unit === 'rsi' || ex.test_key === 'dj') {
          finalVal = parseFloat(calculateRSI(res.flightTime, res.contactTime)) || 0;
        } else if (ex.is_bilateral) {
          finalVal = Math.max(parseFloat(res.valL) || 0, parseFloat(res.valR) || 0);
        } else {
          finalVal = parseFloat(res.valL) || 0;
        }

        return {
          ...ex,
          logged_weight: finalVal,
          result_left: res.valL,
          result_right: res.valR,
          flight_time: res.flightTime,
          contact_time: res.contactTime,
          video_uri: res.videoUri
        };
      });

      // 1. Completar la sesión en el calendario
      await api.updateWorkout(workout.id || workout._id, {
        ...workout,
        completed: true,
        completion_data: { exercise_results: exercisesToSave }
      });

      // 2. Inyectar cada test en el registro global del atleta (tests.tsx)
      if (api.postTest) {
        for (const ex of exercisesToSave) {
           if (ex.logged_weight > 0 || parseFloat(ex.result_left) > 0 || parseFloat(ex.result_right) > 0) {
              await api.postTest({
                athlete_id: workout.athlete_id,
                test_name: 'custom',
                custom_name: ex.name,
                test_type: testCategories[ex.test_key] || 'custom',
                value: ex.logged_weight,
                value_left: ex.is_bilateral && ex.result_left ? parseFloat(ex.result_left) : null,
                value_right: ex.is_bilateral && ex.result_right ? parseFloat(ex.result_right) : null,
                date: workout.date,
                unit: ex.unit || 'kg',
                notes: `Test desde Batería: ${ex.is_bilateral ? 'Bilateral' : 'Unilateral'}`
              });
           }
        }
      }

      setShowSummary(false);
      // Redirigimos a la pantalla de Tests del deportista específico
      router.replace({ pathname: '/tests', params: { athlete_id: workout.athlete_id } });

    } catch (e) {
      Alert.alert("Error", "No se pudieron guardar los resultados en el registro.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{flex:1, justifyContent:'center', alignItems:'center', backgroundColor: colors.background}}>
        <ActivityIndicator size="large" color="#F59E0B"/>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Tests: {athleteName}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>
               {(workout?.date || '').split('-').reverse().join('/')}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* LISTA DE INPUTS */}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {workout?.exercises?.map((ex: any, idx: number) => {
            const res = results[ex.test_key];
            if (!res) return null;

            return (
              <View key={idx} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: '#F59E0B40' }]}>
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
                      <Ionicons name={ex.unit === 'rsi' ? "flash" : "trophy"} size={20} color="#F59E0B" />
                      <Text style={[styles.testName, { color: colors.textPrimary }]} numberOfLines={1}>{ex.name}</Text>
                   </View>
                   <TouchableOpacity 
                     onPress={() => captureVideo(ex.test_key)}
                     style={{ padding: 8, backgroundColor: res.videoUri ? '#10B98120' : colors.surfaceHighlight, borderRadius: 8 }}
                   >
                     <Ionicons name={res.videoUri ? "videocam" : "videocam-outline"} size={20} color={res.videoUri ? "#10B981" : colors.textSecondary} />
                   </TouchableOpacity>
                </View>

                {ex.unit === 'rsi' || ex.test_key === 'dj' ? (
                  <View style={{ backgroundColor: colors.surfaceHighlight, padding: 15, borderRadius: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 10, textAlign: 'center' }}>CÁLCULO DE RSI (VUELO / CONTACTO)</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
                       <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Vuelo (ms)</Text>
                          <TextInput 
                            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} 
                            keyboardType="numeric" placeholder="450" placeholderTextColor={colors.border}
                            value={res.flightTime} onChangeText={(val) => updateResult(ex.test_key, 'flightTime', val)} 
                          />
                       </View>
                       <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }}>Contacto (ms)</Text>
                          <TextInput 
                            style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} 
                            keyboardType="numeric" placeholder="200" placeholderTextColor={colors.border}
                            value={res.contactTime} onChangeText={(val) => updateResult(ex.test_key, 'contactTime', val)} 
                          />
                       </View>
                    </View>
                    <View style={{ alignItems: 'center', backgroundColor: '#F59E0B20', padding: 10, borderRadius: 8 }}>
                       <Text style={{ fontSize: 10, fontWeight: '800', color: '#F59E0B' }}>RSI RESULTANTE</Text>
                       <Text style={{ fontSize: 24, fontWeight: '900', color: colors.textPrimary }}>
                         {calculateRSI(res.flightTime, res.contactTime)}
                       </Text>
                    </View>
                  </View>
                ) : ex.is_bilateral ? (
                  <View style={{ flexDirection: 'row', gap: 15 }}>
                     <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#3B82F6', marginBottom: 6, textAlign: 'center' }}>PIERNA IZQ.</Text>
                        <View style={styles.inputWithUnitContainer}>
                          <TextInput 
                            style={[styles.inputLarge, { borderColor: colors.border, color: colors.textPrimary, flex: 1, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} 
                            keyboardType="numeric" placeholder="0" placeholderTextColor={colors.border}
                            value={res.valL} onChangeText={(val) => updateResult(ex.test_key, 'valL', val)} 
                          />
                          <View style={[styles.unitBadge, { borderColor: colors.border }]}>
                            <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>{ex.unit}</Text>
                          </View>
                        </View>
                     </View>
                     <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#EF4444', marginBottom: 6, textAlign: 'center' }}>PIERNA DER.</Text>
                        <View style={styles.inputWithUnitContainer}>
                          <TextInput 
                            style={[styles.inputLarge, { borderColor: colors.border, color: colors.textPrimary, flex: 1, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} 
                            keyboardType="numeric" placeholder="0" placeholderTextColor={colors.border}
                            value={res.valR} onChangeText={(val) => updateResult(ex.test_key, 'valR', val)} 
                          />
                          <View style={[styles.unitBadge, { borderColor: colors.border }]}>
                            <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }}>{ex.unit}</Text>
                          </View>
                        </View>
                     </View>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.inputWithUnitContainer, { width: '70%' }]}>
                      <TextInput 
                        style={[styles.inputLarge, { borderColor: colors.border, color: colors.textPrimary, flex: 1, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} 
                        keyboardType="numeric" placeholder="0" placeholderTextColor={colors.border}
                        value={res.valL} onChangeText={(val) => updateResult(ex.test_key, 'valL', val)} 
                      />
                      <View style={[styles.unitBadge, { borderColor: colors.border }]}>
                        <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 14 }}>{ex.unit}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.finishBtn, { backgroundColor: '#F59E0B' }]} onPress={handleReviewTests}>
            <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>REVISAR RESULTADOS</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* MODAL: RESUMEN Y GUARDADO DE CATEGORÍAS */}
      <Modal visible={showSummary} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
           <View style={styles.header}>
              <TouchableOpacity onPress={() => setShowSummary(false)} style={{ padding: 8 }}>
                <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Guardar en Historial</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>Clasifica las métricas</Text>
              </View>
              <View style={{ width: 44 }} />
           </View>

           <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
             {workout?.exercises?.map((ex: any, idx: number) => {
                const res = results[ex.test_key];
                if (!res) return null;

                let displayVal = res.valL || '0';
                if (ex.unit === 'rsi' || ex.test_key === 'dj') displayVal = calculateRSI(res.flightTime, res.contactTime);
                
                return (
                  <View key={idx} style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={[styles.testName, { color: colors.textPrimary, marginLeft: 0, fontSize: 15 }]} numberOfLines={2}>{ex.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                            <View style={[styles.pill, { backgroundColor: ex.is_bilateral ? '#3B82F615' : '#10B98115' }]}>
                               <Text style={{ fontSize: 10, fontWeight: '800', color: ex.is_bilateral ? '#3B82F6' : '#10B981' }}>
                                 {ex.is_bilateral ? 'BILATERAL' : 'UNILATERAL'}
                               </Text>
                            </View>
                          </View>
                        </View>
                        
                        <View style={{ alignItems: 'flex-end' }}>
                          {ex.is_bilateral ? (
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#3B82F6' }}>Izq: {res.valL || 0} {ex.unit}</Text>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#EF4444' }}>Der: {res.valR || 0} {ex.unit}</Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>{displayVal} <Text style={{fontSize: 12, fontWeight: '700', color: colors.textSecondary}}>{ex.unit}</Text></Text>
                          )}
                        </View>
                     </View>

                     <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: 8 }}>CATEGORÍA DE GUARDADO:</Text>
                     <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                       {['strength', 'plyometrics', 'max_force', 'custom'].map(cat => {
                          const labels: Record<string,string> = { strength: 'Fuerza', plyometrics: 'Pliometría', max_force: 'F. Máxima', custom: 'Personalizado' };
                          const isSelected = testCategories[ex.test_key] === cat;
                          return (
                            <TouchableOpacity 
                              key={cat}
                              style={[styles.categoryChip, { borderColor: colors.border }, isSelected && { backgroundColor: '#F59E0B', borderColor: '#F59E0B' }]}
                              onPress={() => setTestCategories(prev => ({ ...prev, [ex.test_key]: cat }))}
                            >
                               <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFF' : colors.textSecondary }}>{labels[cat]}</Text>
                            </TouchableOpacity>
                          );
                       })}
                     </View>
                  </View>
                );
             })}
           </ScrollView>

           <View style={[styles.footer, { backgroundColor: colors.background, position: 'absolute', bottom: 0, width: '100%' }]}>
              <TouchableOpacity style={[styles.finishBtn, { backgroundColor: '#10B981' }]} onPress={executeSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Ionicons name="save" size={22} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16, marginLeft: 8 }}>CONFIRMAR Y GUARDAR</Text>
                  </>
                )}
              </TouchableOpacity>
           </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  title: { fontSize: 20, fontWeight: '900' },
  testCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  summaryCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 15 },
  testName: { fontSize: 16, fontWeight: '800', marginLeft: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, textAlign: 'center' },
  inputLarge: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  inputWithUnitContainer: { flexDirection: 'row', alignItems: 'stretch' },
  unitBadge: { borderWidth: 1, borderLeftWidth: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12, backgroundColor: 'rgba(0,0,0,0.02)', paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16 }
});
