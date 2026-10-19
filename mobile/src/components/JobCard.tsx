import { View } from 'react-native';
import { category } from '@/lib/catalog';
import { fcfa, km, relativeDay } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { Job } from '@/lib/types';
import { Icon } from './Icon';
import { Card, T } from './ui';

export function JobCard({ job, onPress, showNet = true }: { job: Job; onPress: () => void; showNet?: boolean }) {
  const cat = category(job.category);
  const amount = showNet ? job.workerNetXof : job.rateXof;
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
      <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={cat.icon} size={28} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{job.title}</T>
          {job.farmer.verified && <Icon name="shield" size={17} color={colors.green} strokeWidth={2.4} />}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Meta icon="pin" text={job.distanceKm !== undefined ? km(job.distanceKm) : job.locality} />
          <Meta icon="calendar" text={job.payMode === 'DAILY' ? `${job.durationDays} j` : 'À la tâche'} />
          <Meta icon="clock" text={relativeDay(job.startDate)} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T style={{ fontSize: 19, fontWeight: '800' }}>{fcfa(amount)}</T>
        <T variant="tiny" color={colors.muted}>{job.payMode === 'DAILY' ? 'FCFA / jour' : 'FCFA'}</T>
      </View>
    </Card>
  );
}

function Meta({ icon, text }: { icon: 'pin' | 'calendar' | 'clock'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={15} color={colors.muted} strokeWidth={2.2} />
      <T variant="tiny" color={colors.muted}>{text}</T>
    </View>
  );
}
