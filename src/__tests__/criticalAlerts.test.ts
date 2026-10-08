import { classifyCriticalAlerts } from '@/services/criticalAlerts';

jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn() }));

describe('classifyCriticalAlerts', () => {
  it('is granted when iOS reports the setting enabled', () => {
    expect(classifyCriticalAlerts({ ios: { allowsCriticalAlerts: true } })).toBe('granted');
  });

  it('is denied when entitled but the user declined', () => {
    expect(classifyCriticalAlerts({ ios: { allowsCriticalAlerts: false } })).toBe('denied');
  });

  it('is unavailable when the build has no entitlement (iOS reports notSupported → null)', () => {
    expect(classifyCriticalAlerts({ ios: { allowsCriticalAlerts: null } })).toBe('unavailable');
    expect(classifyCriticalAlerts({ ios: {} })).toBe('unavailable');
  });

  it('is unavailable off-iOS or with no permission payload', () => {
    expect(classifyCriticalAlerts({})).toBe('unavailable');
    expect(classifyCriticalAlerts(null)).toBe('unavailable');
    expect(classifyCriticalAlerts(undefined)).toBe('unavailable');
  });
});
