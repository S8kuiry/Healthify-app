import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialWeight: number;
  onSave: (data: { date: string; weightKg: number }) => void;
};

export default function AddWeightModal({
  visible,
  onClose,
  initialWeight,
  onSave,
}: Props) {
  const [weightInput, setWeightInput] = useState('');
  const [dayInput, setDayInput] = useState('');
  const [monthInput, setMonthInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Auto-initialize with current system date splits on open
  useEffect(() => {
    if (visible) {
      setWeightInput(initialWeight > 0 ? String(initialWeight) : '');
      
      const today = new Date();
      // Ensure zero-padded strings for initial display layout state
      setDayInput(String(today.getDate()).padStart(2, '0'));
      setMonthInput(String(today.getMonth() + 1).padStart(2, '0'));
      setYearInput(String(today.getFullYear()));
      
      setError(null);
    }
  }, [visible, initialWeight]);

  const handleSave = () => {
    setError(null);

    // 1. Weight Evaluation
    const parsedWeight = parseFloat(weightInput);
    if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > 500) {
      setError('Please enter a valid weight between 1 and 500 kg.');
      return;
    }

    // 2. Strict Numeric Conversions
    const day = parseInt(dayInput, 10);
    const month = parseInt(monthInput, 10);
    const year = parseInt(yearInput, 10);

    // 3. Range Bound Assertions
    if (isNaN(day) || day < 1 || day > 31) {
      setError('Please enter a valid day (1-31).');
      return;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      setError('Please enter a valid month (1-12).');
      return;
    }
    if (isNaN(year) || year < 1900 || year > 2100) {
      setError('Please enter a valid 4-digit year.');
      return;
    }

    // 4. Calendar Matrix Sanity Test (Handles variations in month-end loops/leap years)
    const daysInTargetMonth = new Date(year, month, 0).getDate();
    if (day > daysInTargetMonth) {
      setError(`Invalid date string. Selected month only features ${daysInTargetMonth} days.`);
      return;
    }

    // 5. Build ISO-8601 Compliance Output: YYYY-MM-DD
    const isoDay = String(day).padStart(2, '0');
    const isoMonth = String(month).padStart(2, '0');
    const strictIsoString = `${year}-${isoMonth}-${isoDay}`;

    // 6. State Lifecycle Propagation
    onSave({
      date: strictIsoString,
      weightKg: parsedWeight,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-cardBackground rounded-2xl p-6 w-full max-w-sm">
          
          <Text className="text-textPrimary text-lg font-black tracking-tight mb-1">
            Log Weight Entry
          </Text>
          <Text className="text-textSecondary text-xs font-medium mb-5">
            Add or overwrite historical metrics for a specific track date.
          </Text>

          {/* Weight Field Input */}
          <View className="mb-4">
            <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase mb-1.5">
              Weight Metrics (kg)
            </Text>
            <TextInput
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="numeric"
              placeholder="e.g. 72.5"
              placeholderTextColor="#8a8a8a"
              className="bg-lightBackground rounded-lg px-4 py-3 text-textPrimary text-base font-bold"
            />
          </View>

          {/* Split Date Pick Rows */}
          <View className="mb-5">
            <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase mb-1.5">
              Log Track Date (DD / MM / YYYY)
            </Text>
            
            <View className="flex-row items-center" style={{ gap: 8 }}>
              {/* Day Box */}
              <View className="flex-1">
                <TextInput
                  value={dayInput}
                  onChangeText={setDayInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="DD"
                  placeholderTextColor="#8a8a8a"
                  className="bg-lightBackground rounded-lg py-3 text-center text-textPrimary text-base font-bold"
                />
              </View>

              {/* Month Box */}
              <View className="flex-1">
                <TextInput
                  value={monthInput}
                  onChangeText={setMonthInput}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                  placeholderTextColor="#8a8a8a"
                  className="bg-lightBackground rounded-lg py-3 text-center text-textPrimary text-base font-bold"
                />
              </View>

              {/* Year Box */}
              <View className="flex-[1.5]">
                <TextInput
                  value={yearInput}
                  onChangeText={setYearInput}
                  keyboardType="number-pad"
                  maxLength={4}
                  placeholder="YYYY"
                  placeholderTextColor="#8a8a8a"
                  className="bg-lightBackground rounded-lg py-3 text-center text-textPrimary text-base font-bold"
                />
              </View>
            </View>
          </View>

          {/* Validation Error Banner */}
          {error && (
            <Text className="text-danger text-xs font-semibold mb-3">{error}</Text>
          )}

          {/* Form Processing Actions Row */}
          <View className="flex-row mt-4" style={{ gap: 8 }}>
            <Pressable
              onPress={onClose}
              className="flex flex-1 rounded-3xl border border-textSecondary border-dashed py-2 items-center justify-center bg-backgroundElement active:opacity-85"
            >
              <Text className="text-textSecondary text-xs font-black tracking-wide uppercase">Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              className="flex flex-1 rounded-full py-2 items-center justify-center bg-accent active:opacity-85"
            >
              <Text className="text-background text-xs font-black tracking-wide uppercase">Save Log</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}