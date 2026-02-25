import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-workout" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-test" options={{ presentation: 'modal' }} />
        <Stack.Screen name="athlete-detail" options={{ presentation: 'card' }} />
        <Stack.Screen name="add-athlete" options={{ presentation: 'modal' }} />
        <Stack.Screen name="training-mode" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="edit-workout" options={{ presentation: 'modal' }} />
      </Stack>
    </AuthProvider>
  );
}
