import { SafeAreaView, ScrollView, View, type ViewProps } from 'react-native';
import { cn } from '../../lib/cn';

/** Full-bleed background so the safe areas match the page, not the system. */
export function Screen({ className, children, ...props }: ViewProps) {
  return (
    <SafeAreaView className="flex-1 bg-paper dark:bg-night">
      <View className={cn('flex-1', className)} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function ScreenScroll({ className, children }: ViewProps) {
  return (
    <SafeAreaView className="flex-1 bg-paper dark:bg-night">
      <ScrollView
        contentContainerClassName={cn('px-7 pb-16 pt-6 gap-8', className)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
