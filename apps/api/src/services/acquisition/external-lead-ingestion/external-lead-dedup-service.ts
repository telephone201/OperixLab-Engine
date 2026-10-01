import {
    findDedupCandidates,
} from "./dedup-candidate-repository";

import {
    deduplicateExternalLead,
    type DedupLeadInput,
    type DedupResult,
    type DedupCandidate,
} from "./external-lead-dedup-engine";

export interface ExternalLeadDedupResult {
    decision: DedupResult["decision"];
    matchType: DedupResult["matchType"];
    reason: DedupResult["reason"];
    candidate: DedupResult["candidate"];
}

function buildCandidates(
    repositoryResult: Awaited<ReturnType<typeof findDedupCandidates>>,
): DedupCandidate[] {
    const candidates: DedupCandidate[] = [];

    for (const company of repositoryResult.companies) {
        const contacts = repositoryResult.contacts.filter(
            (contact) => contact.companyId === company.id,
        );

        if (contacts.length === 0) {
            candidates.push({
                company,
                contact: null,
            });
            continue;
        }

        for (const contact of contacts) {
            candidates.push({
                company,
                contact,
            });
        }
    }

    return candidates;
}

export async function deduplicateExternalLeadFromRepository(
    input: DedupLeadInput,
): Promise<ExternalLeadDedupResult> {
    const repositoryResult = await findDedupCandidates(input);

    const candidates = buildCandidates(repositoryResult);

    return deduplicateExternalLead(input, candidates);
}
