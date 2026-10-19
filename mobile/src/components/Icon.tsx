import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/lib/theme';

// Line icons from the design direction (24px grid, 2px stroke). Always shown next to a word.
const icons = {
  volume: <><Path d="M11 5 6 9H3v6h3l5 4z" /><Path d="M15.5 8.5a5 5 0 0 1 0 7" /><Path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
  stop: <Rect x="6" y="6" width="12" height="12" rx="2" />,
  back: <><Path d="M19 12H5" /><Path d="m12 19-7-7 7-7" /></>,
  arrow: <><Path d="M5 12h14" /><Path d="m12 5 7 7-7 7" /></>,
  chevron: <Path d="m9 18 6-6-6-6" />,
  phone: <Path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  pin: <><Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><Circle cx="12" cy="10" r="3" /></>,
  calendar: <><Rect x="3" y="4" width="18" height="18" rx="2" /><Path d="M16 2v4M8 2v4M3 10h18" /></>,
  clock: <><Circle cx="12" cy="12" r="10" /><Path d="M12 6v6l4 2" /></>,
  users: <><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  user: <><Circle cx="12" cy="8" r="4" /><Path d="M4 21a8 8 0 0 1 16 0" /></>,
  shield: <><Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><Path d="m9 12 2 2 4-4" /></>,
  check: <Path d="M20 6 9 17l-5-5" />,
  close: <Path d="M18 6 6 18M6 6l12 12" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  map: <><Path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z" /><Path d="M9 3v15M15 6v15" /></>,
  briefcase: <><Rect x="2" y="7" width="20" height="14" rx="2" /><Path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>,
  home: <><Path d="M3 10.5 12 3l9 7.5" /><Path d="M5 9.5V21h14V9.5" /></>,
  lock: <><Rect x="4" y="11" width="16" height="10" rx="2" /><Path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  alert: <><Circle cx="12" cy="12" r="10" /><Path d="M12 8v5M12 16h.01" /></>,
  delete: <><Path d="M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" /><Path d="m16 9-6 6M10 9l6 6" /></>,
  locate: <><Circle cx="12" cy="12" r="3" /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><Circle cx="12" cy="12" r="8" /></>,
  logout: <><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Path d="m16 17 5-5-5-5M21 12H9" /></>,
  wallet: <><Rect x="2" y="6" width="20" height="14" rx="2" /><Path d="M16 13h2M2 10h20" /></>,
  // Job categories
  basket: <><Path d="M3 10h18l-2 10H5z" /><Path d="m8 10 4-6 4 6" /></>,
  sprout: <><Path d="M7 20h10" /><Path d="M12 20V10" /><Path d="M12 10c0-4 3-6 7-6 0 4-3 6-7 6z" /><Path d="M12 13c0-3-2-5-6-5 0 3 2 5 6 5z" /></>,
  leaf: <><Path d="M11 20A7 7 0 0 1 4 13c0-6 6-10 16-10 0 10-4 16-9 17z" /><Path d="M4 21c3-6 6-9 10-11" /></>,
  axe: <><Path d="m14 12-8.5 8.5a2.1 2.1 0 0 1-3-3L11 9" /><Path d="M15 13 9 7l4-4c3 1 6 4 7 7z" /></>,
  drop: <Path d="M12 2.7 6.3 9a7 7 0 1 0 11.4 0z" />,
  truck: <><Path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><Circle cx="7" cy="18" r="2" /><Circle cx="17" cy="18" r="2" /></>,
  task: <><Rect x="3" y="3" width="18" height="18" rx="3" /><Path d="m8 12 3 3 5-6" /></>,
  more: <><Circle cx="5" cy="12" r="1.5" /><Circle cx="12" cy="12" r="1.5" /><Circle cx="19" cy="12" r="1.5" /></>,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 22, color = colors.ink, strokeWidth = 2 }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </Svg>
  );
}
