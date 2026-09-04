import { TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '../../lib/cn';
import { Meta, Muted } from './text';

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  containerClassName?: string;
}

export function TextField({ label, hint, containerClassName, className, ...props }: Props) {
  return (
    <View className={cn('gap-2.5', containerClassName)}>
      {label ? <Meta>{label}</Meta> : null}
      <TextInput
        placeholderTextColor="#8A8A8E"
        className={cn(
          'rounded-input border border-grey-line px-5 py-4 font-body text-lead text-ink',
          'dark:text-paper',
          className,
        )}
        {...props}
      />
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}
