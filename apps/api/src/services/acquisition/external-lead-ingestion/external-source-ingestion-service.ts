import {
    externalSourceAdapterRegistry,
} from "./adapters/external-source-adapter-registry";
import type {
    ExternalSourceMetadata,
    ExternalSourceRow,
} from "./adapters/external-source-reader";

export interface ReadExternalSourceInput {
    filePath: string;
    format: string;
}

export interface ReadExternalSourceResult {
    metadata: ExternalSourceMetadata;
    rows: ExternalSourceRow[];
}

export class ExternalSourceIngestionService {
    readSample(
        input: ReadExternalSourceInput,
        limit: number = 10,
    ): ReadExternalSourceResult {
        const adapter =
            externalSourceAdapterRegistry.get(input.format);

        return {
            metadata: adapter.metadata,
            rows: adapter.readSample(
                input.filePath,
                limit,
            ),
        };
    }

    readAll(
        input: ReadExternalSourceInput,
    ): ReadExternalSourceResult {
        const adapter =
            externalSourceAdapterRegistry.get(input.format);

        return {
            metadata: adapter.metadata,
            rows: adapter.readAll(
                input.filePath,
            ),
        };
    }
}

export const externalSourceIngestionService =
    new ExternalSourceIngestionService();
