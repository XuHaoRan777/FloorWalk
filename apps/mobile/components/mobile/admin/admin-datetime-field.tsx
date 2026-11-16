import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import tokens from '../../../../../packages/tokens/native.json';
import { PrimaryButton } from '../primary-button';
import { AdminField, AdminText } from './admin-ui';

const pad = (value: number) => String(value).padStart(2, '0');

export function AdminDateTimeField({
  label,
  value,
  onChange,
  mode,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mode: 'date' | 'time';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return (
      <AdminField
        label={label}
        value={value}
        onChangeText={onChange}
        disabled={disabled}
      />
    );
  }
  const selected = new Date();
  if (value) {
    const parts = value.split(mode === 'time' ? ':' : '-').map(Number);
    if (mode === 'time') selected.setHours(parts[0], parts[1], 0, 0);
    else selected.setFullYear(parts[0], parts[1] - 1, parts[2]);
  }
  return (
    <View style={{ gap: tokens.space.xs }}>
      <AdminText>{label}</AdminText>
      <PrimaryButton
        disabled={disabled}
        variant="secondary"
        onPress={() => setOpen(true)}
      >
        {`${label}：${value || '请选择'}`}
      </PrimaryButton>
      {open ? (
        <>
          <DateTimePicker
            mode={mode}
            value={selected}
            is24Hour
            themeVariant="light"
            onDismiss={() => setOpen(false)}
            onValueChange={(_, next) => {
              if (Platform.OS === 'android') setOpen(false);
              onChange(
                mode === 'time'
                  ? `${pad(next.getHours())}:${pad(next.getMinutes())}`
                  : `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
              );
            }}
          />
          {Platform.OS === 'ios' ? (
            <PrimaryButton variant="secondary" onPress={() => setOpen(false)}>
              完成选择
            </PrimaryButton>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
