import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface VideoUploaderProps {
  currentVideo: string | null;
  onUploadSuccess: (url: string) => void;
  colors: any;
  readOnly?: boolean;
  onPlay?: () => void;
}

export default function VideoUploader({ currentVideo, onUploadSuccess, colors, readOnly = false, onPlay }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleMediaUpload = async (pickerResult: ImagePicker.ImagePickerResult) => {
    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) return;
    
    const asset = pickerResult.assets[0];
    setUploading(true);
    
    try {
      const formData = new FormData();
      
      if (Platform.OS === 'web') {
        if ((asset as any).file) {
          formData.append('file', (asset as any).file);
        } else {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          const filename = asset.uri.split('/').pop() || 'video.mp4';
          formData.append('file', blob, filename);
        }
      } else {
        const filename = asset.uri.split('/').pop() || 'video.mp4';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `video/${match[1]}` : `video/mp4`;
        
        formData.append('file', {
          uri: asset.uri,
          name: filename,
          type
        } as any);
      }

      formData.append('upload_preset', 'fit_tracker_videos'); 

      const cloudName = 'slsdfq8t';
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.secure_url) {
        onUploadSuccess(data.secure_url);
      } else {
        throw new Error(data.error?.message || 'Error al subir a Cloudinary');
      }

    } catch (error) {
      console.error("Error al subir video:", error);
      Alert.alert("Error", "Ocurrió un problema al subir el vídeo a la nube.");
    } finally {
      setUploading(false);
    }
  };

  const recordVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permiso Denegado", "Se requiere acceso a la cámara para grabar vídeos.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.8,
      });
      handleMediaUpload(result);
    } catch (error) {
      console.error("Error al abrir cámara:", error);
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {readOnly ? (
        currentVideo ? (
          <TouchableOpacity onPress={onPlay} style={{ paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#10B98120', borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="play" size={14} color="#10B981" />
            <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 10, marginLeft: 4 }}>VER VÍDEO</Text>
          </TouchableOpacity>
        ) : null
      ) : uploading ? (
        <View style={{ padding: 8, backgroundColor: colors?.surfaceHighlight || '#EEE', borderRadius: 8 }}>
          <ActivityIndicator size="small" color={colors?.primary || '#F59E0B'} />
        </View>
      ) : currentVideo ? (
        <>
          <TouchableOpacity onPress={onPlay} style={{ padding: 8, backgroundColor: '#10B98120', borderRadius: 8 }}>
            <Ionicons name="play" size={20} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onUploadSuccess('')} style={{ padding: 8, backgroundColor: '#EF444420', borderRadius: 8 }}>
            <Ionicons name="trash" size={20} color="#EF4444" />
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={recordVideo} style={{ padding: 8, backgroundColor: colors?.surfaceHighlight || '#EEE', borderRadius: 8 }}>
          <Ionicons name="camera" size={20} color={colors?.textSecondary || '#888'} />
        </TouchableOpacity>
      )}
    </View>
  );
}
