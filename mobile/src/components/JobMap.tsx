import MapView, { Marker } from 'react-native-maps';
import { View } from 'react-native';
import { fcfa } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Job } from '@/lib/types';
import { T } from './ui';

export interface JobMapProps {
  center: { lat: number; lng: number };
  jobs: Job[];
  selectedId?: string;
  onSelect: (job: Job) => void;
}

/** Price pins on the map, like the design: black pills, the selected one in green. */
export function JobMap({ center, jobs, selectedId, onSelect }: JobMapProps) {
  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.35, longitudeDelta: 0.35 }}
      showsUserLocation
      toolbarEnabled={false}>
      {jobs.map((job) => (
        <Marker key={job.id} coordinate={{ latitude: job.lat, longitude: job.lng }} onPress={() => onSelect(job)}
          accessibilityLabel={`${job.title}, ${fcfa(job.workerNetXof)} francs`}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ paddingHorizontal: 12, height: 32, borderRadius: 16, justifyContent: 'center',
              backgroundColor: job.id === selectedId ? colors.green : colors.ink }}>
              <T style={{ fontSize: 15, fontWeight: '800' }} color={colors.white}>{fcfa(job.workerNetXof)}</T>
            </View>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}
