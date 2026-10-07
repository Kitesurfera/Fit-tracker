import { Alert, AlertButton, Platform } from 'react-native';

// En la web, Alert.alert de React Native no muestra nada.
// Lo sustituimos por los diálogos del navegador para que avisos y confirmaciones se vean en Chrome y Safari.
export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length < 2) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }

    const cancel = buttons.find(b => b.style === 'cancel') || buttons[0];
    const confirm = buttons.find(b => b !== cancel)!;
    if (window.confirm(text)) confirm.onPress?.();
    else cancel.onPress?.();
  };
}
