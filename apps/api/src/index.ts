/**
 * @file index.ts
 * @description Main entry point for the Operix API.
 * Sets up Express server, middleware, and routes.
 */

import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api-router';
import { ConfigurationManager } from './config/config-manager';

const app = express();
const config = new ConfigurationManager();

const PORT = config.get('port') || 3000;

// 1. Middleware
app.use(cors()); // Enable CORS for frontend access
app.use(express.json());

// 2. Routes
app.use('/api', apiRouter);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.url} not found`
        }
    });
});

// Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API ERROR]', err);
    res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: err.message || 'An unexpected error occurred'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Operix API running on http://localhost:${PORT}`);
    console.log(`Environment: ${config.get('nodeEnv')}`);
});
