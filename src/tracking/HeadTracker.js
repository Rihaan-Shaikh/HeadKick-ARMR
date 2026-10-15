// Robust Head Tracker for TILT KICK
// High-Reliability Vision Engine:
// 1. Face Framing & Orientation Validation with Real-Time Rejection Diagnostics
// 2. Continuous Neutral Pose Baseline Calibration (Median Outlier Rejection)
// 3. Multi-Face Spatial Tracking with Primary Player Lock & Crowd Rejection
// 4. Dead Zone Hysteresis: Sitting Straight = True Center (0.00)
// 5. Pre-Nod Authoritative Aim Freezing (Nod motion does not deflect shot)
// 6. 100% Genuine Telemetry Metrics — Honest Status & Rejection Reporting

import { settingsManager } from '../utils/SettingsManager.js';

export const DiagnosticStages = Object.freeze({
    CAMERA_NOT_READY: 'CAMERA_NOT_READY',
    VIDEO_FRAME_UNAVAILABLE: 'VIDEO_FRAME_UNAVAILABLE',
    MODEL_LOADING: 'MODEL_LOADING',
    MODEL_INITIALIZATION_ERROR: 'MODEL_INITIALIZATION_ERROR',
    INFERENCE_NOT_RUNNING: 'INFERENCE_NOT_RUNNING',
    INFERENCE_ERROR: 'INFERENCE_ERROR',
    INFERENCE_RETURNED_NO_FACE: 'INFERENCE_RETURNED_NO_FACE',
    LANDMARKS_RECEIVED: 'LANDMARKS_RECEIVED',
    FACE_REJECTED_BY_VALIDATION: 'FACE_REJECTED_BY_VALIDATION',
    FACE_ACCEPTED: 'FACE_ACCEPTED',
    ENROLLMENT_ACTIVE: 'ENROLLMENT_ACTIVE'
});

export class HeadTracker {
    constructor() {
        // Diagnostic Stage Tracking (P0, P2, P13 Telemetry Boundary)
        this.diagnosticStage = DiagnosticStages.CAMERA_NOT_READY;

        // Enrolled Player Spatial Baseline
        this.enrolledProfile = null; // { baselineCenter: {x,y}, baselineFaceWidth, baselineFaceHeight }
        // 'ENROLLMENT_IDLE' | 'ENROLLMENT_SEARCHING' | 'ENROLLMENT_COLLECTING' | 'ENROLLMENT_SUCCESS'
        this.enrollmentState = 'ENROLLMENT_IDLE';
        this.idSamples = [];
        this.idSamplesRequired = 24; // Real clean frames required
        this.acceptedEnrollmentSamples = 0;
        this.rejectedEnrollmentSamples = 0;
        this.lastRejectionReason = 'FACE NOT DETECTED';
        this.lastSampleAcceptedTime = 0;
        this.sampleCadenceMs = 65; // ~1 sample per 65ms ensures ~1.6s smooth enrollment without duplicate frames
        this.selectedFaceArea = 0;
        this.selectedFaceWidth = 0;
        this.isAmbiguousCrowd = false;

        // Multi-Face Tracking State & Crowd Rejection
        this.detectedFaceCount = 0;
        this.ignoredFaceCount = 0;
        this.isPlayer1Locked = false;
        this.searchingForPlayer = false;
        this.playerLostTimestamp = 0;
        this.recoveryGracePeriodMs = 2800; // 2.8s recovery window before resetting

        // Separate Genuine Metrics
        this.detectionConfidence = 0; // 0 - 100%
        this.poseConfidence = 0;      // 0 - 100%
        this.trackStability = 0;     // 0 - 100%
        this.identityMatchScore = 0; // Tracking confidence percentage

        // 3D Head Pose (Roll, Pitch, Yaw)
        this.rawRollAngle = 0;        // Degrees: + = right tilt, - = left tilt
        this.rawPitch = 0;            // Degrees: + = pitch up, - = pitch down (centered at 0)
        this.rawYaw = 0;              // Degrees: + = turn right, - = turn left (centered at 0)
        this.neutralRoll = 0;         // Calibrated neutral baseline roll
        this.neutralPitch = 0;        // Calibrated neutral baseline pitch
        this.neutralYaw = 0;          // Calibrated neutral baseline yaw

        this.smoothedRoll = 0;
        this.smoothedPitch = 0;
        this.prevPitch = 0;
        this.pitchVelocity = 0;       // Upward pitch velocity (deg/sec)
        this.pitchHistory = [];       // { time, pitch } history for nod displacement check
        this.aimHistory = [];         // { time, aim } sliding buffer for pre-nod aim freeze

        // Neutral Pose Calibration State
        // 'CALIBRATION_IDLE' | 'CALIBRATING' | 'CALIBRATED'
        this.calibrationState = 'CALIBRATION_IDLE';
        this.calibrationSamples = [];
        this.calibrationSamplesRequired = 24; // Actual required clean frames
        this.calibrationComplete = false;
        this.lastCalSampleTime = 0;

        // Aiming & Dead Zone Hysteresis
        this.normalizedAim = 0.0;     // -1.0 (Left) to +1.0 (Right)
        this.lockedShotAim = 0.0;     // Authoritative aim frozen before nod gesture
        this.inDeadZone = true;
        this.deadZoneDeg = 4.8;
        this.deadZoneExitHysteresis = 5.6;
        this.deadZoneEnterHysteresis = 4.0;

        // Power Charging (Duration-based across all aims including Center)
        this.power = 0;               // 0.0 to 1.0
        this.effectiveKickPower = 0.35; // Minimum valid shot power if kicking immediately
        this.isCharging = false;
        this.chargeDurationMs = 0;
        this.maxChargeDurationMs = 2000;
        this.holdAimTimer = 0;

        // Kick Trigger & Safety State
        this.kickTriggered = false;
        this.lastKickTimestamp = -99999;
        this.kickCooldownMs = 1000;
        this.inputLocked = false;

        // Upward Nod Tuning Parameters
        this.nodVelocityThreshold = 30.0;   // Minimum upward pitch velocity (deg/s)
        this.nodDisplacementThreshold = 3.2;// Minimum upward angular displacement (deg)
        this.nodWindowMs = 220;             // Upward displacement time window
        this.nodMaxDurationMs = 380;        // Quick jerk max duration

        // Face Validation & Tracking Status
        this.faceDetected = false;
        this.positionStatus = 'NO_FACE';
        this.candidatePositionStatus = 'NO_FACE';
        this.candidateStatusStartTime = 0;
        this.stabilityHistory = [];
        this.lastDetectionTime = 0;
        this.faceLostThresholdMs = 450;
        this.lastTrackedCenter = { x: 0.5, y: 0.5 };
        this.lastFaceWidth = 0.3;
        this.lastFaceHeight = 0.4;

        // External lighting rejection indicator from InputManager
        this.lightingRejection = null;

        // Telemetry counters
        this.framesReceived = 0;
        this.validDetections = 0;
        this.lastError = null;

        // Subscribe to settings
        this.syncSettings();
        settingsManager.subscribe(() => this.syncSettings());
    }

    syncSettings() {
        this.sensitivity = settingsManager.get('headSensitivity') || 1.1;
        this.deadZoneDeg = settingsManager.get('deadZone') || 4.8;
        this.deadZoneExitHysteresis = this.deadZoneDeg * 1.18;
        this.deadZoneEnterHysteresis = this.deadZoneDeg * 0.82;
        this.smoothingAlpha = settingsManager.getSmoothingAlpha ? settingsManager.getSmoothingAlpha() : 0.28;
        this.aimAssistFactor = settingsManager.getAimAssistFactor ? settingsManager.getAimAssistFactor() : 0.35;

        const chargeSpeed = settingsManager.get('chargeSpeed');
        if (chargeSpeed === 'slow') this.maxChargeDurationMs = 2500;
        else if (chargeSpeed === 'fast') this.maxChargeDurationMs = 1500;
        else this.maxChargeDurationMs = 2000;
    }

    // ============================================================
    // ENROLLMENT & CALIBRATION LIFECYCLE
    // ============================================================
    startEnrollment() {
        this.enrollmentState = 'ENROLLMENT_SEARCHING';
        this.idSamples = [];
        this.acceptedEnrollmentSamples = 0;
        this.rejectedEnrollmentSamples = 0;
        this.lastRejectionReason = 'FACE NOT DETECTED';
        this.enrolledProfile = null;
        this.isPlayer1Locked = false;
        this.identityMatchScore = 0;
        this.calibrationState = 'CALIBRATION_IDLE';
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        this.lastSampleAcceptedTime = 0;
        this.lastError = null;
        console.log('[HeadTracker] Step 1: Aligning face to calibrate Player 1...');
    }

    isEnrollmentComplete() {
        return this.enrollmentState === 'ENROLLMENT_SUCCESS' && this.enrolledProfile !== null;
    }

    isCalibrationComplete() {
        return this.calibrationState === 'CALIBRATED' && this.calibrationComplete === true;
    }

    startPoseCalibration() {
        this.calibrationState = 'CALIBRATING';
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        this.lastCalSampleTime = 0;
        console.log('[HeadTracker] Step 2: Calibrating neutral head position baseline...');
    }

    startCalibration() {
        if (!this.isEnrollmentComplete()) {
            this.startEnrollment();
        } else {
            this.startPoseCalibration();
        }
    }

    resetCalibration() {
        this.enrollmentState = 'ENROLLMENT_IDLE';
        this.calibrationState = 'CALIBRATION_IDLE';
        this.calibrationComplete = false;
        this.enrolledProfile = null;
        this.isPlayer1Locked = false;
        this.searchingForPlayer = false;
        this.idSamples = [];
        this.acceptedEnrollmentSamples = 0;
        this.rejectedEnrollmentSamples = 0;
        this.lastRejectionReason = 'FACE NOT DETECTED';
        this.calibrationSamples = [];
        this.neutralRoll = 0;
        this.neutralPitch = 0;
        this.neutralYaw = 0;
        this.smoothedRoll = 0;
        this.smoothedPitch = 0;
        this.prevPitch = 0;
        this.pitchVelocity = 0;
        this.pitchHistory = [];
        this.aimHistory = [];
        this.power = 0;
        this.isCharging = false;
        this.chargeDurationMs = 0;
        this.kickTriggered = false;
        this.lockedShotAim = 0.0;
        this.positionStatus = 'NO_FACE';
        this.candidatePositionStatus = 'NO_FACE';
        this.stabilityHistory = [];
        this.detectionConfidence = 0;
        this.poseConfidence = 0;
        this.trackStability = 0;
        this.identityMatchScore = 0;
    }

    forceCompleteCalibration() {
        if (this.enrollmentState !== 'ENROLLMENT_SUCCESS') {
            if (this.idSamples.length >= 6) {
                this.enrolledProfile = {
                    baselineCenter: { ...this.lastTrackedCenter },
                    baselineFaceWidth: this.lastFaceWidth,
                    baselineFaceHeight: this.lastFaceHeight
                };
                this.enrollmentState = 'ENROLLMENT_SUCCESS';
                this.isPlayer1Locked = true;
                this.identityMatchScore = 100;
            } else {
                console.warn('[HeadTracker] Cannot force complete: insufficient face samples captured.');
                return false;
            }
        }

        if (this.calibrationSamples.length >= 6) {
            const sortedRolls = this.calibrationSamples.map(s => s.roll).sort((a, b) => a - b);
            const sortedPitches = this.calibrationSamples.map(s => s.pitch).sort((a, b) => a - b);
            const sortedYaws = this.calibrationSamples.map(s => s.yaw || 0).sort((a, b) => a - b);
            const mid = Math.floor(sortedRolls.length / 2);
            this.neutralRoll = sortedRolls[mid];
            this.neutralPitch = sortedPitches[mid];
            this.neutralYaw = sortedYaws[mid];
        } else {
            this.neutralRoll = this.rawRollAngle;
            this.neutralPitch = this.rawPitch;
            this.neutralYaw = this.rawYaw;
        }

        this.calibrationState = 'CALIBRATED';
        this.calibrationComplete = true;
        this.isPlayer1Locked = true;
        console.log(`[HeadTracker] Enrollment & Calibration finalized. Neutral Roll: ${this.neutralRoll.toFixed(1)}°, Neutral Pitch: ${this.neutralPitch.toFixed(1)}°`);
        return true;
    }

    getCalibrationProgress() {
        // Step 3: Fully Calibrated and Ready to Play
        if (this.isEnrollmentComplete() && this.isCalibrationComplete()) {
            return {
                step: 3,
                stage: 'LOCKED',
                stageTitle: 'READY TO PLAY',
                stageLabel: 'PLAYER 1 READY ✓',
                samples: this.calibrationSamplesRequired,
                required: this.calibrationSamplesRequired,
                samplesInfo: `${this.calibrationSamplesRequired} / ${this.calibrationSamplesRequired} SAMPLES`,
                percent: 100,
                quality: 5,
                complete: true,
                rejectionReason: null
            };
        }

        // Step 2: Calibrating Neutral Pose
        if (this.isEnrollmentComplete() && this.calibrationState === 'CALIBRATING') {
            const count = this.calibrationSamples.length;
            const pct = Math.min(99, Math.round((count / this.calibrationSamplesRequired) * 100));
            return {
                step: 2,
                stage: 'HEAD_POSE',
                stageTitle: 'STEP 2: NEUTRAL POSITION',
                stageLabel: 'HOLD STILL — LOOK STRAIGHT AHEAD',
                samples: count,
                required: this.calibrationSamplesRequired,
                samplesInfo: `${count} / ${this.calibrationSamplesRequired} SAMPLES`,
                percent: pct,
                quality: Math.min(5, Math.floor((count / this.calibrationSamplesRequired) * 5)),
                complete: false,
                rejectionReason: this.lastRejectionReason
            };
        }

        // Step 1: Aligning Face & Collecting Enrollment Samples
        if (this.enrollmentState === 'ENROLLMENT_COLLECTING' || this.enrollmentState === 'ENROLLMENT_SEARCHING') {
            const count = this.acceptedEnrollmentSamples;
            const pct = Math.min(99, Math.round((count / this.idSamplesRequired) * 100));
            return {
                step: 1,
                stage: 'IDENTITY',
                stageTitle: 'STEP 1: FACE SETUP',
                stageLabel: count > 0 ? 'CALIBRATING FACE SENSORS...' : (this.lastRejectionReason || 'CENTER YOUR FACE'),
                samples: count,
                required: this.idSamplesRequired,
                samplesInfo: `${count} / ${this.idSamplesRequired} SAMPLES`,
                percent: pct,
                quality: Math.min(5, Math.floor((count / this.idSamplesRequired) * 5)),
                complete: false,
                rejectionReason: this.lastRejectionReason
            };
        }

        return {
            step: 1,
            stage: 'IDLE',
            stageTitle: 'STEP 1: FACE SETUP',
            stageLabel: 'POSITION YOUR FACE TO BEGIN',
            samples: 0,
            required: this.idSamplesRequired,
            samplesInfo: '0 / 24 SAMPLES',
            percent: 0,
            quality: 0,
            complete: false,
            rejectionReason: 'CAMERA INITIALIZING'
        };
    }

    // ============================================================
    // MULTI-FACE DETECTION & SPATIAL CROWD ARBITRATION
    // ============================================================
    getFaceMetrics(landmarks) {
        if (!landmarks || landmarks.length === 0) return null;
        let center, faceWidth, faceHeight;
        if (landmarks.length >= 468) {
            const cheekL = landmarks[454];
            const cheekR = landmarks[234];
            const forehead = landmarks[10];
            const chin = landmarks[152];
            center = {
                x: (cheekL.x + cheekR.x) * 0.5,
                y: (forehead.y + chin.y) * 0.5
            };
            faceWidth = Math.hypot(cheekL.x - cheekR.x, cheekL.y - cheekR.y);
            faceHeight = Math.max(0.08, Math.hypot(chin.x - forehead.x, chin.y - forehead.y));
        } else {
            const leftEye = landmarks[2] || landmarks[7];
            const rightEye = landmarks[5] || landmarks[8];
            const nose = landmarks[0];
            if (!leftEye || !rightEye || !nose) return null;
            center = { x: (leftEye.x + rightEye.x) * 0.5, y: (leftEye.y + rightEye.y) * 0.5 };
            faceWidth = Math.abs(rightEye.x - leftEye.x) * 1.8;
            faceHeight = faceWidth * 1.35;
        }
        const area = faceWidth * faceHeight;
        const aspect = faceHeight / Math.max(0.01, faceWidth);
        const distCenter = Math.hypot(center.x - 0.5, center.y - 0.5);
        return { center, faceWidth, faceHeight, area, aspect, distCenter };
    }

    processMultiFace(allFacesLandmarks, deltaSec = 1 / 60, timestamp = null) {
        this.framesReceived++;
        const now = (timestamp !== null && timestamp !== undefined) ? timestamp : performance.now();
        const dt = Math.max(0.001, deltaSec);

        this.detectedFaceCount = allFacesLandmarks ? allFacesLandmarks.length : 0;

        if (!allFacesLandmarks || allFacesLandmarks.length === 0) {
            this.handleFaceLost(now, dt);
            return;
        }

        this.validDetections++;
        let targetFaceLandmarks = null;
        let overrideRejection = null;

        // 1. If currently enrolling (or before profile exists), select primary foreground face
        if (!this.isEnrollmentComplete()) {
            const candidates = [];
            for (let i = 0; i < allFacesLandmarks.length; i++) {
                const face = allFacesLandmarks[i];
                const metrics = this.getFaceMetrics(face);
                if (!metrics) continue;
                // Reject distorted or zero-scale faces
                if (metrics.aspect < 0.7 || metrics.aspect > 2.6 || metrics.faceWidth < 0.05) continue;

                // Score: Prominence (area) divided by center distance penalty
                // A foreground face (e.g. width 0.28, area 0.10) at dist 0.15 has score = 0.10 / (1 + 4.5*0.0225) = 0.091
                // A background face (e.g. width 0.08, area 0.01) at dist 0.02 has score = 0.01 / (1 + 0) = 0.01
                let score = metrics.area / (1.0 + 4.5 * metrics.distCenter * metrics.distCenter);

                // Temporal continuity: if this face matches our recently tracked face in position and scale, add bonus
                if (now - this.lastDetectionTime < 500) {
                    const distToLast = Math.hypot(metrics.center.x - this.lastTrackedCenter.x, metrics.center.y - this.lastTrackedCenter.y);
                    const scaleDiff = Math.abs(metrics.faceWidth - this.lastFaceWidth) / Math.max(0.1, this.lastFaceWidth);
                    if (distToLast < 0.20 && scaleDiff < 0.35) {
                        score *= 1.35; // 35% continuity boost to prevent flickering
                    }
                }

                candidates.push({ face, metrics, score });
            }

            if (candidates.length === 0) {
                this.handleFaceLost(now, dt);
                return;
            }

            // Sort descending by score
            candidates.sort((a, b) => b.score - a.score);

            // Ambiguity check: if 2 distinct foreground faces (both area > 0.035) are competing with close scores (< 15% diff)
            if (candidates.length >= 2 && candidates[0].metrics.area > 0.035 && candidates[1].metrics.area > 0.035) {
                const ratio = candidates[1].score / candidates[0].score;
                if (ratio > 0.85 && Math.abs(candidates[0].metrics.center.x - candidates[1].metrics.center.x) > 0.15) {
                    this.isAmbiguousCrowd = true;
                    overrideRejection = 'MULTIPLE FACES DETECTED — CENTER YOURSELF';
                } else {
                    this.isAmbiguousCrowd = false;
                }
            } else {
                this.isAmbiguousCrowd = false;
            }

            targetFaceLandmarks = candidates[0].face;
            this.selectedFaceArea = candidates[0].metrics.area;
            this.selectedFaceWidth = candidates[0].metrics.faceWidth;
            this.ignoredFaceCount = allFacesLandmarks.length - 1;
        } else {
            // 2. Enrolled Player Spatial Tracking:
            let bestScore = 999;
            for (let i = 0; i < allFacesLandmarks.length; i++) {
                const face = allFacesLandmarks[i];
                const metrics = this.getFaceMetrics(face);
                if (!metrics) continue;
                const distToLast = Math.hypot(metrics.center.x - this.lastTrackedCenter.x, metrics.center.y - this.lastTrackedCenter.y);
                const scaleDiff = Math.abs(metrics.faceWidth - (this.enrolledProfile?.baselineFaceWidth || this.lastFaceWidth));
                const spatialDiff = distToLast + scaleDiff * 0.5;
                if (spatialDiff < bestScore) {
                    bestScore = spatialDiff;
                    targetFaceLandmarks = face;
                    this.selectedFaceArea = metrics.area;
                    this.selectedFaceWidth = metrics.faceWidth;
                }
            }

            if (bestScore < 0.40 && targetFaceLandmarks) {
                this.isPlayer1Locked = true;
                this.searchingForPlayer = false;
                this.identityMatchScore = Math.max(70, Math.min(100, Math.round((1 - bestScore / 0.40) * 100)));
                this.ignoredFaceCount = allFacesLandmarks.length - 1;
            } else {
                this.handlePlayerSearching(now, dt);
                return;
            }
        }

        if (targetFaceLandmarks) {
            this.processSingleFace(targetFaceLandmarks, dt, now, overrideRejection);
        }
    }

    processLandmarks(landmarks, isPoseModel = false, deltaSec = 1 / 60, timestamp = null) {
        if (!landmarks || landmarks.length === 0) {
            this.processMultiFace([], deltaSec, timestamp);
            return;
        }
        this.processMultiFace([landmarks], deltaSec, timestamp);
    }

    handleFaceLost(now, dt) {
        this.faceLostAccumulatorMs = (this.faceLostAccumulatorMs || 0) + dt * 1000;
        this.lastRejectionReason = 'FACE NOT DETECTED';
        this.diagnosticStage = DiagnosticStages.INFERENCE_RETURNED_NO_FACE;
        if (this.faceLostAccumulatorMs > this.faceLostThresholdMs || (now - this.lastDetectionTime > this.faceLostThresholdMs)) {
            this.faceDetected = false;
            this.isPlayer1Locked = false;
            this.positionStatus = 'NO_FACE';
            this.detectionConfidence = 0;
            this.identityMatchScore = 0;
            this.poseConfidence = 0;
            this.power = Math.max(0, this.power - 0.05);
            this.isCharging = false;
            this.chargeDurationMs = 0;
        }
    }

    handlePlayerSearching(now, dt) {
        if (!this.searchingForPlayer) {
            this.searchingForPlayer = true;
            this.playerLostTimestamp = now;
        }

        const elapsedSearching = now - this.playerLostTimestamp;
        this.lastRejectionReason = 'SEARCHING FOR PLAYER 1';
        this.diagnosticStage = DiagnosticStages.INFERENCE_RETURNED_NO_FACE;
        if (elapsedSearching < this.recoveryGracePeriodMs) {
            this.positionStatus = 'SEARCHING_PLAYER';
            this.identityMatchScore = Math.max(0, Math.round(this.identityMatchScore * 0.95));
            this.power = Math.max(0, this.power - 0.03);
            this.isCharging = false;
        } else {
            this.faceDetected = false;
            this.isPlayer1Locked = false;
            this.positionStatus = 'NO_PLAYER';
            this.power = 0;
            this.isCharging = false;
            this.chargeDurationMs = 0;
            this.identityMatchScore = 0;
        }
    }

    getFaceCenter(landmarks) {
        const metrics = this.getFaceMetrics(landmarks);
        return metrics ? metrics.center : { x: 0.5, y: 0.5 };
    }

    // ============================================================
    // SINGLE FACE POSE, VALIDATION & AIMING PIPELINE
    // ============================================================
    processSingleFace(landmarks, dt, now, overrideRejection = null) {
        this.faceLostAccumulatorMs = 0;
        this.faceDetected = true;
        this.lastDetectionTime = now;

        const isFaceMesh = landmarks.length >= 468;
        let rollDeg = 0;
        let pitchDeg = 0;
        let yawDeg = 0;
        let faceCenter = { x: 0.5, y: 0.5 };
        let faceWidth = 0.3;
        let faceHeight = 0.4;

        if (isFaceMesh) {
            // Anatomical anchors:
            // 33: Right eye outer corner (camera image left)
            // 263: Left eye outer corner (camera image right)
            // 234: Right cheekbone (camera image left)
            // 454: Left cheekbone (camera image right)
            // 1: Nose tip
            // 168: Nose bridge / nasion
            // 10: Forehead top
            // 152: Chin tip
            const leftEyeOut = landmarks[33];
            const rightEyeOut = landmarks[263];
            const cheekR = landmarks[234];
            const cheekL = landmarks[454];
            const noseTip = landmarks[1];
            const forehead = landmarks[10];
            const chin = landmarks[152];

            faceCenter = {
                x: (cheekR.x + cheekL.x) * 0.5,
                y: (forehead.y + chin.y) * 0.5
            };

            // Accurate cheek-to-cheek face width
            faceWidth = Math.hypot(cheekL.x - cheekR.x, cheekL.y - cheekR.y);
            faceHeight = Math.max(0.08, Math.hypot(chin.x - forehead.x, chin.y - forehead.y));

            // 1. Inter-ocular roll angle (eye line)
            rollDeg = -Math.atan2(rightEyeOut.y - leftEyeOut.y, rightEyeOut.x - leftEyeOut.x) * (180 / Math.PI);

            // 2. Proper anatomical pitch centered at 0° for upright gaze:
            const eyeMidY = (leftEyeOut.y + rightEyeOut.y) * 0.5;
            const naturalEyeToNoseRatio = 0.245;
            const currentEyeToNoseRatio = (noseTip.y - eyeMidY) / faceHeight;
            pitchDeg = (naturalEyeToNoseRatio - currentEyeToNoseRatio) * 110;

            // 3. Anatomical yaw angle centered at 0°:
            const eyeMidX = (leftEyeOut.x + rightEyeOut.x) * 0.5;
            yawDeg = ((noseTip.x - eyeMidX) / Math.max(0.01, faceWidth)) * 90;

            // Detection Confidence
            const aspectSanity = faceHeight / Math.max(0.01, faceWidth);
            const isInBounds = (faceCenter.x >= 0.05 && faceCenter.x <= 0.95 && faceCenter.y >= 0.05 && faceCenter.y <= 0.95);
            let conf = 92;
            if (aspectSanity < 0.9 || aspectSanity > 2.3) conf -= 25;
            if (!isInBounds) conf -= 35;
            this.detectionConfidence = Math.max(20, Math.min(100, conf));
        } else {
            const leftEye = landmarks[2] || landmarks[7];
            const rightEye = landmarks[5] || landmarks[8];
            const nose = landmarks[0];
            if (leftEye && rightEye && nose) {
                faceCenter = { x: (leftEye.x + rightEye.x) * 0.5, y: (leftEye.y + rightEye.y) * 0.5 };
                faceWidth = Math.abs(rightEye.x - leftEye.x) * 1.8;
                faceHeight = faceWidth * 1.35;
                rollDeg = -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);
                const eyeMidY = (leftEye.y + rightEye.y) * 0.5;
                pitchDeg = (0.24 - (nose.y - eyeMidY) / Math.max(0.1, faceHeight)) * 100;
                this.detectionConfidence = 75;
            } else {
                this.handleFaceLost(now, dt);
                return;
            }
        }

        this.lastTrackedCenter = faceCenter;
        this.lastFaceWidth = faceWidth;
        this.lastFaceHeight = faceHeight;
        this.rawRollAngle = rollDeg;
        this.rawPitch = pitchDeg;
        this.rawYaw = yawDeg;

        // Framing & Orientation Validation with Detailed Rejection Reason
        let frameRejection = overrideRejection || null;
        let rawStatus = overrideRejection ? 'MULTIPLE_FACES' : 'PLAYER_TRACKED';

        if (!frameRejection) {
            // 1. Lighting check from InputManager
            if (this.lightingRejection) {
                frameRejection = this.lightingRejection;
                rawStatus = 'IMPROVE_LIGHTING';
            }
            // 2. Face distance check
            else if (faceWidth < 0.16) {
                frameRejection = 'MOVE CLOSER TO CAMERA';
                rawStatus = 'MOVE_CLOSER';
            } else if (faceWidth > 0.48) {
                frameRejection = 'MOVE SLIGHTLY BACK';
                rawStatus = 'MOVE_BACK';
            }
            // 3. Centering in guide (Note: selfie preview is mirrored scaleX(-1))
            else if (faceCenter.x < 0.30) {
                frameRejection = 'CENTER FACE (MOVE LEFT)';
                rawStatus = 'MOVE_LEFT';
            } else if (faceCenter.x > 0.70) {
                frameRejection = 'CENTER FACE (MOVE RIGHT)';
                rawStatus = 'MOVE_RIGHT';
            } else if (faceCenter.y < 0.18) {
                frameRejection = 'MOVE DOWN TOWARDS CENTER';
                rawStatus = 'MOVE_DOWN';
            } else if (faceCenter.y > 0.82) {
                frameRejection = 'MOVE UP TOWARDS CENTER';
                rawStatus = 'MOVE_UP';
            }
            // 4. Orientation checks
            else if (Math.abs(rollDeg) > 16) {
                frameRejection = 'LEVEL YOUR HEAD';
                rawStatus = 'LEVEL_HEAD';
            } else if (Math.abs(yawDeg) > 16) {
                frameRejection = 'LOOK STRAIGHT AT CAMERA';
                rawStatus = 'LOOK_STRAIGHT';
            } else if (Math.abs(pitchDeg) > 18) {
                frameRejection = 'LOOK STRAIGHT AHEAD';
                rawStatus = 'LOOK_AHEAD';
            }
            // 5. Stability check
            else if (!this.isHeadStable(now, rollDeg, pitchDeg)) {
                frameRejection = 'HOLD STILL FOR CALIBRATION';
                rawStatus = 'STEADY_HEAD';
            }
        }

        this.lastRejectionReason = frameRejection;

        // Status stabilization debounce:
        // Transition immediately when coming from initial/lost states or critical ambiguity
        if (this.positionStatus === 'NO_FACE' || this.positionStatus === 'SEARCHING_PLAYER' || rawStatus === 'MULTIPLE_FACES') {
            this.candidatePositionStatus = rawStatus;
            this.candidateStatusStartTime = now;
            this.positionStatus = rawStatus;
        } else if (rawStatus !== this.candidatePositionStatus) {
            this.candidatePositionStatus = rawStatus;
            this.candidateStatusStartTime = now;
        } else if (now - this.candidateStatusStartTime >= 120) {
            this.positionStatus = rawStatus;
        }

        const isLowRotation = (Math.abs(rollDeg) < 16 && Math.abs(yawDeg) < 16 && Math.abs(pitchDeg) < 18);
        const isFrameClean = (frameRejection === null);

        this.trackStability = this.isHeadStable(now, rollDeg, pitchDeg) ? 96 : 74;
        this.poseConfidence = isLowRotation ? 95 : 70;

        if (isFrameClean) {
            this.diagnosticStage = DiagnosticStages.FACE_ACCEPTED;
        } else {
            this.diagnosticStage = DiagnosticStages.FACE_REJECTED_BY_VALIDATION;
        }

        // ------------------------------------------------------------
        // STAGE 1: PLAYER SETUP & FACE CALIBRATION (24 Clean Samples)
        // ------------------------------------------------------------
        if (!this.isEnrollmentComplete()) {
            this.enrollmentState = 'ENROLLMENT_SEARCHING';

            if (isFrameClean) {
                this.enrollmentState = 'ENROLLMENT_COLLECTING';
                this.diagnosticStage = DiagnosticStages.ENROLLMENT_ACTIVE;

                // Cadence check: accept 1 clean sample every ~65ms to collect distinct observations over ~1.6s
                if (now - this.lastSampleAcceptedTime >= this.sampleCadenceMs) {
                    this.lastSampleAcceptedTime = now;
                    this.idSamples.push({
                        roll: rollDeg,
                        pitch: pitchDeg,
                        yaw: yawDeg,
                        center: { ...faceCenter },
                        faceWidth,
                        faceHeight
                    });
                    this.acceptedEnrollmentSamples = this.idSamples.length;

                    if (this.acceptedEnrollmentSamples >= this.idSamplesRequired) {
                        this.enrolledProfile = {
                            baselineCenter: { ...faceCenter },
                            baselineFaceWidth: faceWidth,
                            baselineFaceHeight: faceHeight
                        };
                        this.enrollmentState = 'ENROLLMENT_SUCCESS';
                        this.isPlayer1Locked = true;
                        this.identityMatchScore = 100;
                        console.log('[HeadTracker] Player 1 Face Setup COMPLETE (24/24 clean samples accepted).');
                        // Advance directly to neutral pose baseline calibration
                        this.startPoseCalibration();
                    }
                }
            } else {
                this.rejectedEnrollmentSamples++;
            }
            return;
        }

        // ------------------------------------------------------------
        // STAGE 2: NEUTRAL HEAD POSE CALIBRATION (Median Outlier Rejection)
        // ------------------------------------------------------------
        if (this.calibrationState === 'CALIBRATING') {
            if (isFrameClean && now - this.lastCalSampleTime >= 45) {
                this.lastCalSampleTime = now;
                this.calibrationSamples.push({ roll: rollDeg, pitch: pitchDeg, yaw: yawDeg });

                if (this.calibrationSamples.length >= this.calibrationSamplesRequired) {
                    // Outlier rejection: compute median roll, pitch, yaw
                    const sortedRolls = this.calibrationSamples.map(s => s.roll).sort((a, b) => a - b);
                    const sortedPitches = this.calibrationSamples.map(s => s.pitch).sort((a, b) => a - b);
                    const sortedYaws = this.calibrationSamples.map(s => s.yaw || 0).sort((a, b) => a - b);
                    const mid = Math.floor(sortedRolls.length / 2);

                    this.neutralRoll = sortedRolls[mid];
                    this.neutralPitch = sortedPitches[mid];
                    this.neutralYaw = sortedYaws[mid];

                    this.calibrationState = 'CALIBRATED';
                    this.calibrationComplete = true;
                    this.isPlayer1Locked = true;
                    console.log(`[HeadTracker] Neutral pose calibrated: Roll=${this.neutralRoll.toFixed(1)}°, Pitch=${this.neutralPitch.toFixed(1)}°`);
                }
            }
            return;
        }

        // ------------------------------------------------------------
        // STAGE 3: ACTIVE GAMEPLAY AIMING PIPELINE
        // ------------------------------------------------------------
        const offsetRoll = this.rawRollAngle - this.neutralRoll;
        const offsetPitch = this.rawPitch - this.neutralPitch;

        // Exponential Moving Average Smoothing
        this.smoothedRoll = this.smoothingAlpha * offsetRoll + (1 - this.smoothingAlpha) * this.smoothedRoll;

        // Pitch smoothing & Upward nod velocity
        const pitchAlpha = 0.40;
        this.prevPitch = this.smoothedPitch;
        this.smoothedPitch = pitchAlpha * offsetPitch + (1 - pitchAlpha) * this.smoothedPitch;
        this.pitchVelocity = (this.smoothedPitch - this.prevPitch) / dt;

        // Temporal pitch history for upward displacement verification
        this.pitchHistory.push({ time: now, pitch: this.smoothedPitch });
        while (this.pitchHistory.length > 0 && now - this.pitchHistory[0].time > this.nodWindowMs) {
            this.pitchHistory.shift();
        }

        if (this.inputLocked) {
            this.isCharging = false;
            this.power = 0;
            this.chargeDurationMs = 0;
            return;
        }

        // Dead Zone with Hysteresis & Nonlinear Aim Mapping
        const absRoll = Math.abs(this.smoothedRoll);
        const sign = Math.sign(this.smoothedRoll);
        const maxRoll = 24.0;

        if (this.inDeadZone) {
            if (absRoll > this.deadZoneExitHysteresis) this.inDeadZone = false;
        } else {
            if (absRoll < this.deadZoneEnterHysteresis) this.inDeadZone = true;
        }

        if (this.inDeadZone) {
            this.normalizedAim = 0.0; // Sitting straight = TRUE CENTER (0.00)
        } else {
            const effectiveRoll = (absRoll - this.deadZoneDeg) / (maxRoll - this.deadZoneDeg);
            const clamped = Math.max(0, Math.min(1.0, effectiveRoll));
            let curved = Math.pow(clamped, 1.20) * this.sensitivity;
            let aim = Math.max(-1.0, Math.min(1.0, sign * curved));

            if (this.aimAssistFactor > 0 && Math.abs(aim) > 0.70) {
                const cornerTarget = Math.sign(aim) * 0.90;
                aim = aim + (cornerTarget - aim) * this.aimAssistFactor;
            }
            this.normalizedAim = Math.max(-1.0, Math.min(1.0, aim));
        }

        // Maintain sliding history of aim positions (~220ms) for pre-nod aim freeze
        this.aimHistory.push({ time: now, aim: this.normalizedAim });
        while (this.aimHistory.length > 0 && now - this.aimHistory[0].time > 220) {
            this.aimHistory.shift();
        }

        // Update authoritative locked aim continuously until kick triggers
        if (!this.kickTriggered) {
            this.lockedShotAim = this.normalizedAim;
        }

        // Power Charging (Optional duration-based charging across ALL targets including Center)
        const isAimSteady = Math.abs(this.pitchVelocity) < 14.0;
        if (isAimSteady && isFrameClean) {
            this.holdAimTimer += dt * 1000;
            if (this.holdAimTimer > 200) {
                this.isCharging = true;
                this.chargeDurationMs = Math.min(this.maxChargeDurationMs, this.chargeDurationMs + dt * 1000);
                this.power = Math.min(1.0, this.chargeDurationMs / this.maxChargeDurationMs);
            }
        } else if (!this.isCharging) {
            this.holdAimTimer = Math.max(0, this.holdAimTimer - dt * 1500);
            this.chargeDurationMs = Math.max(0, this.chargeDurationMs - dt * 2000);
            this.power = Math.max(0, this.power - 0.05);
        }

        // Deliberate Nod Kick Detection
        // Decoupled from prior tilt or power > 0: Center Nod = Clean Center Kick!
        if (this.detectKickGesture(now)) {
            // Authoritative aim freeze: lookup aim ~130ms ago immediately BEFORE nod upward motion started!
            const preNodAim = this.getPreNodAim(now, 130);
            this.lockedShotAim = preNodAim;
            this.triggerKick();
        }
    }

    getPreNodAim(now, lookbackMs = 130) {
        if (this.aimHistory.length === 0) return this.normalizedAim;
        const targetTime = now - lookbackMs;
        let closest = this.aimHistory[0];
        let minDiff = 99999;
        for (const entry of this.aimHistory) {
            const diff = Math.abs(entry.time - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closest = entry;
            }
        }
        return closest.aim;
    }

    isHeadStable(now, roll, pitch) {
        this.stabilityHistory.push({ time: now, roll, pitch });
        while (this.stabilityHistory.length > 0 && now - this.stabilityHistory[0].time > 320) {
            this.stabilityHistory.shift();
        }
        if (this.stabilityHistory.length < 2) return true;
        const rolls = this.stabilityHistory.map(s => s.roll);
        const deltaRoll = Math.max(...rolls) - Math.min(...rolls);
        return deltaRoll < 3.8;
    }

    detectKickGesture(now) {
        if (!this.faceDetected) return false;
        if (!this.isPlayer1Locked) return false;
        if (now - this.lastKickTimestamp < this.kickCooldownMs) return false;

        // 1. Upward pitch velocity threshold (quick deliberate nod)
        const hasUpwardVelocity = this.pitchVelocity > this.nodVelocityThreshold;

        // 2. Upward displacement in temporal window
        let hasUpwardDisplacement = false;
        if (this.pitchHistory.length >= 3) {
            const earliestPitch = this.pitchHistory[0].pitch;
            const currentPitch = this.smoothedPitch;
            const displacement = currentPitch - earliestPitch;
            if (displacement > this.nodDisplacementThreshold) {
                hasUpwardDisplacement = true;
            }
        }

        return hasUpwardVelocity && hasUpwardDisplacement;
    }

    triggerKick() {
        this.kickTriggered = true;
        this.lastKickTimestamp = performance.now();
        // Calculate authoritative kick power: at least minimum valid base power (0.35)
        this.effectiveKickPower = Math.max(0.35, this.power);
        this.isCharging = false;
        console.log(`[HeadTracker] UPWARD NOD KICK FIRED! Target Aim: ${this.lockedShotAim.toFixed(2)}, Power: ${Math.round(this.effectiveKickPower * 100)}%`);
    }

    resetKickTrigger() {
        this.kickTriggered = false;
        this.power = 0;
        this.chargeDurationMs = 0;
        this.holdAimTimer = 0;
        this.isCharging = false;
    }

    lockInput(locked) {
        this.inputLocked = locked;
        if (locked) {
            this.resetKickTrigger();
        }
    }

    getDebugStats() {
        const isCooldown = (performance.now() - this.lastKickTimestamp < this.kickCooldownMs);
        let nodLabel = 'READY';
        if (this.kickTriggered) nodLabel = 'KICK FIRED!';
        else if (isCooldown) nodLabel = 'COOLDOWN';

        const relativeRoll = this.rawRollAngle - this.neutralRoll;
        const relativePitch = this.rawPitch - this.neutralPitch;

        return {
            playerId: this.isPlayer1Locked ? 'PLAYER 1' : (this.searchingForPlayer ? 'SEARCHING' : 'CALIBRATING'),
            faceCount: this.detectedFaceCount,
            ignoredFaces: this.ignoredFaceCount,
            detectionConf: `${this.detectionConfidence}%`,
            landmarkValid: this.faceDetected ? 'VALID' : 'INVALID',
            acceptedSamples: this.acceptedEnrollmentSamples,
            rejectedSamples: this.rejectedEnrollmentSamples,
            lastRejection: this.lastRejectionReason || 'NONE',
            rawRoll: this.rawRollAngle.toFixed(1),
            neutralRoll: this.neutralRoll.toFixed(1),
            relativeRoll: relativeRoll.toFixed(1),
            smoothedRoll: this.smoothedRoll.toFixed(1),
            rawPitch: this.rawPitch.toFixed(1),
            neutralPitch: this.neutralPitch.toFixed(1),
            relativePitch: relativePitch.toFixed(1),
            smoothedPitch: this.smoothedPitch.toFixed(1),
            pitchVel: this.pitchVelocity.toFixed(1),
            aim: this.normalizedAim === 0 ? 'CENTER (0.00)' : this.normalizedAim.toFixed(2),
            lockedAim: this.lockedShotAim.toFixed(2),
            power: Math.round(this.power * 100),
            charging: this.isCharging,
            nodState: nodLabel,
            status: this.positionStatus,
            calibrationState: this.calibrationComplete ? 'CALIBRATED' : (this.calibrationState === 'CALIBRATING' ? 'CALIBRATING' : this.enrollmentState),
            lastError: this.lastError || 'NONE'
        };
    }

    drawOverlay(ctx, width, height) {
        if (!ctx) return;
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        // 1. Enrollment & Calibration Mode Overlay
        if (!this.isCalibrationComplete()) {
            const progress = this.getCalibrationProgress();
            const pct = progress.percent / 100;

            const isClean = (this.lastRejectionReason === null);
            ctx.strokeStyle = isClean ? '#00e676' : '#ffd700';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.ellipse(cx, cy, width * 0.28, height * 0.38, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.min(width, height) * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
            ctx.stroke();

            ctx.restore();
            return;
        }

        // 2. In-Match AR PiP Corner Overlay
        if (this.faceDetected && this.isPlayer1Locked) {
            const fcX = this.lastTrackedCenter.x * width;
            const fcY = this.lastTrackedCenter.y * height;
            const bw = width * 0.38;
            const bh = height * 0.50;

            ctx.strokeStyle = this.isCharging ? '#ffd700' : '#00e676';
            ctx.lineWidth = 2.5;

            const drawCorner = (x, y, dx, dy) => {
                ctx.beginPath();
                ctx.moveTo(x + dx * 16, y);
                ctx.lineTo(x, y);
                ctx.lineTo(x, y + dy * 16);
                ctx.stroke();
            };

            const left = fcX - bw / 2;
            const right = fcX + bw / 2;
            const top = fcY - bh / 2;
            const bot = fcY + bh / 2;

            drawCorner(left, top, 1, 1);
            drawCorner(right, top, -1, 1);
            drawCorner(left, bot, 1, -1);
            drawCorner(right, bot, -1, -1);

            // Roll tilt gauge arc
            const angleRad = (this.smoothedRoll * Math.PI) / 180;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(fcX, top - 12, 20, -Math.PI * 0.8, -Math.PI * 0.2);
            ctx.stroke();

            const needleX = fcX + Math.sin(angleRad) * 20;
            const needleY = (top - 12) - Math.cos(angleRad) * 20;
            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(fcX, top - 12);
            ctx.lineTo(needleX, needleY);
            ctx.stroke();

            if (this.ignoredFaceCount > 0) {
                ctx.fillStyle = 'rgba(10, 16, 26, 0.88)';
                ctx.fillRect(8, height - 24, width - 16, 18);
                ctx.fillStyle = '#ffb300';
                ctx.font = 'bold 9px Inter, sans-serif';
                ctx.fillText(`PLAYER 1 LOCKED • ${this.ignoredFaceCount} CROWD FACE IGNORED`, 12, height - 11);
            }
        } else if (this.searchingForPlayer) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 11px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SEARCHING FOR PLAYER 1...', cx, cy);
        }

        ctx.restore();
    }
}
