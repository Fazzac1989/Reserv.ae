import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { BRAND } from '@reservai/config';
import { Rule, ScreenScroll } from '../../src/components/ui/screen';
import { Body, Display, Meta, Muted, Title } from '../../src/components/ui/text';
import { useProfile } from '../../src/lib/profile';
import { signOut } from '../../src/lib/auth';

/**
 * Everything about the person, and everything Riva is allowed to do.
 *
 * A hub rather than a settings screen: the two things worth reaching quickly
 * are what Riva believes and what it may act on, and both are trust features
 * rather than preferences.
 */

const SECTIONS = [
  {
    href: '/knows',
    title: `What ${BRAND.assistant} knows`,
    blurb: 'Everything inferred about you, and how to correct it.',
  },
  {
    href: '/profile',
    title: 'Preferences',
    blurb: 'Tastes, dietary needs, usual party size, reminders.',
  },
] as const;

export default function You() {
  const profile = useProfile();

  return (
    <ScreenScroll>
      <View className="gap-3 pt-4">
        <Display>{profile.data?.full_name ?? 'You'}</Display>
        <Muted>{profile.data?.email ?? ''}</Muted>
      </View>

      <View>
        {SECTIONS.map((section, i) => (
          <View key={section.href}>
            <Link href={section.href} asChild>
              <Pressable accessibilityRole="link" className="gap-1 py-5">
                <Title>{section.title}</Title>
                <Body className="text-stone">{section.blurb}</Body>
              </Pressable>
            </Link>
            {i < SECTIONS.length - 1 ? <Rule /> : null}
          </View>
        ))}
      </View>

      {/*
        Named rather than implied. The brief asks for a permissions centre and
        there is nothing yet to permit — no calendar, no email, no calls — so
        this says which, instead of showing switches that control nothing.
      */}
      <View className="gap-3">
        <Meta>Not connected yet</Meta>
        <Muted>
          {BRAND.assistant} cannot read your calendar or email, and cannot answer your phone. When
          any of that arrives you will be asked before it is switched on.
        </Muted>
      </View>

      <Pressable
        onPress={() => void signOut()}
        accessibilityRole="button"
        className="min-h-[44px] justify-center"
      >
        <Muted>Sign out</Muted>
      </Pressable>
    </ScreenScroll>
  );
}
