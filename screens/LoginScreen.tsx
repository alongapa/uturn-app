import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { CAMPUSES } from '@/constants/campuses';
import { Layout, Spacing } from '@/constants/theme';
import { useUser } from '@/contexts/UserContext';
import { useLayout } from '@/hooks/use-layout';
import { OTP_LENGTH, universityFromEmail } from '@/services/api/auth';
import { verifyCredentialByEmailMatch } from '@/services/api/identity';
import { nameEmailMatchScore, nameMatchesEmail } from '@/services/identity/name-email-match';
import { isSupabaseConfigured } from '@/services/supabase';
import { useAppState } from '@/store/appState';

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

const YEAR_CELL_HEIGHT = 46;

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
  const minYear = today.getFullYear() - 100;
  const maxYear = today.getFullYear();
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) list.push(y);
    return list;
  }, [maxYear, minYear]);

  const parsed = useMemo(() => {
    const [year, month, day] = value.split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day) : null;
  }, [value]);

  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear() - 18);
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());
  const [pickerMode, setPickerMode] = useState<'days' | 'years'>('days');
  const yearListRef = useRef<ScrollView>(null);
  // La hoja se ancla abajo: sin el inset, "Cerrar" queda sobre el home indicator.
  const { bottomSpacing } = useLayout();

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

  const openYearPicker = () => {
    setPickerMode('years');
    const index = years.indexOf(viewYear);
    if (index >= 0) {
      requestAnimationFrame(() => {
        yearListRef.current?.scrollTo({ y: index * YEAR_CELL_HEIGHT, animated: false });
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalContent, { paddingBottom: bottomSpacing + Spacing.xl }]}>
          <Text style={styles.modalTitle}>Selecciona tu fecha de nacimiento</Text>

          <View style={styles.calendarNav}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={goPrevMonth}
              disabled={pickerMode === 'years'}
              hitSlop={Layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Mes anterior"
            >
              <Text style={styles.navButtonText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openYearPicker}
              style={styles.monthLabelButton}
              hitSlop={Layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel={`${monthLabel}. Tocar para elegir el año`}
            >
              <Text style={styles.calendarMonthLabel}>
                {monthLabel} {pickerMode === 'days' ? '▾' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={goNextMonth}
              disabled={pickerMode === 'years'}
              hitSlop={Layout.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Mes siguiente"
            >
              <Text style={styles.navButtonText}>›</Text>
            </TouchableOpacity>
          </View>

          {pickerMode === 'years' ? (
            <ScrollView ref={yearListRef} style={styles.yearList} showsVerticalScrollIndicator={false}>
              {years.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[styles.yearCell, year === viewYear && styles.yearCellSelected]}
                  onPress={() => {
                    setViewYear(year);
                    setPickerMode('days');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Año ${year}`}
                  accessibilityState={{ selected: year === viewYear }}
                >
                  <Text style={[styles.yearCellText, year === viewYear && styles.yearCellTextSelected]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <>
              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((label, index) => (
                  <Text key={index} style={styles.weekdayLabel}>
                    {label}
                  </Text>
                ))}
              </View>

              {/* El área tocable es el wrapper completo (~48pt), no la píldora
                  interior (~42pt): así cada día supera el mínimo táctil sin que
                  los hitSlop de celdas vecinas se solapen. */}
              <View style={styles.calendarGrid}>
                {cells.map((day, index) =>
                  day ? (
                    <TouchableOpacity
                      key={index}
                      style={styles.dayCellWrapper}
                      onPress={() => onSelect(`${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`${day} de ${monthLabel}`}
                      accessibilityState={{ selected: day === selectedDay }}
                    >
                      <View style={[styles.dayCell, day === selectedDay && styles.dayCellSelected]}>
                        <Text style={[styles.dayCellText, day === selectedDay && styles.dayCellTextSelected]}>
                          {day}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View key={index} style={styles.dayCellWrapper} />
                  )
                )}
              </View>
            </>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar el selector de fecha"
          >
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
  const { setCredencialVerificada } = useAppState();
  // Primera pantalla de la app y sin header: los insets tienen que salir de acá,
  // no de un margen fijo.
  const { screenPadding, topSpacing, bottomSpacing, contentWidthStyle } = useLayout();

  const normalizedEmail = email.toLowerCase().trim();

  // Verificación de identidad (reemplaza la captura de intranet): el código al
  // correo institucional prueba que es tuyo; además revisamos que tu nombre
  // completo se parezca al correo (coincidencia de patrones). El servidor
  // decide de verdad; esto es solo el adelanto en vivo.
  const matchScore = useMemo(
    () => (name.trim() && universityFromEmail(normalizedEmail) ? nameEmailMatchScore(name, normalizedEmail) : 0),
    [name, normalizedEmail]
  );
  const nameMatches = useMemo(
    () => (name.trim() && universityFromEmail(normalizedEmail) ? nameMatchesEmail(name, normalizedEmail) : false),
    [name, normalizedEmail]
  );

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
    // Modo local (sin servidor): la identidad queda verificada si el nombre
    // coincide con el correo institucional (misma regla que el servidor).
    setCredencialVerificada(nameMatchesEmail(resolvedName, normalizedEmail));
    router.replace('/(tabs)');
  }, [normalizedEmail, name, dateOfBirth, setUser, setCredencialVerificada]);

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
    if (code.trim().length < OTP_LENGTH) {
      alert(`Ingresa el código de ${OTP_LENGTH} dígitos que enviamos a tu correo`);
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(normalizedEmail, code);
      // Identidad verificada por el servidor: coincidencia nombre↔correo
      // institucional (fuente de verdad). No bloquea el ingreso si no coincide;
      // solo define la insignia de credencial verificada.
      verifyCredentialByEmailMatch().catch(() => undefined);
      router.replace('/(tabs)');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Código inválido o expirado.');
    } finally {
      setLoading(false);
    }
  }, [code, normalizedEmail, verifyOtp]);

  // Autoverificación al completar los OTP_LENGTH dígitos, para que el flujo no
  // dependa de tocar el botón si el teclado tapa la pantalla.
  useEffect(() => {
    if (step === 'code' && code.trim().length === OTP_LENGTH && !loading) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          contentWidthStyle,
          {
            paddingHorizontal: screenPadding,
            paddingTop: topSpacing + Spacing.xl,
            paddingBottom: bottomSpacing + Spacing.xl,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
      <Image source={require('../assets/icons/unities-icon-512.png')} style={styles.logo} />
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
              returnKeyType="done"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TouchableOpacity
              style={styles.dateField}
              onPress={() => setDatePickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={
                dateOfBirth
                  ? `Fecha de nacimiento: ${formatDateLabel(dateOfBirth)}. Tocar para cambiarla`
                  : 'Selecciona tu fecha de nacimiento'
              }
            >
              <Text style={dateOfBirth ? styles.dateFieldText : styles.dateFieldPlaceholder}>
                {dateOfBirth ? formatDateLabel(dateOfBirth) : 'Selecciona una fecha'}
              </Text>
            </TouchableOpacity>

            {name.trim() && universityFromEmail(normalizedEmail) ? (
              <View style={[styles.matchBox, nameMatches ? styles.matchBoxOk : styles.matchBoxWarn]}>
                <Text style={nameMatches ? styles.matchTextOk : styles.matchTextWarn}>
                  {nameMatches
                    ? `✓ Tu nombre coincide con tu correo institucional (${matchScore} coincidencias). Tu identidad quedará verificada.`
                    : 'Tu nombre no se parece a tu correo institucional. Podrás ingresar igual, pero tu identidad no quedará verificada hasta que coincidan.'}
                </Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendCode}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
            accessibilityLabel={isSupabaseConfigured ? 'Enviarme un código' : 'Ingresar'}
          >
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
            <Text style={styles.label}>Código de {OTP_LENGTH} dígitos</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder={'0'.repeat(OTP_LENGTH)}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={OTP_LENGTH}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              value={code}
              onChangeText={setCode}
              onSubmitEditing={handleVerify}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
            accessibilityLabel="Verificar código"
          >
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Verificar código</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStep('form')}
            disabled={loading}
            style={styles.linkButton}
            accessibilityRole="button"
            accessibilityLabel="Cambiar correo"
          >
            <Text style={styles.linkText}>Cambiar correo</Text>
          </TouchableOpacity>
        </>
      )}
      </ScrollView>

      <DatePickerModal
        visible={datePickerVisible}
        value={dateOfBirth}
        onClose={() => setDatePickerVisible(false)}
        onSelect={(value) => {
          setDateOfBirth(value);
          setDatePickerVisible(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    // paddingHorizontal / paddingTop / paddingBottom los aporta useLayout().
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#5f5f5f',
    textAlign: 'center',
  },
  form: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: 14,
    color: '#3a3a3a',
    marginBottom: Spacing.sm,
  },
  emailEcho: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D4ED8',
    // 20 no está en la escala de 9 pasos y no tiene token: se deja literal para
    // no mover píxeles. Se normaliza en la pasada posterior al piloto.
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d1d1',
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
    fontSize: 16,
    color: '#1a1a1a',
    minHeight: Layout.touchTarget,
  },
  dateField: {
    borderWidth: 1,
    borderColor: '#d1d1d1',
    borderRadius: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: '#f1f5f9',
    minHeight: Layout.touchTarget,
    justifyContent: 'center',
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
  matchBox: {
    borderRadius: 8,
    padding: Spacing.md,
    borderWidth: 1,
  },
  matchBoxOk: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  matchBoxWarn: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  matchTextOk: {
    color: '#15803d',
    fontSize: 13,
    lineHeight: 18,
  },
  matchTextWarn: {
    color: '#b45309',
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#1D4ED8',
    paddingVertical: Spacing.mdPlus,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Layout.touchTarget,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // El enlace era solo texto (~20pt de alto). El área tocable va en el
  // contenedor; el margen superior se mantiene en el texto.
  linkButton: {
    minHeight: Layout.touchTarget,
    justifyContent: 'center',
  },
  linkText: {
    color: '#1D4ED8',
    textAlign: 'center',
    marginTop: Spacing.lg,
    fontSize: 15,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: Spacing.xl,
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
    // 20 sin token: se mantiene el valor original en los tres lados; el
    // paddingBottom lo aporta el inset en el render.
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: '#0f172a',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  // Se mantienen 36pt visuales (el círculo se vería tosco a 44) y el mínimo
  // táctil se alcanza con hitSlop de 8 por lado.
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabelButton: {
    minHeight: Layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
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
    marginBottom: Spacing.xsPlus,
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
    marginBottom: Spacing.lg,
  },
  yearList: {
    maxHeight: 276,
    marginBottom: Spacing.lg,
  },
  yearCell: {
    height: 46,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xsPlus,
  },
  yearCellSelected: {
    backgroundColor: '#1D4ED8',
  },
  yearCellText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  yearCellTextSelected: {
    color: '#ffffff',
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
    paddingVertical: Spacing.smPlus,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Layout.touchTarget,
  },
  secondaryButtonText: {
    color: '#0A1525',
    fontWeight: '700',
  },
});
