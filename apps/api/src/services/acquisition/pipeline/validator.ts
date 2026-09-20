/**
 * @file validator.ts
 * @description Deterministic validation of leads.
 */

import { NormalizedCompany, NormalizedContact, ValidatedLead, LeadState } from '../types/acquisition-types';

export class ValidationService {
    validate(company: NormalizedCompany, contact?: NormalizedContact): ValidatedLead {
        const qualitySignals = {
            hasWebsite: !!company.website,
            hasEmail: !!contact?.email,
            hasPhone: !!company.phone || !!contact?.phone,
            hasAddress: !!company.address,
            hasIndustry: false, // Industry is handled in Phase 4/5
            hasContact: !!contact,
        };

        let status: LeadState = LeadState.NORMALIZED;

        // Validation Rules
        const hasBasicIdentity = company.companyName && (company.domain || company.phone);
        const hasContactableInfo = qualitySignals.hasEmail || qualitySignals.hasPhone;

        if (!hasBasicIdentity) {
            status = LeadState.INVALID;
        } else if (!hasContactableInfo) {
            // Valid company, but we can't reach them
            status = LeadState.NORMALIZED;
        } else {
            status = LeadState.VALIDATED;
        }

        // Final transition to READY_FOR_RESEARCH if it passes all basic gates
        if (status === LeadState.VALIDATED && qualitySignals.hasWebsite) {
            status = LeadState.READY_FOR_RESEARCH;
        }

        return {
            company,
            contact,
            status,
            qualitySignals
        };
    }
}

export const validator = new ValidationService();
