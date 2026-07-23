import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { CAMPUSES } from '@/constants/campuses';
import { useUser } from '@/contexts/UserContext';
import { universityFromEmail } from '@/services/api/auth';
import { isSupabaseConfigured } from '@/services/supabase';

const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const pad2 = (n: number) => n.toString().padStart(2, '0');

function formatDateLabel(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function DatePickerModal({
  visible,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const today = new Date();
  const parsed = useMemo(() => {
    const [year, month, day] = value.split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day) : null;
  }, [value]);

  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear() - 18);
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('es-CL', {
    month: 'long',
    year: 'numeric',
  });

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedDay =
    parsed && parsed.getFullYear() === viewYear && parsed.getMonth() === viewMonth ? parsed.getDate() : null;

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Selecciona tu fecha de nacimiento</Text>

          <View style={styles.calendarNav}>
            <TouchableOpacity style={styles.navButton} onPress={goPrevMonth}>
              <Text style={styles.navButtonText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
            <TouchableOpacity style={styles.navButton} onPress={goNextMonth}>
              <Text style={styles.navButtonText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text key={index} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {cells.map((day, index) => (
              <View key={index} style={styles.dayCellWrapper}>
                {day ? (
                  <TouchableOpacity
                    style={[styles.dayCell, day === selectedDay && styles.dayCellSelected]}
                    onPress={() => onSelect(`${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`)}
                  >
                    <Text style={[styles.dayCellText, day === selectedDay && styles.dayCellTextSelected]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function LoginScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [loading, setLoading] = useState(false);
  const { setUser, signInWithOtp, verifyOtp } = useUser();

  const normalizedEmail = email.toLowerCase().trim();

  const validate = useCallback(() => {
    if (!name.trim()) {
      alert('Ingresa tu nombre completo');
      return false;
    }
    if (!universityFromEmail(normalizedEmail)) {
      alert('Usa tu correo institucional (@alumnos.uai.cl, @udd.cl o @miuandes.cl)');
      return false;
    }
    if (!dateOfBirth.trim()) {
      alert('Selecciona tu fecha de nacimiento');
      return false;
    }
    return true;
  }, [name, normalizedEmail, dateOfBirth]);

  // Sin Supabase configurado: modo dev local (sin verificación por correo).
  const handleLocalLogin = useCallback(() => {
    const universityId = universityFromEmail(normalizedEmail)!;
    const homeCampusId = CAMPUSES.find((campus) => campus.universityId === universityId)?.id;
    const resolvedName = name.trim();
    setUser({
      id: normalizedEmail,
      name: resolvedName,
      email: normalizedEmail,
      travelMode: 'driver',
      accountRole: 'user',
      universityId,
      homeCampusId,
      dateOfBirth,
    });
    router.replace({ pathname: '/verify-profile', params: { name: resolvedName, email: normalizedEmail } });
  }, [normalizedEmail, name, dateOfBirth, setUser]);

  const handleSendCode = useCallback(async () => {
    if (!validate()) return;
    if (!isSupabaseConfigured) {
      handleLocalLogin();
      return;
    }
    setLoading(true);
    try {
      const universityId = universityFromEmail(normalizedEmail)!;
      const homeCampusId = CAMPUSES.find((campus) => campus.universityId === universityId)?.id;
      await signInWithOtp(normalizedEmail, {
        full_name: name.trim(),
        university_id: universityId,
        home_campus_id: homeCampusId,
        date_of_birth: dateOfBirth,
      });
      setStep('code');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No pudimos enviar el código. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [validate, normalizedEmail, name, dateOfBirth, signInWithOtp, handleLocalLogin]);

  const handleVerify = useCallback(async () => {
    if (code.trim().length < 6) {
      alert('Ingresa el código de 6 dígitos que enviamos a tu correo');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(normalizedEmail, code);
      router.replace({
        pathname: '/verify-profile',
        params: { name: name.trim(), email: normalizedEmail },
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Código inválido o expirado.');
    } finally {
      setLoading(false);
    }
  }, [code, normalizedEmail, name, verifyOtp]);

  return (
    <View style={styles.container}>
      <Image source={require('../assets/images/unities-logo.png')} style={styles.logo} />
      <View style={styles.header}>
        <Text style={styles.title}>Bienvenido a UNITIES</Text>
        <Text style={styles.subtitle}>Comparte tu viaje con la comunidad universitaria</Text>
      </View>

      {step === 'form' ? (
        <>
          <View style={styles.form}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu nombre"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Correo institucional</Text>
            <TextInput
              style={styles.input}
              placeholder="nombre@alumnos.uai.cl"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TouchableOpacity style={styles.dateField} onPress={() => setDatePickerVisible(true)}>
              <Text style={dateOfBirth ? styles.dateFieldText : styles.dateFieldPlaceholder}>
                {dateOfBirth ? formatDateLabel(dateOfBirth) : 'Selecciona una fecha'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSendCode} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>
                {isSupabaseConfigured ? 'Enviarme un código' : 'Ingresar'}
              </Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.form}>
            <Text style={styles.label}>Código enviado a</Text>
            <Text style={styles.emailEcho}>{normalizedEmail}</Text>
            <Text style={styles.label}>Código de 6 dígitos</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Verificar código</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep('form')} disabled={loading}>
            <Text style={styles.linkText}>Cambiar correo</Text>
          </TouchableOpacity>
        </>
      )}

      <DatePickerModal
        visible={datePickerVisible}
        value={dateOfBirth}
        onClose={() => setDatePickerVisible(false)}
        onSelect={(value) => {
          setDateOfBirth(value);
          setDatePickerVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#5f5f5f',
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#3a3a3a',
    marginBottom: 8,
  },
  emailEcho: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D4ED8',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d1d1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#1a1a1a',
  },
  dateField: {
    borderWidth: 1,
    borderColor: '#d1d1d1',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    backgroundColor: '#f1f5f9',
  },
  dateFieldText: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  dateFieldPlaceholder: {
    fontSize: 16,
    color: '#8a8a8a',
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linkText: {
    color: '#1D4ED8',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 15,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
    alignSelf: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  calendarMonthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'capitalize',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  dayCellWrapper: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  dayCell: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#1D4ED8',
  },
  dayCellText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  dayCellTextSelected: {
    color: '#ffffff',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0A1525',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0A1525',
    fontWeight: '700',
  },
});
