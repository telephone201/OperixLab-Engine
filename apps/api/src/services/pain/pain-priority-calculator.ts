/**
 * @file pain-priority-calculator.ts
 * @description Deterministic priority calculation for operational focus.
 */

import { Pain, PainPriority } from './pain-types';

export class PainPriorityCalculator {
    /**
     * Calculates the priority of a pain based on a weighted formula.
     * Priority = (Severity * 0.4) + (Frequency * 0.3) + (Confidence * 0.3)
     */
    calculatePriority(pain: Pain): PainPriority {
        const severityMap: Record<string, number> = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNKNOWN': 0 };
        const frequencyMap: Record<string, number> = { 'CONTINUOUS': 4, 'FREQUENT': 3, 'REGULAR': 2, 'OCCASIONAL': 1, 'RARE': 0, 'UNKNOWN': 0 };

        const sScore = severityMap[pain.severity] || 0;
        const fScore = frequencyMap[pain.frequency] || 0;
        const cScore = pain.confidence * 4; // Normalize 0-1 to 0-4

        const priorityScore = (sScore * 0.4) + (fScore * 0.3) + (cScore * 0.3);

        if (priorityScore >= 3.5) return 'CRITICAL';
        if (priorityScore >= 2.5) return 'HIGH';
        if (priorityScore >= 1.5) return 'MEDIUM';
        return 'LOW';
    }
}
