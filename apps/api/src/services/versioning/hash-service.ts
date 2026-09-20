/**
 * @file hash-service.ts
 * @description Deterministic SHA-256 hashing for workflow artifacts.
 */

import crypto from 'crypto';
import fs from 'fs/promises';

export class HashService {
    /**
     * Generates a SHA-256 hash of a file's raw bytes.
     * This is the foundation for immutable source identification.
     */
    async hashFile(filePath: string): Promise<string> {
        try {
            const buffer = await fs.readFile(filePath);
            return this.hashBuffer(buffer);
        } catch (error) {
            console.error(`[HASH_SERVICE] Error hashing file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Generates a SHA-256 hash of a provided buffer.
     */
    hashBuffer(buffer: Buffer): string {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Verifies if a content buffer matches an expected hash.
     */
    verifyHash(content: Buffer, expectedHash: string): boolean {
        const actualHash = this.hashBuffer(content);
        return actualHash === expectedHash;
    }
}

export const hashService = new HashService();
