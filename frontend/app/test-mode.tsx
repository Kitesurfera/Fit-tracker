import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ActivityIndicator, ScrollView, TextInput, Alert, Platform,
  KeyboardAvoidingView, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';

import { useTheme } from '../src/hooks/useTheme';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/api';
import VideoUploader from '../src/components/VideoUploader';

export default function TestModeScreen() {
  const { workoutId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  
  const { width: screenWidth } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [workout, setWorkout] = useState<any>(null);
  const [athleteName, setAthleteName] = useState<string>('Deportista');
  const [results, setResults] = useState<Record<string, any>>({});
  const [historicalData, setHistoricalData] = useState<Record<string, any>>({});

  const timerRefs = useRef<Record<string, NodeJS.Timeout>>({});
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({}); 
  const [runningTimers, setRunningTimers] = useState<Record<string, boolean>>({});

  const [showSummary, setShowSummary] = useState(false);
  const [testCategories, setTestCategories] = useState<Record<string, string>>({});
  
  // Estado para controlar el reproductor de vídeo a pantalla completa
  const [fullScreenVideo, setFullScreenVideo] = useState<string | null>(null);

  useEffect(() => {
    return () => {
       Object.values(timerRefs.current).forEach(clearInterval);
    };
  }, []);

  useEffect(() => {
    const fetchWorkoutAndAthlete = async () => {
      try {
        const res = await api.getWorkouts({}); 
        const wks = Array.isArray(res) ? res : (res.data || []);
        const currentWorkout = wks.find((w: any) => String(w.id || w._id) === String(workoutId));
        
        if (currentWorkout) {
          setWorkout(currentWorkout);
          
          let athleteId = currentWorkout.athlete_id;

          if (user?.role === 'trainer') {
             const athletesRes = await api.getAthletes();
             const athletesList = Array.isArray(athletesRes) ? athletesRes : (athletesRes?.data || []);
             const ath = athletesList.find((a: any) => String(a.id) === String(athleteId));
             if (ath) setAthleteName(ath.name);
          } else if (user?.name) {
             setAthleteName(user.name);
             athleteId = user.id;
          }
          
          const initialResults: Record<string, any> = {};
          
          if (currentWorkout.completed && currentWorkout.completion_data?.exercise_results) {
             currentWorkout.completion_data.exercise_results.forEach((ex: any) => {
                initialResults[ex.test_key] = { 
                   valL: ex.result_left || '', 
                   valR: ex.result_right || '', 
                   flightTime: ex.flight_time || '', 
                   contactTime: ex.contact_time || '', 
                   videoUri: ex.video_uri || null 
                };
             });
             setResults(initialResults);
             setShowSummary(true);
          } else {
             currentWorkout.exercises?.forEach((ex: any) => {
                initialResults[ex.test_key] = { valL: '', valR: '', flightTime: '', contactTime: '', videoUri: null };
             });
             setResults(initialResults);
          }

          if (athleteId) {
             const testsHistory = await api.getTests({ athlete_id: athleteId }).catch(() => []);
             const pastTests = Array.isArray(testsHistory) ? testsHistory : (testsHistory?.data || []);
             pastTests.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
             
             const historyMap: Record<string, any> = {};
             currentWorkout.exercises?.forEach((ex: any) => {
                const previous = pastTests.find((pt: any) => pt.custom_name === ex.name || pt.test_name === ex.test_key);
                if (previous) historyMap[ex.test_key] = previous;
             });
             setHistoricalData(historyMap);
          }
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
  }, [workoutId, user]);

  const updateResult = (testKey: string, field: string, value: string) => {
    setResults(prev => ({ ...prev, [testKey]: { ...prev[testKey], [field]: value } }));
  };

  const toggleTimer = (testKey: string, side: 'valL' | 'valR' = 'valL') => {
    const timerKey = `${testKey}_${side}`;
    if (runningTimers[timerKey]) {
        clearInterval(timerRefs.current[timerKey]);
        setRunningTimers(prev => ({ ...prev, [timerKey]: false }));
        updateResult(testKey, side, activeTimers[timerKey].toFixed(1));
    } else {
        setActiveTimers(prev => ({ ...prev, [timerKey]: 0 }));
        setRunningTimers(prev => ({ ...prev, [timerKey]: true }));
        timerRefs.current[timerKey] = setInterval(() => {
            setActiveTimers(prev => ({ ...prev, [timerKey]: (prev[timerKey] || 0) + 0.1 }));
        }, 100);
    }
  };

  const calculateRSI = (flightMs: string, contactMs: string) => {
    const f = parseFloat(flightMs);
    const c = parseFloat(contactMs);
    if (!isNaN(f) && !isNaN(c) && c > 0) return (f / c).toFixed(2);
    return '0.00';
  };

  const renderGhostMode = (ex: any) => {
    const past = historicalData[ex.test_key];
    if (!past) return null;
    let text = ex.is_bilateral ? `Izq ${past.value_left || 0} | Der ${past.value_right || 0} ${past.unit}` : `${past.value || 0} ${past.unit}`;
    return (
       <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 8, textAlign: 'center', fontWeight: '600' }} numberOfLines={1} adjustsFontSizeToFit>
          <Ionicons name="time" size={12} color={colors.textSecondary} /> Última vez: {text}
       </Text>
    );
  };

  const handleReviewTests = () => {
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

  const executeSave = async () => {
      setSaving(true);
      try {
        const exercisesToSave = workout.exercises.map((ex: any) => {
          const res = results[ex.test_key] || {};
          let finalVal = 0;
          
          const vLStr = res.valL ? String(res.valL).replace(',', '.') : '';
          const vRStr = res.valR ? String(res.valR).replace(',', '.') : '';
          
          if (ex.unit === 'rsi' || ex.test_key === 'dj') {
            finalVal = parseFloat(calculateRSI(res.flightTime, res.contactTime)) || 0;
          } else if (ex.is_bilateral) {
            finalVal = Math.max(parseFloat(vLStr) || 0, parseFloat(vRStr) || 0);
          } else {
            finalVal = parseFloat(vLStr) || 0;
          }
  
          return {
            ...ex,
            logged_weight: finalVal,
            result_left: vLStr,
            result_right: vRStr,
            flight_time: res.flightTime,
            contact_time: res.contactTime,
            video_uri: res.videoUri
          };
        });
  
        // 1. Limpiamos basura de base de datos antes de enviar para evitar Error 422 de FastAPI
        const cleanWorkout = { ...workout };
        delete cleanWorkout._id; 
        
        await api.updateWorkout(workout.id || workout._id, {
          ...cleanWorkout,
          completed: true,
          completion_data: { exercise_results: exercisesToSave }
        });
  
        // 2. Guardado en el historial de tests
        if (api.createTest) {
          for (const ex of exercisesToSave) {
             const valL = parseFloat(ex.result_left);
             const valR = parseFloat(ex.result_right);
             const loggedVal = ex.logged_weight;
  
             if (loggedVal > 0 || valL > 0 || valR > 0) {
                await api.createTest({
                  athlete_id: workout.athlete_id,
                  test_name: 'custom',
                  custom_name: ex.name,
                  test_type: testCategories[ex.test_key] || 'custom',
                  value: loggedVal || 0,
                  value_left: ex.is_bilateral && valL > 0 ? valL : null,
                  value_right: ex.is_bilateral && valR > 0 ? valR : null,
                  date: workout.date,
                  unit: ex.unit || 'kg',
                  notes: `Test desde Batería: ${ex.is_bilateral ? 'Bilateral' : 'Unilateral'}`
                });
             }
          }
        }
  
        setShowSummary(false);
        setSaving(false);
        
        // 3. Navegación en formato String (infalible en Web y Móvil)
        router.replace(`/tests?athlete_id=${workout.athlete_id}`);
  
      } catch (e: any) {
        console.error("Error al guardar la batería:", e);
        setSaving(false); // Detenemos el spinner de carga antes de la alerta
        
        // 4. Fallback robusto para mostrar errores en Web
        const errorMsg = e?.message || "No se pudo comunicar con el servidor.";
        if (Platform.OS === 'web') {
          window.alert(`Error al guardar: ${errorMsg}`);
        } else {
          Alert.alert("Error", `No se pudieron guardar los resultados.\n${errorMsg}`);
        }
      }
    };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      
      {showSummary ? (
        <View style={{ flex: 1 }}>
           <View style={styles.header}>
              <TouchableOpacity onPress={() => workout?.completed ? router.back() : setShowSummary(false)} style={{ padding: 8 }}>
                <Ionicons name="arrow-back" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                   {workout?.completed ? 'Resultados Guardados' : 'Guardar en Historial'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>
                   {workout?.completed ? 'Modo revisión' : 'Clasifica las métricas'}
                </Text>
              </View>
              <View style={{ width: 44 }} />
           </View>

           <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
             {workout?.exercises?.map((ex: any, idx: number) => {
                const res = results[ex.test_key];
                if (!res) return null;

                let displayVal = res.valL || '0';
                if (ex.unit === 'rsi' || ex.test_key === 'dj') displayVal = calculateRSI(res.flightTime, res.contactTime);
                
                return (
                  <View key={idx} style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 }}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={[styles.testName, { color: colors.textPrimary, marginLeft: 0, fontSize: 14 }]} numberOfLines={2}>{ex.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <View style={[styles.pill, { backgroundColor: ex.is_bilateral ? '#3B82F615' : '#10B98115' }]}>
                               <Text style={{ fontSize: 10, fontWeight: '800', color: ex.is_bilateral ? '#3B82F6' : '#10B981' }}>
                                 {ex.is_bilateral ? 'BILATERAL' : 'UNILATERAL'}
                               </Text>
                            </View>

                            {res.videoUri && (
                               <VideoUploader 
                                 currentVideo={res.videoUri} 
                                 onUploadSuccess={() => {}} 
                                 colors={colors} 
                                 readOnly={true} 
                                 onPlay={() => setFullScreenVideo(res.videoUri)}
                               />
                            )}

                          </View>
                        </View>
                        
                        <View style={{ alignItems: 'flex-end', minWidth: 60 }}>
                          {ex.is_bilateral ? (
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#3B82F6' }}>Izq: {res.valL || 0} {ex.unit}</Text>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#EF4444' }}>Der: {res.valR || 0} {ex.unit}</Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>{displayVal} <Text style={{fontSize: 11, fontWeight: '700', color: colors.textSecondary}}>{ex.unit}</Text></Text>
                          )}
                        </View>
                     </View>

                     {!workout?.completed && (
                       <>
                         <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textSecondary, marginBottom: 8 }}>CATEGORÍA DE GUARDADO:</Text>
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
                       </>
                     )}
                  </View>
                );
             })}
           </ScrollView>

           <View style={[styles.footer, { backgroundColor: colors.background, position: 'absolute', bottom: 0, width: '100%' }]}>
              {workout?.completed ? (
                 <TouchableOpacity style={[styles.finishBtn, { backgroundColor: '#3B82F6' }]} onPress={() => router.back()}>
                   <Ionicons name="arrow-back" size={22} color="#FFF" />
                   <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16, marginLeft: 8 }}>VOLVER</Text>
                 </TouchableOpacity>
              ) : (
                 <TouchableOpacity style={[styles.finishBtn, { backgroundColor: '#10B981' }]} onPress={executeSave} disabled={saving}>
                   {saving ? <ActivityIndicator color="#FFF" /> : (
                     <>
                       <Ionicons name="save" size={22} color="#FFF" />
                       <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16, marginLeft: 8 }}>CONFIRMAR Y GUARDAR</Text>
                     </>
                   )}
                 </TouchableOpacity>
              )}
           </View>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
              <Ionicons name="close" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>Tests: {athleteName}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>
                 {(workout?.date || '').split('-').reverse().join('/')}
              </Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {workout?.exercises?.map((ex: any, idx: number) => {
              const res = results[ex.test_key];
              if (!res) return null;
              const hasTimer = ex.unit === 'seg' || ex.unit === 'segundos';

              return (
                <View key={idx} style={[styles.testCard, { backgroundColor: colors.surface, borderColor: '#F59E0B40' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                     <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
                        <Ionicons name={ex.unit === 'rsi' ? "flash" : (hasTimer ? "timer" : "trophy")} size={20} color="#F59E0B" />
                        <Text style={[styles.testName, { color: colors.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit>{ex.name}</Text>
                     </View>
                     
                     <VideoUploader 
                       currentVideo={res.videoUri} 
                       onUploadSuccess={(url) => updateResult(ex.test_key, 'videoUri', url)} 
                       colors={colors} 
                       onPlay={() => setFullScreenVideo(res.videoUri)}
                     />
                  </View>

                  {ex.unit === 'rsi' || ex.test_key === 'dj' ? (
                    <View style={{ backgroundColor: colors.surfaceHighlight, padding: 12, borderRadius: 12 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textSecondary, marginBottom: 10, textAlign: 'center' }}>CÁLCULO DE RSI (VUELO / CONTACTO)</Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                         <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }} numberOfLines={1} adjustsFontSizeToFit>Vuelo (ms)</Text>
                            <TextInput 
                              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} 
                              keyboardType="decimal-pad" placeholder="450" placeholderTextColor={colors.border}
                              value={res.flightTime} onChangeText={(val) => updateResult(ex.test_key, 'flightTime', val)} 
                              adjustsFontSizeToFit
                            />
                         </View>
                         <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }} numberOfLines={1} adjustsFontSizeToFit>Contacto (ms)</Text>
                            <TextInput 
                              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} 
                              keyboardType="decimal-pad" placeholder="200" placeholderTextColor={colors.border}
                              value={res.contactTime} onChangeText={(val) => updateResult(ex.test_key, 'contactTime', val)} 
                              adjustsFontSizeToFit
                            />
                         </View>
                      </View>
                      <View style={{ alignItems: 'center', backgroundColor: '#F59E0B20', padding: 8, borderRadius: 8 }}>
                         <Text style={{ fontSize: 9, fontWeight: '800', color: '#F59E0B' }}>RSI RESULTANTE</Text>
                         <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>
                           {calculateRSI(res.flightTime, res.contactTime)}
                         </Text>
                      </View>
                      {renderGhostMode(ex)}
                    </View>
                  ) : ex.is_bilateral ? (
                    <View>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                         <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#3B82F6', marginBottom: 6, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>PIERNA IZQ.</Text>
                            <View style={styles.inputWithUnitContainer}>
                              <TextInput 
                                style={[styles.inputLarge, { borderColor: runningTimers[`${ex.test_key}_valL`] ? colors.primary : colors.border, color: runningTimers[`${ex.test_key}_valL`] ? colors.primary : colors.textPrimary, flex: 1, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} 
                                keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.border}
                                value={runningTimers[`${ex.test_key}_valL`] ? activeTimers[`${ex.test_key}_valL`]?.toFixed(1) : res.valL} 
                                onChangeText={(val) => updateResult(ex.test_key, 'valL', val)} 
                                adjustsFontSizeToFit
                              />
                              <View style={[styles.unitBadge, { borderColor: colors.border, borderTopRightRadius: hasTimer ? 0 : 12, borderBottomRightRadius: hasTimer ? 0 : 12 }]}>
                                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 11 }} numberOfLines={1} adjustsFontSizeToFit>{ex.unit}</Text>
                              </View>
                              {hasTimer && (
                                <TouchableOpacity 
                                  style={[styles.timerBtn, { backgroundColor: runningTimers[`${ex.test_key}_valL`] ? '#EF4444' : colors.primary }]}
                                  onPress={() => toggleTimer(ex.test_key, 'valL')}
                                >
                                  <Ionicons name={runningTimers[`${ex.test_key}_valL`] ? "stop" : "play"} size={16} color="#FFF" />
                                </TouchableOpacity>
                              )}
                            </View>
                         </View>
                         <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#EF4444', marginBottom: 6, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>PIERNA DER.</Text>
                            <View style={styles.inputWithUnitContainer}>
                              <TextInput 
                                style={[styles.inputLarge, { borderColor: runningTimers[`${ex.test_key}_valR`] ? colors.primary : colors.border, color: runningTimers[`${ex.test_key}_valR`] ? colors.primary : colors.textPrimary, flex: 1, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} 
                                keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.border}
                                value={runningTimers[`${ex.test_key}_valR`] ? activeTimers[`${ex.test_key}_valR`]?.toFixed(1) : res.valR} 
                                onChangeText={(val) => updateResult(ex.test_key, 'valR', val)} 
                                adjustsFontSizeToFit
                              />
                              <View style={[styles.unitBadge, { borderColor: colors.border, borderTopRightRadius: hasTimer ? 0 : 12, borderBottomRightRadius: hasTimer ? 0 : 12 }]}>
                                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 11 }} numberOfLines={1} adjustsFontSizeToFit>{ex.unit}</Text>
                              </View>
                              {hasTimer && (
                                <TouchableOpacity 
                                  style={[styles.timerBtn, { backgroundColor: runningTimers[`${ex.test_key}_valR`] ? '#EF4444' : colors.primary }]}
                                  onPress={() => toggleTimer(ex.test_key, 'valR')}
                                >
                                  <Ionicons name={runningTimers[`${ex.test_key}_valR`] ? "stop" : "play"} size={16} color="#FFF" />
                                </TouchableOpacity>
                              )}
                            </View>
                         </View>
                      </View>
                      {renderGhostMode(ex)}
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center' }}>
                      <View style={[styles.inputWithUnitContainer, { width: hasTimer ? '100%' : '80%' }]}>
                        <TextInput 
                          style={[styles.inputLarge, { borderColor: runningTimers[`${ex.test_key}_valL`] ? colors.primary : colors.border, color: runningTimers[`${ex.test_key}_valL`] ? colors.primary : colors.textPrimary, flex: 1, borderRightWidth: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]} 
                          keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.border}
                          value={runningTimers[`${ex.test_key}_valL`] ? activeTimers[`${ex.test_key}_valL`]?.toFixed(1) : res.valL} 
                          onChangeText={(val) => updateResult(ex.test_key, 'valL', val)} 
                          adjustsFontSizeToFit
                        />
                        <View style={[styles.unitBadge, { borderColor: colors.border, borderTopRightRadius: hasTimer ? 0 : 12, borderBottomRightRadius: hasTimer ? 0 : 12 }]}>
                          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 12 }} numberOfLines={1} adjustsFontSizeToFit>{ex.unit}</Text>
                        </View>
                        {hasTimer && (
                          <TouchableOpacity 
                            style={[styles.timerBtn, { backgroundColor: runningTimers[`${ex.test_key}_valL`] ? '#EF4444' : colors.primary }]}
                            onPress={() => toggleTimer(ex.test_key, 'valL')}
                          >
                            <Ionicons name={runningTimers[`${ex.test_key}_valL`] ? "stop" : "play"} size={22} color="#FFF" />
                          </TouchableOpacity>
                        )}
                      </View>
                      {renderGhostMode(ex)}
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
      )}

      {fullScreenVideo && (
        <View style={[StyleSheet.absoluteFill, styles.fullscreenOverlay]}>
          <TouchableOpacity onPress={() => setFullScreenVideo(null)} style={styles.closeBtn}>
            <Ionicons name="close-circle" size={40} color="#FFF" />
          </TouchableOpacity>
          <Video 
            source={{ uri: fullScreenVideo }} 
            style={styles.fullVideo} 
            resizeMode={ResizeMode.CONTAIN} 
            useNativeControls 
            shouldPlay 
          />
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  title: { fontSize: 18, fontWeight: '900' },
  testCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  summaryCard: { padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  testName: { fontSize: 15, fontWeight: '800', marginLeft: 8 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, textAlign: 'center' },
  inputLarge: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 8, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  inputWithUnitContainer: { flexDirection: 'row', alignItems: 'stretch' },
  unitBadge: { borderWidth: 1, borderLeftWidth: 0, borderTopRightRadius: 10, borderBottomRightRadius: 10, backgroundColor: 'rgba(0,0,0,0.02)', paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  timerBtn: { paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  categoryChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 14 },
  
  fullscreenOverlay: { backgroundColor: '#000', justifyContent: 'center', zIndex: 9999, elevation: 9999 },
  closeBtn: { position: 'absolute', top: 30, right: 20, zIndex: 10000, padding: 10 },
  fullVideo: { width: '100%', height: '80%' }
});
