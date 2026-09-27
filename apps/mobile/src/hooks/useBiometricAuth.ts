/**
 * useBiometricAuth — Task 34.5
 * Fingerprint/face recognition as alternative to password entry.
 * Falls back to password if biometrics not available.
 */
import { useState, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricStatus = 'available' | 'unavailable' | 'not_enrolled' | 'checking';

export function useBiometricAuth() {
  const [status, setStatus] = useState<BiometricStatus>('checking');
  const [supportedTypes, setSupportedTypes] = useState<LocalAuthentication.AuthenticationType[]>([]);

  useEffect(() => {
    async function checkBiometrics() {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        setStatus('unavailable');
        return;
      }
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        setStatus('not_enrolled');
        return;
      }
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      setSupportedTypes(types);
      setStatus('available');
    }
    checkBiometrics();
  }, []);

  const authenticate = async (promptMessage = 'Authenticate to continue'): Promise<boolean> => {
    if (status !== 'available') return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use Password',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });

    return result.success;
  };

  const isFaceId = supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const isFingerprint = supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

  return {
    status,
    isBiometricAvailable: status === 'available',
    isFaceId,
    isFingerprint,
    authenticate,
  };
}
