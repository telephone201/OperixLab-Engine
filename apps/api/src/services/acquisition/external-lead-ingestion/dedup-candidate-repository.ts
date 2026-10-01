import { db } from "../../../lib/db";
import type {
    ExistingCompanyCandidate,
    ExistingContactCandidate,
    DedupLeadInput,
} from "./external-lead-dedup-engine";

interface CompanyRow {
    id: string;
    name: string;
    domain: string | null;
    phone: string | null;
}

interface ContactRow {
    id: string;
    company_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
}

export interface DedupCandidates {
    companies: ExistingCompanyCandidate[];
    contacts: ExistingContactCandidate[];
}

export async function findDedupCandidates(
    input: DedupLeadInput,
): Promise<DedupCandidates> {
    void input;

    const companiesResult = await db.query(`
        SELECT
            id,
            name,
            domain,
            phone
        FROM companies
        ORDER BY created_at ASC
    `);

    const contactsResult = await db.query(`
        SELECT
            id,
            company_id,
            first_name,
            last_name,
            email
        FROM contacts
        ORDER BY created_at ASC
    `);

    const companyRows = companiesResult.rows as CompanyRow[];
    const contactRows = contactsResult.rows as ContactRow[];

    const companies: ExistingCompanyCandidate[] = companyRows.map(
        (row: CompanyRow) => ({
            id: row.id,
            name: row.name,
            domain: row.domain,
            phone: row.phone,
        }),
    );

    const contacts: ExistingContactCandidate[] = contactRows.map(
        (row: ContactRow) => ({
            id: row.id,
            companyId: row.company_id,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
        }),
    );

    return {
        companies,
        contacts,
    };
}
