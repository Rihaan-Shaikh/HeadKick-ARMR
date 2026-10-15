// Enhanced Shot Engine for TILT KICK
// Continuous 3D world target coordinates, 7 distinct target zones,
// shot quality grading, and physical world-space outcome classification.

import { settingsManager } from '../utils/SettingsManager.js';

export class ShotEngine {
    constructor() {
        // FIFA Standard Goal Dimensions (Scaled meters)
        this.goalWidth = 7.32;
        this.goalHeight = 2.44;
        this.halfWidth = this.goalWidth / 2; // 3.66m

        this.postRadius = 0.08;
        this.postThreshold = 0.16;
    }

    // Maps player's normalized aim (-1.0 to +1.0) and power (0.0 to 1.0) to continuous 3D world coordinates
    calculateTarget(aim, rawPower) {
        const powerMultiplier = settingsManager.get('shotPower') || 1.0;
        const effectivePower = Math.min(1.0, rawPower * powerMultiplier);

        // Horizontal target range: -3.85m to +3.85m (posts are at ±3.66m)
        const targetX = aim * 3.70;

        // Vertical target range:
        // Low driven: ~0.35m
        // Mid-height: ~1.25m
        // Upper 90 top corners: ~2.18m - 2.40m
        const baseHeight = 0.35 + Math.pow(effectivePower, 0.94) * 1.95;
        const targetY = Math.max(0.20, Math.min(2.55, baseHeight + (Math.random() - 0.5) * 0.05));

        return { x: targetX, y: targetY, effectivePower };
    }

    // Classifies shot into one of 7 distinct target zones
    getTargetZone(x, y) {
        const isLeft = x < -0.85;
        const isRight = x > 0.85;

        if (y > 1.68) {
            if (isLeft) return 'TOP_LEFT_90';
            if (isRight) return 'TOP_RIGHT_90';
            return 'TOP_CENTER';
        } else if (y < 0.85) {
            if (isLeft) return 'BOTTOM_LEFT';
            if (isRight) return 'BOTTOM_RIGHT';
            return 'BOTTOM_CENTER';
        } else {
            if (isLeft) return 'MID_LEFT';
            if (isRight) return 'MID_RIGHT';
            return 'CENTER';
        }
    }

    // Determine shot release quality: "PERFECT", "GREAT", "GOOD", "WEAK"
    getShotQuality(targetX, targetY, power) {
        const absX = Math.abs(targetX);
        const isCorner = absX > 2.2 && (targetY > 1.55 || targetY < 0.90);

        if (isCorner && power > 0.78) {
            return { label: 'PERFECT FINISH!', grade: 'PERFECT' };
        } else if (absX > 1.6 && power > 0.60) {
            return { label: 'GREAT STRIKE!', grade: 'GREAT' };
        } else if (power > 0.38) {
            return { label: 'GOOD EFFORT', grade: 'GOOD' };
        } else {
            return { label: 'WEAK SHOT', grade: 'WEAK' };
        }
    }

    // Classifies the shot's target trajectory before flight begins
    getShotMetadata(targetX, targetY, effectivePower) {
        const zone = this.getTargetZone(targetX, targetY);
        const quality = this.getShotQuality(targetX, targetY, effectivePower);

        return {
            targetX,
            targetY,
            effectivePower,
            zone,
            quality: quality.label,
            grade: quality.grade
        };
    }
}
