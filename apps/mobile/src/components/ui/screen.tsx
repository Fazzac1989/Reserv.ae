import { ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '../../lib/cn';

/**
 * Porcelain by day, ink by night. Night is the flagship: photography glows
 * against it, and the serif reads as it does on a menu in a dark room.
 *
 * The colour is on a plain View rather than on the safe-area component.
 * React Native's own SafeAreaView drops `className` entirely — it is not one
 * of the components NativeWind wraps — which leaves the screen with no ground
 * at all and porcelain text sitting on the navigator's default grey. The
 * insets come from safe-area-context, which is the maintained one and works on
 * every platform rather than iOS alone.
 */
export function Screen({ className, children, ...props }: ViewProps) {
  return (
    <View className="flex-1 bg-porcelain dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View className={cn('flex-1', className)} {...props}>
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

export function ScreenScroll({ className, children }: ViewProps) {
  return (
    <View className="flex-1 bg-porcelain dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          // Whitespace is the material. 28 either side, and a long tail at the
          // bottom so the last line never sits against the edge.
          contentContainerClassName={cn('gap-9 px-7 pb-20 pt-6', className)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** A hairline. Used wherever a border would otherwise be drawn. */
export function Rule({ className }: { className?: string }) {
  return <View className={cn('h-px w-full bg-stone-line', className)} />;
}
