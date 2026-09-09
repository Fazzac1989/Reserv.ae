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
 * at all and paper text sitting on the navigator's default grey. The
 * insets come from safe-area-context, which is the maintained one and works on
 * every platform rather than iOS alone.
 */

/**
 * How wide the app is ever allowed to be.
 *
 * This is a phone app with a web build, and a phone app stretched across a
 * laptop is not a desktop app — it is a phone app with the words too far apart
 * to read. On reserv.ae the greeting sat at the far left of a 1750px window
 * with the ask field running most of the way across it, which is what a layout
 * built for one column does when nobody tells it where the column ends.
 *
 * 480 because every screen inside is built around a single column and one
 * thumb, and widening the container does not widen the thinking behind it. The
 * board's desktop answer is a sidebar beside this column; that lands once
 * Routines and Household exist to go in it, and until then centring the column
 * is the same idea with nothing invented.
 *
 * Exported as both a class and a number: layout uses the class, and anything
 * measuring itself — a photograph sized to the shelf it sits on — needs the
 * figure, because a card sized from the window rather than from the column is
 * a card that overflows it.
 */
export const COLUMN_MAX = 480;
export const COLUMN = 'w-full max-w-[480px] self-center';

export function Screen({ className, children, ...props }: ViewProps) {
  return (
    <View className="flex-1 bg-paper dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View className={cn('flex-1', COLUMN, className)} {...props}>
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

export function ScreenScroll({ className, children }: ViewProps) {
  return (
    <View className="flex-1 bg-paper dark:bg-ink">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          // Whitespace is the material. 28 either side, and a long tail at the
          // bottom so the last line never sits against the edge.
          //
          // The cap goes on the content container rather than on the ScrollView
          // itself, so the scrollbar and the touch target stay the full width
          // of the window while the words stay in a column.
          contentContainerClassName={cn('gap-9 px-7 pb-20 pt-6', COLUMN, className)}
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
  return <View className={cn('h-px w-full bg-grey-line', className)} />;
}
