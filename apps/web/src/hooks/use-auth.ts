import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthState, AuthDefaults } from '@/lib/auth';

interface AuthContextType extends AuthState {
    login: (token: string, user: User) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextTye | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        isAuthenticated: false,
        isLoading: true,
    });

    useEffect(() => {
        // Mock session restoration
        const token = localStorage.getItem('operix_auth_token');
        if (token) {
            setState({
                user: AuthDefaults.MOCK_USER,
                isAuthenticated: true,
                isLoading: false,
            });
        } else {
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, []);

    const login = (token: string, user: User) => {
        localStorage.setItem('operix_auth_token', token);
        setState({ user, isAuthenticated: true, isLoading: false });
    };

    const logout = () => {
        localStorage.removeItem('operix_auth_token');
        setState({ user: null, isAuthenticated: false, isLoading: false });
    };

    return (
        <AuthContext.Provider value={{ ...state, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
