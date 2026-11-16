import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  uploadVideoFile, uploadVideoNative, pickVideoFileWeb, isTouchDevice, videoPosterUrl, prepareVideoForPlayback,
  MAX_VIDEO_MB, UploadedVideo,
} from '../utils/cloudinaryVideo';

// Subir un vídeo de técnica: grabarlo en el momento o elegir uno ya grabado, con barra de progreso.
// El archivo va a la nube (Cloudinary) y luego se reproduce en una versión compatible con cualquier dispositivo.

interface VideoUploaderProps {
  currentVideo: string | null;
  onUploadSuccess: (url: string, meta?: UploadedVideo) => void;
  colors: any;
  readOnly?: boolean;
  onPlay?: () => void;
  onDelete?: () => void;      // si no se pasa, borrar = onUploadSuccess('')
  variant?: 'compact' | 'full';
}

export default function VideoUploader({ currentVideo, onUploadSuccess, colors, readOnly = false, onPlay, onDelete, variant = 'compact' }: VideoUploaderProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const uploading = progress !== null;
  const full = variant === 'full';

  const finish = (video: UploadedVideo) => {
    prepareVideoForPlayback(video.url);
    onUploadSuccess(video.url, video);
  };

  const pickAndUpload = async (camera: boolean) => {
    setError('');
    try {
      if (Platform.OS === 'web') {
        const file = await pickVideoFileWeb(camera);
        if (!file) return;
        setProgress(0);
        finish(await uploadVideoFile(file, file.name, setProgress));
      } else {
        const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') { Alert.alert('Permiso denegado', camera ? 'Hace falta acceso a la cámara.' : 'Hace falta acceso a tus vídeos.'); return; }
        const options = { mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: false, quality: 0.7 as any, videoMaxDuration: 120 };
        const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled || !result.assets?.length) return;
        setProgress(0);
        finish(await uploadVideoNative(result.assets[0].uri));
      }
    } catch (e: any) {
      const msg = e?.message || 'No se pudo subir el vídeo.';
      setError(msg);
      if (!full) Alert.alert('No se pudo subir el vídeo', msg);
    } finally {
      setProgress(null);
    }
  };

  const remove = () => (onDelete ? onDelete() : onUploadSuccess(''));

  // --- Solo ver ---
  if (readOnly) {
    if (!currentVideo) return null;
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver vídeo" onPress={onPlay} style={{ paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#10B98120', borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="play" size={14} color="#10B981" />
        <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 10, marginLeft: 4 }}>VER VÍDEO</Text>
      </TouchableOpacity>
    );
  }

  // --- Subiendo ---
  if (uploading) {
    const pct = Math.round((progress || 0) * 100);
    return full ? (
      <View style={{ gap: 8, width: '100%' }} accessibilityLabel={`Subiendo vídeo ${pct}%`}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{pct < 100 ? `Subiendo vídeo… ${pct}%` : 'Procesando…'}</Text>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceHighlight, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.primary }} />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No cierres esta pantalla hasta que termine.</Text>
      </View>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: colors?.surfaceHighlight || '#EEE', borderRadius: 8 }} accessibilityLabel={`Subiendo vídeo ${pct}%`}>
        <ActivityIndicator size="small" color={colors?.primary || '#F59E0B'} />
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{pct}%</Text>
      </View>
    );
  }

  // --- Ya hay vídeo ---
  if (currentVideo) {
    if (!full) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver vídeo" onPress={onPlay} style={{ padding: 8, backgroundColor: '#10B98120', borderRadius: 8 }}>
            <Ionicons name="play" size={20} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Eliminar vídeo" onPress={remove} style={{ padding: 8, backgroundColor: '#EF444420', borderRadius: 8 }}>
            <Ionicons name="trash" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      );
    }
    const poster = videoPosterUrl(currentVideo);
    return (
      <View style={{ gap: 10, width: '100%' }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ver vídeo" onPress={onPlay} style={{ height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          {!!poster && <Image source={{ uri: poster }} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="contain" />}
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="play" size={28} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={{ color: colors.success || '#10B981', fontWeight: '700', fontSize: 13 }}>✓ Vídeo guardado. Tu entrenador podrá verlo y corregirte.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cambiar vídeo" onPress={() => pickAndUpload(false)} style={{ flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.surfaceHighlight }}>
            <Ionicons name="swap-horizontal" size={18} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Cambiar</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Eliminar vídeo" onPress={remove} style={{ flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#EF444418' }}>
            <Ionicons name="trash" size={18} color="#EF4444" />
            <Text style={{ color: '#EF4444', fontWeight: '700' }}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Sin vídeo ---
  if (!full) {
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Subir vídeo" onPress={() => pickAndUpload(false)} style={{ padding: 8, backgroundColor: colors?.surfaceHighlight || '#EEE', borderRadius: 8 }}>
        <Ionicons name="videocam" size={20} color={colors?.textSecondary || '#888'} />
      </TouchableOpacity>
    );
  }
  const canRecord = isTouchDevice();
  return (
    <View style={{ gap: 10, width: '100%' }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {canRecord && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Grabar vídeo" onPress={() => pickAndUpload(true)} style={{ flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: colors.primary }}>
            <Ionicons name="videocam" size={20} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '800' }}>Grabar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Elegir vídeo" onPress={() => pickAndUpload(false)} style={{ flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: canRecord ? colors.surfaceHighlight : colors.primary }}>
          <Ionicons name="folder-open" size={20} color={canRecord ? colors.textPrimary : '#FFF'} />
          <Text style={{ color: canRecord ? colors.textPrimary : '#FFF', fontWeight: '800' }}>Elegir vídeo</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
        Mejor clips cortos (30–60 s, máximo {MAX_VIDEO_MB} MB). Se verá bien en cualquier móvil u ordenador.
      </Text>
      {!!error && <Text style={{ color: colors.error || '#EF4444', fontSize: 13, fontWeight: '600' }}>{error}</Text>}
    </View>
  );
}
