import React, { createContext, useContext, useMemo, useState } from 'react';
const UserContext = createContext(undefined);
export function UserProvider({ children }) {
    const [user, setUserState] = useState(null);
    const setUser = (nextUser) => {
        setUserState(nextUser);
    };
    const updateUser = (updates) => {
        setUserState((prev) => {
            if (!prev) {
                return updates;
            }
            return Object.assign(Object.assign({}, prev), updates);
        });
    };
    const clearUser = () => setUserState(null);
    const value = useMemo(() => ({ user, setUser, updateUser, clearUser }), [user]);
    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
export function useUser() {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser debe usarse dentro de UserProvider');
    }
    return context;
}
