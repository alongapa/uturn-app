import React, { useMemo, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { Place, PlaceType, searchPlaces } from '@/constants/places';

const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  campus: 'Campus',
  'meeting-point': 'Punto de encuentro',
  hotspot: 'Hotspot',
};

type PlaceAutocompleteProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  onSelectPlace: (place: Place) => void;
  types?: PlaceType[];
  containerStyle?: StyleProp<ViewStyle>;
  suggestionsStyle?: StyleProp<ViewStyle>;
  suggestionItemStyle?: StyleProp<ViewStyle>;
  suggestionTextStyle?: StyleProp<TextStyle>;
  suggestionMetaStyle?: StyleProp<TextStyle>;
};

export function PlaceAutocomplete({
  value,
  onChangeText,
  onSelectPlace,
  types,
  containerStyle,
  suggestionsStyle,
  suggestionItemStyle,
  suggestionTextStyle,
  suggestionMetaStyle,
  style,
  onFocus,
  onBlur,
  ...inputProps
}: PlaceAutocompleteProps) {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => searchPlaces(value, { types }), [value, types]);
  const showSuggestions = focused && value.trim().length > 0 && suggestions.length > 0;

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        style={style}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setTimeout(() => setFocused(false), 150);
          onBlur?.(event);
        }}
      />
      {showSuggestions && (
        <View style={[styles.suggestions, suggestionsStyle]}>
          {suggestions.map(({ place }) => (
            <TouchableOpacity
              key={place.id}
              style={[styles.suggestionItem, suggestionItemStyle]}
              onPress={() => {
                onSelectPlace(place);
                setFocused(false);
              }}
            >
              <Text style={[styles.suggestionText, suggestionTextStyle]}>{place.name}</Text>
              <Text style={[styles.suggestionMeta, suggestionMetaStyle]}>{PLACE_TYPE_LABELS[place.type]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10,
  },
  suggestions: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionText: {
    color: '#0f172a',
    fontWeight: '600',
  },
  suggestionMeta: {
    color: '#64748b',
    fontSize: 12,
  },
});
