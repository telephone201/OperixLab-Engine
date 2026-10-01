/**
 * @file sensitive-filter.ts
 * @description Centralized sensitive data filtering for audit log details.
 * Redacts credentials, tokens, payment data, and other sensitive keys.
 */



/**
 * Exact-match sensitive keys (case-insensitive).
 * These keys will have their values replaced with "[REDACTED]".
 */
const EXACT_SENSITIVE_KEYS = new Set<string>([
    'password',
    'token',
    'access_token',
    'refresh_token',
    'api_key',
    'apikey',
    'apikey',
    'secret',
    'authorization',
    'cookie',
    'session',
    'client_secret',
    'private_key',
    'privatekey',
    'cvv',
    'pin',
    'card_number',
    'cardnumber',
    'card_cvv',
    'cardcvv',
    'accesskey',
    'refreshkey',
    'clientsecret',
]);

/**
 * Prefix-match: keys starting with these strings (case-insensitive).
 */
const PREFIX_SENSITIVE = [
    'password_',
    'token_',
    'secret_',
    'key_',
];

/**
 * Suffix-match: keys ending with these strings (case-insensitive).
 */
const SUFFIX_SENSITIVE = [
    '_password',
    '_token',
    '_secret',
    '_key',
    '_cvv',
    '_pin',
];

/**
 * Checks if a key should be considered sensitive.
 */
function isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();
    
    if (EXACT_SENSITIVE_KEYS.has(lower)) {
        return true;
    }
    
    for (const prefix of PREFIX_SENSITIVE) {
        if (lower.startsWith(prefix)) {
            return true;
        }
    }
    
    for (const suffix of SUFFIX_SENSITIVE) {
        if (lower.endsWith(suffix)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Recursively filters sensitive data from an object/array.
 * Returns a deep clone with sensitive values redacted.
 * Handles circular references, arrays, nested objects.
 */
export function filterSensitiveData<T>(value: T): T {
    const seen = new WeakSet<object>();
    
    function filter(val: unknown): unknown {
        if (val === null || val === undefined) {
            return val;
        }
        
        if (typeof val !== 'object') {
            return val;
        }
        
        if (Array.isArray(val)) {
            if (seen.has(val)) {
                return ['[CIRCULAR]'];
            }
            seen.add(val);
            const result = val.map(item => filter(item));
            seen.delete(val);
            return result;
        }
        
        // Plain object
        if (seen.has(val)) {
            return { _circular: true };
        }
        seen.add(val);
        
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            if (isSensitiveKey(k)) {
                result[k] = '[REDACTED]';
            } else {
                result[k] = filter(v);
            }
        }
        
        seen.delete(val);
        return result;
    }
    
    return filter(value) as T;
}

/**
 * Maximum audit payload size in bytes (64KB).
 */
export const MAX_AUDIT_PAYLOAD_BYTES = 65536;

/**
 * Serializes filtered audit details to JSON with size protection.
 * Handles BigInt, Buffer, Date, Error, circular refs.
 * Never throws - returns safe JSON string on any error.
 */
export function serializeAuditDetails(details: unknown): string {
    const filtered = filterSensitiveData(details);
    
    const seen = new WeakSet<object>();
    
    const replacer = (_key: string, val: unknown): unknown => {
        if (typeof val === 'bigint') {
            return val.toString();
        }
        if (Buffer.isBuffer(val)) {
            return val.toString('base64');
        }
        if (val instanceof Date) {
            return val.toISOString();
        }
        if (val instanceof Error) {
            return { message: val.message, stack: val.stack };
        }
        if (val instanceof Map) {
            return Array.from(val.entries());
        }
        if (val instanceof Set) {
            return Array.from(val.values());
        }
        if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) {
                return '[CIRCULAR]';
            }
            seen.add(val);
        }
        return val;
    };
    
    try {
        const json = JSON.stringify(filtered, replacer);
        const byteLength = Buffer.byteLength(json, 'utf8');
        
        if (byteLength > MAX_AUDIT_PAYLOAD_BYTES) {
            return JSON.stringify({
                _truncated: true,
                originalSize: byteLength,
                maxSize: MAX_AUDIT_PAYLOAD_BYTES,
            });
        }
        
        return json;
    } catch {
        return JSON.stringify({ _serializationError: true });
    }
}