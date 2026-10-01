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

// Health check
app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'operix-api',
        environment: config.get('nodeEnv')
    });
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

    server.close((err) => {
        if (err) {
            console.error('[SHUTDOWN] Failed to close HTTP server:', err);
            process.exit(1);
        }

        console.log('[SHUTDOWN] HTTP server closed.');
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
