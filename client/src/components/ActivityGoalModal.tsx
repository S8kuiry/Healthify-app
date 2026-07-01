import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable } from 'react-native';
import { validateStepGoal, validateCalorieGoal } from '@/domain/goal';

type Mode = 'initial' | 'steps' | 'calories';
type Scope = 'steps' | 'calories' | 'both';

type Props = {
  visible: boolean;
  onClose: () => void;
  mode: Mode;
  initialStepGoal: number;
  initialCalorieGoal: number;
  onSave: (goals: { stepGoal: number; calorieGoal: number }) => void;
  onRemoveStep?: () => void;
  onRemoveCalorie?: () => void;
};

export default function ActivityGoalModal({
  visible,
  onClose,
  mode,
  initialStepGoal,
  initialCalorieGoal,
  onSave,
  onRemoveStep,
  onRemoveCalorie,
}: Props) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [stepInput, setStepInput] = useState('');
  const [calorieInput, setCalorieInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset local state whenever the modal opens
  useEffect(() => {
    if (visible) {
      setScope(mode === 'initial' ? null : mode);
      setStepInput(initialStepGoal > 0 ? String(initialStepGoal) : '');
      setCalorieInput(initialCalorieGoal > 0 ? String(initialCalorieGoal) : '');
      setError(null);
    }
  }, [visible, mode, initialStepGoal, initialCalorieGoal]);

  const showSteps = scope === 'steps' || scope === 'both';
  const showCalories = scope === 'calories' || scope === 'both';

  const handleSave = () => {
    setError(null);

    const wantsSteps = mode === 'steps' || (mode === 'initial' && showSteps);
    const wantsCalories = mode === 'calories' || (mode === 'initial' && showCalories);

    let nextStepGoal = initialStepGoal;
    let nextCalorieGoal = initialCalorieGoal;

    if (wantsSteps) {
      const parsed = parseInt(stepInput, 10);
      if (!validateStepGoal(parsed)) {
        setError('Step goal must be between 500 and 100,000.');
        return;
      }
      nextStepGoal = parsed;
    }

    if (wantsCalories) {
      const parsed = parseInt(calorieInput, 10);
      if (!validateCalorieGoal(parsed)) {
        setError('Calorie goal must be between 50 and 5,000.');
        return;
      }
      nextCalorieGoal = parsed;
    }

    onSave({ stepGoal: nextStepGoal, calorieGoal: nextCalorieGoal });
    onClose();
  };

  const handleRemove = () => {
    if (mode === 'steps' && onRemoveStep) {
      onRemoveStep();
    } else if (mode === 'calories' && onRemoveCalorie) {
      onRemoveCalorie();
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-cardBackground rounded-3xl p-6 w-full max-w-sm">

          <Text className="text-textPrimary text-lg font-black tracking-tight mb-1">
            {mode === 'initial' && 'Set a goal'}
            {mode === 'steps' && 'Step goal'}
            {mode === 'calories' && 'Calorie goal'}
          </Text>
          <Text className="text-textSecondary text-xs font-medium mb-5">
            {mode === 'initial' && 'Choose what you want to track daily.'}
            {mode === 'steps' && 'Set your daily step target.'}
            {mode === 'calories' && 'Set your daily active calorie target.'}
          </Text>

          {/* Scope picker — initial mode only */}
          {mode === 'initial' && (
            <View className="flex-row mb-5" style={{ gap: 8 }}>
              {(['steps', 'calories', 'both'] as Scope[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setScope(option)}
                  className="flex-1 rounded-full py-2 items-center"
                  style={{
                    backgroundColor: scope === option ? undefined : 'transparent',
                  }}
                >
                  <View
                    className={`rounded-full px-3 py-2 items-center w-full ${
                      scope === option ? 'bg-accent' : 'bg-backgroundElement/60'
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-black tracking-wide uppercase ${
                        scope === option ? 'text-background' : 'text-textSecondary'
                      }`}
                    >
                      {option}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Steps input */}
          {showSteps && (
            <View className="mb-4">
              <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase mb-1.5">
                Steps / day
              </Text>
              <TextInput
                value={stepInput}
                onChangeText={setStepInput}
                keyboardType="number-pad"
                placeholder="e.g. 10000"
                placeholderTextColor="#8a8a8a"
                className="bg-lightBackground rounded-2xl px-4 py-3 text-textPrimary text-base font-bold"
              />
            </View>
          )}

          {/* Calories input */}
          {showCalories && (
            <View className="mb-4">
              <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase mb-1.5 ">
                Calories / day
              </Text>
              <TextInput
                value={calorieInput}
                onChangeText={setCalorieInput}
                keyboardType="number-pad"
                placeholder="e.g. 300"
                placeholderTextColor="#8a8a8a"
                className="bg-lightBackground rounded-2xl px-4 py-3 text-textPrimary text-base font-bold"
              />
            </View>
          )}

          {error && (
            <Text className="text-danger text-xs font-semibold mb-3">{error}</Text>
          )}

          {/* Actions */}
          <View className="flex-row mt-2" style={{ gap: 8 }}>
            {mode !== 'initial' && (
              <Pressable
                onPress={handleRemove}
                className=" flex flex-1 rounded-full py-2 items-center bg-danger/10 border border-danger border-dashed"
              >
                <Text className="text-danger text-xs font-black tracking-wide uppercase">Remove</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              className="flex flex-1 rounded-3xl border border-textSecondary border-dashed py-2 items-center justify-center bg-backgroundElement"
            >
              <Text className="text-textSecondary text-xs font-black tracking-wide uppercase">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={mode === 'initial' && scope === null}
              className="flex flex-1 rounded-full py-2 items-center justify-center bg-accent"
              style={{ opacity: mode === 'initial' && scope === null ? 0.4 : 1 }}
            >
              <Text className="text-background text-xs font-black tracking-wide uppercase">Save</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}