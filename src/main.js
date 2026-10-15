// Main Bootstrap for TILT KICK
// Connects 3D Stadium, Physics, Unified Input Tracking, UI Controller, Audio, and Settings.

import { StadiumScene } from './game/StadiumScene.js';
import { Ball } from './game/Ball.js';
import { Goalkeeper } from './game/Goalkeeper.js';
import { InputManager } from './tracking/InputManager.js';
import { UIManager } from './ui/UIManager.js';
import { GameManager } from './game/GameManager.js';
import { settingsManager } from './utils/SettingsManager.js';

class TiltKickApp {
    constructor() {
        this.gameContainer = document.getElementById('game-container');
        this.videoElement = document.getElementById('webcam');
        this.overlayCanvas = document.getElementById('overlayCanvas');

        this.stadiumScene = null;
        this.ball = null;
        this.goalkeeper = null;
        this.inputManager = null;
        this.uiManager = null;
        this.gameManager = null;

        this.lastTime = performance.now();
        this.init();
    }

    async init() {
        console.log('[TILT KICK] Booting game engine v2...');

        // 1. Initialize 3D Stadium Environment
        this.stadiumScene = new StadiumScene(this.gameContainer);

        // 2. Initialize Ball & Goalkeeper
        this.ball = new Ball(this.stadiumScene.scene);
        this.goalkeeper = new Goalkeeper(this.stadiumScene.scene);

        // 3. Initialize Unified Input Manager
        this.inputManager = new InputManager();

        // 4. Initialize UI Manager
        this.uiManager = new UIManager();

        // 5. Initialize Master Game Manager
        this.gameManager = new GameManager(
            this.stadiumScene,
            this.ball,
            this.goalkeeper,
            this.inputManager,
            this.uiManager
        );

        // 6. Connect UI & Event Callbacks
        this.setupCallbacks();

        // 7. Bind Camera DOM elements (Camera stays OFF until calibration/gameplay)
        this.inputManager.bindDOMElements(this.videoElement, this.overlayCanvas);

        // 8. Start Render & Game Loop
        this.lastTime = performance.now();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);

        console.log('[TILT KICK] Ready to play.');
    }

    setupCallbacks() {
        // Mode Selection
        this.uiManager.onTrackingModeSelected = (mode) => {
            this.gameManager.setTrackingMode(mode);
        };

        this.uiManager.onMatchLengthConfirmed = (sec) => {
            this.gameManager.setMatchLength(sec);
        };

        this.uiManager.onGameModeSelected = (mode) => {
            this.gameManager.setGameMode(mode);
            this.gameManager.startNewGame();
        };

        // Practice Mode Callbacks
        this.uiManager.onPracticeKeeperToggle = () => {
            return this.gameManager.togglePracticeKeeper();
        };

        this.uiManager.onPracticeReset = () => {
            this.gameManager.resetPracticeShot();
        };

        // Pause Menu Callbacks
        this.uiManager.onResumeClicked = () => {
            this.gameManager.resumeGame();
        };

        this.uiManager.onRecalibrateClicked = () => {
            this.gameManager.recalibrate();
        };

        this.uiManager.onCalReadyClicked = () => {
            this.inputManager.forceCalibrationComplete();
        };

        this.uiManager.onCalStartMatchClicked = () => {
            this.gameManager.confirmCalibrationStart();
        };

        this.uiManager.onCalRecalibrateClicked = () => {
            this.gameManager.recalibrate();
        };

        this.uiManager.onCalBackClicked = () => {
            this.inputManager.stopCamera();
            this.gameManager.state = 'MAIN_MENU';
            this.ball.reset();
            this.goalkeeper.reset();
            this.uiManager.showScreen('mainMenu');
        };

        this.uiManager.onCalRetryCameraClicked = async () => {
            this.uiManager.hideCameraError();
            await this.gameManager.beginCalibration();
        };

        this.uiManager.onCalFallbackKeyClicked = () => {
            this.inputManager.fallbackToKeyboard();
            this.uiManager.hideCameraError();
            this.gameManager.onCalibrationComplete();
        };

        // Game Over actions
        this.uiManager.onRestartClicked = () => {
            this.gameManager.startNewGame();
        };

        this.uiManager.onMainMenuClicked = () => {
            this.inputManager.stopCamera();
            this.gameManager.state = 'MAIN_MENU';
            this.ball.reset();
            this.goalkeeper.reset();
        };

        // Keyboard hotkeys
        this.inputManager.keyboardTracker.onRestartKey = () => {
            if (this.gameManager.state === 'AIMING' || this.gameManager.state === 'CHARGING') {
                this.gameManager.beginAiming();
            }
        };

        this.inputManager.keyboardTracker.onMenuKey = () => {
            this.gameManager.togglePause();
        };

        // Space / Enter keyboard shortcut during calibration wait
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                if (this.gameManager.state === 'CALIBRATED_WAIT') {
                    e.preventDefault();
                    this.gameManager.confirmCalibrationStart();
                }
            }
        });
    }

    loop(currentTime) {
        requestAnimationFrame(this.loop);

        const delta = Math.min(0.1, (currentTime - this.lastTime) / 1000);
        this.lastTime = currentTime;

        // 1. Update Game Manager & Subsystems
        this.gameManager.update(delta);

        // 2. Update PiP tracking badge status & Guided Calibration feedback
        const isCameraOn = this.inputManager.isCameraActive();
        const isTracking = this.inputManager.isTracking();
        const statusText = this.inputManager.getStatusText();
        this.uiManager.updateTrackingBadge(statusText, isTracking, isCameraOn);

        // 3. Update Real-time Vision Telemetry (Phase 18 & 41)
        const telemetry = this.inputManager.getTelemetry();
        this.uiManager.updateDebugStats(telemetry);

        // 4. Render 3D Scene
        this.stadiumScene.render();
    }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => new TiltKickApp());
} else {
    new TiltKickApp();
}
