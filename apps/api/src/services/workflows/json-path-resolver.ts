/**
 * @file json-path-resolver.ts
 * @description Deterministic JSON path resolution for workflow data mapping.
 * Implements the logic to inspect and validate data paths.
 */

export enum MappingConfidence {
    EXACT = 'EXACT',
    HIGH_CONFIDENCE = 'HIGH_CONFIDENCE',
    INFERRED = 'INFERRED',
    UNKNOWN = 'UNKNOWN',
    INCOMPATIBLE = 'INCOMPATIBLE'
}

export interface PathResolution {
    path: string;
    type: string;
    confidence: MappingConfidence;
    reasoning: string;
}

export class JsonPathResolver {
    /**
     * Resolves a path against a sample JSON structure.
     * Returns the value and the confidence of the resolution.
     */
    resolve(data: any, path: string): { value: any, confidence: MappingConfidence, reasoning: string } {
        try {
            const value = this.getValueByPath(data, path);
            if (value === undefined) {
                return { value: undefined, confidence: MappingConfidence.UNKNOWN, reasoning: 'Path not found in provided structure' };
            }
            return { value, confidence: MappingConfidence.EXACT, reasoning: 'Deterministic path match' };
        } catch (e) {
            return { value: undefined, confidence: MappingConfidence.INCOMPATIBLE, reasoning: `Resolution error: ${e}` };
        }
    }

    /**
     * Simple JSON path resolver (e.g., "$.customer.id" or "customer.id")
     */
    private getValueByPath(obj: any, path: string): any {
        const normalizedPath = path.startsWith('$.') ? path.substring(2) : path;
        const parts = normalizedPath.split('.');

        let current = obj;
        for (const part of parts) {
            if (current === null || typeof current !== 'object') return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Determines if two paths are compatible based on type.
     */
    checkCompatibility(sourceValue: any, targetValue: any): { compatible: boolean, transformationRequired: boolean, type: string } {
        const sourceType = this.getType(sourceValue);
        const targetType = this.getType(targetValue);

        if (sourceType === targetType) {
            return { compatible: true, transformationRequired: false, type: sourceType };
        }

        // Basic compatibility rules
        if (sourceType === 'number' && targetType === 'string') {
            return { compatible: true, transformationRequired: true, type: 'TYPE_CONVERSION' };
        }
        if (sourceType === 'string' && targetType === 'number') {
            return { compatible: true, transformationRequired: true, type: 'TYPE_CONVERSION' };
        }

        return { compatible: false, transformationRequired: true, type: 'INCOMPATIBLE' };
    }

    private getType(val: any): string {
        if (val === null) return 'null';
        if (Array.isArray(val)) return 'array';
        return typeof val;
    }

    /**
     * Suggests a path based on field name similarity.
     */
    suggestPath(data: any, targetFieldName: string): PathResolution {
        const paths: string[] = [];
        this.findPaths(data, '', paths);

        const bestMatch = paths.find(p => p.toLowerCase().includes(targetFieldName.toLowerCase()));

        if (bestMatch) {
            return {
                path: bestMatch,
                type: 'inferred',
                confidence: MappingConfidence.INFERRED,
                reasoning: `Field name match found: ${bestMatch}`
            };
        }

        return {
            path: '',
            type: 'unknown',
            confidence: MappingConfidence.UNKNOWN,
            reasoning: 'No similar field names found'
        };
    }

    private findPaths(obj: any, currentPath: string, paths: string[]) {
        if (obj === null || typeof obj !== 'object') return;

        for (const key in obj) {
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            paths.push(newPath);
            this.findPaths(obj[key], newPath, paths);
        }
    }
}

export const jsonPathResolver = new JsonPathResolver();
