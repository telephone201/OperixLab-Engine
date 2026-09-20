/**
 * @file api-integration-test.ts
 * @description Integration tests for the API Bridge.
 * These tests verify the full HTTP path from request to DB response.
 */

import axios from 'axios';
import { db } from '../lib/db';

async function runIntegrationTests() {
    console.log('ðŸš€ Starting API Bridge Integration Tests...');
    const API_BASE = 'http://localhost:3000/api';
    const results = [];

    try {
        // Setup: Create a test lead
        const leadId = 'test_lead_123';
        await db.leads.upsert({
            where: { id: leadId },
            update: {},
            create: {
                id: leadId,
                company_id: 'comp_123',
                contact_id: 'cont_123',
                status: 'VALIDATED',
                created_at: new Date()
            }
        });

        // --- TEST 1: GET /api/leads ---
        const leadsResp = await axios.get(`${API_BASE}/leads`);
        if (leadsResp.status === 200 && leadsResp.data.data.length > 0) {
            results.push({ test: 'GET /api/leads', status: 'PASS' });
        } else {
            results.push({ test: 'GET /api/leads', status: 'FAIL', error: 'Empty or wrong response' });
        }

        // --- TEST 2: GET /api/leads/:id ---
        const leadResp = await axios.get(`${API_BASE}/leads/${leadId}`);
        if (leadResp.status === 200 && leadResp.data.data.id === leadId) {
            results.push({ test: 'GET /api/leads/:id', status: 'PASS' });
        } else {
            results.push({ test: 'GET /api/leads/:id', status: 'FAIL' });
        }

        // --- TEST 3: GET /api/leads/:id/research ---
        const resResp = await axios.get(`${API_BASE}/leads/${leadId}/research`);
        // If no research exists, 404 is expected and valid per our controller logic
        if (resResp.status === 200 || resResp.status === 404) {
            results.push({ test: 'GET /api/leads/:id/research', status: 'PASS' });
        } else {
            results.push({ test: 'GET /api/leads/:id/research', status: 'FAIL' });
        }

        // --- TEST 4: GET /api/leads/:id/qualification ---
        const qualResp = await axios.get(`${API_BASE}/leads/${leadId}/qualification`);
        if (qualResp.status === 200 || qualResp.status === 404) {
            results.push({ test: 'GET /api/leads/:id/qualification', status: 'PASS' });
        } else {
            results.push({ test: 'GET /api/leads/:id/qualification', status: 'FAIL' });
        }

        // --- TEST 5: GET /api/leads/:id/pain ---
        const painResp = await axios.get(`${API_BASE}/leads/${leadId}/pain`);
        if (painResp.status === 200 || painResp.status === 404) {
            results.push({ test: 'GET /api/leads/:id/pain', status: 'PASS' });
        } else {
            results.push({ test: 'GET /api/leads/:id/pain', status: 'FAIL' });
        }

        // --- TEST 6: GET /api/leads/:id/requirements ---
        const reqResp = await axios.get(`${API_BASE}/leads/${leadId}/requirements`);
        if (reqResp.status === 200 || reqResp.status === 404) {
            results.push({ test: 'GET /api/leads/:id/requirements', status: 'PASS' });
        } else {
            results.push({ test: 'GET /api/leads/:id/requirements', status: 'FAIL' });
        }

    } catch (e: any) {
        console.error('âŒ Integration test crashed:', e.message);
        results.push({ test: 'GENERAL_INTEGRATION', status: 'FAIL', error: e.message });
    }

    console.log('\n--- INTEGRATION RESULTS ---');
    results.forEach(r => console.log(`${r.test}: ${r.status === 'PASS' ? 'âœ…' : 'âŒ'} ${r.error || ''}`));

    return results;
}

export { runIntegrationTests };


