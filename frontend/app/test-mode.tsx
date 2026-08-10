import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, 
  ActivityIndicator, ScrollView, TextInput, Alert, Platform,
  KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/hooks/useTheme';
import { api } from '../src/api';
import * as ImagePicker from 'expo-image-picker';

export default function TestModeScreen() {
  const { workoutId } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workout, setWorkout] = useState<any>(null);
  
  const [results, setResults] = useState<Record<string, any>>({});
  
  useEffect(() => {
    const fetchWorkout = async () => {
      try {
        const res = await api.getWorkouts({}); 
        const wks = Array.isArray(res) ? res : (res.data || []);
        const currentWorkout = wks.find((w: any) => String(w.id || w._id) === String(workoutId));
        
        if (currentWorkout) {
          setWorkout(currentWorkout);
          
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
    if (workoutId) fetchWorkout();
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
    if (!isNaN(f) && !isNaN(c) && c > 0) {
      return (f / c).toFixed(2);
    }
    return '0.00';
  };

  const handleFinishTests = async () => {
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

      await api.updateWorkout(workout.id || workout._id, {
        ...workout,
        completed: true,
        completion_data: { exercise_results: exercisesToSave }
      });

      if (api.postTest) {
        for (const ex of exercisesToSave) {
           if (ex.logged_weight > 0) {
              await api.postTest({
                athlete_id: workout.athlete_id,
                test_name: ex.test_key || ex.name,
                value: ex.logged_weight,
                value_left: ex.result_left,
                value_right: ex.result_right,
                date: workout.date,
                unit: ex.unit || 'kg'
              });
           }
        }
      }

      router.back();
    } catch (e) {
      Alert.alert("Error", "No se pudieron guardar los resultados.");
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="close" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Evaluación de Tests</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '700' }}>
               {(workout?.date || '').split('-').reverse().join('/')}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

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

                {/* MOTOR DINÁMICO DE INPUTS */}
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
          <TouchableOpacity style={[styles.finishBtn, { backgroundColor: '#F59E0B' }]} onPress={handleFinishTests} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Ionicons name="checkmark-done-circle" size={24} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16, marginLeft: 8 }}>GUARDAR BATERÍA</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  title: { fontSize: 20, fontWeight: '900' },
  testCard: { padding: 20, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  testName: { fontSize: 16, fontWeight: '800', marginLeft: 10 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16, textAlign: 'center' },
  inputLarge: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  inputWithUnitContainer: { flexDirection: 'row', alignItems: 'stretch' },
  unitBadge: { borderWidth: 1, borderLeftWidth: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12, backgroundColor: 'rgba(0,0,0,0.02)', paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16 }
});
