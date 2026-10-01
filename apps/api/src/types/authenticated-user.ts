import type { AppUserRole } from '../services/auth/app-user-service';

export interface AuthenticatedUser {
    id: string;
    email: string;
    role: AppUserRole;
}
