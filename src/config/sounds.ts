// All alarm sounds must be statically required — React Native bundler cannot
// resolve dynamic require() paths at runtime.

export interface SoundOption {
  key: string;
  label: string;
  source: any;
}

export const ALARM_SOUNDS: SoundOption[] = [
  { key: 'alarm',  label: 'Default',  source: require('../../assets/sounds/alarm.mp3') },
  { key: 'alarm2', label: 'Alarm 2',  source: require('../../assets/sounds/alarm2.mp3') },
  { key: 'alarm3', label: 'Alarm 3',  source: require('../../assets/sounds/alarm3.mp3') },
  { key: 'alarm4', label: 'Alarm 4',  source: require('../../assets/sounds/alarm4.mp3') },
  { key: 'alarm5', label: 'Alarm 5',  source: require('../../assets/sounds/alarm5.mp3') },
  { key: 'alarm6', label: 'Alarm 6',  source: require('../../assets/sounds/alarm6.mp3') },
];

export function getSoundSource(key: string): any {
  return (ALARM_SOUNDS.find(s => s.key === key) ?? ALARM_SOUNDS[0]).source;
}
