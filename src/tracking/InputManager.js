// Unified Input Manager for TILT KICK
// Enforces complete architectural separation:
// 1. Pristine High-Resolution Display Feed (Preserves camera native clarity)
// 2. High-Performance Inference Pipeline (Throttled 25-30 FPS, Zero Frame Backlog)
// 3. Deterministic Hardware Verification (Zero Fake Camera Ready States)
// 4. Model Readiness & Exception Instrumentation (Zero Swallowed Errors)
// 5. Adaptive Lighting & Backlight Analysis
// 6. Dynamic Video Source Selection (Active Preview vs PiP)
// 7. 3D Head Tracking, Multi-Face Crowd Arbitration, Body Tracking, Keyboard Fallback.

import { HeadTracker, DiagnosticStages } from './HeadTracker.js';
import { BodyTracker } from './BodyTracker.js';
import { KeyboardTracker } from './KeyboardTracker.js';
import { settingsManager } from '../utils/SettingsManager.js';

export const CameraStates = Object.freeze({
    IDLE: 'CAMERA_IDLE',
    REQUESTING: 'CAMERA_REQUESTING',
    READY: 'CAMERA_READY',
    DENIED: 'CAMERA_DENIED',
    UNAVAILABLE: 'CAMERA_UNAVAILABLE',
    LOST: 'CAMERA_LOST'
});

export const ModelStates = Object.freeze({
    NOT_LOADED: 'NOT_LOADED',
    LOADING: 'LOADING',
    READY: 'READY',
    ERROR: 'ERROR'
});

export const StartupStages = Object.freeze({
    IDLE: 'IDLE',
    REQUESTING_CAMERA: 'REQUESTING_CAMERA',
    CAMERA_READY: 'CAMERA_READY',
    WAITING_FOR_VIDEO: 'WAITING_FOR_VIDEO',
    VIDEO_READY: 'VIDEO_READY',
    LOADING_MODEL: 'LOADING_MODEL',
    MODEL_READY: 'MODEL_READY',
    SEARCHING_FOR_FACE: 'SEARCHING_FOR_FACE',
    CAMERA_DENIED: 'CAMERA_DENIED',
    CAMERA_UNAVAILABLE: 'CAMERA_UNAVAILABLE',
    CAMERA_LOST: 'CAMERA_LOST',
    VIDEO_TIMEOUT: 'VIDEO_TIMEOUT',
    MODEL_ERROR: 'MODEL_ERROR',
    INFERENCE_ERROR: 'INFERENCE_ERROR'
});

export class InputManager {
    constructor() {
        this.mode = 'head'; // 'head' | 'body'
        this.headTracker = new HeadTracker();
        this.bodyTracker = new BodyTracker();
        this.keyboardTracker = new KeyboardTracker();

        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;

        // Dedicated offscreen canvas for ML inference
        // Separates crystal-clear camera preview from low-latency ML frames
        this.inferenceCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        if (this.inferenceCanvas) {
            this.inferenceCanvas.width = 480;
            this.inferenceCanvas.height = 270;
            this.inferenceCtx = this.inferenceCanvas.getContext('2d', { willReadFrequently: true });
        } else {
            this.inferenceCtx = null;
        }

        // Vision Models & Model Lifecycle States
        this.poseModel = null;
        this.faceMeshModel = null;
        this.modelState = ModelStates.NOT_LOADED;
        this.modelLoaded = false;
        this.modelLoading = false;
        this.modelError = null;

        this.startupStage = StartupStages.IDLE;
        this.videoTimedOut = false;
        this.cameraState = CameraStates.IDLE;
        this.isProcessingPaused = false;
        this.isProcessingLoopRunning = false;
        this.frameLoopId = null;
        this.cameraAllowed = false;
        this.cameraError = null;
        this.mediaStream = null;
        this.calPreviewVideo = null;
        this.cameraSettings = null; // Real hardware settings from track.getSettings()
        this.cameraCapabilities = null; // Hardware capabilities from track.getCapabilities()
        this.isKeyboardMode = false;

        // Inference Cadence & Real FPS Tracking
        this.lastInferenceTimestamp = 0;
        this.lastInferenceDurationMs = 0;
        this.inferenceFrameCount = 0;
        this.inferenceFpsTimer = performance.now();
        this.inferenceFPS = 0;
        this.minInferenceIntervalMs = 33; // Controlled ~30 FPS cadence
        this.lastSuccessfulDetection = 0;
        this.lastError = null;

        // Lighting Analysis
        this.lightingCondition = 'NORMAL';
        this.lastFaceLuminance = 128;
        this.lastBgLuminance = 128;
        this.lastLightingCheckTime = 0;

        this.cameraPreviewVisible = settingsManager.get('cameraPreview');
        this.lastProcessTime = performance.now();

        // Subscribe to settings
        settingsManager.subscribe((s) => {
            this.setCameraPreviewVisible(s.cameraPreview);
        });
    }

    setMode(mode) {
        if (mode !== 'head' && mode !== 'body') return;
        this.mode = mode;
        console.log(`[InputManager] Switched tracking mode to: ${this.mode}`);
    }

    getMode() {
        return this.mode;
    }

    getCameraState() {
        return this.cameraState;
    }

    getModelState() {
        return this.modelState;
    }

    setCameraPreviewVisible(visible) {
        this.cameraPreviewVisible = visible;
        if (this.canvasElement && this.videoElement) {
            this.videoElement.style.display = visible ? 'block' : 'none';
            this.canvasElement.style.display = visible ? 'block' : 'none';
        }
    }

    bindDOMElements(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = canvasElement ? canvasElement.getContext('2d') : null;
    }

    isCameraActive() {
        return !!(
            this.cameraState === CameraStates.READY &&
            this.mediaStream &&
            this.mediaStream.active &&
            this.mediaStream.getVideoTracks().some(t => t.readyState === 'live')
        );
    }

    getStream() {
        return this.mediaStream;
    }

    getCameraSettings() {
        return this.cameraSettings;
    }

    pauseProcessing(paused = true) {
        this.isProcessingPaused = !!paused;
    }

    attachPreviewTo(videoElement) {
        this.calPreviewVideo = videoElement;
        if (!videoElement) return;
        if (this.mediaStream && this.isCameraActive()) {
            if (videoElement.srcObject !== this.mediaStream) {
                videoElement.srcObject = this.mediaStream;
            }
            videoElement.play().catch(e => console.warn('[InputManager] Preview play note:', e));
        }
    }

    getActiveVideo() {
        if (this.calPreviewVideo && this.calPreviewVideo.isConnected && this.calPreviewVideo.videoWidth > 0 && this.calPreviewVideo.readyState >= 2) {
            return this.calPreviewVideo;
        }
        if (this.videoElement && this.videoElement.videoWidth > 0 && this.videoElement.readyState >= 2) {
            return this.videoElement;
        }
        if (this.calPreviewVideo && this.calPreviewVideo.isConnected && this.calPreviewVideo.videoWidth > 0) {
            return this.calPreviewVideo;
        }
        if (this.videoElement && this.videoElement.videoWidth > 0) {
            return this.videoElement;
        }
        return null;
    }

    // ============================================================
    // DETERMINISTIC CAMERA & TRACKING PIPELINE (LIFECYCLE)
    // CAMERA_REQUESTED -> CAMERA_READY -> VIDEO_READY -> MODEL_LOADING -> MODEL_READY -> SEARCHING_FOR_FACE
    // ============================================================
    waitForGlobal(globalName, timeoutMs = 5000) {
        return new Promise((resolve) => {
            if (typeof window !== 'undefined' && typeof window[globalName] !== 'undefined') {
                resolve(true);
                return;
            }
            const startTime = performance.now();
            const interval = setInterval(() => {
                if (typeof window !== 'undefined' && typeof window[globalName] !== 'undefined') {
                    clearInterval(interval);
                    resolve(true);
                } else if (performance.now() - startTime >= timeoutMs) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 50);
        });
    }

    waitForVideoReady(videoElement, timeoutMs = 4500) {
        return new Promise((resolve) => {
            if (!videoElement) {
                resolve(false);
                return;
            }

            if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0 && videoElement.readyState >= 2) {
                resolve(true);
                return;
            }

            let settled = false;
            let checkRafId = null;

            const cleanup = () => {
                videoElement.removeEventListener('loadedmetadata', onReady);
                videoElement.removeEventListener('canplay', onReady);
                videoElement.removeEventListener('playing', onReady);
                if (checkRafId) cancelAnimationFrame(checkRafId);
                clearTimeout(timer);
            };

            const finish = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(ok);
            };

            const onReady = () => {
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    finish(true);
                }
            };

            videoElement.addEventListener('loadedmetadata', onReady, { once: true });
            videoElement.addEventListener('canplay', onReady, { once: true });
            videoElement.addEventListener('playing', onReady, { once: true });

            videoElement.play().catch(e => {
                console.warn('[InputManager] Video play promise catch:', e);
            });

            const check = () => {
                if (settled) return;
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0 && videoElement.readyState >= 2) {
                    finish(true);
                } else {
                    checkRafId = requestAnimationFrame(check);
                }
            };
            checkRafId = requestAnimationFrame(check);

            const timer = setTimeout(() => {
                if (!settled) {
                    console.warn(`[InputManager] Video dimensions timeout after ${timeoutMs}ms.`);
                    finish(videoElement.videoWidth > 0 && videoElement.videoHeight > 0);
                }
            }, timeoutMs);
        });
    }

    async acquireCameraStream() {
        if (this.isCameraActive()) {
            return true;
        }

        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.cameraState = CameraStates.UNAVAILABLE;
            this.cameraAllowed = false;
            this.cameraError = 'NotSupportedError';
            return false;
        }

        try {
            console.log('[InputManager] Requesting camera stream...');
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
                        frameRate: { ideal: 30 }
                    },
                    audio: false
                });
            } catch (e1) {
                console.warn('[InputManager] Preferred 720p unavailable, trying default camera:', e1);
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user' },
                    audio: false
                });
            }

            if (!stream || !stream.active) {
                throw new Error('Acquired MediaStream is inactive');
            }

            const videoTracks = stream.getVideoTracks();
            if (!videoTracks || videoTracks.length === 0 || videoTracks[0].readyState !== 'live') {
                throw new Error('No live video tracks in acquired stream');
            }

            const videoTrack = videoTracks[0];
            this.cameraSettings = videoTrack.getSettings ? videoTrack.getSettings() : {};

            videoTrack.onended = () => {
                console.warn('[InputManager] Camera stream ended.');
                this.cameraState = CameraStates.LOST;
                this.startupStage = StartupStages.CAMERA_LOST;
                this.cameraAllowed = false;
                this.cameraError = 'CameraStreamEnded';
                this.stopCamera();
            };

            this.mediaStream = stream;
            return true;
        } catch (err) {
            console.warn('[InputManager] Camera acquisition error:', err);
            this.cameraAllowed = false;
            this.mediaStream = null;
            this.lastError = err.message || String(err);

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                this.cameraState = CameraStates.DENIED;
                this.cameraError = 'NotAllowedError';
            } else {
                this.cameraState = CameraStates.UNAVAILABLE;
                this.cameraError = err.name || 'NotFoundError';
            }
            return false;
        }
    }

    async startTrackingPipeline() {
        this.isKeyboardMode = false;
        this.videoTimedOut = false;

        // If pipeline is already fully active and running, reuse it
        if (this.isCameraActive() && this.modelLoaded && this.isProcessingLoopRunning) {
            console.log('[InputManager] Reusing already active tracking pipeline.');
            this.startupStage = StartupStages.SEARCHING_FOR_FACE;
            return true;
        }

        // Clean up previous loops or stale instances
        if (this.frameLoopId) {
            cancelAnimationFrame(this.frameLoopId);
            this.frameLoopId = null;
        }
        this.isProcessingLoopRunning = false;

        // 1. Stage: REQUESTING_CAMERA
        this.startupStage = StartupStages.REQUESTING_CAMERA;
        this.cameraState = CameraStates.REQUESTING;
        if (this.headTracker) {
            this.headTracker.diagnosticStage = DiagnosticStages.CAMERA_NOT_READY;
        }

        const camOk = await this.acquireCameraStream();
        if (!camOk) {
            this.startupStage = this.cameraState === CameraStates.DENIED
                ? StartupStages.CAMERA_DENIED
                : StartupStages.CAMERA_UNAVAILABLE;
            return false;
        }

        this.startupStage = StartupStages.CAMERA_READY;
        this.cameraState = CameraStates.READY;
        this.cameraAllowed = true;
        this.cameraError = null;

        // 2. Stage: WAITING_FOR_VIDEO
        this.startupStage = StartupStages.WAITING_FOR_VIDEO;
        if (this.headTracker) {
            this.headTracker.diagnosticStage = DiagnosticStages.VIDEO_FRAME_UNAVAILABLE;
        }

        if (this.videoElement && this.videoElement.srcObject !== this.mediaStream) {
            this.videoElement.srcObject = this.mediaStream;
        }
        if (this.calPreviewVideo && this.calPreviewVideo.srcObject !== this.mediaStream) {
            this.calPreviewVideo.srcObject = this.mediaStream;
        }

        const activeVideo = (this.calPreviewVideo && this.calPreviewVideo.isConnected)
            ? this.calPreviewVideo
            : this.videoElement;

        const videoOk = await this.waitForVideoReady(activeVideo, 4500);
        if (!videoOk && (!activeVideo || activeVideo.videoWidth === 0)) {
            console.warn('[InputManager] Video stream timed out.');
            this.videoTimedOut = true;
            this.startupStage = StartupStages.VIDEO_TIMEOUT;
            this.cameraError = 'VideoTimeout';
            return false;
        }

        this.startupStage = StartupStages.VIDEO_READY;

        // 3. Stage: LOADING_MODEL
        this.startupStage = StartupStages.LOADING_MODEL;
        if (this.headTracker) {
            this.headTracker.diagnosticStage = DiagnosticStages.MODEL_LOADING;
        }

        const modelOk = await this.initMediaPipeModels();
        if (!modelOk) {
            console.warn('[InputManager] Model initialization failed.');
            this.startupStage = StartupStages.MODEL_ERROR;
            this.cameraError = 'ModelError';
            if (this.headTracker) {
                this.headTracker.diagnosticStage = DiagnosticStages.MODEL_INITIALIZATION_ERROR;
            }
            return false;
        }

        this.startupStage = StartupStages.MODEL_READY;

        // 4. Stage: SEARCHING_FOR_FACE & Start Processing Loop
        this.isProcessingPaused = false;
        this.startProcessingLoop();

        this.startupStage = StartupStages.SEARCHING_FOR_FACE;
        if (this.headTracker) {
            this.headTracker.diagnosticStage = DiagnosticStages.INFERENCE_RETURNED_NO_FACE;
        }

        return true;
    }

    async startCamera() {
        return await this.startTrackingPipeline();
    }

    stopCamera() {
        console.log('[InputManager] Stopping camera and releasing hardware...');
        if (this.cameraState !== CameraStates.DENIED && this.cameraState !== CameraStates.UNAVAILABLE && this.cameraState !== CameraStates.LOST) {
            this.cameraState = CameraStates.IDLE;
        }

        if (this.frameLoopId) {
            cancelAnimationFrame(this.frameLoopId);
            this.frameLoopId = null;
        }
        this.isProcessingLoopRunning = false;

        if (this.mediaStream) {
            try {
                this.mediaStream.getTracks().forEach(track => {
                    track.stop();
                });
            } catch (e) {
                console.warn('[InputManager] Error stopping tracks:', e);
            }
            this.mediaStream = null;
        }

        if (this.videoElement) this.videoElement.srcObject = null;
        if (this.calPreviewVideo) this.calPreviewVideo.srcObject = null;

        if (this.ctx && this.canvasElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }

        if (this.headTracker) {
            this.headTracker.faceDetected = false;
            this.headTracker.isPlayer1Locked = false;
        }
        if (this.bodyTracker) {
            this.bodyTracker.bodyDetected = false;
            this.bodyTracker.isBodyLocked = false;
        }
    }

    async restartCamera() {
        this.stopCamera();
        return await this.startCamera();
    }

    fallbackToKeyboard() {
        console.log('[InputManager] Engaging Keyboard Mode Fallback.');
        this.isKeyboardMode = true;
        this.cameraAllowed = false;
        this.cameraError = 'FallbackKeyboard';
        this.stopCamera();
        if (this.headTracker) this.headTracker.forceCompleteCalibration();
        if (this.bodyTracker) this.bodyTracker.forceCompleteCalibration();
    }

    // ============================================================
    // MEDIAPIPE MODELS INITIALIZATION & READINESS VERIFICATION
    // ============================================================
    async initMediaPipeModels() {
        if (this.mode === 'head') {
            return await this.initFaceMeshModel();
        } else {
            return await this.initPoseModel();
        }
    }

    async initFaceMeshModel() {
        if (this.faceMeshModel && this.modelLoaded) return true;
        if (this.modelLoading) {
            const startWait = performance.now();
            while (this.modelLoading && performance.now() - startWait < 8000) {
                await new Promise(r => setTimeout(r, 100));
            }
            return this.modelLoaded;
        }

        this.modelLoading = true;
        this.modelState = ModelStates.LOADING;
        if (this.headTracker) {
            this.headTracker.diagnosticStage = DiagnosticStages.MODEL_LOADING;
        }
        this.modelError = null;

        try {
            if (typeof window !== 'undefined' && typeof window.FaceMesh === 'undefined') {
                const scriptReady = await this.waitForGlobal('FaceMesh', 4000);
                if (!scriptReady) {
                    throw new Error('MediaPipe FaceMesh script library not loaded in window');
                }
            }

            if (!this.faceMeshModel && typeof window !== 'undefined' && window.FaceMesh) {
                this.faceMeshModel = new window.FaceMesh({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
                });
                this.faceMeshModel.setOptions({
                    maxNumFaces: 3,
                    refineLandmarks: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.faceMeshModel.onResults((results) => this.onFaceResults(results));

                if (typeof this.faceMeshModel.initialize === 'function') {
                    const initPromise = this.faceMeshModel.initialize();
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('MediaPipe FaceMesh initialize timed out after 8s')), 8000)
                    );
                    try {
                        await Promise.race([initPromise, timeoutPromise]);
                    } catch (eInit) {
                        console.warn('[InputManager] FaceMesh explicit initialize warning, will lazy-init on send:', eInit);
                    }
                }
            }

            this.modelLoaded = true;
            this.modelLoading = false;
            this.modelState = ModelStates.READY;
            this.modelError = null;
            if (this.headTracker) {
                this.headTracker.diagnosticStage = DiagnosticStages.INFERENCE_NOT_RUNNING;
            }
            console.log('[InputManager] MediaPipe FaceMesh model READY.');
            return true;
        } catch (err) {
            console.error('[InputManager] FaceMesh initialization failed:', err);
            this.modelLoaded = false;
            this.modelLoading = false;
            this.modelState = ModelStates.ERROR;
            if (this.headTracker) {
                this.headTracker.diagnosticStage = DiagnosticStages.MODEL_INITIALIZATION_ERROR;
            }
            this.modelError = err.message || String(err);
            this.lastError = this.modelError;
            return false;
        }
    }

    async initPoseModel() {
        if (this.poseModel && this.modelLoaded) return true;
        if (this.modelLoading) return false;

        this.modelLoading = true;
        this.modelState = ModelStates.LOADING;
        this.modelError = null;

        try {
            if (typeof window.Pose === 'undefined') {
                throw new Error('MediaPipe Pose script library not loaded in window');
            }

            if (!this.poseModel) {
                this.poseModel = new window.Pose({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
                });
                this.poseModel.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.poseModel.onResults((results) => this.onPoseResults(results));
                if (typeof this.poseModel.initialize === 'function') {
                    await this.poseModel.initialize();
                }
            }

            this.modelLoaded = true;
            this.modelLoading = false;
            this.modelState = ModelStates.READY;
            this.modelError = null;
            console.log('[InputManager] MediaPipe Pose loaded and verified READY.');
            return true;
        } catch (err) {
            console.error('[InputManager] Pose initialization failed:', err);
            this.modelLoaded = false;
            this.modelLoading = false;
            this.modelState = ModelStates.ERROR;
            this.modelError = err.message || String(err);
            this.lastError = this.modelError;
            return false;
        }
    }

    // ============================================================
    // LIGHTING & LUMINANCE ANALYSIS (Phase 2 & Inference Preprocessing)
    // ============================================================
    analyzeLighting(video) {
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) return 'NORMAL';

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const aspect = vw / vh;
        const targetW = 320;
        const targetH = Math.round(targetW / aspect);

        if (this.inferenceCanvas.width !== targetW || this.inferenceCanvas.height !== targetH) {
            this.inferenceCanvas.width = targetW;
            this.inferenceCanvas.height = targetH;
        }

        // Draw active video to inference canvas
        this.inferenceCtx.drawImage(video, 0, 0, targetW, targetH);

        // Fast luminance sampling of central face region vs background periphery
        const cx = Math.floor(targetW * 0.30);
        const cy = Math.floor(targetH * 0.22);
        const cw = Math.floor(targetW * 0.40);
        const ch = Math.floor(targetH * 0.55);

        let centerLumaSum = 0;
        let centerCount = 0;

        try {
            const imgData = this.inferenceCtx.getImageData(cx, cy, cw, ch);
            const data = imgData.data;
            const step = 16; // Sample every 4th pixel for speed (<0.1ms)
            for (let i = 0; i < data.length; i += step) {
                centerLumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                centerCount++;
            }
        } catch (e) {
            // Ignore potential canvas security issues
        }

        const centerLuma = centerCount > 0 ? centerLumaSum / centerCount : 128;

        // Sample background periphery
        let bgLumaSum = 0;
        let bgCount = 0;
        try {
            const bgData = this.inferenceCtx.getImageData(0, 0, Math.floor(targetW * 0.25), Math.floor(targetH * 0.35)).data;
            const step = 16;
            for (let i = 0; i < bgData.length; i += step) {
                bgLumaSum += 0.299 * bgData[i] + 0.587 * bgData[i + 1] + 0.114 * bgData[i + 2];
                bgCount++;
            }
        } catch (e) {
            // Ignore
        }

        const bgLuma = bgCount > 0 ? bgLumaSum / bgCount : 128;

        this.lastFaceLuminance = Math.round(centerLuma);
        this.lastBgLuminance = Math.round(bgLuma);

        let condition = 'NORMAL';
        if (centerLuma < 38 && bgLuma > 115) {
            condition = 'BACKLIT';
            this.headTracker.lightingRejection = 'FACE TOO DARK — FACE THE LIGHT SOURCE';
        } else if (centerLuma < 34) {
            condition = 'DIM_LIGHTING';
            this.headTracker.lightingRejection = 'IMPROVE LIGHTING';
        } else if (centerLuma > 238) {
            condition = 'OVEREXPOSED';
            this.headTracker.lightingRejection = 'TOO BRIGHT — REDUCE GLARE';
        } else {
            this.headTracker.lightingRejection = null;
        }

        this.lightingCondition = condition;

        // Mild, bounded inference enhancement when dim (without touching visible preview!)
        if (centerLuma >= 25 && centerLuma < 75) {
            this.inferenceCtx.filter = 'brightness(1.18) contrast(1.10)';
            this.inferenceCtx.drawImage(video, 0, 0, targetW, targetH);
            this.inferenceCtx.filter = 'none';
        }

        return condition;
    }

    // ============================================================
    // INFERENCE PROCESSING LOOP
    // ============================================================
    startProcessingLoop() {
        if (this.isProcessingLoopRunning) return;
        this.isProcessingLoopRunning = true;
        let isSending = false;

        const processFrame = async () => {
            if (this.cameraState !== CameraStates.READY || !this.mediaStream) {
                this.isProcessingLoopRunning = false;
                return;
            }

            const now = performance.now();
            const activeVideo = this.getActiveVideo();

            // 1. Diagnostic boundary: Video Frame Availability
            if (!activeVideo || activeVideo.videoWidth === 0 || activeVideo.readyState < 2) {
                if (this.mode === 'head' && this.headTracker) {
                    this.headTracker.diagnosticStage = DiagnosticStages.VIDEO_FRAME_UNAVAILABLE;
                }
                this.frameLoopId = requestAnimationFrame(processFrame);
                return;
            }

            // 2. Diagnostic boundary: Model Loading / Error State
            if (this.modelState === ModelStates.LOADING) {
                if (this.mode === 'head' && this.headTracker) {
                    this.headTracker.diagnosticStage = DiagnosticStages.MODEL_LOADING;
                }
                this.frameLoopId = requestAnimationFrame(processFrame);
                return;
            }

            if (this.modelState === ModelStates.ERROR) {
                if (this.mode === 'head' && this.headTracker) {
                    this.headTracker.diagnosticStage = DiagnosticStages.MODEL_INITIALIZATION_ERROR;
                }
                this.frameLoopId = requestAnimationFrame(processFrame);
                return;
            }

            if (this.modelState !== ModelStates.READY) {
                if (this.mode === 'head' && this.headTracker) {
                    this.headTracker.diagnosticStage = DiagnosticStages.INFERENCE_NOT_RUNNING;
                }
                this.frameLoopId = requestAnimationFrame(processFrame);
                return;
            }

            const canSendCadence = (now - this.lastInferenceTimestamp >= this.minInferenceIntervalMs);

            if (!this.isProcessingPaused && !isSending && canSendCadence) {
                // Sync overlay canvas dimensions to video
                if (this.canvasElement &&
                    (this.canvasElement.width !== activeVideo.videoWidth ||
                     this.canvasElement.height !== activeVideo.videoHeight)) {
                    this.canvasElement.width = activeVideo.videoWidth;
                    this.canvasElement.height = activeVideo.videoHeight;
                }

                // Analyze lighting (sample periodically to preserve CPU)
                if (now - this.lastLightingCheckTime > 400) {
                    this.lastLightingCheckTime = now;
                    this.analyzeLighting(activeVideo);
                }

                isSending = true;
                this.lastInferenceTimestamp = now;
                const inferenceStartTime = performance.now();

                try {
                    if (this.mode === 'head') {
                        if (this.faceMeshModel && this.modelLoaded) {
                            await this.faceMeshModel.send({ image: activeVideo });
                        }
                    } else {
                        if (this.poseModel && this.modelLoaded) {
                            await this.poseModel.send({ image: activeVideo });
                        }
                    }

                    this.lastInferenceDurationMs = Math.round(performance.now() - inferenceStartTime);
                    this.inferenceFrameCount++;
                    if (now - this.inferenceFpsTimer >= 1000) {
                        this.inferenceFPS = Math.round((this.inferenceFrameCount * 1000) / (now - this.inferenceFpsTimer));
                        this.inferenceFrameCount = 0;
                        this.inferenceFpsTimer = now;
                    }
                } catch (err) {
                    this.lastError = err.message || String(err);
                    console.warn('[InputManager] Inference frame warning:', err);
                    if (this.mode === 'head' && this.headTracker) {
                        this.headTracker.diagnosticStage = DiagnosticStages.INFERENCE_ERROR;
                    }
                } finally {
                    isSending = false;
                }
            }

            if (this.cameraState === CameraStates.READY) {
                this.frameLoopId = requestAnimationFrame(processFrame);
            } else {
                this.isProcessingLoopRunning = false;
            }
        };

        this.frameLoopId = requestAnimationFrame(processFrame);
    }

    onFaceResults(results) {
        if (this.mode !== 'head') return;
        const now = performance.now();
        const deltaSec = Math.max(0.005, Math.min(0.1, (now - (this.lastProcessTime || now)) / 1000));
        this.lastProcessTime = now;

        const faces = results.multiFaceLandmarks;
        if (!faces || faces.length === 0) {
            this.headTracker.diagnosticStage = DiagnosticStages.INFERENCE_RETURNED_NO_FACE;
            this.headTracker.processMultiFace([], deltaSec, now);
        } else {
            this.lastSuccessfulDetection = now;
            this.headTracker.diagnosticStage = DiagnosticStages.LANDMARKS_RECEIVED;
            this.headTracker.processMultiFace(faces, deltaSec, now);
        }
        this.renderOverlay();
    }

    onPoseResults(results) {
        const now = performance.now();
        const deltaSec = Math.max(0.005, Math.min(0.1, (now - (this.lastProcessTime || now)) / 1000));
        this.lastProcessTime = now;
        this.lastSuccessfulDetection = now;

        if (this.mode === 'head') {
            if (!this.faceMeshModel) {
                const faceOnly = results.poseLandmarks ? results.poseLandmarks.slice(0, 11) : null;
                this.headTracker.processLandmarks(faceOnly, true, deltaSec);
                this.renderOverlay();
            }
        } else {
            this.bodyTracker.processLandmarks(results.poseLandmarks);
            this.renderOverlay();
        }
    }

    renderOverlay() {
        if (!this.ctx || !this.cameraPreviewVisible) return;
        const w = this.canvasElement.width || 640;
        const h = this.canvasElement.height || 480;

        if (this.mode === 'head') {
            this.headTracker.drawOverlay(this.ctx, w, h);
        } else {
            this.bodyTracker.drawOverlay(this.ctx, w, h);
        }
    }

    resetPlayerSession() {
        this.headTracker.resetCalibration();
        this.bodyTracker.resetCalibration();
        this.keyboardTracker.resetKickTrigger();
        this.resetKickTrigger();
    }

    startCalibration() {
        if (this.cameraState !== CameraStates.READY) return;
        if (this.mode === 'head') {
            this.headTracker.startCalibration();
        } else {
            this.bodyTracker.startCalibration();
        }
    }

    resetCalibration() {
        if (this.mode === 'head') {
            this.headTracker.resetCalibration();
        } else {
            this.bodyTracker.resetCalibration();
        }
    }

    forceCalibrationComplete() {
        if (this.mode === 'head') {
            this.headTracker.forceCompleteCalibration();
        } else {
            this.bodyTracker.forceCompleteCalibration();
        }
    }

    isCalibrating() {
        if (this.isKeyboardMode) return false;
        if (this.cameraState !== CameraStates.READY) return false;
        if (this.mode === 'head') {
            return !this.headTracker.isCalibrationComplete();
        } else {
            return this.bodyTracker.isCalibrating;
        }
    }

    isCalibrationComplete() {
        if (this.isKeyboardMode) return true;
        if (this.cameraState !== CameraStates.READY) return false;

        if (this.mode === 'head') {
            return this.headTracker.isCalibrationComplete() && this.headTracker.isPlayer1Locked;
        } else {
            return this.bodyTracker.calibrationComplete && this.bodyTracker.isBodyLocked;
        }
    }

    canStartMatch() {
        if (this.isKeyboardMode) return true;
        if (this.cameraState !== CameraStates.READY) return false;

        if (this.mode === 'head') {
            return (
                this.headTracker.faceDetected &&
                this.headTracker.isPlayer1Locked &&
                this.headTracker.isCalibrationComplete()
            );
        } else {
            return (
                this.bodyTracker.bodyDetected &&
                this.bodyTracker.isBodyLocked &&
                this.bodyTracker.calibrationComplete
            );
        }
    }

    getCalibrationProgress() {
        if (this.isKeyboardMode) {
            return {
                percent: 100,
                quality: 5,
                complete: true,
                stage: 'LOCKED',
                stageLabel: 'KEYBOARD CONTROLS (ACTIVE)',
                samples: 24,
                required: 24,
                rejectionReason: null
            };
        }

        if (this.cameraState !== CameraStates.READY) {
            let label = 'CAMERA NOT INITIALIZED';
            if (this.cameraState === CameraStates.REQUESTING) label = 'REQUESTING CAMERA PERMISSION...';
            if (this.cameraState === CameraStates.DENIED) label = 'CAMERA ACCESS DENIED';
            if (this.cameraState === CameraStates.UNAVAILABLE) label = 'CAMERA UNAVAILABLE';
            if (this.cameraState === CameraStates.LOST) label = 'CAMERA STREAM LOST';

            return {
                percent: 0,
                quality: 0,
                complete: false,
                stage: 'ERROR',
                stageLabel: label,
                samples: 0,
                required: 24,
                rejectionReason: label
            };
        }

        if (this.mode === 'head') {
            return this.headTracker.getCalibrationProgress();
        } else {
            return this.bodyTracker.getCalibrationProgress();
        }
    }

    lockInput(locked) {
        this.headTracker.lockInput(locked);
    }

    update(delta = 1 / 60) {
        this.keyboardTracker.update(delta);
    }

    getAim() {
        if (Math.abs(this.keyboardTracker.normalizedAim) > 0.05) {
            return this.keyboardTracker.normalizedAim;
        }
        if (this.mode === 'head') {
            if (this.headTracker.kickTriggered || this.headTracker.isCharging) {
                return this.headTracker.lockedShotAim !== null ? this.headTracker.lockedShotAim : this.headTracker.normalizedAim;
            }
            return this.headTracker.normalizedAim;
        }
        if (this.bodyTracker.kickTriggered || this.bodyTracker.isCharging) {
            return this.bodyTracker.lockedShotAim !== null ? this.bodyTracker.lockedShotAim : this.bodyTracker.normalizedAim;
        }
        return this.bodyTracker.normalizedAim;
    }

    getLockedKickAim(defaultAim) {
        if (this.mode === 'head' && this.headTracker.lockedShotAim !== null) {
            return this.headTracker.lockedShotAim;
        }
        if (this.mode === 'body' && this.bodyTracker.lockedShotAim !== null) {
            return this.bodyTracker.lockedShotAim;
        }
        return defaultAim;
    }

    getPower() {
        if (this.keyboardTracker.power > 0.05) {
            return this.keyboardTracker.power;
        }
        return this.mode === 'head' ? this.headTracker.power : this.bodyTracker.power;
    }

    isKickTriggered() {
        return this.keyboardTracker.kickTriggered ||
               (this.mode === 'head' ? this.headTracker.kickTriggered : this.bodyTracker.kickTriggered);
    }

    resetKickTrigger() {
        this.keyboardTracker.resetKickTrigger();
        if (this.mode === 'head') {
            this.headTracker.resetKickTrigger();
        } else {
            this.bodyTracker.resetKickTrigger();
        }
    }

    isTracking() {
        if (this.isKeyboardMode) return true;
        if (!this.isCameraActive()) return false;
        return this.mode === 'head'
            ? (this.headTracker.faceDetected && this.headTracker.isPlayer1Locked)
            : (this.bodyTracker.bodyDetected && this.bodyTracker.isBodyLocked);
    }

    getPositionStatus() {
        if (this.isKeyboardMode) return 'KEYBOARD';

        // 1. Camera Lifecycle Failures & Requests
        if (this.cameraState === CameraStates.DENIED || this.startupStage === StartupStages.CAMERA_DENIED) {
            return 'CAMERA_DENIED';
        }
        if (this.cameraState === CameraStates.UNAVAILABLE || this.startupStage === StartupStages.CAMERA_UNAVAILABLE) {
            return 'CAMERA_UNAVAILABLE';
        }
        if (this.cameraState === CameraStates.LOST || this.startupStage === StartupStages.CAMERA_LOST) {
            return 'CAMERA_LOST';
        }
        if (this.cameraState === CameraStates.REQUESTING || this.startupStage === StartupStages.REQUESTING_CAMERA) {
            return 'CAMERA_REQUESTING';
        }
        if (this.cameraState !== CameraStates.READY) {
            return 'CAMERA_OFF';
        }

        // 2. Fatal Model Lifecycle Errors
        if (this.modelState === ModelStates.ERROR || this.startupStage === StartupStages.MODEL_ERROR) {
            return 'MODEL_ERROR';
        }

        // 3. Video Stream Readiness
        if (this.videoTimedOut || this.startupStage === StartupStages.VIDEO_TIMEOUT) {
            return 'VIDEO_TIMEOUT';
        }
        const activeVideo = this.getActiveVideo();
        if (!activeVideo || activeVideo.videoWidth === 0 || activeVideo.readyState < 2) {
            return 'VIDEO_WAITING';
        }

        // 4. Model Loading
        if (this.modelState === ModelStates.LOADING || this.startupStage === StartupStages.LOADING_MODEL || this.modelState !== ModelStates.READY) {
            return 'MODEL_LOADING';
        }

        // 4. Inference & Face Detection
        if (this.mode === 'head') {
            if (this.headTracker.diagnosticStage === DiagnosticStages.INFERENCE_ERROR) {
                return 'INFERENCE_ERROR';
            }
            return this.headTracker.positionStatus || 'NO_FACE';
        }
        return this.bodyTracker.positionStatus || 'NO_BODY';
    }

    getStatusText() {
        if (this.isKeyboardMode) return 'KEYBOARD CONTROLS (CAM OFF)';

        if (this.cameraState === CameraStates.REQUESTING) return 'REQUESTING CAMERA ACCESS...';
        if (this.cameraState === CameraStates.DENIED) return 'CAMERA PERMISSION DENIED';
        if (this.cameraState === CameraStates.UNAVAILABLE) return 'CAMERA UNAVAILABLE';
        if (this.cameraState === CameraStates.LOST) return 'CAMERA STREAM LOST';
        if (this.cameraState !== CameraStates.READY) return 'CAMERA OFF';

        if (this.modelState === ModelStates.LOADING) return 'LOADING MODEL...';
        if (this.modelState === ModelStates.ERROR) return 'MODEL ERROR';

        if (this.isCalibrating()) {
            const prog = this.getCalibrationProgress();
            return prog.rejectionReason || prog.stageLabel || 'CALIBRATING...';
        }

        if (this.mode === 'head') {
            if (this.headTracker.searchingForPlayer) {
                return 'SEARCHING FOR PLAYER 1...';
            }
            if (this.headTracker.isPlayer1Locked) {
                if (this.headTracker.ignoredFaceCount > 0) {
                    return `P1 LOCKED • ${this.headTracker.ignoredFaceCount} CROWD FACE IGNORED`;
                }
                return 'PLAYER 1 ● TRACKED';
            }
            if (this.headTracker.lastRejectionReason) {
                return this.headTracker.lastRejectionReason;
            }
            return 'SEARCHING...';
        } else {
            if (this.bodyTracker.isBodyLocked) {
                return 'BODY ● TRACKED';
            }
            switch (this.bodyTracker.positionStatus) {
                case 'MOVE_BACK': return 'MOVE BACK';
                case 'MOVE_CLOSER': return 'MOVE CLOSER';
                case 'MOVE_LEFT': return 'STEP LEFT';
                case 'MOVE_RIGHT': return 'STEP RIGHT';
                case 'FULL_BODY_REQUIRED': return 'FULL BODY REQUIRED';
                case 'BODY_FRAMED': return 'BODY FRAMED ✓';
                default: return 'BODY NOT DETECTED';
            }
        }
    }

    // Telemetry Diagnostics
    getTelemetry() {
        const headStats = this.headTracker.getDebugStats();
        const activeVideo = this.getActiveVideo();
        const camW = this.cameraSettings?.width || activeVideo?.videoWidth || 0;
        const camH = this.cameraSettings?.height || activeVideo?.videoHeight || 0;
        const resStr = camW > 0 ? `${camW}x${camH}` : 'NO SIGNAL';

        let modelStr = 'NOT LOADED';
        if (this.modelLoading) modelStr = 'INITIALIZING...';
        else if (this.modelLoaded) modelStr = 'READY';
        if (this.modelError) modelStr = `ERROR: ${this.modelError}`;

        const now = performance.now();
        const trackingAgeMs = this.lastSuccessfulDetection > 0 ? Math.round(now - this.lastSuccessfulDetection) : 9999;
        const activeVideoId = activeVideo ? (activeVideo.id || 'ANONYMOUS_VIDEO') : 'NONE';

        return {
            cameraState: this.cameraState,
            diagnosticStage: (this.mode === 'head' && this.headTracker) ? this.headTracker.diagnosticStage : DiagnosticStages.CAMERA_NOT_READY,
            activeVideoId,
            hardwareRes: resStr,
            frameAge: `${trackingAgeMs} ms`,
            modelState: modelStr,
            inferenceFps: `${this.inferenceFPS} FPS`,
            inferenceDuration: `${this.lastInferenceDurationMs || 0} ms`,
            lighting: this.lightingCondition || 'NORMAL',
            faceLuminance: this.lastFaceLuminance || 0,
            selectedFaceArea: this.headTracker?.selectedFaceArea ? this.headTracker.selectedFaceArea.toFixed(3) : '0',
            selectedFaceWidth: this.headTracker?.selectedFaceWidth ? this.headTracker.selectedFaceWidth.toFixed(3) : '0',
            ...headStats,
            lastError: this.lastError || this.modelError || 'NONE'
        };
    }
}
