import { TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '../../lib/cn';
import { Caption } from './text';

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  containerClassName?: string;
}

export function TextField({ label, hint, containerClassName, className, ...props }: Props) {
  return (
    <View className={cn('gap-2', containerClassName)}>
      {label ? <Caption>{label}</Caption> : null}
      <TextInput
        placeholderTextColor="#a8a29e"
        className={cn(
          'rounded-2xl border border-paper-line bg-paper-raised px-4 py-4 text-base text-ink',
          'dark:border-night-line dark:bg-night-raised dark:text-paper',
          className,
        )}
        {...props}
      />
      {hint ? <Caption className="text-ink-faint">{hint}</Caption> : null}
    </View>
  );
}
