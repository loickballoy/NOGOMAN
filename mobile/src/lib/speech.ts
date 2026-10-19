import * as Speech from 'expo-speech';

// "Écouter" reads the screen aloud in French with the phone's own voice (free, works offline).
// Pre-recorded AI voices can replace this later without changing the screens.
let speaking = false;

export async function toggleSpeak(text: string, onChange?: (speaking: boolean) => void) {
  if (speaking || (await Speech.isSpeakingAsync())) {
    await Speech.stop();
    speaking = false;
    onChange?.(false);
    return;
  }
  speaking = true;
  onChange?.(true);
  const done = () => {
    speaking = false;
    onChange?.(false);
  };
  Speech.speak(text, { language: 'fr-FR', rate: 0.95, onDone: done, onStopped: done, onError: done });
}

export function stopSpeaking() {
  speaking = false;
  return Speech.stop();
}
