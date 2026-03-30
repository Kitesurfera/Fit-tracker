import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function UnifiedTimer({ 
  isPrep, isResting, isWorking, prepSeconds, restSeconds, workSeconds, 
  restTotalSeconds, workTotalSeconds, exName, colors, onToggleWork, 
  onStopPrep, onSkipRest, onResetWork 
}: any) {
  
  if (!isPrep && !isResting && !isWorking) return null;

  const currentSeconds = isPrep ? prepSeconds : isResting ? restSeconds : workSeconds;
  const currentTitle = isPrep ? 'PREPÁRATE' : isResting ? 'DESCANSO' : '¡A TOPE!';
  const color = isResting ? (colors.success || '#10B981') : colors.primary;

  return (
    <View style={{ padding: 20, backgroundColor: colors.surface, borderRadius: 16, alignItems: 'center', marginBottom: 16 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>
        {currentTitle}
      </Text>
      <Text style={{ color, fontSize: 60, fontWeight: '900', marginVertical: 10 }}>
        {currentSeconds}s
      </Text>
      <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
        {exName}
      </Text>
      
      <View style={{ flexDirection: 'row', gap: 15, marginTop: 20 }}>
        {isWorking && (
          <TouchableOpacity 
            style={{ backgroundColor: colors.surfaceHighlight, padding: 12, borderRadius: 12 }} 
            onPress={onToggleWork}
          >
            <Ionicons name="pause" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        {(isResting || isPrep) && (
          <TouchableOpacity 
            style={{ backgroundColor: colors.surfaceHighlight, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }} 
            onPress={isPrep ? onStopPrep : onSkipRest}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Saltar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
