/**
 * @file index.ts
 * @description Main entry point for the Operix API.
 * Sets up Express server, middleware, and routes.
 */

import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api-router';
import { ConfigurationManager } from './config/config-manager';
import { requestContextMiddleware } from './middleware/request-context';
import { requestLoggingMiddleware } from './middleware/request-logging';
import { getCorrelationId } from './core/logging/audit-context';
import { db, closeDbPool } from './lib/db';

const app = express();
const config = new ConfigurationManager();

const PORT = config.get('port') || 3000;

// 1. Middleware
const corsOrigins = config.get('corsOrigins');

app.use(
    cors(
        corsOrigins.length > 0
            ? { origin: corsOrigins }
            : undefined
    )
);
app.use(express.json());
app.use(requestContextMiddleware);
app.use(requestLoggingMiddleware); // Audit correlation context (correlation ID + IP hash)

// Health check (lightweight liveness probe)
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'operix-api',
        environment: config.get('nodeEnv'),
        uptime: process.uptime()
    });
});

// Readiness probe (verifies database connectivity)
app.get('/health/ready', async (_req, res) => {
    const startTime = Date.now();
    try {
        await db.query('SELECT 1');
        const latencyMs = Date.now() - startTime;
        return res.status(200).json({
            status: 'ready',
            service: 'operix-api',
            database: {
                status: 'connected',
                latencyMs
            },
            environment: config.get('nodeEnv'),
            uptime: process.uptime()
        });
    } catch (err: any) {
        return res.status(503).json({
            status: 'degraded',
            service: 'operix-api',
            database: {
                status: 'disconnected',
                error: err.message
            },
            environment: config.get('nodeEnv'),
            uptime: process.uptime()
        });
    }
});
// 2. Routes
app.use('/api', apiRouter);

// 404 Handler
app.use((_req, res) => {
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: 'Route not found',
            correlationId: getCorrelationId()
        }
    });
});

// Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API ERROR]', err);

    res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred',
            correlationId: getCorrelationId()
        }
    });
});

const server = app.listen(PORT, () => {
    console.log(`ðŸš€ Operix API running on http://localhost:${PORT}`);
    console.log(`Environment: ${config.get('nodeEnv')}`);
});

const gracefulShutdown = (signal: string) => {
    console.log(`[SHUTDOWN] ${signal} received. Closing HTTP server...`);

    server.close(async (err) => {
        if (err) {
            console.error('[SHUTDOWN] Failed to close HTTP server:', err);
            process.exit(1);
        }

        console.log('[SHUTDOWN] HTTP server closed.');

        try {
            await closeDbPool();
            console.log('[SHUTDOWN] Database connection pool closed.');
            process.exit(0);
        } catch (dbErr) {
            console.error('[SHUTDOWN] Failed to close database connection pool:', dbErr);
            process.exit(1);
        }
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('message', (msg) => {
    if (msg === 'shutdown') gracefulShutdown('SIGTERM');
});

export { app, server, gracefulShutdown };
