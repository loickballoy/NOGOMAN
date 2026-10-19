import { router } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Banner, Card, Empty, Header, Loading, T } from '@/components/ui';
import { seconds } from '@/components/Voice';
import { errorMessage } from '@/lib/api';
import { initials } from '@/lib/format';
import { useConversations } from '@/lib/queries';
import { colors, space } from '@/lib/theme';
import { Conversation } from '@/lib/types';

function preview(c: Conversation) {
  const m = c.lastMessage;
  if (!m) return 'Pas encore de message';
  const who = m.mine ? 'Vous : ' : '';
  return m.kind === 'VOICE' ? `${who}Message vocal (${seconds(m.audioMs ?? 0)})` : `${who}${m.text}`;
}

export default function Messages() {
  const conversations = useConversations();
  const list = conversations.data ?? [];
  const unread = list.reduce((s, c) => s + c.unread, 0);
  const listen = list.length === 0
    ? 'Pas encore de discussion. Vous pourrez écrire depuis une offre.'
    : `${list.length} discussion${list.length > 1 ? 's' : ''}. ${unread} message${unread > 1 ? 's' : ''} non lu${unread > 1 ? 's' : ''}.`;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={conversations.isRefetching} onRefresh={() => { conversations.refetch(); }} />}>
        <Header back={false} listen={listen} />
        <T variant="title">Messages</T>
        {conversations.isLoading ? <Loading /> : conversations.error ? <Banner tone="alert">{errorMessage(conversations.error)}</Banner>
          : list.length === 0 ? <Empty icon="chat" title="Pas encore de discussion">Écrivez depuis une offre ou une candidature.</Empty>
          : list.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/chat/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={initials(c.other.name)} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="bodyStrong" numberOfLines={1}>{c.other.name}</T>
                <T variant="tiny" color={colors.muted} numberOfLines={1}>{c.job.title}</T>
                <T variant="small" color={c.unread ? colors.ink : colors.muted} numberOfLines={1} style={c.unread ? { fontWeight: '700' } : undefined}>{preview(c)}</T>
              </View>
              {c.unread > 0 && (
                <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
                  <T variant="tiny" color={colors.white} style={{ fontWeight: '800' }}>{c.unread}</T>
                </View>
              )}
            </Card>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}
