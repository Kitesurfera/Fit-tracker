import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Switch, Share, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/api';
import { getWebPushSubscription, testNotification } from '../../src/notifications';
import * as ImagePicker from 'expo-image-picker';

const SPORT_ICON_MAP: Record<string, {icon: any, lib: string}> = {
  'kite': { icon: 'kitesurfing', lib: 'MaterialCommunity' },
  'football': { icon: 'football', lib: 'Ionicons' },
  'volleyball': { icon: 'volleyball', lib: 'MaterialCommunity' },
  'tennis': { icon: 'tennisball', lib: 'Ionicons' },
  'gym': { icon: 'barbell', lib: 'Ionicons' },
  'surf': { icon: 'surfing', lib: 'MaterialCommunity' },
  'bike': { icon: 'bicycle', lib: 'Ionicons' },
};

export default function SettingsScreen() {
  const { colors, themeMode, changeTheme } = useTheme();
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();

  const isAthlete = user?.role === 'athlete';

  // --- ESTADOS ---
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
// Asumimos que los emails están activados por defecto a menos que el usuario los apague explícitamente.
  const [emailEnabled, setEmailEnabled] = useState(user?.email_notifications !== false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [measurements, setMeasurements] = useState({
    weight: '', shoulders: '', chest: '', arm: '', thigh: ''
  });
  const [savingMeasures, setSavingMeasures] = useState(false);
  const [timerSoundsEnabled, setTimerSoundsEnabled] = useState(true);

  // --- NUEVA FUNCIÓN: CAMBIAR FOTO DE PERFIL ---
  const handlePickAvatar = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (!result.canceled && result.assets) {
        setUploadingAvatar(true);
        const asset = result.assets[0];
        
        // Subimos a nuestro bucket (Firebase/Supabase/etc)
        const uploaded = await api.uploadFile(asset);
        const finalUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.url || asset.uri);
        
        setAvatarUrl(finalUrl);
        
        // Lo guardamos en la base de datos y actualizamos el contexto
        if (api.updateProfile) await api.updateProfile({ avatar_url: finalUrl });
        if (updateUser) updateUser({ ...user, avatar_url: finalUrl });
      }
    } catch (error) {
      if (Platform.OS === 'web') window.alert("Error al subir la imagen.");
      else Alert.alert("Error", "No se pudo actualizar la foto de perfil.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // --- GESTOR DE PÍLDORAS ---
  const [pills, setPills] = useState<any[]>([]);
  const [showPillBuilder, setShowPillBuilder] = useState(false);
  const [editingPillId, setEditingPillId] = useState<string | null>(null);
  const [pillName, setPillName] = useState('');
  const [pillType, setPillType] = useState<'traditional' | 'hiit'>('traditional');
  const [pillExs, setPillExs] = useState<any[]>([{ _key: '1', name: '', sets: '', reps: '', duration: '', video_url: '', is_unilateral: false }]);
  const [pillBlocks, setPillBlocks] = useState<any[]>([{ _key: 'b1', name: 'Bloque 1', sets: '1', exercises: [{ _key: 'e1', name: '', duration_reps: '', duration: '', video_url: '', is_unilateral: false }] }]);
  const [savingPill, setSavingPill] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('timer_sounds_enabled').then(val => {
      if (val === 'false') setTimerSoundsEnabled(false);
    });
    if (!isAthlete) {
      loadPills();
    }
  }, [isAthlete]);

  const loadPills = () => {
    api.getPills().then(setPills).catch(console.log);
  };

  // --- FUNCIONES ---
  const toggleTimerSounds = async (value: boolean) => {
    setTimerSoundsEnabled(value);
    await AsyncStorage.setItem('timer_sounds_enabled', value ? 'true' : 'false');
  };

const toggleEmail = async (value: boolean) => {
     if (loadingEmail) return;
     setLoadingEmail(true);
     setEmailEnabled(value);
     
     try {
       if (api.updateProfile) {
         await api.updateProfile({ email_notifications: value });
       }
       
       // ¡Aquí está la magia! Actualizamos la memoria a corto plazo al instante:
       if (updateUser) {
           updateUser({ ...user, email_notifications: value });
       }
       
     } catch (e) {
       setEmailEnabled(!value);
       if (Platform.OS === 'web') window.alert("Error guardando preferencias.");
       else Alert.alert("Error", "No se pudo actualizar la preferencia de correos.");
     } finally {
       setLoadingEmail(false);
     }
   };
  
  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    setSavingProfile(true);
    try {
      if (api.updateProfile) await api.updateProfile({ name });
      if (Platform.OS === 'web') window.alert("Perfil actualizado.");
      else Alert.alert("¡Éxito!", "Perfil actualizado.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveMeasurements = async () => {
    const hasData = Object.values(measurements).some(val => val.trim() !== '');
    if (!hasData) return;
    setSavingMeasures(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const measuresToSave = [
        { key: 'weight', name: 'peso', val: measurements.weight, unit: 'kg' },
        { key: 'shoulders', name: 'hombros', val: measurements.shoulders, unit: 'cm' },
        { key: 'chest', name: 'pecho', val: measurements.chest, unit: 'cm' },
        { key: 'arm', name: 'brazo', val: measurements.arm, unit: 'cm' },
        { key: 'thigh', name: 'muslo', val: measurements.thigh, unit: 'cm' }
      ];
      for (const m of measuresToSave) {
        if (m.val.trim() !== '' && api.createTest) {
          await api.createTest({ athlete_id: user?.id, test_type: 'medicion', test_name: m.key, value: parseFloat(m.val.replace(',','.')), unit: m.unit, date: today });
        }
      }
      setMeasurements({ weight: '', shoulders: '', chest: '', arm: '', thigh: '' });
      if (Platform.OS === 'web') window.alert("Mediciones guardadas.");
    } finally {
      setSavingMeasures(false);
    }
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message: '¡Únete a Fit Tracker y entrena conmigo! Regístrate aquí: https://fit-tracker-azure-iota.vercel.app/',
        url: 'https://fit-tracker-azure-iota.vercel.app/', 
        title: 'Fit Tracker App'
      });
    } catch (error: any) {}
  };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Seguro que quieres cerrar sesión?')) { await logout(); router.replace('/'); }
    } else {
      Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Salir', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } }]);
    }
  };

  // --- LOGICA BUILDER PILDORAS ---
  const openNewPillBuilder = () => {
    setEditingPillId(null);
    setPillName('');
    setPillType('traditional');
    setPillExs([{ _key: Math.random().toString(), name: '', sets: '', reps: '', duration: '', video_url: '', is_unilateral: false }]);
    setPillBlocks([{ _key: Math.random().toString(), name: 'Bloque 1', sets: '1', exercises: [{ _key: Math.random().toString(), name: '', duration_reps: '', duration: '', video_url: '', is_unilateral: false }] }]);
    setShowPillBuilder(true);
  };

  const openEditPillBuilder = (pill: any) => {
    setEditingPillId(pill.id);
    setPillName(pill.name);
    setPillType(pill.is_hiit ? 'hiit' : 'traditional');
    
    if (pill.is_hiit) {
      const blocks = pill.exercises.map((b: any) => ({
        _key: Math.random().toString(),
        name: b.name || '',
        sets: b.sets || '1',
        exercises: (b.hiit_exercises || b.exercises || []).map((e: any) => ({
          _key: Math.random().toString(),
          name: e.name || '',
          duration_reps: e.duration_reps || '',
          duration: e.duration || '',
          video_url: e.video_url || '',
          is_unilateral: !!e.is_unilateral
        }))
      }));
      setPillBlocks(blocks.length > 0 ? blocks : [{ _key: Math.random().toString(), name: 'Bloque 1', sets: '1', exercises: [{ _key: Math.random().toString(), name: '', duration_reps: '', duration: '', video_url: '', is_unilateral: false }] }]);
    } else {
      const exs = pill.exercises.map((e: any) => ({
        _key: Math.random().toString(),
        name: e.name || '',
        sets: e.sets || '',
        reps: e.reps || '',
        duration: e.duration || '',
        video_url: e.video_url || '',
        is_unilateral: !!e.is_unilateral
      }));
      setPillExs(exs.length > 0 ? exs : [{ _key: Math.random().toString(), name: '', sets: '', reps: '', duration: '', video_url: '', is_unilateral: false }]);
    }
    
    setShowPillBuilder(true);
  };

  const handleSavePill = async () => {
    if (!pillName.trim()) { Alert.alert("Aviso", "Ponle un nombre a la píldora"); return; }
    
    let exercisesToSave = [];
    
    // Normalizamos los datos
    if (pillType === 'traditional') {
        exercisesToSave = pillExs.filter(e => e.name.trim()).map(e => ({
            name: e.name, 
            sets: e.sets, 
            reps: e.reps, 
            duration: e.duration, 
            weight: '',
            rest: '', 
            rest_exercise: '', 
            video_url: e.video_url, 
            exercise_notes: '', 
            is_unilateral: !!e.is_unilateral
        }));
    } else {
        exercisesToSave = pillBlocks.filter(b => b.exercises.some((e:any) => e.name.trim())).map(block => ({
            is_hiit_block: true, 
            name: block.name, 
            sets: block.sets, 
            rest_exercise: '0', 
            rest_block: '0', 
            rest_between_blocks: '60',
            hiit_exercises: block.exercises.filter((e:any) => e.name.trim()).map((e:any) => ({
                name: e.name, 
                sets: '1',
                duration_reps: e.duration_reps, 
                duration: e.duration, 
                exercise_notes: '', 
                video_url: e.video_url, 
                is_unilateral: !!e.is_unilateral
            }))
        }));
    }

    if (exercisesToSave.length === 0) { Alert.alert("Aviso", "Añade al menos un ejercicio."); return; }

    setSavingPill(true);
    try {
        const payload = { name: pillName.trim(), is_hiit: pillType === 'hiit', exercises: exercisesToSave };
        
        if (editingPillId) {
            await api.updatePill(editingPillId, payload);
        } else {
            await api.createPill(payload);
        }
        
        setShowPillBuilder(false);
        loadPills();
    } catch (e: any) { Alert.alert("Error", e.message); } 
    finally { setSavingPill(false); }
  };

  const handleDeletePill = async (id: string) => {
    try { await api.deletePill(id); loadPills(); } catch (e) { Alert.alert("Error al borrar"); }
  };

  const renderInputBox = (label: string, iconName: any, value: string, onChange: (t: string) => void, placeholder: string) => (
    <View style={styles.measureCol}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 }}>
        <Ionicons name={iconName} size={16} color={colors.primary} />
        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <TextInput style={[styles.measureInput, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]} keyboardType="numeric" value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textSecondary} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        
return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        
        {/* HEADER */}
        {/* ... */}

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          
          <View style={styles.profileHeader}>
            <TouchableOpacity 
              onPress={handlePickAvatar} 
              style={[styles.avatarCircle, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              {uploadingAvatar ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || 'U'}</Text>
              )}
              {/* Badget de la cámara */}
              <View style={[styles.cameraBadge, { backgroundColor: colors.background }]}>
                <Ionicons name="camera" size={12} color={colors.textPrimary} />
              </View>
            </TouchableOpacity>
            
            <View style={styles.profileTextWrapper}>
              <Text style={[styles.profileName, { color: colors.textPrimary }]}>{name || 'Usuario'}</Text>
              <Text style={[styles.roleText, { color: colors.textSecondary }]}>{isAthlete ? 'DEPORTISTA' : 'ENTRENADOR'}</Text>
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={{ marginRight: 10 }} />
              <TextInput style={[styles.input, { color: colors.textPrimary }]} value={name} onChangeText={setName} placeholder="Tu nombre completo" placeholderTextColor={colors.textSecondary} />
            </View>
            {name.trim() !== user?.name && (
              <TouchableOpacity style={[styles.saveProfileBtn, { backgroundColor: colors.primary }]} onPress={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.saveProfileBtnText}>Guardar Nombre</Text>}
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>APARIENCIA</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, paddingVertical: 12 }]}>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
              {['light', 'dark', 'system'].map((m: any) => (
                <TouchableOpacity key={m} style={[styles.themeBtn, themeMode === m && { backgroundColor: colors.primary + '15' }]} onPress={() => changeTheme?.(m)}>
                  <Ionicons name={m === 'light' ? 'sunny' : m === 'dark' ? 'moon' : 'phone-portrait'} size={24} color={themeMode === m ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.themeBtnText, { color: themeMode === m ? colors.primary : colors.textSecondary }]}>{m === 'light' ? 'Claro' : m === 'dark' ? 'Oscuro' : 'Auto'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>NOTIFICACIONES Y AUDIO</Text>
          <View style={[styles.cardList, { backgroundColor: colors.surface }]}>
            <View style={styles.settingRowAction}>
              <View style={styles.settingIconText}>
                <View style={[styles.iconBox, { backgroundColor: '#3B82F615' }]}>
                  {/* Cambiamos el icono a "mail" */}
                  <Ionicons name="mail" size={20} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingText, { color: colors.textPrimary }]}>Avisos por Correo</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    Recibe notificaciones importantes por email
                  </Text>
                </View>
              </View>
              {/* Conectamos el Switch a nuestras nuevas funciones */}
              <Switch 
                value={emailEnabled} 
                onValueChange={toggleEmail} 
                trackColor={{ false: colors.border, true: colors.primary }} 
                thumbColor="#FFF" 
              />
            </View>

            {isAthlete && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.settingRowAction}>
                  <View style={styles.settingIconText}>
                    <View style={[styles.iconBox, { backgroundColor: '#10B98115' }]}><Ionicons name="volume-high" size={20} color="#10B981" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingText, { color: colors.textPrimary }]}>Pitidos de Entreno</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>Avisos de 3, 2, 1, Trabajo y Descanso</Text>
                    </View>
                  </View>
                  <Switch value={timerSoundsEnabled} onValueChange={toggleTimerSounds} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF" />
                </View>
              </>
            )}
          </View>

          {/* GESTOR DE PÍLDORAS (SOLO ENTRENADOR) */}
          {!isAthlete && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>GESTOR DE PÍLDORAS (PREHAB/CALENTAMIENTO)</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                {pills.length === 0 ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 15 }}>No tienes píldoras guardadas. Crea bloques base para inyectar en las sesiones.</Text>
                ) : (
                  <View style={{ gap: 10, marginBottom: 15 }}>
                    {pills.map(p => (
                      <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 14 }}>{p.name}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{p.is_hiit ? 'Formato Circuito' : 'Formato Fuerza'} • {p.exercises?.length || 0} bloques/ej.</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity onPress={() => openEditPillBuilder(p)} style={{ padding: 6, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: 6 }}>
                            <Ionicons name="pencil" size={16} color="#3B82F6" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeletePill(p.id)} style={{ padding: 6, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 6 }}>
                            <Ionicons name="trash" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 12 }]} onPress={openNewPillBuilder}>
                  <Ionicons name="add" size={18} color="#FFF" />
                  <Text style={[styles.saveBtnText, { color: '#FFF', fontSize: 13 }]}>Crear Nueva Píldora</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {isAthlete ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>ACTUALIZAR MEDICIONES</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <View style={styles.measureRow}>
                  {renderInputBox("Peso (kg)", "scale", measurements.weight, (t) => setMeasurements({...measurements, weight: t}), "Ej: 75")}
                  {renderInputBox("Hombros (cm)", "resize", measurements.shoulders, (t) => setMeasurements({...measurements, shoulders: t}), "Ej: 110")}
                </View>
                <View style={styles.measureRow}>
                  {renderInputBox("Pecho (cm)", "shirt", measurements.chest, (t) => setMeasurements({...measurements, chest: t}), "Ej: 98")}
                  {renderInputBox("Brazo (cm)", "fitness", measurements.arm, (t) => setMeasurements({...measurements, arm: t}), "Ej: 35")}
                </View>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, marginTop: 10 }]} onPress={handleSaveMeasurements} disabled={savingMeasures}>
                  {savingMeasures ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Guardar Mediciones</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>COMPARTIR APP</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 14, lineHeight: 22 }}>
                  Comparte este enlace con tus deportistas para que se registren fácilmente en tu equipo.
                </Text>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, flexDirection: 'row', justifyContent: 'center', gap: 10 }]} onPress={handleShareApp}>
                  <Ionicons name="share-social" size={20} color="#FFF" />
                  <Text style={[styles.saveBtnText, { color: '#FFF' }]}>Compartir Enlace</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 25 }]}>LIBRERÍA DE ICONOS DEPORTIVOS</Text>
              <View style={[styles.card, { backgroundColor: colors.surface }]}>
                <Text style={{ color: colors.textSecondary, marginBottom: 15, fontSize: 13 }}>
                  Estos iconos aparecen en el calendario cuando un atleta registra una sesión técnica o competición.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 15 }}>
                  {Object.entries(SPORT_ICON_MAP).map(([key, value]) => (
                    <View key={key} style={{ alignItems: 'center', width: '20%' }}>
                      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                         {value.lib === 'Ionicons' ? (
                           <Ionicons name={value.icon as any} size={20} color={colors.textPrimary} />
                         ) : (
                           <MaterialCommunityIcons name={value.icon as any} size={20} color={colors.textPrimary} />
                         )}
                      </View>
                      <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: 4, textTransform: 'uppercase' }}>{key}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 25 }]}>ZONA DE PELIGRO</Text>
          <View style={[styles.cardList, { backgroundColor: colors.surface, marginBottom: 40 }]}>
            <TouchableOpacity style={styles.settingRowAction} onPress={handleLogout}>
              <View style={[styles.iconBox, { backgroundColor: '#EF444415' }]}><Ionicons name="log-out" size={20} color="#EF4444" /></View>
              <Text style={[styles.settingText, { color: '#EF4444', marginLeft: 16, flex: 1 }]}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* --- MODAL CREADOR DE PÍLDORAS --- */}
      <Modal visible={showPillBuilder} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.modalContent, { backgroundColor: colors.surface, height: '90%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.textPrimary }}>
                {editingPillId ? 'Editar Píldora' : 'Constructor de Píldoras'}
              </Text>
              <TouchableOpacity onPress={() => setShowPillBuilder(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              <TextInput style={[styles.pillInput, { color: colors.textPrimary, borderColor: colors.border }]} value={pillName} onChangeText={setPillName} placeholder="Nombre (ej: Activación Hombros)" placeholderTextColor={colors.textSecondary} />
              
              <View style={[styles.typeSelector, { backgroundColor: colors.background, borderColor: colors.border, marginBottom: 20 }]}>
                <TouchableOpacity style={[styles.typeBtn, pillType === 'traditional' && { backgroundColor: colors.primary }]} onPress={() => setPillType('traditional')}><Text style={{ color: pillType === 'traditional' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Fuerza</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.typeBtn, pillType === 'hiit' && { backgroundColor: colors.error || '#EF4444' }]} onPress={() => setPillType('hiit')}><Text style={{ color: pillType === 'hiit' ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>Circuito</Text></TouchableOpacity>
              </View>

              {pillType === 'traditional' ? (
                <View style={{ gap: 10 }}>
                  {pillExs.map((ex, i) => (
                    <View key={ex._key} style={[styles.pillExCard, { borderColor: colors.border }]}>
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.name} onChangeText={v => { const n = [...pillExs]; n[i].name = v; setPillExs(n); }} placeholder="Nombre ej." placeholderTextColor={colors.textSecondary} />
                        <TouchableOpacity onPress={() => setPillExs(pillExs.filter((_, idx) => idx !== i))}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.sets} onChangeText={v => { const n = [...pillExs]; n[i].sets = v; setPillExs(n); }} placeholder="Series" />
                        <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.reps} onChangeText={v => { const n = [...pillExs]; n[i].reps = v; setPillExs(n); }} placeholder="Reps" />
                        <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.duration} onChangeText={v => { const n = [...pillExs]; n[i].duration = v; setPillExs(n); }} placeholder="Tiempo" />
                      </View>
                      <TextInput style={[styles.pillExInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: 8 }]} value={ex.video_url} onChangeText={v => { const n = [...pillExs]; n[i].video_url = v; setPillExs(n); }} placeholder="URL YouTube (opcional)" />
                      <TouchableOpacity onPress={() => { const n = [...pillExs]; n[i].is_unilateral = !n[i].is_unilateral; setPillExs(n); }} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8}}>
                        <Ionicons name={ex.is_unilateral ? "checkbox" : "square-outline"} size={18} color={ex.is_unilateral ? colors.primary : colors.textSecondary} />
                        <Text style={{color: ex.is_unilateral ? colors.primary : colors.textSecondary, fontSize: 12, fontWeight: '700'}}>Unilateral</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => setPillExs([...pillExs, { _key: Math.random().toString(), name: '', sets: '', reps: '', duration: '', video_url: '', is_unilateral: false }])} style={[styles.addExBtnBig, { borderColor: colors.primary }]}><Text style={{ color: colors.primary, fontWeight: '700' }}>+ Añadir Ejercicio</Text></TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 15 }}>
                  {pillBlocks.map((block, bIdx) => (
                    <View key={block._key} style={[styles.pillExCard, { borderColor: colors.border }]}>
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                        <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border, fontWeight: '700' }]} value={block.name} onChangeText={v => { const n = [...pillBlocks]; n[bIdx].name = v; setPillBlocks(n); }} placeholder="Nombre Bloque" />
                        <TextInput style={[styles.pillExInput, { width: 60, color: colors.textPrimary, borderColor: colors.border }]} value={block.sets} onChangeText={v => { const n = [...pillBlocks]; n[bIdx].sets = v; setPillBlocks(n); }} placeholder="Vueltas" keyboardType="numeric" />
                        <TouchableOpacity onPress={() => setPillBlocks(pillBlocks.filter((_, idx) => idx !== bIdx))}><Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} /></TouchableOpacity>
                      </View>
                      
                      {block.exercises.map((ex: any, eIdx: number) => (
                        <View key={ex._key} style={{ paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.primary, marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                            <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.name} onChangeText={v => { const n = [...pillBlocks]; n[bIdx].exercises[eIdx].name = v; setPillBlocks(n); }} placeholder="Ejercicio" />
                            <TouchableOpacity onPress={() => { const n = [...pillBlocks]; n[bIdx].exercises.splice(eIdx, 1); setPillBlocks(n); }}><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></TouchableOpacity>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                            <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.duration_reps} onChangeText={v => { const n = [...pillBlocks]; n[bIdx].exercises[eIdx].duration_reps = v; setPillBlocks(n); }} placeholder="Reps" />
                            <TextInput style={[styles.pillExInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border }]} value={ex.duration} onChangeText={v => { const n = [...pillBlocks]; n[bIdx].exercises[eIdx].duration = v; setPillBlocks(n); }} placeholder="Tiempo" />
                          </View>
                          <TextInput style={[styles.pillExInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: 6 }]} value={ex.video_url} onChangeText={v => { const n = [...pillBlocks]; n[bIdx].exercises[eIdx].video_url = v; setPillBlocks(n); }} placeholder="URL YouTube (opcional)" />
                          <TouchableOpacity onPress={() => { const n = [...pillBlocks]; n[bIdx].exercises[eIdx].is_unilateral = !n[bIdx].exercises[eIdx].is_unilateral; setPillBlocks(n); }} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6}}>
                            <Ionicons name={ex.is_unilateral ? "checkbox" : "square-outline"} size={16} color={ex.is_unilateral ? colors.primary : colors.textSecondary} />
                            <Text style={{color: ex.is_unilateral ? colors.primary : colors.textSecondary, fontSize: 11, fontWeight: '700'}}>Unilateral</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity onPress={() => { const n = [...pillBlocks]; n[bIdx].exercises.push({ _key: Math.random().toString(), name: '', duration_reps: '', duration: '', video_url: '', is_unilateral: false }); setPillBlocks(n); }} style={{ paddingVertical: 8 }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>+ Añadir ejercicio al bloque</Text></TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => setPillBlocks([...pillBlocks, { _key: Math.random().toString(), name: `Bloque ${pillBlocks.length + 1}`, sets: '1', exercises: [{ _key: Math.random().toString(), name: '', duration_reps: '', duration: '', video_url: '', is_unilateral: false }] }])} style={[styles.addExBtnBig, { borderColor: colors.error || '#EF4444', borderStyle: 'dashed' }]}><Text style={{ color: colors.error || '#EF4444', fontWeight: '700' }}>+ Añadir Bloque</Text></TouchableOpacity>
                </View>
              )}

            </ScrollView>

            <TouchableOpacity style={[styles.saveBtnBig, { backgroundColor: colors.primary, marginTop: 10 }]} onPress={handleSavePill} disabled={savingPill}>
              {savingPill ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>{editingPillId ? 'GUARDAR CAMBIOS' : 'GUARDAR PÍLDORA'}</Text>}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 10 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, paddingHorizontal: 10 },
  avatarCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 35 },
  cameraBadge: { position: 'absolute', bottom: 0, right: -4, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
  avatarText: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  profileTextWrapper: { marginLeft: 20, flex: 1 },
  profileName: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  roleText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#888', marginBottom: 12, letterSpacing: 1.5, marginLeft: 12 },
  card: { borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardList: { borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  divider: { height: 1, marginLeft: 65, opacity: 0.3 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  input: { flex: 1, fontSize: 16, fontWeight: '600', paddingVertical: 12 },
  saveProfileBtn: { marginTop: 15, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveProfileBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  inputLabel: { fontSize: 12, fontWeight: '800' },
  measureInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontWeight: '600', marginBottom: 15 },
  saveBtn: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { fontWeight: '800', fontSize: 15 },
  measureRow: { flexDirection: 'row', gap: 15 },
  measureCol: { flex: 1 },
  settingRowAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingIconText: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
  iconBox: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  settingText: { fontSize: 15, fontWeight: '700' },
  themeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  themeBtnText: { fontSize: 11, fontWeight: '800', marginTop: 6, textTransform: 'uppercase' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { padding: 25, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  pillInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 15 },
  typeSelector: { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1 }, 
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 }, 
  pillExCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  pillExInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13 },
  addExBtnBig: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginTop: 5 },
  saveBtnBig: { paddingVertical: 16, borderRadius: 15, alignItems: 'center' },
});
