import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/hooks/useTheme';
import { api } from '../../src/api';
import WellnessModal from '../../src/components/WellnessModal';

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  const [athletes, setAthletes] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeMicro, setActiveMicro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showWellness, setShowWellness] = useState(false);

  // Estados para el alta de deportista
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAthlete, setNewAthlete] = useState({ 
    name: '', email: '', password: '', gender: 'Femenino' 
  });

  const isTrainer = user?.role === 'trainer';
  const firstName = user?.name?.split(' ')[0] || 'Usuario';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      if (isTrainer) {
        const data = await api.getAthletes();
        setAthletes(data);
      } else {
        const [wData, sData, treeData] = await Promise.all([
          api.getWorkouts(),
          api.getSummary(),
          api.getPeriodizationTree(user.id)
        ]);
        setWorkouts(wData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setSummary(sData);

        let foundMicro = null;
        if (treeData && Array.isArray(treeData)) {
          treeData.forEach(macro => {
            macro.microciclos?.forEach(micro => {
              if (todayStr >= micro.fecha_inicio && todayStr <= micro.fecha_fin) {
                foundMicro = { ...micro, macroNombre: macro.nombre };
              }
            });
          });
        }
        setActiveMicro(foundMicro);
      }
    } catch (e) {
      console.log("Error cargando home:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAddAthlete = async () => {
    if (!newAthlete.name || !newAthlete.email || !newAthlete.password) {
      Alert.alert("Campos incompletos", "Por favor, rellena todos los datos.");
      return;
    }
    try {
      await api.createAthlete(newAthlete);
      setShowAddModal(false);
      setNewAthlete({ name: '', email: '', password: '', gender: 'Femenino' });
      loadData();
      Alert.alert("¡Éxito!", "Deportista registrado correctamente.");
    } catch (e) {
      Alert.alert("Error", "No se pudo registrar al deportista.");
    }
  };

  const confirmDelete = (athlete: any) => {
    Alert.alert(
      "Eliminar Deportista",
      `¿Estás segura de que quieres borrar a ${athlete.name}? Se perderán todos sus entrenamientos.`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Eliminar", 
          style: "destructive", 
          onPress: async () => {
            try {
              await api.deleteAthlete(athlete.id);
              loadData();
            } catch (e) { Alert.alert("Error", "No se pudo eliminar."); }
          }
        }
      ]
    );
  };

  const TrainerView = () => (
    <View style={{ flex: 1 }}>
      <FlatList
        data={athletes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); loadData();}} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.container}>
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{todayLabel}</Text>
            <View style={styles.headerRow}>
              <Text style={[styles.welcomeText, { color: colors.textPrimary }]}>Mis Deportistas 📋</Text>
              <TouchableOpacity 
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowAddModal(true)}
              >
                <Ionicons name="person-add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.athleteCard, { backgroundColor: colors.surface }]}>
            <TouchableOpacity 
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              onPress={() => router.push({ pathname: "/athlete-detail", params: { id: item.id, name: item.name } })}
            >
              <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>{item.name.charAt(0)}</Text>
              </View>
              <View>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.gender}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => confirmDelete(item)}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Modal para añadir deportista */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Nuevo Registro</Text>
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} 
              placeholder="Nombre completo" placeholderTextColor="#888" 
              onChangeText={t => setNewAthlete({...newAthlete, name: t})} 
            />
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} 
              placeholder="Email" placeholderTextColor="#888" autoCapitalize="none"
              onChangeText={t => setNewAthlete({...newAthlete, email: t})} 
            />
            <TextInput 
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]} 
              placeholder="Contraseña" placeholderTextColor="#888" secureTextEntry
              onChangeText={t => setNewAthlete({...newAthlete, password: t})} 
            />
            
            <Text style={[styles.label, { color: colors.textSecondary }]}>GÉNERO</Text>
            <View style={styles.genderRow}>
              {['Masculino', 'Femenino'].map(g => (
                <TouchableOpacity 
                  key={g} 
                  style={[styles.genderBtn, { borderColor: colors.border }, newAthlete.gender === g && { backgroundColor: colors.primary, borderColor: colors.primary }]} 
                  onPress={() => setNewAthlete({...newAthlete, gender: g})}
                >
                  <Text style={{ color: newAthlete.gender === g ? '#FFF' : colors.textPrimary, fontWeight: '700' }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary }]} onPress={handleAddAthlete}>
              <Text style={styles.submitBtnText}>CREAR DEPORTISTA</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.cancelLink}>
              <Text style={{ color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  const AthleteView = () => (
    <FlatList
      data={workouts}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); loadData();}} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.container}>
          <Text style={
