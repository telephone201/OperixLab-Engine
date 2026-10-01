import type { AuthenticatedUser } from './authenticated-user';

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}

export {};
