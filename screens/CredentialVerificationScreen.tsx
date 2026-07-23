import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  type ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { UniversityId } from '@/constants/campuses';
import { useUser } from '@/contexts/UserContext';
import { uploadCredential } from '@/services/api/storage';
import { isSupabaseConfigured } from '@/services/supabase';
import { useAppState } from '@/store/appState';

const UNIVERSITY_OPTIONS: { id: UniversityId; label: string }[] = [
  { id: 'uai', label: 'Universidad Adolfo Ibáñez' },
  { id: 'udd', label: 'Universidad del Desarrollo' },
  { id: 'uandes', label: 'Universidad de los Andes' },
];

const allowedExtensions = ['png', 'jpg', 'jpeg'];

const UNIVERSITY_REFERENCE_IMAGES: Record<UniversityId, { label: string; source: ImageSourcePropType }> = {
  uai: { label: 'intranet UAI', source: require('@/assets/images/intranet-uai.png') },
  udd: { label: 'intranet UDD', source: require('@/assets/images/intranet-udd.png') },
  uandes: { label: 'intranet UAndes', source: require('@/assets/images/intranet-uandes.jpeg') },
};

const getImageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const getUniversityFromEmail = (value?: string | null): UniversityId | null => {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (email.endsWith('@alumnos.uai.cl')) return 'uai';
  if (email.endsWith('@udd.cl')) return 'udd';
  if (email.endsWith('@miuandes.cl')) return 'uandes';
  return null;
};

export default function CredentialVerificationScreen() {
  const { name, email } = useLocalSearchParams<{ name?: string; email?: string }>();
  const { updateUser, user } = useUser();
  const { setCredencialVerificada } = useAppState();
  const [intranetName, setIntranetName] = useState('');
  const [selectedUniversity, setSelectedUniversity] = useState<UniversityId | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const loginNameDisplay = useMemo(() => (name ? String(name) : 'No recibido'), [name]);
  const loginEmailDisplay = useMemo(() => (email ? String(email) : 'No recibido'), [email]);
  const normalizedEmail = useMemo(() => (email ? String(email).trim().toLowerCase() : ''), [email]);
  const expectedUniversity = useMemo(() => getUniversityFromEmail(normalizedEmail), [normalizedEmail]);

  useEffect(() => {
    if (expectedUniversity && selectedUniversity !== expectedUniversity) {
      setSelectedUniversity(expectedUniversity);
    }
  }, [expectedUniversity, selectedUniversity]);

  const referenceAspectRatios = useMemo(() => {
    const ratios: Partial<Record<UniversityId, number>> = {};
    (Object.keys(UNIVERSITY_REFERENCE_IMAGES) as UniversityId[]).forEach((universityId) => {
      const source = UNIVERSITY_REFERENCE_IMAGES[universityId].source;
      // En nativo require() de una imagen da un id numérico que hay que resolver;
      // en web (react-native-web no implementa Image.resolveAssetSource) Metro ya
      // lo resuelve a { uri, width, height } directamente.
      const asset = typeof source === 'number' ? Image.resolveAssetSource(source) : source;
      if (!Array.isArray(asset) && asset?.width && asset?.height) {
        ratios[universityId] = asset.width / asset.height;
      }
    });
    return ratios as Record<UniversityId, number>;
  }, []);

  const handlePickImage = useCallback(async () => {
    try {
      setIsPickingImage(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para subir la captura.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        quality: 1,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Error', 'No pudimos obtener la imagen seleccionada.');
        return;
      }

      setPhotoUri(asset.uri);
    } catch (error) {
      Alert.alert('Error', 'No pudimos abrir tu galería. Intenta nuevamente.');
    } finally {
      setIsPickingImage(false);
    }
  }, []);

  const validateImageMetadata = useCallback(
    async (uri: string) => {
      const uriWithoutQuery = uri.split('?')[0] ?? uri;
      const extension = uriWithoutQuery.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) {
        Alert.alert('Formato de imagen no soportado. Usa PNG o JPG.');
        return null;
      }

      let dimensions;
      try {
        dimensions = await getImageSize(uri);
      } catch (error) {
        Alert.alert('No pudimos validar la captura de intranet. Vuelve a subir una imagen clara y completa del perfil.');
        return null;
      }

      const { width, height } = dimensions;
      if (width < 300 || height < 300) {
        Alert.alert('La captura de intranet es muy pequeña. Sube una imagen más clara.');
        return null;
      }

      const aspectRatio = width / height;
      if (aspectRatio < 0.4 || aspectRatio > 2.5) {
        Alert.alert('No pudimos validar la captura de intranet. Vuelve a subir una imagen clara y completa del perfil.');
        return null;
      }

      return dimensions;
    },
    [],
  );

  const handleVerify = useCallback(async () => {
    if (isVerifying) {
      return;
    }
    setIsVerifying(true);
    try {
      if (!name || !String(name).trim()) {
        Alert.alert('Falta tu nombre del login.');
        return;
      }
      if (!email || !String(email).trim()) {
        Alert.alert('Falta tu correo institucional.');
        return;
      }
      if (!expectedUniversity) {
        Alert.alert('Usa tu correo institucional de universidad soportada (@alumnos.uai.cl, @udd.cl o @miuandes.cl).');
        return;
      }
      if (!intranetName.trim()) {
        Alert.alert('Ingresa tu nombre tal como aparece en la intranet.');
        return;
      }
      if (!photoUri) {
        Alert.alert('Sube la captura de tu perfil de intranet.');
        return;
      }

      if (selectedUniversity !== expectedUniversity) {
        Alert.alert('La universidad debe coincidir con el dominio de tu correo institucional.');
        setSelectedUniversity(expectedUniversity);
        return;
      }

      const normalizedUserName = normalizeText(String(name));
      const normalizedIntranetName = normalizeText(intranetName);
      const sameName = normalizedUserName === normalizedIntranetName;

      const dimensions = await validateImageMetadata(photoUri);
      if (!dimensions) {
        return;
      }

      const referenceRatio = referenceAspectRatios[expectedUniversity];
      if (referenceRatio) {
        const aspectRatio = dimensions.width / dimensions.height;
        const diff = Math.abs(aspectRatio - referenceRatio);
        if (diff > 0.15) {
          const expectedLabel = UNIVERSITY_REFERENCE_IMAGES[expectedUniversity].label;
          Alert.alert(
            'Formato de intranet incorrecto',
            `Tu dominio institucional requiere la captura de ${expectedLabel}. Vuelve a subirla completa.`
          );
          return;
        }
      }

      if (!sameName) {
        Alert.alert('El nombre no coincide con el registrado durante el login.');
        return;
      }

      // Sube la captura de credencial al bucket privado (URL firmada) si hay sesión.
      if (isSupabaseConfigured && user?.id) {
        try {
          await uploadCredential(user.id, photoUri);
        } catch (error) {
          console.warn('No se pudo subir la credencial a Storage', error);
        }
      }

      updateUser({
        name: String(name),
        email: normalizedEmail,
      });
      setCredencialVerificada(true);

      Alert.alert('Perfil verificado', 'Tu identidad universitaria ha sido verificada correctamente.');
      router.replace('/(tabs)');
    } finally {
      setIsVerifying(false);
    }
  }, [
    email,
    expectedUniversity,
    intranetName,
    isVerifying,
    name,
    normalizedEmail,
    photoUri,
    referenceAspectRatios,
    selectedUniversity,
    setCredencialVerificada,
    updateUser,
    user,
    validateImageMetadata,
  ]);

  return (
    <ScrollView contentContainerStyle={styles.container} style={styles.wrapper}>
      <Text style={styles.title}>Verificación de perfil de intranet</Text>
      <Text style={styles.subtitle}>
        Aseguramos la confianza entre conductores y pasajeros verificando tu cuenta universitaria.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Datos desde tu login</Text>
        <View style={styles.readonlyField}>
          <Text style={styles.fieldLabel}>Nombre</Text>
          <Text style={styles.fieldValue}>{loginNameDisplay}</Text>
        </View>
        <View style={styles.readonlyField}>
          <Text style={styles.fieldLabel}>Correo institucional</Text>
          <Text style={styles.fieldValue}>{loginEmailDisplay}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Datos del perfil de intranet</Text>
        <Text style={styles.inputLabel}>Nombre en intranet</Text>
        <TextInput
          style={styles.input}
          placeholder="Nombre tal como aparece en tu intranet"
          value={intranetName}
          onChangeText={setIntranetName}
        />

        <Text style={styles.inputLabel}>Universidad</Text>
        <View style={styles.chipGroup}>
          {UNIVERSITY_OPTIONS.map((option) => {
            const isSelected = selectedUniversity === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => setSelectedUniversity(option.id)}
              >
                <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.uploadButton} onPress={handlePickImage} disabled={isPickingImage}>
          <Text style={styles.uploadButtonText}>
            {photoUri ? (isPickingImage ? 'Actualizando captura...' : 'Cambiar imagen') : 'Subir captura de intranet'}
          </Text>
        </TouchableOpacity>

        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.previewImage} />
        ) : (
          <Text style={styles.helperText}>Sube una imagen PNG o JPG clara donde se vea tu perfil.</Text>
        )}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleVerify} disabled={isVerifying}>
        <Text style={styles.primaryButtonText}>
          {isVerifying ? 'Verificando...' : 'Verificar perfil'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    padding: 24,
    paddingBottom: 48,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#4B5563',
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  readonlyField: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 16,
    color: '#111827',
  },
  inputLabel: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  chipSelected: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  chipLabel: {
    color: '#1F2937',
    fontSize: 14,
  },
  chipLabelSelected: {
    color: '#ffffff',
  },
  uploadButton: {
    backgroundColor: '#E0E7FF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  uploadButtonText: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 8,
    resizeMode: 'cover',
  },
  primaryButton: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
