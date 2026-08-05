// mobile/src/lib/useBreakpoint.ts
import { useEffect, useState } from 'react';
import { Dimensions, ScaledSize } from 'react-native';
import { breakpoints } from '../theme';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

function classify(width: number): Breakpoint {
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'phone';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => classify(Dimensions.get('window').width));

  useEffect(() => {
    const handler = ({ window }: { window: ScaledSize }) => setBp(classify(window.width));
    const sub = Dimensions.addEventListener('change', handler);
    return () => sub.remove();
  }, []);

  return bp;
}
