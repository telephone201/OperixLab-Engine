import {
    createHash,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
    type ScryptOptions
} from 'node:crypto';

const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 128 * 1024 * 1024;
const SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;

const HASH_PREFIX = 'scrypt';
const TOKEN_HASH_LENGTH = 64;

function scryptAsync(
    password: string,
    salt: Buffer,
    keyLength: number,
    options: ScryptOptions
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scryptCallback(
            password,
            salt,
            keyLength,
            options,
            (error, derivedKey) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(derivedKey as Buffer);
            }
        );
    });
}

function assertNonEmptySecret(value: string, name: string): void {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${name} must be a non-empty string`);
    }
}

function encodeBase64Url(value: Buffer): string {
    return value.toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
    return Buffer.from(value, 'base64url');
}

export async function hashPassword(password: string): Promise<string> {
    assertNonEmptySecret(password, 'Password');

    const salt = randomBytes(SALT_BYTES);

    const derivedKey = await scryptAsync(
        password,
        salt,
        SCRYPT_KEY_LENGTH,
        {
            N: SCRYPT_COST,
            r: SCRYPT_BLOCK_SIZE,
            p: SCRYPT_PARALLELIZATION,
            maxmem: SCRYPT_MAX_MEMORY
        }
    );

    return [
        HASH_PREFIX,
        `N=${SCRYPT_COST}`,
        `r=${SCRYPT_BLOCK_SIZE}`,
        `p=${SCRYPT_PARALLELIZATION}`,
        encodeBase64Url(salt),
        encodeBase64Url(derivedKey)
    ].join('$');
}

export async function verifyPassword(
    password: string,
    storedHash: string
): Promise<boolean> {
    if (
        typeof password !== 'string' ||
        password.length === 0 ||
        typeof storedHash !== 'string' ||
        storedHash.length === 0
    ) {
        return false;
    }

    const parts = storedHash.split('$');

    if (parts.length !== 6 || parts[0] !== HASH_PREFIX) {
        return false;
    }

    const costMatch = /^N=(\d+)$/.exec(parts[1]);
    const blockMatch = /^r=(\d+)$/.exec(parts[2]);
    const parallelMatch = /^p=(\d+)$/.exec(parts[3]);

    if (!costMatch || !blockMatch || !parallelMatch) {
        return false;
    }

    const cost = Number(costMatch[1]);
    const blockSize = Number(blockMatch[1]);
    const parallelization = Number(parallelMatch[1]);

    if (
        !Number.isSafeInteger(cost) ||
        !Number.isSafeInteger(blockSize) ||
        !Number.isSafeInteger(parallelization) ||
        cost <= 1 ||
        blockSize <= 0 ||
        parallelization <= 0 ||
        !Number.isInteger(Math.log2(cost))
    ) {
        return false;
    }

    let salt: Buffer;
    let expectedKey: Buffer;

    try {
        salt = decodeBase64Url(parts[4]);
        expectedKey = decodeBase64Url(parts[5]);
    } catch {
        return false;
    }

    if (
        salt.length === 0 ||
        expectedKey.length === 0 ||
        expectedKey.length > SCRYPT_KEY_LENGTH
    ) {
        return false;
    }

    try {
        const derivedKey = await scryptAsync(
            password,
            salt,
            expectedKey.length,
            {
                N: cost,
                r: blockSize,
                p: parallelization,
                maxmem: SCRYPT_MAX_MEMORY
            }
        );

        if (derivedKey.length !== expectedKey.length) {
            return false;
        }

        return timingSafeEqual(derivedKey, expectedKey);
    } catch {
        return false;
    }
}

export function generateSessionToken(): string {
    return encodeBase64Url(randomBytes(SESSION_TOKEN_BYTES));
}

export function hashSessionToken(token: string): string {
    assertNonEmptySecret(token, 'Session token');

    const hash = createHash('sha256')
        .update(token, 'utf8')
        .digest('hex');

    if (hash.length !== TOKEN_HASH_LENGTH) {
        throw new Error('Unexpected session token hash length');
    }

    return hash;
}
