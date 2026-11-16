import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { friendlyDate } from '../utils/dates';
import { videoPosterUrl, formatSeconds } from '../utils/cloudinaryVideo';
import TechniqueVideoPlayer, { TechniquePlayerHandle } from './TechniqueVideoPlayer';

// Tarjeta de un vídeo de técnica: el vídeo, las correcciones del entrenador (cada una puede ir enganchada
// a un segundo del vídeo: al tocarla, el vídeo salta a ese momento) y opciones para borrar.

type Props = {
  video: any;
  colors: any;
  currentUser: { id: string; role: string } | null;
  onChange: (video: any | null) => void;   // vídeo actualizado, o null si se ha borrado
  startPlaying?: boolean;
};

const confirm = (title: string, message: string, onYes: () => void) =>
  Alert.alert(title, message, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: onYes }]);

export default function TechniqueVideoCard({ video, colors, currentUser, onChange, startPlaying }: Props) {
  const isTrainer = currentUser?.role === 'trainer';
  const playerRef = useRef<TechniquePlayerHandle>(null);
  const [playing, setPlaying] = useState(!!startPlaying);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [text, setText] = useState('');
  const [atMoment, setAtMoment] = useState(true);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const comments: any[] = [...(video.comments || [])].sort((a, b) => {
    if (a.time_s != null && b.time_s != null) return a.time_s - b.time_s;
    if (a.time_s != null) return -1;
    if (b.time_s != null) return 1;
    return String(a.created_at).localeCompare(String(b.created_at));
  });

  // Saltar al segundo de un comentario (si el vídeo aún no estaba abierto, se abre y luego salta)
  useEffect(() => {
    if (playing && pendingSeek !== null) {
      const t = setTimeout(() => { playerRef.current?.seek(pendingSeek); setPendingSeek(null); }, 300);
      return () => clearTimeout(t);
    }
  }, [playing, pendingSeek]);

  const goTo = (seconds: number) => { setPlaying(true); setPendingSeek(seconds); };

  const sendComment = async () => {
    const clean = text.trim();
    if (!clean) return;
    setSending(true);
    try {
      const time = playing && atMoment && isTrainer ? playerRef.current?.getTime() ?? currentTime : null;
      const comment = await api.addVideoComment(video.id, clean, time != null && time > 0 ? time : null);
      onChange({ ...video, comments: [...(video.comments || []), comment] });
      setText('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo guardar el comentario.');
    } finally {
      setSending(false);
    }
  };

  const deleteComment = (c: any) => confirm('Eliminar comentario', '¿Seguro que quieres borrar este comentario?', async () => {
    try {
      await api.deleteVideoComment(video.id, c.id);
      onChange({ ...video, comments: (video.comments || []).filter((x: any) => x.id !== c.id) });
    } catch (e: any) { Alert.alert('Error', e?.message || 'No se pudo borrar el comentario.'); }
  });

  const deleteVideo = () => confirm('Eliminar vídeo', 'Se borrarán el vídeo y todos sus comentarios. ¿Continuar?', async () => {
    setBusy(true);
    try {
      await api.deleteTechniqueVideo(video.id);
      onChange(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo borrar el vídeo.');
      setBusy(false);
    }
  });

  const poster = videoPosterUrl(video.url);
  const authorLabel = (c: any) => c.author_id === currentUser?.id ? 'Tú' : c.author_role === 'trainer' ? 'Entrenador' : (c.author_name || 'Deportista');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel={`Vídeo de ${video.exercise_name || 'técnica'}`}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: colors.primary + '18' }]}><Ionicons name="videocam" size={18} color={colors.primary} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>{video.exercise_name || 'Vídeo de técnica'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {[video.workout_title, video.workout_date ? friendlyDate(video.workout_date) : ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Eliminar vídeo" onPress={deleteVideo} disabled={busy} style={{ padding: 6 }}>
          {busy ? <ActivityIndicator size="small" color={colors.error || '#EF4444'} /> : <Ionicons name="trash-outline" size={20} color={colors.error || '#EF4444'} />}
        </TouchableOpacity>
      </View>

      {playing ? (
        <TechniqueVideoPlayer ref={playerRef} url={video.url} autoPlay colors={colors} onTimeUpdate={setCurrentTime} />
      ) : (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reproducir vídeo" onPress={() => setPlaying(true)} style={styles.poster}>
          {!!poster && <Image source={{ uri: poster }} style={StyleSheet.absoluteFillObject as any} resizeMode="contain" />}
          <View style={styles.playCircle}><Ionicons name="play" size={30} color="#FFF" /></View>
        </TouchableOpacity>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>
          {comments.length ? `CORRECCIONES (${comments.length})` : 'SIN CORRECCIONES TODAVÍA'}
        </Text>
        {comments.map(c => (
          <View key={c.id} style={[styles.comment, { backgroundColor: c.author_role === 'trainer' ? colors.primary + '10' : colors.surfaceHighlight }]}>
            {c.time_s != null && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ir al segundo ${formatSeconds(c.time_s)}`} onPress={() => goTo(c.time_s)} style={[styles.timeChip, { backgroundColor: colors.primary }]}>
                <Ionicons name="play" size={10} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>{formatSeconds(c.time_s)}</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>{c.text}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{authorLabel(c)}</Text>
            </View>
            {(c.author_id === currentUser?.id || isTrainer) && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Eliminar comentario" onPress={() => deleteComment(c)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {!!currentUser && (
        <View style={{ gap: 8 }}>
          {isTrainer && playing && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={atMoment ? 'No enganchar al segundo actual' : 'Enganchar al segundo actual'} onPress={() => setAtMoment(v => !v)}
              style={[styles.momentChip, { borderColor: atMoment ? colors.primary : colors.border, backgroundColor: atMoment ? colors.primary + '15' : 'transparent' }]}>
              <Ionicons name={atMoment ? 'checkbox' : 'square-outline'} size={16} color={atMoment ? colors.primary : colors.textSecondary} />
              <Text style={{ color: atMoment ? colors.primary : colors.textSecondary, fontWeight: '700', fontSize: 12 }}>En el segundo {formatSeconds(currentTime)} del vídeo</Text>
            </TouchableOpacity>
          )}
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel={isTrainer ? 'Escribir corrección' : 'Escribir respuesta'}
              value={text} onChangeText={setText} multiline
              placeholder={isTrainer ? (playing ? 'Pausa en el momento clave y escribe la corrección…' : 'Escribe una corrección de técnica…') : 'Responde o pregunta a tu entrenador…'}
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Enviar comentario" onPress={sendComment} disabled={sending || !text.trim()}
              style={[styles.send, { backgroundColor: text.trim() ? colors.primary : colors.surfaceHighlight }]}>
              {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color={text.trim() ? '#FFF' : colors.textSecondary} />}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  poster: { height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  playCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  comment: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 12 },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  momentChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  send: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});
