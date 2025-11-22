import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { router } from 'expo-router';

export default function PassengerHomeScreen() {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [horario, setHorario] = useState('');

  const handleSearch = () => {
    router.push({ pathname: '/passenger/search-results', params: { origen, destino, horario } });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Buscar viajes</Text>
      <View style={styles.field}> 
        <Text style={styles.label}>Origen</Text>
        <TextInput value={origen} onChangeText={setOrigen} placeholder="Campus o comuna" style={styles.input} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Destino</Text>
        <TextInput value={destino} onChangeText={setDestino} placeholder="Campus o comuna" style={styles.input} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Horario</Text>
        <TextInput value={horario} onChangeText={setHorario} placeholder="Ej: 08:00" style={styles.input} />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={handleSearch}>
        <Text style={styles.primaryText}>Buscar viajes</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  field: { gap: 6 },
  label: { color: '#334155', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryText: { textAlign: 'center', color: '#fff', fontWeight: '700' },
});
