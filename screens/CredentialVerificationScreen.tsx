import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { UniversityId } from '@/constants/campuses';
import { useUser } from '@/contexts/UserContext';

const UNIVERSITY_OPTIONS: { id: UniversityId; label: string }[] = [
  { id: 'uai', label: 'Universidad Adolfo Ibáñez' },
  { id: 'udd', label: 'Universidad del Desarrollo' },
  { id: 'uandes', label: 'Universidad de los Andes' },
];

const allowedExtensions = ['png', 'jpg', 'jpeg'];

const getImageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });

export default function CredentialVerificationScreen() {
  const { name, email } = useLocalSearchParams<{ name?: string; email?: string }>();
  const { updateUser } = useUser();
  const [intranetName, setIntranetName] = useState('');
  const [selectedUniversity, setSelectedUniversity] = useState<UniversityId | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const loginNameDisplay = useMemo(() => (name ? String(name) : 'No recibido'), [name]);
  const loginEmailDisplay = useMemo(() => (email ? String(email) : 'No recibido'), [email]);

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
        return false;
      }

      let dimensions;
      try {
        dimensions = await getImageSize(uri);
      } catch (error) {
        Alert.alert('No pudimos validar la captura de intranet. Vuelve a subir una imagen clara y completa del perfil.');
        return false;
      }

      const { width, height } = dimensions;
      if (width < 300 || height < 300) {
        Alert.alert('La captura de intranet es muy pequeña. Sube una imagen más clara.');
        return false;
      }

      const aspectRatio = width / height;
      if (aspectRatio < 0.4 || aspectRatio > 2.5) {
        Alert.alert('No pudimos validar la captura de intranet. Vuelve a subir una imagen clara y completa del perfil.');
        return false;
      }

      return true;
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
      if (!intranetName.trim()) {
        Alert.alert('Ingresa tu nombre tal como aparece en la intranet.');
        return;
      }
      if (!selectedUniversity) {
        Alert.alert('Selecciona tu universidad.');
        return;
      }
      if (!photoUri) {
        Alert.alert('Sube la captura de tu perfil de intranet.');
        return;
      }

      const normalizedUserName = String(name).trim().toLowerCase();
      const normalizedIntranetName = intranetName.trim().toLowerCase();
      const sameName = normalizedUserName === normalizedIntranetName;

      const emailStr = String(email).trim().toLowerCase();
      let universityFromEmail: UniversityId | null = null;
      if (emailStr.endsWith('@alumnos.uai.cl')) universityFromEmail = 'uai';
      if (emailStr.endsWith('@udd.cl')) universityFromEmail = 'udd';
      if (emailStr.endsWith('@miuandes.cl')) universityFromEmail = 'uandes';
      const universityMatches = universityFromEmail !== null && universityFromEmail === selectedUniversity;

      const imageValid = await validateImageMetadata(photoUri);
      if (!imageValid) {
        return;
      }

      if (!sameName) {
        Alert.alert('El nombre no coincide con el registrado durante el login.');
        return;
      }

      if (!universityMatches) {
        Alert.alert('La universidad seleccionada no coincide con el dominio de tu correo institucional.');
        return;
      }

      updateUser({
        name: String(name),
        email: emailStr,
        verified: true,
      });

      Alert.alert('Perfil verificado', 'Tu identidad universitaria ha sido verificada correctamente.');
      router.replace('/(tabs)');
    } finally {
      setIsVerifying(false);
    }
  }, [email, intranetName, isVerifying, name, photoUri, selectedUniversity, updateUser, validateImageMetadata]);

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
