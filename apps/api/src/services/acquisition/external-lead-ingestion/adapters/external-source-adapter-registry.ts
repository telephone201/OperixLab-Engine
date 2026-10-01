import type { ExternalSourceReader } from "./external-source-reader";
import { excelSourceAdapter } from "./excel-source-adapter";
import { csvSourceAdapter } from "./csv-source-adapter";

export class ExternalSourceAdapterRegistry {
    private readonly adapters = new Map<string, ExternalSourceReader>();

    constructor() {
        this.register(excelSourceAdapter);
        this.register(csvSourceAdapter);
    }

    register(adapter: ExternalSourceReader): void {
        this.adapters.set(
            adapter.metadata.format.toUpperCase(),
            adapter,
        );
    }

    get(format: string): ExternalSourceReader {
        const normalizedFormat = format.trim().toUpperCase();
        const adapter = this.adapters.get(normalizedFormat);

        if (!adapter) {
            throw new Error(
                `No external source adapter registered for format: ${format}`,
            );
        }

        return adapter;
    }

    has(format: string): boolean {
        return this.adapters.has(
            format.trim().toUpperCase(),
        );
    }

    listFormats(): string[] {
        return Array.from(this.adapters.keys()).sort();
    }
}

export const externalSourceAdapterRegistry =
    new ExternalSourceAdapterRegistry();
