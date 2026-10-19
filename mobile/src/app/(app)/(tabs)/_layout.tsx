import { Tabs } from 'expo-router/js-tabs';
import { Icon, IconName } from '@/components/Icon';
import { useMe } from '@/lib/auth';
import { useUnread } from '@/lib/queries';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const me = useMe();
  const unread = useUnread().data?.count ?? 0;
  const tab = (icon: IconName) => {
    const TabIcon = ({ color, focused }: { color: unknown; focused: boolean }) =>
      <Icon name={icon} color={String(color)} strokeWidth={focused ? 2.4 : 2} />;
    return TabIcon;
  };
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.ink,
      tabBarInactiveTintColor: colors.muted,
      tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
      tabBarStyle: { borderTopColor: colors.line, height: 64, paddingTop: 6 },
    }}>
      <Tabs.Screen name="index" options={{ title: me.role === 'FARMER' ? 'Accueil' : 'Carte', tabBarIcon: tab(me.role === 'FARMER' ? 'home' : 'map') }} />
      <Tabs.Screen name="missions" options={{ title: 'Missions', tabBarIcon: tab('briefcase') }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: tab('chat'),
        tabBarBadge: unread > 0 ? unread : undefined, tabBarBadgeStyle: { backgroundColor: colors.green, fontWeight: '800' } }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}
