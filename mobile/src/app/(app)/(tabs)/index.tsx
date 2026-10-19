import { useMe } from '@/lib/auth';
import FarmerHome from '@/screens/FarmerHome';
import WorkerHome from '@/screens/WorkerHome';

export default function Home() {
  const me = useMe();
  return me.role === 'FARMER' ? <FarmerHome /> : <WorkerHome />;
}
