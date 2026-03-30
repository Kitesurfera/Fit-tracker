import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HiitCardProps {
  currentBlock: any;
  hiitRound: number;
  hiitPhase: string;
  hiitExIdx: number;
  hiitBlockIdx: number;
  colors: any;
  hiitLogs: Record<string, any>;
  setHiitLogs: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  recordedVideos: Record<string, string>;
  handleRecordVideoOptions: (key: string) => void;
  videoUploading: string | null;
  renderVideoPlayer: (url: string) => React.ReactNode;
}

export default function HiitCard({
  currentBlock, hiitRound, hiitPhase, hiitExIdx, hiitBlockIdx, colors,
  hiitLogs, setHiitLogs, recordedVideos, handleRecordVideoOptions, videoUploading, renderVideoPlayer
}: HiitCardProps) {
  
  const totalExs = currentBlock.hiit_exercises.length;
  const dynamicPadding = totalExs <= 3 ? 18 : totalExs <= 5 ? 12 : 8;
  const dynamicFontName = totalExs <= 3 ? 20 : totalExs <= 5 ? 18 : 15;
  const dynamicFontDur = totalExs <= 3 ? 18 : totalExs <= 5 ? 16 : 14;

  return (
    <View style={[styles.hiitCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.hiitHeader, { backgroundColor: (colors.error || '#EF4444') + '15' }]}>
        <Ionicons name="flame" size={24} color={colors.error || '#EF4444'} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: colors.error || '#EF4444', fontWeight: '900', fontSize: 18, textTransform: 'uppercase' }}>{currentBlock.name}</Text>
          <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 14 }}>Vuelta {hiitRound} de {currentBlock.sets}</Text>
        </View>
      </View>

      <View style={styles.hiitList}>
        {currentBlock.hiit_exercises.map((ex: any, idx: number) => {
          const isCurrent = hiitPhase === 'work' && idx === hiitExIdx;
          const isDone = hiitExIdx > idx;
          const videoKey = `${hiitBlockIdx}-${idx}`;

          return (
            <View key={idx} style={[styles.hiitExRowWrapper, isCurrent && { backgroundColor: colors.surfaceHighlight, borderRadius: 10, borderWidth: 1, borderColor: colors.primary }]}>
              <View style={[styles.hiitExRow, { paddingVertical: dynamicPadding }]}>
                <View style={[styles.hiitCheck, { backgroundColor: isDone ? (colors.success || '#10B981') : isCurrent ? colors.primary : colors.border }]}>
                  <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{isDone ? <Ionicons name="checkmark" size={12} color="#FFF" /> : idx + 1}</Text>
                </View>
                <Text style={[styles.hiitExName, { fontSize: dynamicFontName, color: isCurrent ? colors.textPrimary : colors.textSecondary, fontWeight: isCurrent ? '800' : '600', flex: 1 }]}>{ex.name}</Text>
                <Text style={[styles.hiitExDur, { fontSize: dynamicFontDur, color: isCurrent ? colors.primary : colors.textSecondary, fontWeight: '800' }]}>{ex.duration_reps || ex.duration}</Text>
              </View>
              
              {isCurrent && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                  {ex.video_url && (
                    <TouchableOpacity style={[styles.hiitRefBtn, { backgroundColor: colors.primary + '15', marginBottom: 10 }]} onPress={() => Linking.openURL(ex.video_url)}>
                      <Ionicons name="logo-youtube" size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Ver Vídeo de Referencia</Text>
                    </TouchableOpacity>
                  )}
                  {ex.exercise_notes && (
                    <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                      <Ionicons name="information-circle" size={14} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', marginLeft: 4, flex: 1 }}>{ex.exercise_notes}</Text>
                    </View>
                  )}

                  <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 5 }}>
                    <TextInput 
                      style={[styles.feedbackInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, marginBottom: 12 }]}
                      placeholder="Comentarios rápidos (opcional)..."
                      placeholderTextColor={colors.textSecondary}
                      value={hiitLogs[videoKey]?.note || ''}
                      onChangeText={(t) => setHiitLogs(prev => ({...prev, [videoKey]: {...(prev[videoKey]||{}), note: t}}))}
                    />

                    {recordedVideos[videoKey] ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (colors.success || '#10B981') + '15', padding: 10, borderRadius: 8 }}>
                        {renderVideoPlayer(recordedVideos[videoKey])}
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={{ color: colors.success || '#10B981', fontWeight: '700', fontSize: 12, marginBottom: 4 }}>Vídeo subido</Text>
                          <TouchableOpacity onPress={() => handleRecordVideoOptions(videoKey)}>
                            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12, textDecorationLine: 'underline' }}>Cambiar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' }} onPress={() => handleRecordVideoOptions(videoKey)} disabled={videoUploading === videoKey}>
                        {videoUploading === videoKey ? <ActivityIndicator color={colors.primary} size="small" /> : <><Ionicons name="videocam" size={18} color={colors.primary} /><Text style={{ color: colors.primary, marginLeft: 6, fontWeight: '700', fontSize: 12 }}>Grabar técnica</Text></>}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hiitCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' }, 
  hiitHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }, 
  hiitList: { padding: 16, gap: 12 }, 
  hiitExRowWrapper: { overflow: 'hidden' }, 
  hiitExRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }, 
  hiitCheck: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }, 
  hiitExName: { fontSize: 16, fontWeight: '600' }, 
  hiitExDur: { fontSize: 16, fontWeight: '700' }, 
  hiitRefBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 8, alignSelf: 'flex-start' }, 
  feedbackInput: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 60, textAlignVertical: 'top', fontSize: 14 }
});
