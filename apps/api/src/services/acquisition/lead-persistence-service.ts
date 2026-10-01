import { db } from '../../lib/db';

export interface PersistValidatedLeadInput {
    campaignId?: string;
    company: {
        companyName: string;
        normalizedName: string;
        website: string | null;
        domain: string | null;
        phone: string | null;
        address: string | null;
        city: string | null;
        country: string | null;
        source: string;
        provider: string;
        sourceUrl: string | null;
    };
    contact?: {
        name: string;
        email: string | null;
        phone: string | null;
        title: string | null;
        source: string;
    };
}

export interface PersistedLeadResult {
    leadId: string;
    companyId: string;
    contactId: string | null;
    sourceId: string;
    companyCreated: boolean;
    contactCreated: boolean;
}

export class LeadPersistenceService {
    async persist(
        input: PersistValidatedLeadInput
    ): Promise<PersistedLeadResult> {
        return db.$transaction(async (client) => {
            const provider = input.company.provider || 'MANUAL';
            const sourceName = `Chat – ${provider}`;

            const sourceResult = await client.query(
                `
                SELECT id
                FROM lead_sources
                WHERE provider = $1
                ORDER BY created_at ASC
                LIMIT 1
                `,
                [provider]
            );

            let sourceId: string;

            if (sourceResult.rows[0]) {
                sourceId = sourceResult.rows[0].id;
            } else {
                const createdSource = await client.query(
                    `
                    INSERT INTO lead_sources (name, provider)
                    VALUES ($1, $2)
                    RETURNING id
                    `,
                    [sourceName, provider]
                );

                sourceId = createdSource.rows[0].id;
            }

            let companyId: string;
            let companyCreated = false;

            if (input.company.domain) {
                const existingCompany = await client.query(
                    `
                    SELECT id
                    FROM companies
                    WHERE domain = $1
                    LIMIT 1
                    `,
                    [input.company.domain]
                );

                if (existingCompany.rows[0]) {
                    companyId = existingCompany.rows[0].id;
                } else {
                    const createdCompany = await client.query(
                        `
                        INSERT INTO companies (
                            name,
                            domain,
                            website
                        )
                        VALUES ($1, $2, $3)
                        RETURNING id
                        `,
                        [
                            input.company.companyName,
                            input.company.domain,
                            input.company.website
                        ]
                    );

                    companyId = createdCompany.rows[0].id;
                    companyCreated = true;
                }
            } else {
                const existingCompany = await client.query(
                    `
                    SELECT id
                    FROM companies
                    WHERE LOWER(name) = LOWER($1)
                    ORDER BY created_at ASC
                    LIMIT 1
                    `,
                    [input.company.companyName]
                );

                if (existingCompany.rows[0]) {
                    companyId = existingCompany.rows[0].id;
                } else {
                    const createdCompany = await client.query(
                        `
                        INSERT INTO companies (
                            name,
                            website
                        )
                        VALUES ($1, $2)
                        RETURNING id
                        `,
                        [
                            input.company.companyName,
                            input.company.website
                        ]
                    );

                    companyId = createdCompany.rows[0].id;
                    companyCreated = true;
                }
            }

            let contactId: string | null = null;
            let contactCreated = false;

            const contactEmail = input.contact?.email || null;

            if (contactEmail) {
                const existingContact = await client.query(
                    `
                    SELECT id
                    FROM contacts
                    WHERE email = $1
                    LIMIT 1
                    `,
                    [contactEmail]
                );

                if (existingContact.rows[0]) {
                    contactId = existingContact.rows[0].id;
                } else {
                    const contactName = input.contact?.name || 'UNKNOWN';
                    const nameParts = contactName
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean);

                    const firstName = nameParts.shift() || null;
                    const lastName = nameParts.length > 0
                        ? nameParts.join(' ')
                        : null;

                    const createdContact = await client.query(
                        `
                        INSERT INTO contacts (
                            company_id,
                            first_name,
                            last_name,
                            email,
                            role
                        )
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING id
                        `,
                        [
                            companyId,
                            firstName,
                            lastName,
                            contactEmail,
                            input.contact?.title || null
                        ]
                    );

                    contactId = createdContact.rows[0].id;
                    contactCreated = true;
                }
            }

            const createdLead = await client.query(
                `
                INSERT INTO leads (
                    company_id,
                    contact_id,
                    source_id,
                    campaign_id,
                    status,
                    lead_score,
                    intent_score,
                    intent_status
                )
                VALUES ($1, $2, $3, $4, 'NEW', 0, 0, 'NO_SIGNAL')
                RETURNING id
                `,
                [
                    companyId,
                    contactId,
                    sourceId,
                    input.campaignId || null
                ]
            );

            return {
                leadId: createdLead.rows[0].id,
                companyId,
                contactId,
                sourceId,
                companyCreated,
                contactCreated
            };
        });
    }
}

export const leadPersistenceService = new LeadPersistenceService();
