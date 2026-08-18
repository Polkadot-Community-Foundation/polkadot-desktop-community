import { type CodecType, type Theme } from '@novasamatech/host-api';
import { type Container } from '@novasamatech/host-container';
import { useEffect } from 'react';

import { type ResolvedTheme, type ThemeName, useBrowserTheme, useLooseRef, useSubscription, useThemeName } from '@/shared/hooks';

import { createSubscriptionScope } from './_helpers';

// The default theme name maps to the wire's `Default` tag, letting a product keep its own
// baseline; any other selected theme is reported as `Custom` so the product can resolve it.
const DEFAULT_THEME_NAME: ThemeName = 'berlin';

type HostTheme = { variant: ResolvedTheme; name: ThemeName };

// v0.8: host_theme_subscribe delivers a { name, variant } struct instead of a flat 'light' | 'dark'.
// We map the selected theme name onto the wire's Custom/Default tag and the resolved light/dark
// value onto the capitalized variant the wire now expects.
function toTheme({ variant, name }: HostTheme): CodecType<typeof Theme> {
  return {
    name: name === DEFAULT_THEME_NAME ? { tag: 'Default', value: undefined } : { tag: 'Custom', value: name },
    variant: variant === 'dark' ? 'Dark' : 'Light',
  };
}

export function useTheme(container: Container) {
  const variant = useBrowserTheme();
  const name = useThemeName();
  const themeRef = useLooseRef<HostTheme>({ variant, name });
  // A single primitive key so the subscription re-emits on either a variant or a name change.
  const subscribeTheme = useSubscription(`${variant}:${name}`);

  useEffect(() => {
    const subscriptions = createSubscriptionScope();

    const cleanupSubscribe = container.handleThemeSubscribe((_, send) => {
      send(toTheme(themeRef()));
      return subscriptions.track(
        subscribeTheme(() => {
          if (subscriptions.disposed) return;
          send(toTheme(themeRef()));
        }),
      );
    });

    return () => {
      subscriptions.dispose();
      cleanupSubscribe();
    };
  }, [container]);
}
