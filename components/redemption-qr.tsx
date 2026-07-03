import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

const GRID_SIZE = 21;
const FINDER_SIZE = 7;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const isFinderCell = (row: number, col: number) => {
  const inCorner = (r: number, c: number) => r >= 0 && r < FINDER_SIZE && c >= 0 && c < FINDER_SIZE;
  const corners: [number, number][] = [
    [row, col],
    [row, col - (GRID_SIZE - FINDER_SIZE)],
    [row - (GRID_SIZE - FINDER_SIZE), col],
  ];
  for (const [r, c] of corners) {
    if (!inCorner(r, c)) continue;
    const ring = r === 0 || r === FINDER_SIZE - 1 || c === 0 || c === FINDER_SIZE - 1;
    const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
    return ring || core;
  }
  return null;
};

// QR ilustrativo: patrón determinístico a partir del código de canje.
// No es escaneable; el código en texto es el que valida el local.
const buildMatrix = (value: string) => {
  let seed = hashString(value) || 1;
  const nextBit = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed & 0x10000) !== 0;
  };
  const rows: boolean[][] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    const cells: boolean[] = [];
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const finder = isFinderCell(row, col);
      cells.push(finder ?? nextBit());
    }
    rows.push(cells);
  }
  return rows;
};

export function RedemptionQR({ value, size = 180 }: { value: string; size?: number }) {
  const matrix = useMemo(() => buildMatrix(value), [value]);
  const cellSize = size / GRID_SIZE;

  return (
    <View style={[styles.frame, { width: size + 24, height: size + 24 }]}>
      <View style={{ width: size, height: size }}>
        {matrix.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((filled, colIndex) => (
              <View
                key={colIndex}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: filled ? '#0f172a' : '#ffffff',
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
});
