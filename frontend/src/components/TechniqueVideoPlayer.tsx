import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Linking } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { playableVideoUrl, videoPosterUrl } from '../utils/cloudinaryVideo';

// Reproductor de vídeos de técnica.
// En la web usa la etiqueta <video> del navegador con la versión MP4 H.264 (se ve en cualquier dispositivo).
// Si Cloudinary aún está preparando esa versión, reintenta unas veces y, como último recurso, prueba el original.

export type TechniquePlayerHandle = { getTime: () => number; seek: (seconds: number) => void };

type Props = {
  url: string;
  autoPlay?: boolean;
  maxHeight?: number;
  onTimeUpdate?: (seconds: number) => void;
  colors: any;
};

const TechniqueVideoPlayer = forwardRef<TechniquePlayerHandle, Props>(({ url, autoPlay, maxHeight = 420, onTimeUpdate, colors }, ref) => {
  const videoRef = useRef<any>(null);
  const timeRef = useRef(0);
  const [attempt, setAttempt] = useState(0);   // 0-2: versión compatible; 3: archivo original
  const [failed, setFailed] = useState(false);

  useEffect(() => { setAttempt(0); setFailed(false); }, [url]);

  const playable = playableVideoUrl(url);
  const src = attempt < 3 ? (attempt === 0 ? playable : `${playable}?r=${attempt}`) : url;

  useImperativeHandle(ref, () => ({
    getTime: () => timeRef.current,
    seek: (seconds: number) => {
      const v = videoRef.current;
      if (!v) return;
      if (Platform.OS === 'web') { v.currentTime = seconds; v.play?.().catch(() => {}); }
      else v.setPositionAsync?.(seconds * 1000).then(() => v.playAsync?.()).catch(() => {});
    },
  }), []);

  const handleError = () => {
    if (attempt < 2) setTimeout(() => setAttempt(a => a + 1), 4000);
    else if (attempt === 2 && playable !== url) setAttempt(3);
    else setFailed(true);
  };

  if (failed) {
    return (
      <View style={{ padding: 16, borderRadius: 12, backgroundColor: colors.surfaceHighlight, gap: 8 }}>
        <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>No se pudo reproducir el vídeo aquí.</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Si se acaba de subir, puede que la nube aún lo esté preparando. Prueba en un minuto.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity accessibilityRole="button" onPress={() => { setFailed(false); setAttempt(0); }} style={{ padding: 10, borderRadius: 10, backgroundColor: colors.primary }}>
            <Text style={{ color: '#FFF', fontWeight: '800' }}>Reintentar</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => Linking.openURL(url)} style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Abrir el archivo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return React.createElement('video', {
      ref: videoRef,
      key: src,
      src,
      poster: videoPosterUrl(url),
      controls: true,
      playsInline: true,
      autoPlay: !!autoPlay,
      preload: 'metadata',
      'aria-label': 'Vídeo de técnica',
      onError: handleError,
      onTimeUpdate: (e: any) => { timeRef.current = e.currentTarget.currentTime || 0; onTimeUpdate?.(timeRef.current); },
      style: { width: '100%', maxHeight, borderRadius: 12, backgroundColor: '#000', display: 'block' },
    });
  }

  return (
    <Video
      ref={videoRef}
      source={{ uri: src }}
      style={{ width: '100%', height: Math.min(maxHeight, 320), borderRadius: 12, backgroundColor: '#000' }}
      resizeMode={ResizeMode.CONTAIN}
      useNativeControls
      shouldPlay={!!autoPlay}
      onError={handleError}
      onPlaybackStatusUpdate={(s: any) => { if (s?.isLoaded) { timeRef.current = (s.positionMillis || 0) / 1000; onTimeUpdate?.(timeRef.current); } }}
    />
  );
});

export default TechniqueVideoPlayer;
