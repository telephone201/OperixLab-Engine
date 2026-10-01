"use client";

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

/**
 * Public client proposal page (Sales MVP Milestones 1 + 2).
 *
 * No login, no portal, no navigation. Renders the approved proposal for a
 * prospect who received a signed link, plus a minimal Accept / Request
 * Changes CTA (Milestone 2). All failures collapse to one client-safe
 * message; internal state is never revealed.
 *
 * Language: Arabic-first/English-ready. The response UI uses a small local
 * translation object resolved from the proposal's explicit language field
 * (default 'en'). Proposal business content is never translated.
 */

interface CommercialOption {
    name: string;
    setupFee: number | null;
    recurringFee: number | null;
    recommendedPrice: number | null;
    currency: string;
    billingCycle: string;
}

interface ProposalContent {
    introduction: string;
    companyUnderstanding: string;
    painSummary: string;
    requirementsSummary: string;
    recommendedSolution: string;
    solutionExplanation: string;
    expectedImpact: string;
    demo: string;
    scope: {
        included: string[];
        optional: string[];
        outOfScope: string[];
    };
    commercialOptions: CommercialOption[];
    terms: string;
    assumptions: string;
    faq: string;
    nextSteps: string;
    contact: string;
    language?: string;
}

interface PublicProposalView {
    companyName: string;
    offerName: string;
    proposalVersionId: string;
    validUntil: string | null;
    language: 'ar' | 'en';
    content: ProposalContent;
}

type ResponseAction = 'ACCEPT' | 'REQUEST_CHANGES';

type ResponsePhase =
    | { kind: 'idle' }
    | { kind: 'confirmAccept' }
    | { kind: 'requestChanges' }
    | { kind: 'accepted' }
    | { kind: 'changesSent' };

const INVALID_LINK_MESSAGE = 'This proposal link is no longer valid.';

/**
 * Single source of truth for the public API base URL on this page.
 *
 * Root cause of the Milestone 2 bug: the response POST was built from a
 * second, independently inlined `NEXT_PUBLIC_API_BASE_URL ||` expression in
 * submitResponse. Because the running web server was started without
 * NEXT_PUBLIC_API_BASE_URL set, both call sites fell back to the same
 * literal — but any environment where only one call site picks up the env
 * var (e.g. the var added after the server process started, or a proxy-prefixed
 * value baked into one call site) desyncs GET from POST and the POST lands
 * on a path the API router does not serve (observed as 404 on
 * /response while GET succeeded).
 *
 * Both the GET and the POST now resolve the base through this one helper so
 * they can never disagree, and the fallback strips a trailing '/api' so a
 * mis-configured env value cannot double the '/api' prefix.
 */
function resolvePublicApiBase(): string {
    const configured = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    return configured.replace(/\/+$/, '').replace(/\/api$/, '');
}

function buildPublicProposalUrl(versionId: string, signature: string, withResponse = false): string {
    return (
        resolvePublicApiBase() +
        '/api/public/proposals/' +
        encodeURIComponent(versionId) +
        (withResponse ? '/response' : '') +
        '?sig=' +
        encodeURIComponent(signature)
    );
}

const TRANSLATIONS = {
    en: {
        dir: 'ltr' as const,
        lang: 'en',
        ctaPrompt: 'Ready to move forward?',
        accept: 'Accept Proposal',
        requestChanges: 'Request Changes',
        confirmAcceptPrompt: 'Are you ready to accept this proposal?',
        confirmAccept: 'Confirm Acceptance',
        cancel: 'Cancel',
        changesPrompt: 'What would you like us to change?',
        submitRequest: 'Submit Request',
        acceptedTitle: 'Proposal accepted',
        acceptedBody: 'Thank you. Operix Labs will proceed with the next step.',
        changesTitle: 'Change request received',
        changesBody: 'Thank you. Operix Labs will review your requested changes.',
        submitError: "We couldn't submit your response. Please try again."
    },
    ar: {
        dir: 'rtl' as const,
        lang: 'ar',
        ctaPrompt: 'هل ترغب في المتابعة؟',
        accept: 'قبول المقترح',
        requestChanges: 'طلب تعديلات',
        confirmAcceptPrompt: 'هل أنت مستعد لقبول هذا المقترح؟',
        confirmAccept: 'تأكيد قبول المقترح',
        cancel: 'إلغاء',
        changesPrompt: 'ما التعديلات التي ترغب في إجرائها؟',
        submitRequest: 'إرسال طلب التعديل',
        acceptedTitle: 'تم قبول المقترح',
        acceptedBody: 'شكرًا لك. ستقوم Operix Labs بالمتابعة في الخطوة التالية.',
        changesTitle: 'تم استلام طلب التعديلات',
        changesBody: 'شكرًا لك. ستقوم Operix Labs بمراجعة التعديلات المطلوبة.',
        submitError: 'تعذر إرسال ردك. يرجى المحاولة مرة أخرى.'
    }
};

function formatMoney(amount: number | null, currency: string): string | null {
    if (amount === null) {
        return null;
    }

    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency && currency.length === 3 ? currency : 'USD',
            maximumFractionDigits: 0
        }).format(amount);
    } catch {
        return `${currency} ${amount}`;
    }
}

function ScopeList({ title, items }: { title: string; items: string[] }) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">{title}</h3>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {items.map((item, index) => (
                    <li key={index}>{item}</li>
                ))}
            </ul>
        </div>
    );
}

export default function PublicProposalPage() {
    const params = useParams<{ versionId: string }>();
    const searchParams = useSearchParams();
    const versionId = params?.versionId ?? '';
    const signature = searchParams?.get('sig') ?? '';

    const [proposal, setProposal] = useState<PublicProposalView | null>(null);
    const [isInvalid, setIsInvalid] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [phase, setPhase] = useState<ResponsePhase>({ kind: 'idle' });
    const [changesMessage, setChangesMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch(
                    buildPublicProposalUrl(versionId, signature),
                    { headers: { Accept: 'application/json' } }
                );

                if (!response.ok) {
                    if (!cancelled) setIsInvalid(true);
                    return;
                }

                const payload = await response.json();
                const view = payload?.data;

                if (!view || view.proposalVersionId !== versionId) {
                    if (!cancelled) setIsInvalid(true);
                    return;
                }

                if (!cancelled) setProposal(view as PublicProposalView);
            } catch {
                if (!cancelled) setIsInvalid(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        if (versionId && signature) {
            load();
        } else {
            setIsInvalid(true);
            setIsLoading(false);
        }

        return () => {
            cancelled = true;
        };
    }, [versionId, signature]);

    async function submitResponse(action: ResponseAction, message?: string) {
        setIsSubmitting(true);
        setSubmitError(false);

        try {
            const response = await fetch(
                buildPublicProposalUrl(versionId, signature, true),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(action === 'ACCEPT' ? { action } : { action, message })
                }
            );

            if (!response.ok) {
                setSubmitError(true);
                return;
            }

            const payload = await response.json();
            const status = payload?.data?.status;

            if (status === 'ACCEPTED') {
                setPhase({ kind: 'accepted' });
            } else if (status === 'CHANGES_REQUESTED') {
                setPhase({ kind: 'changesSent' });
            } else {
                setSubmitError(true);
            }
        } catch {
            setSubmitError(true);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-500">Loading proposal…</p>
            </main>
        );
    }

    if (isInvalid || !proposal) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-600">{INVALID_LINK_MESSAGE}</p>
            </main>
        );
    }

    const content = proposal.content;
    const primaryOption = content.commercialOptions[0];
    // Milestone language resolution: explicit field on the view (defaults to
    // 'en' server-side); page-level fallback for older cached payloads.
    const t = TRANSLATIONS[proposal.language === 'ar' ? 'ar' : 'en'];

    return (
        <main
            dir={t.dir}
            lang={t.lang}
            className="min-h-screen bg-gray-50 py-10 px-4"
        >
            <article className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <header className="mb-8 border-b border-gray-200 pb-6">
                    <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Prepared for</p>
                    <h1 className="text-2xl font-bold text-gray-900">{proposal.companyName}</h1>
                    <p className="mt-2 text-lg text-gray-800">{proposal.offerName}</p>
                    {proposal.validUntil && (
                        <p className="mt-1 text-sm text-gray-500">
                            Valid until {new Date(proposal.validUntil).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </p>
                    )}
                </header>

                {content.introduction && (
                    <section className="mb-6">
                        <p className="text-gray-800">{content.introduction}</p>
                    </section>
                )}

                {content.companyUnderstanding && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Your Business</h2>
                        <p className="text-gray-700">{content.companyUnderstanding}</p>
                    </section>
                )}

                {content.painSummary && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">The Challenge</h2>
                        <p className="text-gray-700">{content.painSummary}</p>
                    </section>
                )}

                {content.recommendedSolution && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Recommended Solution</h2>
                        <p className="text-gray-700">{content.recommendedSolution}</p>
                        {content.solutionExplanation && (
                            <p className="text-gray-700 mt-2">{content.solutionExplanation}</p>
                        )}
                    </section>
                )}

                {(content.scope.included.length > 0 || content.scope.optional.length > 0 || content.scope.outOfScope.length > 0) && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Scope</h2>
                        <ScopeList title="Included" items={content.scope.included} />
                        <ScopeList title="Optional" items={content.scope.optional} />
                        <ScopeList title="Out of scope" items={content.scope.outOfScope} />
                    </section>
                )}

                {primaryOption && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-3">Pricing</h2>
                        <div className="rounded-md border border-gray-200 p-4">
                            <p className="font-medium text-gray-900">{primaryOption.name}</p>
                            <dl className="mt-2 space-y-1 text-sm text-gray-700">
                                {primaryOption.recommendedPrice !== null && (
                                    <div className="flex justify-between">
                                        <dt>Recommended price</dt>
                                        <dd className="font-semibold">
                                            {formatMoney(primaryOption.recommendedPrice, primaryOption.currency)}
                                        </dd>
                                    </div>
                                )}
                                {primaryOption.setupFee !== null && (
                                    <div className="flex justify-between">
                                        <dt>Setup fee</dt>
                                        <dd>{formatMoney(primaryOption.setupFee, primaryOption.currency)}</dd>
                                    </div>
                                )}
                                {primaryOption.recurringFee !== null && (
                                    <div className="flex justify-between">
                                        <dt>Recurring fee</dt>
                                        <dd>
                                            {formatMoney(primaryOption.recurringFee, primaryOption.currency)}
                                            {primaryOption.billingCycle ? ` / ${primaryOption.billingCycle.toLowerCase()}` : ''}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        </div>
                    </section>
                )}

                {content.terms && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Terms</h2>
                        <p className="text-gray-700">{content.terms}</p>
                    </section>
                )}

                {content.expectedImpact && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Expected Impact</h2>
                        <p className="text-gray-700">{content.expectedImpact}</p>
                    </section>
                )}

                {content.nextSteps && (
                    <section className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Next Steps</h2>
                        <p className="text-gray-700">{content.nextSteps}</p>
                    </section>
                )}

                {/* ---------------- Milestone 2: response CTA ---------------- */}
                <section className="mt-10 border-t border-gray-200 pt-6">
                    {phase.kind === 'idle' && (
                        <div className="text-center">
                            <p className="text-lg font-medium text-gray-900 mb-4">{t.ctaPrompt}</p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    type="button"
                                    onClick={() => setPhase({ kind: 'confirmAccept' })}
                                    className="px-6 py-3 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 transition"
                                >
                                    {t.accept}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPhase({ kind: 'requestChanges' })}
                                    className="px-6 py-3 rounded-md border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition"
                                >
                                    {t.requestChanges}
                                </button>
                            </div>
                        </div>
                    )}

                    {phase.kind === 'confirmAccept' && (
                        <div className="text-center">
                            <p className="text-lg font-medium text-gray-900 mb-4">{t.confirmAcceptPrompt}</p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => submitResponse('ACCEPT')}
                                    className="px-6 py-3 rounded-md bg-green-600 text-white font-medium hover:bg-green-700 transition disabled:opacity-60"
                                >
                                    {t.confirmAccept}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => setPhase({ kind: 'idle' })}
                                    className="px-6 py-3 rounded-md border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition disabled:opacity-60"
                                >
                                    {t.cancel}
                                </button>
                            </div>
                        </div>
                    )}

                    {phase.kind === 'requestChanges' && (
                        <div>
                            <p className="text-lg font-medium text-gray-900 mb-3">{t.changesPrompt}</p>
                            <textarea
                                value={changesMessage}
                                onChange={(event) => setChangesMessage(event.target.value)}
                                rows={4}
                                required
                                className="w-full rounded-md border border-gray-300 p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400"
                            />
                            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-4">
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    onClick={() => setPhase({ kind: 'idle' })}
                                    className="px-6 py-3 rounded-md border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition disabled:opacity-60"
                                >
                                    {t.cancel}
                                </button>
                                <button
                                    type="button"
                                    disabled={isSubmitting || changesMessage.trim().length === 0}
                                    onClick={() => submitResponse('REQUEST_CHANGES', changesMessage.trim())}
                                    className="px-6 py-3 rounded-md bg-gray-900 text-white font-medium hover:bg-gray-700 transition disabled:opacity-60"
                                >
                                    {t.submitRequest}
                                </button>
                            </div>
                        </div>
                    )}

                    {phase.kind === 'accepted' && (
                        <div className="text-center">
                            <p className="text-lg font-semibold text-green-700 mb-2">{t.acceptedTitle}</p>
                            <p className="text-gray-700">{t.acceptedBody}</p>
                        </div>
                    )}

                    {phase.kind === 'changesSent' && (
                        <div className="text-center">
                            <p className="text-lg font-semibold text-gray-900 mb-2">{t.changesTitle}</p>
                            <p className="text-gray-700">{t.changesBody}</p>
                        </div>
                    )}

                    {submitError && (
                        <p className="mt-4 text-center text-sm text-red-600">{t.submitError}</p>
                    )}
                </section>

                {content.contact && (
                    <footer className="mt-8 border-t border-gray-200 pt-4">
                        <p className="text-sm text-gray-500">{content.contact}</p>
                    </footer>
                )}
            </article>
        </main>
    );
}
