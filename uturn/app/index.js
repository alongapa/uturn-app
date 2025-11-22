import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
export default function HomeTab() {
    return (<View style={styles.container}>
      <Text style={styles.title}>U-TURN: TEST HOME</Text>
      <Text style={styles.subtitle}>
        Si ves este texto, estás cargando el proyecto correcto.
      </Text>
    </View>);
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#001F3F',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        color: '#dddddd',
        textAlign: 'center',
    },
});
