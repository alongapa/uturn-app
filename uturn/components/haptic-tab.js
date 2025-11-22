import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
export function HapticTab(props) {
    return (<PlatformPressable {...props} onPressIn={(ev) => {
            var _a;
            if (process.env.EXPO_OS === 'ios') {
                // Add a soft haptic feedback when pressing down on the tabs.
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            (_a = props.onPressIn) === null || _a === void 0 ? void 0 : _a.call(props, ev);
        }}/>);
}
