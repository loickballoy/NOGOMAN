import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Avatar, Banner, IconButton, ListenButton, Loading, MAX_FONT_SCALE, T } from '@/components/ui';
import { seconds, useVoiceRecorder, VOICE_MIME, VoiceBubble } from '@/components/Voice';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { initials } from '@/lib/format';
import { keys, useConversations, useMessages } from '@/lib/queries';
import { colors, radius, space, type } from '@/lib/theme';
import { ChatMessage } from '@/lib/types';

function time(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const conversations = useConversations();
  const conv = conversations.data?.find((c) => c.id === id);
  const messages = useMessages(id);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const voice = useVoiceRecorder();

  const list = messages.data ?? [];
  const lastId = list[list.length - 1]?.id;
  useEffect(() => {
    // Seen everything on screen: clears the unread badge.
    if (lastId) api(`/conversations/${id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: keys.conversations })).catch(() => {});
  }, [id, lastId, qc]);

  const closed = conv && (conv.applicationStatus === 'REJECTED' || conv.applicationStatus === 'WITHDRAWN');

  async function sendText() {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    setError(null);
    try {
      const m = await api<ChatMessage>(`/conversations/${id}/messages`, { method: 'POST', body: { text: value } });
      setText('');
      setWarn(m.masked);
      await qc.invalidateQueries({ queryKey: keys.messages(id) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function toggleRecording() {
    setError(null);
    if (!voice.recording) {
      await voice.start();
      return;
    }
    const file = await voice.stop();
    if (!file) return;
    setSending(true);
    try {
      await apiUpload(`/conversations/${id}/voice`, { durationMs: String(Math.round(file.durationMs)) },
        { uri: file.uri, name: VOICE_MIME === 'audio/webm' ? 'voice.webm' : 'voice.m4a', type: VOICE_MIME });
      await qc.invalidateQueries({ queryKey: keys.messages(id) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const listen = conv
    ? `Discussion avec ${conv.other.name}, pour ${conv.job.title}. Vos numéros restent privés. Pour parler, touchez le micro, parlez, puis touchez encore pour envoyer.`
    : 'Discussion.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <IconButton icon="back" label="Retour" onPress={() => router.back()} />
        <Avatar name={initials(conv?.other.name)} size={40} dark />
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong" numberOfLines={1}>{conv?.other.name ?? '…'}</T>
          <T variant="tiny" color={colors.muted} numberOfLines={1}>{conv?.job.title}</T>
        </View>
        <ListenButton text={listen} compact />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ padding: space.lg, gap: 10 }}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} keyboardDismissMode="on-drag">
          <View style={{ alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, maxWidth: 320 }}>
            <Icon name="lock" size={16} color={colors.ink2} />
            <T variant="tiny" color={colors.ink2} style={{ flexShrink: 1 }}>Vos numéros restent privés. Parlez ici : votre paiement reste protégé.</T>
          </View>
          {messages.isLoading && <Loading />}
          {list.map((m) => (
            <View key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 4 }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
                borderBottomRightRadius: m.mine ? 6 : 18, borderBottomLeftRadius: m.mine ? 18 : 6,
                backgroundColor: m.mine ? colors.ink : colors.white, borderWidth: m.mine ? 0 : 1, borderColor: colors.line }}>
                {m.kind === 'VOICE' && m.audioUrl
                  ? <VoiceBubble url={m.audioUrl} durationMs={m.audioMs ?? 0} mine={m.mine} />
                  : <T color={m.mine ? colors.white : colors.ink}>{m.text}</T>}
                <T variant="tiny" color={m.mine ? colors.onInkMuted : colors.muted} style={{ alignSelf: 'flex-end', marginTop: 2 }}>{time(m.createdAt)}</T>
              </View>
              {m.masked && (
                <T variant="tiny" color={colors.pendingText} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}>Coordonnées masquées par Nogoman</T>
              )}
            </View>
          ))}
          {list.length === 0 && !messages.isLoading && (
            <T variant="small" color={colors.muted} style={{ textAlign: 'center', marginTop: 20 }}>Aucun message. Écrivez ou envoyez un message vocal.</T>
          )}
        </ScrollView>

        {warn && (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
            <Banner tone="pending" title="Numéro masqué.">Restez sur Nogoman : si vous payez en dehors de l’app, vous n’êtes plus protégé.</Banner>
          </View>
        )}
        {(error || voice.error) && <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}><Banner tone="alert">{error ?? voice.error}</Banner></View>}

        {closed ? (
          <View style={{ padding: space.lg }}><Banner tone="info">Cette discussion est fermée.</Banner></View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.white }}>
            {voice.recording ? (
              <View style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: colors.alertSoft, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.alertText }} />
                <T variant="bodyStrong" color={colors.alertText}>Enregistrement… {seconds(voice.durationMs)}</T>
              </View>
            ) : (
              <View style={{ flex: 1, minHeight: 52, borderRadius: 26, backgroundColor: colors.field, justifyContent: 'center', paddingHorizontal: 16 }}>
                <TextInput value={text} onChangeText={(v) => { setText(v); setWarn(false); }} placeholder="Message" placeholderTextColor={colors.muted}
                  multiline maxLength={1000} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Écrire un message"
                  style={[type.body, { color: colors.ink, maxHeight: 120, paddingVertical: 12 }]} />
              </View>
            )}
            {text.trim() && !voice.recording ? (
              <RoundButton icon="send" label="Envoyer" onPress={sendText} busy={sending} />
            ) : (
              <RoundButton icon={voice.recording ? 'send' : 'mic'} label={voice.recording ? 'Envoyer le message vocal' : 'Enregistrer un message vocal'}
                onPress={toggleRecording} busy={sending} danger={voice.recording} />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoundButton({ icon, label, onPress, busy, danger }: { icon: 'send' | 'mic'; label: string; onPress: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={busy}
      style={({ pressed }) => [{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
        backgroundColor: danger ? colors.alertText : colors.ink, opacity: busy ? 0.5 : 1 }, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} color={colors.white} />
    </Pressable>
  );
}
