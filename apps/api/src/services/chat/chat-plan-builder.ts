/**
 * @file chat-plan-builder.ts
 * @description Deterministic intent and execution-plan builder for Chat v1.
 */

export type ChatIntent =
    | 'DISCOVER_LEADS'
    | 'COMPANY_SUMMARY'
    | 'ATTENTION_REQUIRED'
    | 'PIPELINE_ANALYSIS';

export interface ChatPlan {
    intent: ChatIntent;
    summary: string;
    steps: string[];
    requiresConfirmation: boolean;
    searchTerms?: string[];
    locationQuery?: string | null;
}

export interface ChatPlanResult {
    intent: ChatIntent;
    plan: ChatPlan;
}

const DEFAULT_SEARCH_TERMS = [
    'dental clinic',
    'physiotherapy clinic',
    'medical clinic',
    'car service center',
    'real estate agency'
];

interface VerticalDefinition {
    en: RegExp[];
    ar: string[];
    term: string;
}

const VERTICALS: VerticalDefinition[] = [
    {
        en: [/\brestaurant(s)?\b/i],
        ar: ['مطعم', 'مطاعم'],
        term: 'restaurant'
    },
    {
        en: [/\bcaf(?:e|é)s?\b/i, /\bcoffee shop(s)?\b/i],
        ar: ['مقهى', 'كافيه', 'قهوة'],
        term: 'cafe'
    },
    {
        en: [/\bdental\b/i, /\bdentist(s)?\b/i],
        ar: ['اسنان', 'أسنان', 'عيادة اسنان', 'عيادة أسنان'],
        term: 'dental clinic'
    },
    {
        en: [
            /\bclinic(s)?\b/i,
            /\bmedical center(s)?\b/i,
            /\bpolyclinic(s)?\b/i
        ],
        ar: ['عيادة', 'عيادات', 'مركز طبي'],
        term: 'medical clinic'
    },
    {
        en: [
            /\bphysio(therapy)?\b/i,
            /\bphysical therapy\b/i
        ],
        ar: ['علاج طبيعي'],
        term: 'physiotherapy clinic'
    },
    {
        en: [
            /\bsalon(s)?\b/i,
            /\bbeauty\b/i,
            /\bbarber(s)?\b/i,
            /\bhairdresser(s)?\b/i
        ],
        ar: ['صالون', 'حلاق', 'حلاقة', 'تجميل'],
        term: 'beauty salon'
    },
    {
        en: [/\bgym(s)?\b/i, /\bfitness\b/i],
        ar: ['جيم', 'نادي رياضي', 'مركز رياضي'],
        term: 'gym'
    },
    {
        en: [
            /\bcar service\b/i,
            /\bauto service\b/i,
            /\bgarage(s)?\b/i
        ],
        ar: ['سيارات', 'صيانة سيارات', 'ورشة', 'ميكانيكي'],
        term: 'car service center'
    },
    {
        en: [/\breal estate\b/i, /\bproperty\b/i],
        ar: ['عقار', 'عقارات', 'عقاري'],
        term: 'real estate agency'
    },
    {
        en: [
            /\blaw firm(s)?\b/i,
            /\blawyer(s)?\b/i,
            /\battorney(s)?\b/i,
            /\blegal\b/i
        ],
        ar: ['محامي', 'محاماة', 'قانوني'],
        term: 'law firm'
    },
    {
        en: [
            /\baccountant(s)?\b/i,
            /\baccounting\b/i,
            /\bbookkeeping\b/i
        ],
        ar: ['محاسب', 'محاسبة'],
        term: 'accounting firm'
    },
    {
        en: [
            /\btraining center(s)?\b/i,
            /\bacademy\b/i,
            /\bcourses?\b/i
        ],
        ar: ['تدريب', 'مركز تدريب', 'أكاديمية', 'دورات'],
        term: 'training center'
    },
    {
        en: [/\bhotel(s)?\b/i],
        ar: ['فندق', 'فنادق'],
        term: 'hotel'
    },
    {
        en: [/\bretail\b/i, /\bstore(s)?\b/i, /\bshop(s)?\b/i],
        ar: ['متجر', 'تجزئة'],
        term: 'retail store'
    },
    {
        en: [
            /\be-commerce\b/i,
            /\becommerce\b/i,
            /\bonline store(s)?\b/i
        ],
        ar: ['متجر الكتروني', 'متجر إلكتروني', 'تجارة الكترونية', 'تجارة إلكترونية'],
        term: 'e-commerce business'
    }
];

function deriveSearchTerms(normalized: string): string[] {
    const matchedTerms: string[] = [];

    for (const vertical of VERTICALS) {
        const englishMatch = vertical.en.some((pattern) =>
            pattern.test(normalized)
        );

        const arabicMatch = vertical.ar.some((keyword) =>
            normalized.includes(keyword.toLowerCase())
        );

        if (englishMatch || arabicMatch) {
            matchedTerms.push(vertical.term);
        }
    }

    const uniqueTerms = Array.from(new Set(matchedTerms));

    const hasSpecificMedicalVertical =
        uniqueTerms.includes('dental clinic') ||
        uniqueTerms.includes('physiotherapy clinic');

    const filteredTerms = hasSpecificMedicalVertical
        ? uniqueTerms.filter((term) => term !== 'medical clinic')
        : uniqueTerms;

    return filteredTerms.length > 0
        ? filteredTerms.slice(0, 5)
        : [...DEFAULT_SEARCH_TERMS];
}

function deriveLocationQuery(
    instructionText: string
): string | null {
    const englishMatch = instructionText.match(
        /\b(?:in|near|around|at)\s+(.+?)(?=\s+(?:that|which|needing|with|for|and)\b|[,.!?;]|$)/i
    );

    if (englishMatch?.[1]) {
        const location = englishMatch[1].trim();

        if (location.length > 0) {
            return location;
        }
    }

    const arabicMatch = instructionText.match(
        /(?:في|بالقرب من|قرب)\s+(.+?)(?=\s+(?:التي|الذي|التى|و)\b|[،,.;!?]|$)/i
    );

    if (arabicMatch?.[1]) {
        const location = arabicMatch[1].trim();

        if (location.length > 0) {
            return location;
        }
    }

    return null;
}

export function buildPlan(
    instructionText: string
): ChatPlanResult {
    const originalInstruction = instructionText.trim();
    const normalized = originalInstruction.toLowerCase();

    if (!normalized) {
        throw new Error('Instruction is required');
    }

    // 1. COMPANY_SUMMARY patterns
    const companySummaryKeywordsEn = [
        'give me company status',
        'company status',
        'company summary',
        'summarize operix labs',
        'summarize operix',
        'operix status',
        'status of operix',
        'company overview',
        'business overview',
        'overview of company',
        'what is the company status',
        'status summary'
    ];
    const companySummaryKeywordsAr = [
        'ايه وضع الشركة',
        'إيه وضع الشركة',
        'وضع الشركة',
        'ملخص الشركة',
        'تقرير الشركة',
        'حالة الشركة',
        'نظرة عامة على الشركة',
        'ملخص أوبيريكس',
        'وضع اوبيريكس'
    ];

    const isCompanySummary =
        companySummaryKeywordsEn.some((kw) => normalized.includes(kw)) ||
        companySummaryKeywordsAr.some((kw) => originalInstruction.includes(kw));

    if (isCompanySummary) {
        return {
            intent: 'COMPANY_SUMMARY',
            plan: {
                intent: 'COMPANY_SUMMARY',
                summary: 'Compile real-time operational summary across acquisition, commercial, delivery, and governance.',
                steps: [
                    'Query active acquisition pipeline and qualified lead metrics.',
                    'Inspect commercial packages, pricing reviews, and proposal readiness.',
                    'Audit delivery project queue and pending payment verifications.',
                    'Gather pending governance approvals and critical unread notifications.'
                ],
                requiresConfirmation: true
            }
        };
    }

    // 2. ATTENTION_REQUIRED patterns
    const attentionKeywordsEn = [
        'what needs my attention',
        'what needs attention',
        'needs my attention',
        'needs attention',
        'pending actions',
        'pending approvals',
        'pending reviews',
        'blockers',
        'what is blocked',
        'action items',
        'urgent items',
        'attention required'
    ];
    const attentionKeywordsAr = [
        'ايه المطلوب مني',
        'إيه المطلوب مني',
        'المطلوب مني',
        'ما الذي يحتاج انتباهي',
        'ما يحتاج انتباهي',
        'يحتاج انتباهي',
        'المهام المعلقة',
        'المعلقات',
        'المهام العاجلة',
        'ما هو المعلق'
    ];

    const isAttentionRequired =
        attentionKeywordsEn.some((kw) => normalized.includes(kw)) ||
        attentionKeywordsAr.some((kw) => originalInstruction.includes(kw));

    if (isAttentionRequired) {
        return {
            intent: 'ATTENTION_REQUIRED',
            plan: {
                intent: 'ATTENTION_REQUIRED',
                summary: 'Identify pending operational decisions, approval requests, payment verifications, and project blockers.',
                steps: [
                    'Inspect governance approval queue for actionable sign-offs.',
                    'Retrieve pending pricing recommendations and proposal reviews.',
                    'Audit submitted client payments requiring verification.',
                    'Identify projects blocked or awaiting kickoff initiation.'
                ],
                requiresConfirmation: true
            }
        };
    }

    // 3. PIPELINE_ANALYSIS patterns
    const pipelineKeywordsEn = [
        'analyze current pipeline',
        'analyze pipeline',
        'pipeline analysis',
        'pipeline status',
        'pipeline bottlenecks',
        'conversion analysis',
        'operational bottlenecks',
        'analyze the pipeline'
    ];
    const pipelineKeywordsAr = [
        'حلل البايبلاين',
        'تحليل البايبلاين',
        'تحليل المسار',
        'تحليل خط الأنابيب',
        'حالة البايبلاين',
        'عنق الزجاجة في البايبلاين',
        'مراجعة البايبلاين'
    ];

    const isPipelineAnalysis =
        pipelineKeywordsEn.some((kw) => normalized.includes(kw)) ||
        pipelineKeywordsAr.some((kw) => originalInstruction.includes(kw));

    if (isPipelineAnalysis) {
        return {
            intent: 'PIPELINE_ANALYSIS',
            plan: {
                intent: 'PIPELINE_ANALYSIS',
                summary: 'Analyze conversion velocity, stage transitions, operational bottlenecks, and recommended focus areas.',
                steps: [
                    'Calculate acquisition-to-commercial qualification and intent ratios.',
                    'Audit commercial proposal conversion and payment settlement turnaround.',
                    'Detect operational bottlenecks across active pipeline stages.',
                    'Synthesize prioritized strategic focus recommendations.'
                ],
                requiresConfirmation: true
            }
        };
    }

    // 4. DISCOVER_LEADS patterns (unchanged)
    const discoveryKeywords = [
        'find',
        'discover',
        'search',
        'companies',
        'businesses',
        'leads',
        'prospects',
        'اعثر',
        'ابحث',
        'شركات',
        'شركات محتاجة',
        'عملاء',
        'ليدز'
    ];

    const isDiscoveryInstruction = discoveryKeywords.some(
        (keyword) => normalized.includes(keyword)
    );

    if (!isDiscoveryInstruction) {
        throw new Error(
            'Unsupported instruction. Operix AI supports lead discovery instructions, company status summaries, attention & blocker reviews, and pipeline analysis.'
        );
    }

    const searchTerms = deriveSearchTerms(normalized);
    const locationQuery = deriveLocationQuery(
        originalInstruction
    );

    const plan: ChatPlan = {
        intent: 'DISCOVER_LEADS',
        summary:
            'Discover potential business leads for automation opportunities.',
        steps: [
            'Discover candidate businesses using the configured discovery provider.',
            'Create research tasks for discovered leads.',
            'Pause the workflow for manual research completion and existing review gates.'
        ],
        searchTerms,
        locationQuery,
        requiresConfirmation: true
    };

    return {
        intent: 'DISCOVER_LEADS',
        plan
    };
}
