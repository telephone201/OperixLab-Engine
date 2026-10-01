import { db } from '../../lib/db';
import { hashPassword } from './auth-crypto-service';

export type AppUserRole = 'OWNER' | 'OPERATOR' | 'VIEWER';

export interface AppUser {
    id: string;
    email: string;
    role: AppUserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

interface AppUserRow {
    id: string;
    email: string;
    role: AppUserRole;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

function normalizeEmail(email: string): string {
    if (typeof email !== 'string') {
        throw new Error('Email is required');
    }

    const normalized = email.trim().toLowerCase();

    if (
        normalized.length === 0 ||
        normalized.length > 320 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
        throw new Error('Invalid email');
    }

    return normalized;
}

function validateRole(role: AppUserRole): AppUserRole {
    if (role !== 'OWNER' && role !== 'OPERATOR' && role !== 'VIEWER') {
        throw new Error('Invalid user role');
    }

    return role;
}

function mapUser(row: AppUserRow): AppUser {
    return {
        id: row.id,
        email: row.email,
        role: row.role,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export interface CreateAppUserInput {
    email: string;
    password: string;
    role?: AppUserRole;
}

export class AppUserService {
    async createUser(input: CreateAppUserInput): Promise<AppUser> {
        const email = normalizeEmail(input.email);
        const role = validateRole(input.role ?? 'VIEWER');

        if (typeof input.password !== 'string' || input.password.length < 12) {
            throw new Error('Password must be at least 12 characters');
        }

        const existing = await db.app_users.findUnique({
            where: { email }
        });

        if (existing) {
            throw new Error('User already exists');
        }

        const passwordHash = await hashPassword(input.password);

        const row = await db.app_users.create({
            data: {
                email,
                password_hash: passwordHash,
                role,
                is_active: true
            }
        });

        return mapUser(row as AppUserRow);
    }

    async findByEmail(email: string): Promise<AppUser | null> {
        const normalizedEmail = normalizeEmail(email);

        const row = await db.app_users.findUnique({
            where: { email: normalizedEmail }
        });

        return row ? mapUser(row as AppUserRow) : null;
    }

    async findById(id: string): Promise<AppUser | null> {
        if (typeof id !== 'string' || id.trim().length === 0) {
            return null;
        }

        const row = await db.app_users.findUnique({
            where: { id: id.trim() }
        });

        return row ? mapUser(row as AppUserRow) : null;
    }
}

export const appUserService = new AppUserService();
