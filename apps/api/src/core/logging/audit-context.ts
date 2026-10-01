/**
 * @file audit-context.ts
 * @description AsyncLocalStorage-based request context for audit correlation.
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
    correlationId: string;
    clientIpHash: string | null;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string | undefined {
    return requestContextStorage.getStore()?.correlationId;
}

export function getClientIpHash(): string | null | undefined {
    return requestContextStorage.getStore()?.clientIpHash;
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
    return requestContextStorage.run(ctx, fn);
}