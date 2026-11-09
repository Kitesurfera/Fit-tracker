import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Descarga (web) o comparte (móvil nativo) un archivo de texto generado por la app
export async function downloadTextFile(fileName: string, content: string, mime = 'text/csv;charset=utf-8;') {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }
  try {
    const fileUri = (FileSystem as any).documentDirectory + fileName;
    await (FileSystem as any).writeAsStringAsync(fileUri, content, { encoding: 'utf8' });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(fileUri);
    else Alert.alert('Aviso', 'No se puede compartir o guardar el archivo en este dispositivo.');
  } catch (error) {
    Alert.alert('Error', 'No se pudo generar el archivo.');
  }
}

// Lee un archivo elegido por la persona. Excel en Windows guarda los CSV en "ANSI" (windows-1252) en vez de UTF-8:
// si el texto no es UTF-8 válido, lo leemos con esa codificación para que las tildes y la ñ salgan bien.
export async function readFileAsText(uri: string): Promise<string> {
  try {
    const res = await fetch(uri);
    const buffer = await res.arrayBuffer();
    if (typeof TextDecoder !== 'undefined') {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch { try { return new TextDecoder('windows-1252').decode(buffer); } catch {} }
    }
  } catch {}
  if (Platform.OS !== 'web') {
    try { return await (FileSystem as any).readAsStringAsync(uri); } catch {}
  }
  const res = await fetch(uri);
  return res.text();
}

export const CSV_PICKER_TYPES = Platform.OS === 'web'
  ? ['.csv', 'text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel']
  : ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'];
