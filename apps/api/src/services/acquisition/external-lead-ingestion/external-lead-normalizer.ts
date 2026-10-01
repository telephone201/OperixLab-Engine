export interface NormalizedExternalLead {
    companyName: string | null;
    normalizedCompanyName: string | null;
    website: string | null;
    domain: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactTitle: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    industry: string | null;
    source: string | null;
    provider: string | null;
    sourceUrl: string | null;
    sourceExternalId: string | null;
    dedupKey: string | null;
}

function clean(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();

    return text.length > 0 ? text : null;
}

function findValue(
    row: Record<string, unknown>,
    aliases: string[],
): string | null {
    const entries = Object.entries(row);

    for (const alias of aliases) {
        const normalizedAlias = alias.trim().toLowerCase();

        const match = entries.find(([key, value]) => {
            if (clean(value) === null) {
                return false;
            }

            return key.trim().toLowerCase() === normalizedAlias;
        });

        if (match) {
            return clean(match[1]);
        }
    }

    return null;
}

function normalizeCompanyName(value: string | null): string | null {
    if (!value) {
        return null;
    }

    return value
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function normalizeExternalLead(
    row: Record<string, unknown>,
): NormalizedExternalLead {
    const companyName = findValue(row, [
        "Company Name",
        "Company",
        "Business Name",
        "Business",
    ]);

    const contactName = findValue(row, [
        "Name",
        "Full Name",
        "Customer Name",
        "Contact Name",
        "اسم",
        "اسم المتصل",
    ]);

    const phone = findValue(row, [
        "Phone",
        "Mobile",
        "Mobile No.",
        "Mobile No",
        "Tel",
        "Tel1",
        "Tel2",
        "Telephone",
        "رقم الاتصال",
        "رقم الهاتف",
        "الموبايل",
    ]);

    const email = findValue(row, [
        "Email",
        "E-mail",
        "Mail",
        "Mail Address",
        "Email Address",
    ]);

    const city = findValue(row, [
        "City",
        "Location",
        "Place of Residence",
        "المدينة",
        "المنطقة",
    ]);

    const address = findValue(row, [
        "Address",
        "العنوان",
    ]);

    const title = findValue(row, [
        "Title",
        "Job Title",
        "Position",
        "Role",
        "الوظيفة",
    ]);

    const website = findValue(row, [
        "Website",
        "Web",
        "URL",
        "Site",
    ]);

    const industry = findValue(row, [
        "Industry",
        "Sector",
        "Activity",
        "النشاط",
    ]);

    return {
        companyName,
        normalizedCompanyName: normalizeCompanyName(companyName),
        website,
        domain: null,
        contactName,
        contactEmail: email,
        contactTitle: title,
        phone,
        address,
        city,
        country: null,
        industry,
        source: "EXCEL",
        provider: "LOCAL_FILE",
        sourceUrl: null,
        sourceExternalId: null,
        dedupKey: null,
    };
}
