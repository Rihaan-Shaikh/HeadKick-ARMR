// Complete UI Controller for TILT KICK
// Manages visual menus, athletic broadcast HUD, targeting reticle, 4-tier power meter,
// Player Enrollment & Head Pose Calibration sequence, result fanfare, and dev telemetry.

import { soundEngine } from '../audio/SoundEngine.js';
import { settingsManager } from '../utils/SettingsManager.js';

export class UIManager {
    constructor() {
        this.dom = {
            // Screens
            mainMenu: document.getElementById('screen-main-menu'),
            trackingModeSelect: document.getElementById('screen-tracking-mode'),
            gameModeSelect: document.getElementById('screen-game-mode'),
            matchLengthSelect: document.getElementById('screen-match-length'),
            howToPlay: document.getElementById('screen-how-to-play'),
            gameplayHUD: document.getElementById('gameplay-hud'),

            // Modals
            settings: document.getElementById('screen-settings'),
            statsModal: document.getElementById('modal-stats'),
            confirmModal: document.getElementById('modal-confirm'),
            pauseModal: document.getElementById('modal-pause'),
            calibrationOverlay: document.getElementById('calibration-overlay'),
            countdownOverlay: document.getElementById('countdown-overlay'),
            resultBanner: document.getElementById('result-banner'),
            playerSwitchModal: document.getElementById('player-switch-modal'),
            gameOverModal: document.getElementById('game-over-modal'),
            debugOverlay: document.getElementById('debug-overlay'),

            // Practice Toolbar
            practiceToolbar: document.getElementById('practice-toolbar'),
            btnPracticeKeeper: document.getElementById('btn-practice-keeper'),
            btnPracticeDiff: document.getElementById('btn-practice-diff'),
            btnPracticeReset: document.getElementById('btn-practice-reset'),
            btnPracticeExit: document.getElementById('btn-practice-exit'),

            // HUD Elements
            hudStatusPill: document.getElementById('hud-status-pill'),
            soloStats: document.getElementById('solo-stats'),
            twoPlayerStats: document.getElementById('two-player-stats'),
            scoreVal: document.getElementById('score-val'),
            timerVal: document.getElementById('timer-val'),
            bestScoreVal: document.getElementById('best-score-val'),
            p1ScoreVal: document.getElementById('p1-score-val'),
            p2ScoreVal: document.getElementById('p2-score-val'),
            pTimerVal: document.getElementById('p-timer-val'),

            // Reticle & Power
            aimReticle: document.getElementById('aim-reticle'),
            reticleLabel: document.getElementById('reticle-label'),
            aimGuideDot: document.getElementById('aim-guide-dot'),
            powerFill: document.getElementById('power-meter-fill'),
            powerPct: document.getElementById('power-meter-pct'),
            shotQualityBadge: document.getElementById('shot-quality-badge'),
            shotQualityText: document.getElementById('shot-quality-text'),

            // Guided Camera Setup & Enrollment
            faceGuideFrame: document.getElementById('face-guide-frame'),
            bodyGuideFrame: document.getElementById('body-guide-frame'),
            calWebcamPreview: document.getElementById('cal-webcam-preview'),
            calCameraFallback: document.getElementById('cal-camera-fallback'),
            calFallbackTitle: document.getElementById('cal-fallback-title'),
            calFallbackDesc: document.getElementById('cal-fallback-desc'),
            calStatusBadge: document.getElementById('cal-status-badge'),
            calStatusIcon: document.getElementById('cal-status-icon'),
            calStatusText: document.getElementById('cal-status-text'),
            calProgressFill: document.getElementById('cal-progress-fill'),
            calSubtext: document.getElementById('cal-subtext'),
            calStepCount: document.getElementById('cal-step-count'),
            calQualityDots: document.getElementById('cal-quality-dots'),
            calSuccessCard: document.getElementById('cal-success-card'),
            btnCalStartMatch: document.getElementById('btn-cal-start-match'),
            btnCalRecalibrate: document.getElementById('btn-cal-recalibrate'),
            btnCalReady: document.getElementById('btn-cal-ready'),
            btnCalBack: document.getElementById('btn-cal-back'),

            // PiP Camera
            pipContainer: document.getElementById('pip-webcam-container'),
            pipStatusBadge: document.getElementById('pip-status-badge'),
            pipToggleBtn: document.getElementById('pip-toggle-btn'),

            // Top action buttons
            btnPause: document.getElementById('btn-pause'),
            audioToggleBtn: document.getElementById('audio-toggle-btn')
        };

        // Callbacks to GameManager & TiltKickApp
        this.onPlayClicked = null;
        this.onTrackingModeSelected = null;
        this.onGameModeSelected = null;
        this.onMatchLengthConfirmed = null;
        this.onRestartClicked = null;
        this.onMainMenuClicked = null;
        this.onResumeClicked = null;
        this.onRecalibrateClicked = null;
        this.onCalReadyClicked = null;
        this.onCalStartMatchClicked = null;
        this.onCalRecalibrateClicked = null;
        this.onCalBackClicked = null;
        this.onCalRetryCameraClicked = null;
        this.onCalFallbackKeyClicked = null;

        // Practice callbacks
        this.onPracticeKeeperToggle = null;
        this.onPracticeReset = null;

        // State variables
        this.pendingGameMode = 'solo';
        this.selectedMatchSec = settingsManager.get('matchLengthSec') || 180;
        this.calibrationStartTime = 0;
        this.lastMatchShareData = null;

        // FPS tracking for debug
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.currentFps = 60;

        this.initEventListeners();
        this.initSettingsUI();
        this.initMatchLengthUI();
        this.updateAudioButtonState();
    }

    initEventListeners() {
        // Main Menu buttons
        document.getElementById('btn-play')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = 'solo';
            this.showScreen('trackingModeSelect');
        });

        document.getElementById('btn-practice')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = 'practice';
            this.showScreen('trackingModeSelect');
        });

        document.getElementById('btn-how-to')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('howToPlay');
        });

        document.getElementById('btn-settings')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showModal('settings');
        });

        document.getElementById('btn-stats')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showStatsModal();
        });

        // Tracking Mode Select Cards
        document.getElementById('card-mode-head')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onTrackingModeSelected) this.onTrackingModeSelected('head');
            if (this.pendingGameMode === 'practice') {
                if (this.onGameModeSelected) this.onGameModeSelected('practice');
            } else {
                this.showScreen('gameModeSelect');
            }
        });

        document.getElementById('card-mode-body')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onTrackingModeSelected) this.onTrackingModeSelected('body');
            if (this.pendingGameMode === 'practice') {
                if (this.onGameModeSelected) this.onGameModeSelected('practice');
            } else {
                this.showScreen('gameModeSelect');
            }
        });

        document.getElementById('btn-back-tracking')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('mainMenu');
        });

        // Game Mode Select Cards
        document.getElementById('card-game-solo')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = 'solo';
            this.showMatchLengthScreen('solo');
        });

        document.getElementById('card-game-2p')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = '2player';
            this.showMatchLengthScreen('2player');
        });

        document.getElementById('btn-back-game')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('trackingModeSelect');
        });

        // Match Length Selection
        document.getElementById('btn-start-match')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onMatchLengthConfirmed) this.onMatchLengthConfirmed(this.selectedMatchSec);
            if (this.onGameModeSelected) this.onGameModeSelected(this.pendingGameMode);
        });

        document.getElementById('btn-back-match-length')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('gameModeSelect');
        });

        // How To Play tabs & back
        document.getElementById('tab-how-to-head')?.addEventListener('click', () => {
            soundEngine.playClick();
            document.getElementById('tab-how-to-head')?.classList.add('active');
            document.getElementById('tab-how-to-body')?.classList.remove('active');
            const h = document.getElementById('how-to-content-head');
            const b = document.getElementById('how-to-content-body');
            if (h) h.style.display = 'grid';
            if (b) b.style.display = 'none';
        });

        document.getElementById('tab-how-to-body')?.addEventListener('click', () => {
            soundEngine.playClick();
            document.getElementById('tab-how-to-body')?.classList.add('active');
            document.getElementById('tab-how-to-head')?.classList.remove('active');
            const h = document.getElementById('how-to-content-head');
            const b = document.getElementById('how-to-content-body');
            if (h) h.style.display = 'none';
            if (b) b.style.display = 'grid';
        });

        document.getElementById('btn-how-to-back')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('mainMenu');
        });

        // Calibration Action Buttons
        document.getElementById('btn-cal-start-match')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalStartMatchClicked) this.onCalStartMatchClicked();
        });

        document.getElementById('btn-cal-recalibrate')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalRecalibrateClicked) this.onCalRecalibrateClicked();
        });

        document.getElementById('btn-cal-ready')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalReadyClicked) this.onCalReadyClicked();
        });

        document.getElementById('btn-cal-back')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalBackClicked) this.onCalBackClicked();
        });

        document.getElementById('btn-cal-retry')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalRetryCameraClicked) this.onCalRetryCameraClicked();
        });

        document.getElementById('btn-cal-fallback-key')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalFallbackKeyClicked) this.onCalFallbackKeyClicked();
        });

        document.getElementById('btn-cal-fallback-back')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalBackClicked) this.onCalBackClicked();
        });

        // Top Navigation buttons
        this.dom.btnPause?.addEventListener('click', () => {
            soundEngine.playClick();
            this.togglePauseModal();
        });

        this.dom.audioToggleBtn?.addEventListener('click', () => {
            soundEngine.toggleMute();
            this.updateAudioButtonState();
        });

        // Pause Modal Actions
        document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onResumeClicked) this.onResumeClicked();
        });

        document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('pauseModal');
            if (this.onRestartClicked) this.onRestartClicked();
        });

        document.getElementById('btn-pause-recalibrate')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('pauseModal');
            if (this.onRecalibrateClicked) this.onRecalibrateClicked();
        });

        document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showModal('settings');
        });

        document.getElementById('btn-pause-howto')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('howToPlay');
        });

        document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('pauseModal');
            if (this.onMainMenuClicked) this.onMainMenuClicked();
            this.showScreen('mainMenu');
        });

        // Game Over modal actions
        document.getElementById('btn-game-over-again')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('gameOverModal');
            if (this.onRestartClicked) this.onRestartClicked();
        });

        document.getElementById('btn-game-over-share')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.shareMatchResult();
        });

        document.getElementById('btn-game-over-menu')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('gameOverModal');
            if (this.onMainMenuClicked) this.onMainMenuClicked();
            this.showScreen('mainMenu');
        });

        // Practice Mode Toolbar
        this.dom.btnPracticeKeeper?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onPracticeKeeperToggle) {
                const active = this.onPracticeKeeperToggle();
                this.dom.btnPracticeKeeper.innerText = active ? 'KEEPER: ON' : 'KEEPER: OFF';
                this.dom.btnPracticeKeeper.classList.toggle('active', active);
            }
        });

        this.dom.btnPracticeReset?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onPracticeReset) this.onPracticeReset();
        });

        this.dom.btnPracticeExit?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onMainMenuClicked) this.onMainMenuClicked();
            this.showScreen('mainMenu');
        });

        // PiP camera toggle
        this.dom.pipToggleBtn?.addEventListener('click', () => {
            soundEngine.playClick();
            const curr = settingsManager.get('cameraPreview');
            settingsManager.set('cameraPreview', !curr);
            this.toggleCameraPreview(!curr);
        });

        // Dev Debug Overlay toggle with ` backtick
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Backquote' || e.key === '`') {
                this.toggleDebugOverlay();
            }
        });
    }

    initMatchLengthUI() {
        const presets = document.querySelectorAll('.btn-preset');
        const slider = document.getElementById('custom-time-slider');
        const durVal = document.getElementById('match-duration-val');
        const summaryPill = document.getElementById('match-summary-pill');

        const updateDisplay = (sec) => {
            this.selectedMatchSec = sec;
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;
            if (durVal) durVal.innerText = timeStr;
            if (summaryPill) {
                summaryPill.innerText = `${this.pendingGameMode === '2player' ? '2-PLAYER MATCH' : 'SOLO MATCH'} — ${timeStr}`;
            }
        };

        presets.forEach(btn => {
            btn.addEventListener('click', () => {
                soundEngine.playClick();
                presets.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const sec = parseInt(btn.dataset.sec, 10);
                if (slider) slider.value = sec;
                updateDisplay(sec);
            });
        });

        slider?.addEventListener('input', (e) => {
            const sec = parseInt(e.target.value, 10);
            presets.forEach(b => {
                if (parseInt(b.dataset.sec, 10) === sec) b.classList.add('active');
                else b.classList.remove('active');
            });
            updateDisplay(sec);
        });

        updateDisplay(this.selectedMatchSec);
    }

    showMatchLengthScreen(gameMode) {
        const sub = document.getElementById('match-length-sub');
        if (sub) {
            sub.innerText = gameMode === '2player'
                ? 'Each player receives this exact time allocation'
                : 'Select duration for your penalty session';
        }
        this.showScreen('matchLengthSelect');
    }

    showStatsModal() {
        this.renderStatsGrid();
        this.showModal('statsModal');
    }

    renderStatsGrid() {
        const stats = settingsManager.getStats();
        const grid = document.getElementById('stats-grid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="stat-tile">
                <div class="stat-tile-val gold">${stats.bestScore}</div>
                <div class="stat-tile-label">High Score</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.goals}</div>
                <div class="stat-tile-label">Goals Scored</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.accuracy}%</div>
                <div class="stat-tile-label">Shot Accuracy</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.bestStreak}</div>
                <div class="stat-tile-label">Best Goal Streak</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.matchesPlayed}</div>
                <div class="stat-tile-label">Matches Played</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.perfectGoals}</div>
                <div class="stat-tile-label">Top Corner Finishes</div>
            </div>
        `;
    }

    initSettingsUI() {
        const s = settingsManager.getAll();

        const sensSlider = document.getElementById('setting-sensitivity');
        const sensVal = document.getElementById('setting-sensitivity-val');
        if (sensSlider && sensVal) {
            sensSlider.value = s.headSensitivity;
            sensVal.innerText = `${s.headSensitivity.toFixed(1)}x`;
            sensSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                sensVal.innerText = `${val.toFixed(1)}x`;
                settingsManager.set('headSensitivity', val);
            });
        }

        const deadzoneSlider = document.getElementById('setting-deadzone');
        const deadzoneVal = document.getElementById('setting-deadzone-val');
        if (deadzoneSlider && deadzoneVal) {
            deadzoneSlider.value = s.deadZone;
            deadzoneVal.innerText = `${s.deadZone.toFixed(1)}°`;
            deadzoneSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                deadzoneVal.innerText = `${val.toFixed(1)}°`;
                settingsManager.set('deadZone', val);
            });
        }

        const volumeSlider = document.getElementById('setting-volume');
        const volumeVal = document.getElementById('setting-volume-val');
        if (volumeSlider && volumeVal) {
            volumeSlider.value = s.masterVolume;
            volumeVal.innerText = `${Math.round(s.masterVolume * 100)}%`;
            volumeSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                volumeVal.innerText = `${Math.round(val * 100)}%`;
                soundEngine.setMasterVolume(val);
            });
        }

        const soundToggle = document.getElementById('setting-sound-toggle');
        if (soundToggle) {
            soundToggle.checked = s.soundEffects;
            soundToggle.addEventListener('change', (e) => {
                soundEngine.setMuted(!e.target.checked);
                this.updateAudioButtonState();
            });
        }

        const camToggle = document.getElementById('setting-cam-toggle');
        if (camToggle) {
            camToggle.checked = s.cameraPreview;
            camToggle.addEventListener('change', (e) => {
                settingsManager.set('cameraPreview', e.target.checked);
                this.toggleCameraPreview(e.target.checked);
            });
        }

        const setupSegmented = (containerId, settingKey) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            const buttons = container.querySelectorAll('.seg-btn');
            const currentVal = settingsManager.get(settingKey);

            buttons.forEach(btn => {
                if (btn.dataset.val === currentVal) btn.classList.add('active');
                else btn.classList.remove('active');

                btn.addEventListener('click', () => {
                    soundEngine.playClick();
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    settingsManager.set(settingKey, btn.dataset.val);
                });
            });
        };

        setupSegmented('seg-smoothing', 'aimSmoothing');
        setupSegmented('seg-chargespeed', 'chargeSpeed');
        setupSegmented('seg-aimassist', 'aimAssist');
        setupSegmented('seg-difficulty', 'keeperDifficulty');

        // Theme Appearance Control (AUTO / DAY / NIGHT)
        const themeDesc = document.getElementById('setting-theme-desc');
        const updateThemeLabel = () => {
            if (themeDesc && settingsManager.getThemeLabel) {
                themeDesc.innerText = settingsManager.getThemeLabel();
            }
        };
        updateThemeLabel();

        const themeContainer = document.getElementById('seg-theme');
        if (themeContainer) {
            const themeBtns = themeContainer.querySelectorAll('.seg-btn');
            const curTheme = settingsManager.get('theme') || 'auto';
            themeBtns.forEach(b => {
                if (b.dataset.val === curTheme) b.classList.add('active');
                else b.classList.remove('active');

                b.addEventListener('click', () => {
                    soundEngine.playClick();
                    themeBtns.forEach(btn => btn.classList.remove('active'));
                    b.classList.add('active');
                    settingsManager.set('theme', b.dataset.val);
                    updateThemeLabel();
                });
            });
        }

        document.getElementById('btn-close-settings')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('settings');
        });

        document.getElementById('btn-save-settings-close')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('settings');
        });

        document.getElementById('btn-setting-recalibrate')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('settings');
            if (this.onRecalibrateClicked) this.onRecalibrateClicked();
        });

        document.getElementById('btn-reset-defaults')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (confirm('Reset all settings to default values?')) {
                settingsManager.resetDefaults();
                this.initSettingsUI();
            }
        });
    }

    updateAudioButtonState() {
        if (!this.dom.audioToggleBtn) return;
        const muted = soundEngine.isMuted();
        this.dom.audioToggleBtn.innerHTML = muted
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    }

    toggleCameraPreview(visible) {
        if (this.dom.pipContainer) {
            if (!visible) this.dom.pipContainer.classList.add('collapsed');
            else this.dom.pipContainer.classList.remove('collapsed');
        }
    }

    showScreen(screenKey) {
        const screens = [
            this.dom.mainMenu,
            this.dom.trackingModeSelect,
            this.dom.gameModeSelect,
            this.dom.matchLengthSelect,
            this.dom.howToPlay,
            this.dom.gameplayHUD
        ];

        screens.forEach(s => {
            if (s) {
                s.classList.remove('active');
                s.style.display = 'none';
            }
        });

        const target = this.dom[screenKey];
        if (target) {
            target.style.display = 'flex';
            requestAnimationFrame(() => target.classList.add('active'));
        }

        if (screenKey === 'gameplayHUD') {
            if (this.dom.pipContainer) this.dom.pipContainer.style.display = 'block';
            if (this.dom.btnPause) this.dom.btnPause.style.display = 'flex';
        } else {
            if (this.dom.pipContainer) this.dom.pipContainer.style.display = 'none';
            if (this.dom.btnPause) this.dom.btnPause.style.display = 'none';
            if (this.dom.practiceToolbar) this.dom.practiceToolbar.style.display = 'none';
        }
    }

    showModal(modalKey) {
        const target = this.dom[modalKey];
        if (target) {
            target.style.display = 'flex';
            requestAnimationFrame(() => target.classList.add('visible'));
        }
    }

    hideModal(modalKey) {
        const target = this.dom[modalKey];
        if (target) {
            target.classList.remove('visible');
            setTimeout(() => { target.style.display = 'none'; }, 240);
        }
    }

    showPauseModal() {
        this.showModal('pauseModal');
    }

    hidePauseModal() {
        this.hideModal('pauseModal');
    }

    togglePauseModal() {
        if (this.dom.pauseModal?.classList.contains('visible')) {
            if (this.onResumeClicked) this.onResumeClicked();
        } else {
            this.showPauseModal();
        }
    }

    showGameplayHUD() {
        this.showScreen('gameplayHUD');
        if (this.dom.practiceToolbar) this.dom.practiceToolbar.style.display = 'none';
    }

    showPracticeHUD() {
        this.showScreen('gameplayHUD');
        if (this.dom.practiceToolbar) this.dom.practiceToolbar.style.display = 'flex';
        if (this.dom.soloStats) this.dom.soloStats.style.display = 'none';
        if (this.dom.twoPlayerStats) this.dom.twoPlayerStats.style.display = 'none';
    }

    setStatusText(text) {
        if (this.dom.hudStatusPill) {
            this.dom.hudStatusPill.innerText = text;
        }
    }

    // ============================================================
    // PLAYER ENROLLMENT & CALIBRATION UX (Phase 2 & 5)
    // ============================================================
    showCalibrationScreen(playerNum = 1, trackingMode = 'head', inputManager = null) {
        const cal = this.dom.calibrationOverlay;
        if (!cal) return;

        const title = document.getElementById('cal-title');
        const desc = document.getElementById('cal-desc');

        if (title) title.innerText = `PLAYER ${playerNum} SETUP`;
        if (desc) desc.innerText = "Let's lock onto you.";

        if (this.dom.faceGuideFrame) {
            this.dom.faceGuideFrame.style.display = trackingMode === 'head' ? 'flex' : 'none';
            this.dom.faceGuideFrame.className = 'face-guide-frame';
        }
        if (this.dom.bodyGuideFrame) {
            this.dom.bodyGuideFrame.style.display = trackingMode === 'body' ? 'flex' : 'none';
            this.dom.bodyGuideFrame.className = 'body-guide-frame';
        }

        if (inputManager && this.dom.calWebcamPreview) {
            inputManager.attachPreviewTo(this.dom.calWebcamPreview);
        }

        if (this.dom.calProgressFill) this.dom.calProgressFill.style.width = '0%';
        if (this.dom.calQualityDots) {
            const dots = this.dom.calQualityDots.querySelectorAll('.qdot');
            dots.forEach(d => d.classList.remove('filled'));
        }
        if (this.dom.calSuccessCard) this.dom.calSuccessCard.style.display = 'none';

        if (this.dom.btnCalStartMatch) this.dom.btnCalStartMatch.style.display = 'none';
        if (this.dom.btnCalRecalibrate) this.dom.btnCalRecalibrate.style.display = 'none';
        if (this.dom.btnCalReady) this.dom.btnCalReady.style.display = 'none';
        if (this.dom.btnCalBack) this.dom.btnCalBack.style.display = 'inline-block';

        if (inputManager && (inputManager.cameraState === 'CAMERA_DENIED' || inputManager.cameraState === 'CAMERA_UNAVAILABLE')) {
            this.showCameraError(inputManager.cameraError);
        } else if (this.dom.calCameraFallback) {
            this.dom.calCameraFallback.style.display = 'none';
        }

        if (this.dom.calStatusBadge && this.dom.calStatusText) {
            this.dom.calStatusBadge.className = 'cal-status-badge';
            if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⏳';
            this.dom.calStatusText.innerText = 'REQUESTING CAMERA';
        }
        if (this.dom.calSubtext) {
            this.dom.calSubtext.innerText = 'Please allow camera access in your browser prompt...';
        }
        if (this.dom.calStepCount) {
            this.dom.calStepCount.innerText = '';
        }

        this.calibrationStartTime = performance.now();
        cal.style.display = 'flex';
        cal.classList.add('visible');
    }

    updateStepIndicator(step) {
        const step1 = document.getElementById('step-ind-1');
        const step2 = document.getElementById('step-ind-2');
        const step3 = document.getElementById('step-ind-3');
        if (!step1 || !step2 || !step3) return;

        step1.className = 'step-item';
        step2.className = 'step-item';
        step3.className = 'step-item';

        if (step === 1) {
            step1.classList.add('active');
        } else if (step === 2) {
            step1.classList.add('completed');
            step2.classList.add('active');
        } else if (step >= 3) {
            step1.classList.add('completed');
            step2.classList.add('completed');
            step3.classList.add('active');
        }
    }

    updateCalibrationFeedback(positionStatus = 'OK', isTracking = true, progress = null, trackingMode = 'head') {
        if (!this.dom.calStatusBadge || !this.dom.calStatusText) return;

        let label = 'LOOK DIRECTLY AT CAMERA';
        let icon = '🎯';
        let badgeClass = 'cal-status-badge ok';
        let guideModifier = 'aligned';
        let hint = 'Hold still to complete setup';

        // 1. Hardware, Network & Model Lifecycle Failures and Startup Progression
        switch (positionStatus) {
            case 'CAMERA_REQUESTING':
                this.dom.calStatusText.innerText = 'REQUESTING CAMERA';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⏳';
                this.dom.calStatusBadge.className = 'cal-status-badge';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Please allow camera access in your browser prompt.';
                this.updateStepIndicator(0);
                return;
            case 'CAMERA_DENIED':
                this.dom.calStatusText.innerText = 'CAMERA ACCESS DENIED';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '🚫';
                this.dom.calStatusBadge.className = 'cal-status-badge error';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Camera access was blocked. Enable camera permissions in address bar.';
                this.showCameraError('NotAllowedError');
                this.updateStepIndicator(0);
                return;
            case 'CAMERA_UNAVAILABLE':
            case 'CAMERA_OFF':
                this.dom.calStatusText.innerText = 'CAMERA UNAVAILABLE';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '📷';
                this.dom.calStatusBadge.className = 'cal-status-badge error';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'No camera device found or device busy. Connect camera or use keyboard.';
                this.showCameraError('NotFoundError');
                this.updateStepIndicator(0);
                return;
            case 'CAMERA_LOST':
                this.dom.calStatusText.innerText = 'CAMERA STREAM LOST';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⚠️';
                this.dom.calStatusBadge.className = 'cal-status-badge error';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Camera stream was disconnected. Click Try Again.';
                this.showCameraError('CameraLost');
                this.updateStepIndicator(0);
                return;
            case 'VIDEO_WAITING':
                this.dom.calStatusText.innerText = 'WAITING FOR VIDEO';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⏳';
                this.dom.calStatusBadge.className = 'cal-status-badge';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Receiving video stream from camera hardware...';
                this.updateStepIndicator(1);
                return;
            case 'VIDEO_TIMEOUT':
                this.dom.calStatusText.innerText = 'VIDEO INITIALIZATION TIMED OUT';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⚠️';
                this.dom.calStatusBadge.className = 'cal-status-badge error';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Camera stream connected but video frames timed out. Click Try Again.';
                this.showCameraError('VideoTimeout');
                this.updateStepIndicator(0);
                return;
            case 'MODEL_LOADING':
                this.dom.calStatusText.innerText = 'LOADING FACE TRACKER';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⏳';
                this.dom.calStatusBadge.className = 'cal-status-badge';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Loading MediaPipe facial landmark neural network...';
                this.updateStepIndicator(1);
                return;
            case 'MODEL_ERROR':
                this.dom.calStatusText.innerText = 'MODEL LOAD FAILED';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⚠️';
                this.dom.calStatusBadge.className = 'cal-status-badge error';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Failed to load face tracking neural network. Check network and click Try Again.';
                this.showCameraError('ModelError');
                this.updateStepIndicator(0);
                return;
            case 'INFERENCE_ERROR':
                this.dom.calStatusText.innerText = 'INFERENCE FAILED';
                if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '⚠️';
                this.dom.calStatusBadge.className = 'cal-status-badge error';
                if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Vision inference encountered a runtime error. Click Try Again.';
                this.showCameraError('InferenceError');
                this.updateStepIndicator(1);
                return;
        }

        const stage = progress ? progress.stage : 'WAITING';

        if (stage === 'ERROR') {
            label = progress.stageLabel || 'CAMERA ACCESS REQUIRED';
            hint = 'Camera access is required for tracking.';
            icon = '✕';
            badgeClass = 'cal-status-badge error';
            guideModifier = '';
            this.updateStepIndicator(0);
            if (this.dom.calSuccessCard) this.dom.calSuccessCard.style.display = 'none';
            if (this.dom.btnCalStartMatch) this.dom.btnCalStartMatch.style.display = 'none';
        } else if (stage === 'IDENTITY') {
            const reason = progress.rejectionReason;
            const accepted = progress.samples || 0;
            const req = progress.required || 24;

            if (reason) {
                label = reason;
                if (reason.includes('MULTIPLE FACES')) {
                    icon = '👥';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Center yourself in the guide or ask background persons to step back';
                } else if (reason.includes('CLOSER')) {
                    icon = '🔍';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = `Move closer to fill the oval guide (${accepted} / ${req} samples)`;
                } else if (reason.includes('BACK')) {
                    icon = '↔️';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = `Step or lean slightly back (${accepted} / ${req} samples)`;
                } else if (reason.includes('LEFT') || reason.includes('RIGHT') || reason.includes('UP') || reason.includes('DOWN')) {
                    icon = '📍';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = `Center your face in the oval (${accepted} / ${req} samples)`;
                } else if (reason.includes('LIGHT') || reason.includes('DARK') || reason.includes('GLARE')) {
                    icon = '💡';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = reason;
                } else if (reason.includes('LEVEL') || reason.includes('STRAIGHT') || reason.includes('AHEAD')) {
                    icon = '📐';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = `Look directly forward at the camera (${accepted} / ${req} samples)`;
                } else if (reason.includes('STILL')) {
                    icon = '🎯';
                    badgeClass = 'cal-status-badge ok';
                    guideModifier = 'aligned';
                    hint = `Hold still to collect samples (${accepted} / ${req})`;
                } else if (reason.includes('NOT DETECTED')) {
                    icon = '○';
                    badgeClass = 'cal-status-badge';
                    guideModifier = '';
                    hint = 'Position your face inside the framing guide';
                } else {
                    icon = '○';
                    badgeClass = 'cal-status-badge';
                    guideModifier = '';
                    hint = reason;
                }
            } else {
                label = 'FACE ALIGNED ✓';
                icon = '✓';
                badgeClass = 'cal-status-badge ok';
                guideModifier = 'aligned';
                hint = `CAPTURING SAMPLES: ${accepted} / ${req} — HOLD STILL`;
            }
            this.updateStepIndicator(1);
        } else if (stage === 'HEAD_POSE' || stage === 'CALIBRATING') {
            label = trackingMode === 'head' ? 'CALIBRATING NEUTRAL HEAD POSE' : 'CALIBRATING BODY STANCE';
            const accepted = progress.samples || 0;
            const req = progress.required || 24;
            hint = `SAMPLES: ${accepted} / ${req} — Sit naturally and look straight ahead.`;
            icon = '🎯';
            badgeClass = 'cal-status-badge ok';
            guideModifier = 'aligned calibrating';
            this.updateStepIndicator(2);
        } else if (stage === 'LOCKED') {
            label = 'PLAYER 1 READY ✓';
            hint = 'Neutral posture calibrated. Primary player locked.';
            icon = '✓';
            badgeClass = 'cal-status-badge success';
            guideModifier = 'complete';
            this.updateStepIndicator(3);
        } else {
            this.updateStepIndicator(1);
            switch (positionStatus) {
                case 'MULTIPLE_FACES':
                    label = 'MULTIPLE FACES DETECTED';
                    icon = '👥';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Center yourself in the guide or ask background persons to step back';
                    break;
                case 'MOVE_CLOSER':
                    label = 'MOVE CLOSER';
                    icon = '🔍';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Move slightly closer to the camera';
                    break;
                case 'MOVE_BACK':
                    label = 'MOVE BACK';
                    icon = '↔️';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Lean or step slightly back';
                    break;
                case 'MOVE_RIGHT':
                    label = 'MOVE RIGHT';
                    icon = '👉';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Center yourself in the guide';
                    break;
                case 'MOVE_LEFT':
                    label = 'MOVE LEFT';
                    icon = '👈';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Center yourself in the guide';
                    break;
                case 'LEVEL_HEAD':
                    label = 'LEVEL YOUR HEAD';
                    icon = '⚖️';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Keep your head level with shoulders';
                    break;
                case 'LOOK_STRAIGHT':
                    label = 'LOOK STRAIGHT AT CAMERA';
                    icon = '👀';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Turn face directly towards camera lens';
                    break;
                case 'LOOK_AHEAD':
                    label = 'LOOK STRAIGHT AHEAD';
                    icon = '👀';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Tilt face to look directly straight';
                    break;
                case 'STEADY_HEAD':
                    label = 'HOLD STILL';
                    icon = '⏳';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Keep head steady to capture baseline';
                    break;
                case 'IMPROVE_LIGHTING':
                    label = 'IMPROVE LIGHTING';
                    icon = '💡';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Room is too dim for tracking. Turn on room lights';
                    break;
                case 'FACE_TOO_DARK':
                    label = 'FACE TOO DARK (BACKLIT)';
                    icon = '☀️';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Bright light behind you. Turn to face light source';
                    break;
                case 'FULL_BODY_REQUIRED':
                    label = 'FULL BODY REQUIRED';
                    icon = '↔️';
                    badgeClass = 'cal-status-badge warning';
                    guideModifier = 'tracking';
                    hint = 'Step back so full body is visible';
                    break;
                case 'NO_BODY':
                case 'NO_FACE':
                case 'SEARCHING_FOR_FACE':
                default:
                    label = trackingMode === 'head' ? 'SEARCHING FOR FACE' : 'SEARCHING FOR BODY';
                    icon = '○';
                    badgeClass = 'cal-status-badge';
                    guideModifier = '';
                    hint = 'Position yourself in the guide to begin';
                    break;
            }
        }

        this.dom.calStatusText.innerText = label;
        if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = icon;
        this.dom.calStatusBadge.className = badgeClass;
        if (this.dom.calSubtext) this.dom.calSubtext.innerText = hint;

        const activeGuide = trackingMode === 'head' ? this.dom.faceGuideFrame : this.dom.bodyGuideFrame;
        if (activeGuide) {
            const baseClass = trackingMode === 'head' ? 'face-guide-frame' : 'body-guide-frame';
            activeGuide.className = guideModifier ? `${baseClass} ${guideModifier}` : baseClass;
        }

        if (progress) {
            const pct = progress.percent || 0;
            if (this.dom.calProgressFill) {
                this.dom.calProgressFill.style.width = `${pct}%`;
            }

            if (this.dom.calStepCount) {
                if (progress.samples !== undefined && progress.required) {
                    this.dom.calStepCount.innerText = `${progress.samples} / ${progress.required}`;
                } else if (pct > 0) {
                    this.dom.calStepCount.innerText = `${pct}%`;
                } else {
                    this.dom.calStepCount.innerText = '';
                }
            }

            if (this.dom.calQualityDots) {
                const dots = this.dom.calQualityDots.querySelectorAll('.qdot');
                dots.forEach((dot, idx) => {
                    if (idx < progress.quality) dot.classList.add('filled');
                    else dot.classList.remove('filled');
                });
            }
        }
    }

    showCalibrationSuccess() {
        this.updateStepIndicator(3);

        if (this.dom.calStatusBadge && this.dom.calStatusText) {
            this.dom.calStatusBadge.className = 'cal-status-badge success';
            if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '✓';
            this.dom.calStatusText.innerText = 'PLAYER LOCKED ✓';
        }

        if (this.dom.faceGuideFrame) this.dom.faceGuideFrame.className = 'face-guide-frame complete';
        if (this.dom.bodyGuideFrame) this.dom.bodyGuideFrame.className = 'body-guide-frame complete';

        if (this.dom.calProgressFill) this.dom.calProgressFill.style.width = '100%';
        if (this.dom.calStepCount) this.dom.calStepCount.innerText = '24 / 24';
        if (this.dom.calSubtext) this.dom.calSubtext.innerText = 'Neutral position saved. Other faces will be ignored.';

        if (this.dom.calSuccessCard) {
            const title = this.dom.calSuccessCard.querySelector('.cal-success-title');
            const desc = this.dom.calSuccessCard.querySelector('.cal-success-desc');
            if (title) title.innerText = 'PLAYER 1 RECOGNIZED ✓';
            if (desc) desc.innerText = 'Your natural posture is calibrated. Other faces will be ignored.';
            this.dom.calSuccessCard.style.display = 'flex';
        }

        if (this.dom.btnCalStartMatch) {
            this.dom.btnCalStartMatch.style.display = 'inline-block';
            this.dom.btnCalStartMatch.focus();
        }
        if (this.dom.btnCalRecalibrate) this.dom.btnCalRecalibrate.style.display = 'inline-block';
        if (this.dom.btnCalReady) this.dom.btnCalReady.style.display = 'none';
        if (this.dom.btnCalBack) this.dom.btnCalBack.style.display = 'inline-block';
    }

    showCameraError(errorType) {
        if (!this.dom.calCameraFallback) return;

        const title = this.dom.calFallbackTitle || document.getElementById('cal-fallback-title');
        const desc = this.dom.calFallbackDesc || document.getElementById('cal-fallback-desc');

        if (errorType === 'NotAllowedError' || errorType === 'PermissionDeniedError') {
            if (title) title.innerText = 'CAMERA ACCESS DENIED';
            if (desc) desc.innerText = 'Camera access was blocked by your browser. Please allow camera permissions to continue.';
        } else if (errorType === 'VideoTimeout') {
            if (title) title.innerText = 'VIDEO INITIALIZATION TIMED OUT';
            if (desc) desc.innerText = 'Webcam connected, but video frames timed out before becoming ready. Click TRY AGAIN to reconnect.';
        } else if (errorType === 'ModelError' || errorType === 'ModelLoadFailed') {
            if (title) title.innerText = 'MODEL LOAD FAILED';
            if (desc) desc.innerText = 'Face tracking model assets could not be loaded. Check your internet connection or click TRY AGAIN.';
        } else if (errorType === 'InferenceError') {
            if (title) title.innerText = 'INFERENCE FAILED';
            if (desc) desc.innerText = 'Face tracking inference encountered a runtime error. Click TRY AGAIN to restart tracking.';
        } else {
            if (title) title.innerText = 'CAMERA UNAVAILABLE';
            if (desc) desc.innerText = 'No camera device detected or camera in use. Check your webcam or use keyboard.';
        }

        this.dom.calCameraFallback.style.display = 'flex';

        // STRICT P0 FIX: NEVER show success or 100% when camera is unavailable
        if (this.dom.calSuccessCard) this.dom.calSuccessCard.style.display = 'none';
        if (this.dom.btnCalStartMatch) this.dom.btnCalStartMatch.style.display = 'none';
        if (this.dom.calProgressFill) this.dom.calProgressFill.style.width = '0%';
        if (this.dom.calStepCount) this.dom.calStepCount.innerText = '';
        if (this.dom.calStatusBadge && this.dom.calStatusText) {
            this.dom.calStatusBadge.className = 'cal-status-badge error';
            if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '✕';
            if (errorType === 'NotAllowedError' || errorType === 'PermissionDeniedError') {
                this.dom.calStatusText.innerText = 'CAMERA ACCESS DENIED';
            } else if (errorType === 'VideoTimeout') {
                this.dom.calStatusText.innerText = 'VIDEO INITIALIZATION TIMED OUT';
            } else if (errorType === 'ModelError' || errorType === 'ModelLoadFailed') {
                this.dom.calStatusText.innerText = 'MODEL LOAD FAILED';
            } else if (errorType === 'InferenceError') {
                this.dom.calStatusText.innerText = 'INFERENCE FAILED';
            } else {
                this.dom.calStatusText.innerText = 'CAMERA UNAVAILABLE';
            }
        }
        if (this.dom.calSubtext) {
            this.dom.calSubtext.innerText = 'Startup failed. Click TRY AGAIN to retry or USE KEYBOARD to play.';
        }
        this.updateStepIndicator(0);
    }

    hideCameraError() {
        if (this.dom.calCameraFallback) {
            this.dom.calCameraFallback.style.display = 'none';
        }
    }

    hideCalibrationScreen() {
        const cal = this.dom.calibrationOverlay;
        if (cal) {
            cal.classList.remove('visible');
            setTimeout(() => { cal.style.display = 'none'; }, 200);
        }
    }

    showCountdown(value) {
        this.hideCalibrationScreen();
        const overlay = this.dom.countdownOverlay;
        const text = document.getElementById('countdown-text');
        if (overlay && text) {
            text.innerText = value;
            text.classList.remove('pulse');
            void text.offsetWidth;
            text.classList.add('pulse');
            overlay.style.display = 'flex';
            overlay.classList.add('visible');
        }
    }

    hideCountdown() {
        const overlay = this.dom.countdownOverlay;
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => { overlay.style.display = 'none'; }, 200);
        }
    }

    // ============================================================
    // MATCH HUD UPDATES
    // ============================================================
    updateSoloHUD(score, timeSec, bestScore) {
        if (this.dom.soloStats) this.dom.soloStats.style.display = 'flex';
        if (this.dom.twoPlayerStats) this.dom.twoPlayerStats.style.display = 'none';

        if (this.dom.scoreVal) this.dom.scoreVal.innerText = score.toString();
        if (this.dom.bestScoreVal) this.dom.bestScoreVal.innerText = bestScore.toString();
        this.updateSoloTime(timeSec);
    }

    updateSoloTime(timeSec) {
        if (!this.dom.timerVal) return;
        const m = Math.floor(timeSec / 60);
        const s = Math.floor(timeSec % 60);
        this.dom.timerVal.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    updateTwoPlayerHUD(p1Score, p2Score, currentP, timeSec) {
        if (this.dom.soloStats) this.dom.soloStats.style.display = 'none';
        if (this.dom.twoPlayerStats) this.dom.twoPlayerStats.style.display = 'flex';

        if (this.dom.p1ScoreVal) this.dom.p1ScoreVal.innerText = p1Score.toString();
        if (this.dom.p2ScoreVal) this.dom.p2ScoreVal.innerText = p2Score.toString();

        if (this.dom.pTimerVal) {
            const m = Math.floor(timeSec / 60);
            const s = Math.floor(timeSec % 60);
            this.dom.pTimerVal.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        const p1Card = document.getElementById('p1-hud-card');
        const p2Card = document.getElementById('p2-hud-card');
        if (p1Card && p2Card) {
            if (currentP === 1) {
                p1Card.classList.add('active-turn');
                p2Card.classList.remove('active-turn');
            } else {
                p2Card.classList.add('active-turn');
                p1Card.classList.remove('active-turn');
            }
        }
    }

    updateAimReticle(aimNormalized, power = 0) {
        if (this.dom.aimReticle) {
            const containerW = window.innerWidth;
            const centerX = containerW / 2;
            const maxOffset = Math.min(390, containerW * 0.36);
            const targetX = centerX + aimNormalized * maxOffset;

            this.dom.aimReticle.style.transform = `translate3d(${targetX}px, -50%, 0)`;

            // Zone label
            if (this.dom.reticleLabel) {
                if (Math.abs(aimNormalized) < 0.18) this.dom.reticleLabel.innerText = 'CENTER';
                else if (aimNormalized < -0.7) this.dom.reticleLabel.innerText = 'LEFT CORNER';
                else if (aimNormalized > 0.7) this.dom.reticleLabel.innerText = 'RIGHT CORNER';
                else if (aimNormalized < 0) this.dom.reticleLabel.innerText = 'MID LEFT';
                else this.dom.reticleLabel.innerText = 'MID RIGHT';
            }

            if (power > 0.72) {
                this.dom.aimReticle.classList.add('armed');
            } else {
                this.dom.aimReticle.classList.remove('armed');
            }
        }

        if (this.dom.aimGuideDot) {
            const pct = (aimNormalized + 1.0) / 2.0 * 100;
            this.dom.aimGuideDot.style.left = `${pct}%`;
        }
    }

    updatePowerMeter(powerNormalized) {
        const pct = Math.round(powerNormalized * 100);
        if (this.dom.powerFill) {
            this.dom.powerFill.style.width = `${pct}%`;
            // 4-Tier power styling
            if (pct >= 88) {
                this.dom.powerFill.style.backgroundColor = '#ff3b30'; // MAX FIRE
            } else if (pct >= 65) {
                this.dom.powerFill.style.backgroundColor = '#ff9500'; // HIGH
            } else if (pct >= 32) {
                this.dom.powerFill.style.backgroundColor = '#ffd700'; // MEDIUM
            } else {
                this.dom.powerFill.style.backgroundColor = '#00e676'; // LOW
            }
        }
        if (this.dom.powerPct) {
            let label = `${pct}%`;
            if (pct >= 90) label += ' (MAX)';
            this.dom.powerPct.innerText = label;
        }
    }

    showShotQuality(label) {
        const badge = this.dom.shotQualityBadge;
        const text = this.dom.shotQualityText;
        if (badge && text) {
            text.innerText = label;
            badge.style.display = 'block';
            badge.classList.remove('pop');
            void badge.offsetWidth;
            badge.classList.add('pop');
            setTimeout(() => { badge.style.display = 'none'; }, 1100);
        }
    }

    showShotResultBanner(title, subtitle, points, resultType) {
        const banner = this.dom.resultBanner;
        if (!banner) return;

        const bTitle = document.getElementById('result-title');
        const bSub = document.getElementById('result-sub');
        const bPts = document.getElementById('result-points');

        if (bTitle) bTitle.innerText = title;
        if (bSub) bSub.innerText = subtitle;
        if (bPts) {
            bPts.innerText = points > 0 ? `+${points} PTS` : '';
            bPts.style.display = points > 0 ? 'inline-block' : 'none';
        }

        banner.className = 'result-banner';
        if (resultType === 'PERFECT') banner.classList.add('perfect');
        else if (resultType === 'GOAL') banner.classList.add('goal');
        else if (resultType === 'SAVED') banner.classList.add('saved');
        else banner.classList.add('miss');

        banner.style.display = 'flex';
        requestAnimationFrame(() => banner.classList.add('visible'));

        setTimeout(() => {
            banner.classList.remove('visible');
            setTimeout(() => { banner.style.display = 'none'; }, 300);
        }, 1900);
    }

    showPlayerSwitchModal(nextPlayerNum, lastPlayerScore, onReady) {
        const modal = this.dom.playerSwitchModal;
        if (!modal) {
            onReady();
            return;
        }

        const title = document.getElementById('switch-title');
        const summary = document.getElementById('switch-score-summary');
        const btnReady = document.getElementById('btn-switch-ready');

        if (title) title.innerText = `PASS THE PHONE TO PLAYER ${nextPlayerNum}`;
        if (summary) summary.innerText = `PLAYER 1 FINISHED WITH ${lastPlayerScore} POINTS`;

        const handler = () => {
            btnReady?.removeEventListener('click', handler);
            this.hideModal('playerSwitchModal');
            onReady();
        };

        btnReady?.addEventListener('click', handler);
        this.showModal('playerSwitchModal');
    }

    // ============================================================
    // MATCH RESULT SCREEN (Phase 27 & 28)
    // ============================================================
    showSoloGameOver(stats) {
        const modal = this.dom.gameOverModal;
        if (!modal) return;

        if (this.dom.pipContainer) this.dom.pipContainer.style.display = 'none';
        if (this.dom.btnPause) this.dom.btnPause.style.display = 'none';

        this.lastMatchShareData = { mode: 'solo', ...stats };

        const title = document.getElementById('game-over-title');
        const sub = document.getElementById('game-over-subtitle');
        const details = document.getElementById('game-over-details');

        if (title) title.innerText = 'FULL TIME';
        if (sub) {
            sub.style.display = 'block';
            sub.innerText = `FINAL SCORE: ${stats.score} PTS`;
        }

        if (details) {
            details.innerHTML = `
                <div class="stat-row highlight"><span>HIGH SCORE</span><strong>${stats.bestScore}</strong></div>
                <div class="stat-row"><span>GOALS</span><strong>${stats.goals}</strong></div>
                <div class="stat-row"><span>SHOTS TAKEN</span><strong>${stats.shotsTaken}</strong></div>
                <div class="stat-row"><span>ACCURACY</span><strong>${stats.accuracy}%</strong></div>
                <div class="stat-row"><span>SAVES DENIED</span><strong>${stats.saves}</strong></div>
                <div class="stat-row"><span>MISSES</span><strong>${stats.misses}</strong></div>
            `;
        }

        this.showModal('gameOverModal');
    }

    showTwoPlayerGameOver(data) {
        const modal = this.dom.gameOverModal;
        if (!modal) return;

        if (this.dom.pipContainer) this.dom.pipContainer.style.display = 'none';
        if (this.dom.btnPause) this.dom.btnPause.style.display = 'none';

        this.lastMatchShareData = { mode: '2player', ...data };

        const title = document.getElementById('game-over-title');
        const sub = document.getElementById('game-over-subtitle');
        const details = document.getElementById('game-over-details');

        if (title) title.innerText = 'FULL TIME';
        if (sub) {
            sub.style.display = 'none';
            sub.innerText = '';
        }

        const isP1Winner = data.player1Score > data.player2Score;
        const isP2Winner = data.player2Score > data.player1Score;

        if (details) {
            details.innerHTML = `
                <div class="versus-result-container">
                    <div class="versus-cards">
                        <div class="versus-player-card ${isP1Winner ? 'winner' : ''}">
                            <div class="versus-player-label">PLAYER 1</div>
                            <div class="versus-player-score">${data.player1Score}</div>
                            <div class="versus-player-sub">${data.p1Goals || 0} GOALS • ${data.p1Accuracy || 0}% ACC</div>
                        </div>
                        <div class="versus-divider">VS</div>
                        <div class="versus-player-card ${isP2Winner ? 'winner' : ''}">
                            <div class="versus-player-label">PLAYER 2</div>
                            <div class="versus-player-score">${data.player2Score}</div>
                            <div class="versus-player-sub">${data.p2Goals || 0} GOALS • ${data.p2Accuracy || 0}% ACC</div>
                        </div>
                    </div>
                    <div class="versus-winner-banner">
                        <span class="winner-trophy">🏆</span>
                        <span class="winner-text">${data.winner}</span>
                    </div>
                </div>
            `;
        }

        this.showModal('gameOverModal');
    }

    // Dynamic Share using current window.location.href (Phase 28)
    shareMatchResult() {
        const btn = document.getElementById('btn-game-over-share');
        const currentUrl = window.location.href;

        let shareText = '⚽ TILT KICK — FULL TIME RESULT\n';
        if (this.lastMatchShareData) {
            if (this.lastMatchShareData.mode === '2player') {
                shareText += `PLAYER 1: ${this.lastMatchShareData.player1Score} pts | PLAYER 2: ${this.lastMatchShareData.player2Score} pts\n`;
                shareText += `Result: ${this.lastMatchShareData.winner}!\n`;
            } else {
                shareText += `Score: ${this.lastMatchShareData.score} pts | Goals: ${this.lastMatchShareData.goals} | Accuracy: ${this.lastMatchShareData.accuracy}%\n`;
            }
        }
        shareText += `Play the head-controlled football challenge here:\n${currentUrl}`;

        // Prefer Web Share API
        if (navigator.share) {
            navigator.share({
                title: 'TILT KICK — Head. Tilt. Kick.',
                text: shareText,
                url: currentUrl
            }).catch(() => {
                this.fallbackCopyToClipboard(shareText, btn);
            });
        } else {
            this.fallbackCopyToClipboard(shareText, btn);
        }
    }

    fallbackCopyToClipboard(text, btn) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (btn) {
                    const prev = btn.innerText;
                    btn.innerText = 'RESULT COPIED ✓';
                    setTimeout(() => { btn.innerText = prev; }, 2200);
                }
            }).catch(() => {
                window.prompt('Copy match result to share:', text);
            });
        } else {
            window.prompt('Copy match result to share:', text);
        }
    }

    // Camera Window Badge (Phase 24)
    updateTrackingBadge(statusText, isTracking, isCameraActive = false) {
        if (!this.dom.pipStatusBadge) return;
        this.dom.pipStatusBadge.innerText = statusText;

        if (!isCameraActive) {
            this.dom.pipStatusBadge.className = 'pip-badge off';
            if (this.dom.pipToggleBtn) this.dom.pipToggleBtn.innerText = 'CAM OFF';
        } else if (isTracking) {
            this.dom.pipStatusBadge.className = 'pip-badge tracking';
            if (this.dom.pipToggleBtn) this.dom.pipToggleBtn.innerText = 'CAM ACTIVE';
        } else {
            this.dom.pipStatusBadge.className = 'pip-badge searching';
            if (this.dom.pipToggleBtn) this.dom.pipToggleBtn.innerText = 'SEARCHING';
        }
    }

    toggleDebugOverlay() {
        const overlay = this.dom.debugOverlay;
        if (!overlay) return;
        const isHidden = overlay.style.display === 'none';
        overlay.style.display = isHidden ? 'block' : 'none';
    }

    // Complete Developer Vision Telemetry Overlay (Phase 18 & 41)
    updateDebugStats(stats) {
        if (!this.dom.debugOverlay || this.dom.debugOverlay.style.display === 'none') return;

        // Render FPS calculation
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= 500) {
            this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }

        const setField = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };

        setField('dbg-cam-status', stats.cameraState || 'IDLE');
        setField('dbg-diag-stage', stats.diagnosticStage || 'UNKNOWN');
        setField('dbg-video-elem', stats.activeVideoId || 'NONE');
        setField('dbg-cam-res', stats.hardwareRes || '—');
        setField('dbg-frame-age', stats.frameAge || '0 ms');
        setField('dbg-model-state', stats.modelState || 'NOT READY');
        setField('dbg-render-fps', `${this.currentFps} FPS`);
        setField('dbg-inference-fps', stats.inferenceFps || '0 FPS');
        setField('dbg-inference-dur', stats.inferenceDuration || '0 ms');
        setField('dbg-lighting', stats.lighting || 'NORMAL');
        setField('dbg-player-id', stats.playerId || 'SEARCHING');
        setField('dbg-face-count', `${stats.faceCount || 0} (${stats.ignoredFaces || 0} CROWD)`);
        setField('dbg-face-conf', stats.detectionConf || '0%');
        setField('dbg-landmark-valid', stats.landmarkValid || 'INVALID');
        setField('dbg-accepted-samples', `${stats.acceptedSamples || 0} / 24`);
        setField('dbg-rejected-samples', stats.rejectedSamples !== undefined ? String(stats.rejectedSamples) : '0');
        setField('dbg-rejection-reason', stats.lastRejection || 'NONE');
        setField('dbg-raw', `${stats.rawRoll || 0}°`);
        setField('dbg-neutral', `${stats.neutralRoll || 0}°`);
        setField('dbg-smoothed', `${stats.relativeRoll || stats.smoothedRoll || 0}°`);
        setField('dbg-pitch', `${stats.rawPitch || 0} / ${stats.pitchVel || 0}`);
        setField('dbg-neutral-pitch', `${stats.neutralPitch || 0}°`);
        setField('dbg-relative-pitch', `${stats.relativePitch || 0}°`);
        setField('dbg-aim', stats.aim || 'CENTER (0.00)');
        setField('dbg-power', `${stats.power || 0}%`);
        setField('dbg-nod-state', stats.nodState || 'READY');
        setField('dbg-status', stats.status || 'NO FACE');
        setField('dbg-cal-state', stats.calibrationState || 'IDLE');

        const errEl = document.getElementById('dbg-error');
        if (errEl) {
            errEl.innerText = stats.lastError || 'NONE';
            errEl.style.color = (stats.lastError && stats.lastError !== 'NONE') ? '#ff5252' : '#00e676';
        }
    }
}
