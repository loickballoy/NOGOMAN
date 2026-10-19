import {
  AudioQuality, IOSOutputFormat, RecordingOptions, requestRecordingPermissionsAsync, setAudioModeAsync,
  useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { accessToken, API_URL } from '@/lib/api';
import { colors } from '@/lib/theme';
import { Icon } from './Icon';
import { T } from './ui';

/**
 * Mono AAC at 32 kbit/s (~4 KB per second): light on rural data plans, and playable on both
 * iPhone and Android. Android's default (AMR in .3gp) can't be played on iOS.
 */
export const VOICE_PRESET: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { extension: '.m4a', outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.LOW },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

export const VOICE_MIME = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';

export function seconds(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Tap to record, tap again to send. */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE_PRESET);
  const state = useAudioRecorderState(recorder, 250);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('Autorisez le micro pour envoyer un message vocal.');
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    return true;
  }

  /** Stops and returns the file, or null if it was too short to be useful. */
  async function stop(): Promise<{ uri: string; durationMs: number } | null> {
    const durationMs = state.durationMillis;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri || durationMs < 700) return null;
    return { uri, durationMs };
  }

  return { start, stop, recording: state.isRecording, durationMs: state.durationMillis, error };
}

/** A voice note in the thread. The audio only downloads when tapped. */
export function VoiceBubble({ url, durationMs, mine }: { url: string; durationMs: number; mine: boolean }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish, player]);

  async function toggle() {
    if (loading) return;
    if (!loaded) {
      setLoading(true);
      setFailed(false);
      try {
        const token = await accessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        if (Platform.OS === 'web') {
          // The web player ignores request headers, so fetch with the token and play a local blob.
          const res = await fetch(`${API_URL}${url}`, { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          player.replace({ uri: URL.createObjectURL(await res.blob()) });
        } else {
          // Download once into the cache, then play the local file: no streaming, no auth
          // headers for the player to forget, works offline afterwards.
          const id = url.split('/')[2] ?? String(Date.now());
          const local = new File(Paths.cache, `voice-${id}.m4a`);
          if (!local.exists) await File.downloadFileAsync(`${API_URL}${url}`, local, { headers, idempotent: true });
          player.replace({ uri: local.uri });
        }
        // Without this, iPhones in silent mode play voice notes muted.
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
        setLoaded(true);
        player.play();
      } catch (err) {
        console.warn(`[voice] could not play ${url}: ${String(err)}`);
        setFailed(true);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (status.playing) player.pause();
    else {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.play();
    }
  }

  const fg = mine ? colors.white : colors.ink;
  const total = durationMs / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const bars = [8, 14, 20, 12, 24, 18, 10, 22, 26, 16, 12, 20, 14, 8, 18, 24, 12, 16, 10, 20];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause' : 'Écouter le message vocal'} onPress={toggle} hitSlop={8}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mine ? colors.white : colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        {loading
          ? <ActivityIndicator size="small" color={mine ? colors.ink : colors.white} />
          : <Icon name={failed ? 'alert' : status.playing ? 'pause' : 'play'} size={18} color={mine ? colors.ink : colors.white} strokeWidth={2.4} />}
      </Pressable>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 }}>
        {bars.map((h, i) => (
          <View key={i} style={{ flex: 1, height: h, borderRadius: 2,
            backgroundColor: i / bars.length < progress ? fg : mine ? '#6B716E' : '#C9CDCB' }} />
        ))}
      </View>
      <T variant="tiny" color={mine ? colors.onInkMuted : colors.muted}>{seconds(status.playing ? status.currentTime * 1000 : durationMs)}</T>
    </View>
  );
}
