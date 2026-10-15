// Master Game Manager for TILT KICK
// 1. Authoritative State System: Solo, Practice, 2-Player Pass-and-Play
// 2. Strict Real-World Outcome Evaluation (Zero Pre-Determined Outcome Dice Rolls)
// 3. Continuous Swept Goalkeeper Trajectory Collision Interception
// 4. Physical Ball-In-Net Goal Detection with 3D Dynamic Net Bulge & Ripple
// 5. Woodwork Collision (Post & Crossbar) with Metallic Rebounds & Camera Micro-Shake
// 6. Decoupled Center Nod Kick Guarantee (Power > 0 Not Required)

import { soundEngine } from '../audio/SoundEngine.js';
import { ShotEngine } from './ShotEngine.js';
import { settingsManager } from '../utils/SettingsManager.js';

export class GameManager {
    constructor(stadiumScene, ball, goalkeeper, inputManager, uiManager) {
        this.stadiumScene = stadiumScene;
        this.ball = ball;
        this.goalkeeper = goalkeeper;
        this.inputManager = inputManager;
        this.uiManager = uiManager;
        this.shotEngine = new ShotEngine();

        // Game configuration
        this.gameMode = 'solo'; // 'solo' | '2player' | 'practice'
        this.trackingMode = 'head'; // 'head' | 'body'

        // State Machine
        // 'BOOT' | 'MAIN_MENU' | 'CALIBRATION' | 'CALIBRATED_WAIT' | 'COUNTDOWN' | 'AIMING' | 'CHARGING' | 'SHOT_IN_FLIGHT' | 'RESULT_BANNER' | 'PAUSED' | 'PLAYER_SWITCH' | 'GAME_OVER'
        this.state = 'BOOT';
        this.prePauseState = 'AIMING';

        // Match Timer
        this.matchLengthSec = settingsManager.get('matchLengthSec') || 180;
        this.timeRemaining = this.matchLengthSec;

        // Solo Mode Stats
        this.score = 0;
        this.goals = 0;
        this.shotsTaken = 0;
        this.saves = 0;
        this.misses = 0;
        this.perfectGoals = 0;
        this.currentStreak = 0;
        this.maxStreak = 0;
        this.bestScore = parseInt(localStorage.getItem('tiltkick_highscore') || '0', 10);

        // 2-Player Mode State
        this.currentPlayer = 1;
        this.player1Score = 0;
        this.player2Score = 0;
        this.player1Goals = 0;
        this.player2Goals = 0;
        this.player1Shots = 0;
        this.player2Shots = 0;
        this.player1Results = [];
        this.player2Results = [];

        // Practice Mode State
        this.practiceKeeper = settingsManager.get('practiceKeeper') !== false;

        // Active Shot State
        this.currentAim = 0;
        this.currentPower = 0;
        this.activeShotMeta = null;
        this.activeShotOutcome = null; // Determined physically in flight!
        this.shotFlightTimer = 0;
        this.shotOutcomeResolved = false;
        this.lastSoundChargeTime = 0;

        // Sequence Timers
        this.countdownValue = 3;
        this.countdownTimer = 0;
        this.pauseSafetyTimer = null;
    }

    setGameMode(mode) {
        this.gameMode = mode;
        console.log(`[GameManager] Game mode set to: ${mode}`);
    }

    setTrackingMode(mode) {
        this.trackingMode = mode;
        this.inputManager.setMode(mode);
        console.log(`[GameManager] Tracking mode set to: ${mode}`);
    }

    setMatchLength(sec) {
        this.matchLengthSec = Math.max(30, Math.min(600, sec));
        settingsManager.set('matchLengthSec', this.matchLengthSec);
    }

    startNewGame() {
        soundEngine.init();
        this.matchLengthSec = settingsManager.get('matchLengthSec') || 180;
        this.timeRemaining = this.matchLengthSec;

        if (this.gameMode === 'solo') {
            this.score = 0;
            this.goals = 0;
            this.shotsTaken = 0;
            this.saves = 0;
            this.misses = 0;
            this.perfectGoals = 0;
            this.currentStreak = 0;
            this.maxStreak = 0;
            this.uiManager.updateSoloHUD(this.score, this.timeRemaining, this.bestScore);
        } else if (this.gameMode === '2player') {
            this.currentPlayer = 1;
            this.player1Score = 0;
            this.player2Score = 0;
            this.player1Goals = 0;
            this.player2Goals = 0;
            this.player1Shots = 0;
            this.player2Shots = 0;
            this.player1Results = [];
            this.player2Results = [];
            this.uiManager.updateTwoPlayerHUD(
                this.player1Score, this.player2Score,
                this.currentPlayer, this.timeRemaining
            );
        } else if (this.gameMode === 'practice') {
            this.score = 0;
            this.goals = 0;
            this.shotsTaken = 0;
            this.uiManager.showPracticeHUD();
        }

        this.beginCalibration();
    }

    async beginCalibration() {
        this.state = 'CALIBRATION';
        this.inputManager.lockInput(false);
        this.uiManager.showCalibrationScreen(this.currentPlayer, this.trackingMode, this.inputManager);

        const camOk = await this.inputManager.startCamera();
        if (camOk) {
            this.uiManager.hideCameraError();
            this.inputManager.startCalibration();
        } else {
            this.uiManager.showCameraError(this.inputManager.cameraError);
        }
    }

    onCalibrationComplete() {
        if (!this.inputManager.isCalibrationComplete()) return;
        this.state = 'CALIBRATED_WAIT';
        soundEngine.playCountdown(true);
        this.uiManager.showCalibrationSuccess();
    }

    confirmCalibrationStart() {
        if (!this.inputManager.canStartMatch()) {
            console.warn('[GameManager] Match cannot start: Camera and enrollment requirements not verified.');
            return;
        }
        if (this.state !== 'CALIBRATED_WAIT' && this.state !== 'CALIBRATION') return;
        this.uiManager.hideCalibrationScreen();
        this.startCountdown();
    }

    startCountdown() {
        this.state = 'COUNTDOWN';
        this.countdownValue = 3;
        this.countdownTimer = 0.95;
        this.uiManager.showCountdown(this.countdownValue);
        soundEngine.playCountdown(false);
    }

    beginAiming() {
        this.state = 'AIMING';
        this.ball.reset();
        this.goalkeeper.reset();
        this.inputManager.lockInput(false);
        this.inputManager.resetKickTrigger();
        this.currentAim = 0;
        this.currentPower = 0;
        this.activeShotMeta = null;
        this.activeShotOutcome = null;
        this.shotOutcomeResolved = false;

        if (this.gameMode === 'practice') {
            this.uiManager.showPracticeHUD();
            this.uiManager.setStatusText('PRACTICE: TILT TO AIM • NOD ↑ TO KICK');
        } else {
            this.uiManager.showGameplayHUD();
            this.uiManager.setStatusText(this.trackingMode === 'head' ? 'TILT TO AIM' : 'LEAN TO AIM');
        }
        soundEngine.playWhistle();
    }

    // ============================================================
    // PHYSICAL SHOT EXECUTION & LAUNCH (Phase 23 & 25)
    // ============================================================
    executeKick(aim, power) {
        if (this.state !== 'AIMING' && this.state !== 'CHARGING') return;

        this.state = 'SHOT_IN_FLIGHT';
        this.inputManager.lockInput(true); // Lock input during flight
        this.shotsTaken++;
        this.shotOutcomeResolved = false;
        this.activeShotOutcome = null;

        // Authoritative locked aim (guarantees nod motion does not pull reticle off-target)
        const authoritativeAim = this.inputManager.getLockedKickAim(aim);
        this.currentAim = authoritativeAim;
        // Decoupled kick guarantee: minimum 35% shot power even on immediate center nod without charging
        this.currentPower = Math.max(0.35, power);

        if (this.gameMode === '2player') {
            if (this.currentPlayer === 1) this.player1Shots++;
            else this.player2Shots++;
        }

        // Calculate continuous 3D target coordinates in world space
        const target = this.shotEngine.calculateTarget(this.currentAim, this.currentPower);
        const meta = this.shotEngine.getShotMetadata(target.x, target.y, target.effectivePower);
        this.activeShotMeta = meta;

        // Audio & Visual Feedback
        soundEngine.playKick(this.currentPower);
        this.uiManager.setStatusText('KICK! — BALL IN FLIGHT');
        this.uiManager.showShotQuality(meta.quality);

        // Launch ball along physical ballistic trajectory
        this.ball.shoot(target.x, target.y, this.currentPower);

        // Goalkeeper observes shot and leaps with difficulty-tuned uncertainty
        const keeperEnabled = (this.gameMode !== 'practice' || this.practiceKeeper);
        if (keeperEnabled) {
            const difficulty = settingsManager.get('keeperDifficulty') || 'medium';
            this.goalkeeper.reactToShot(target.x, target.y, difficulty);
        }

        this.shotFlightTimer = this.ball.flightDuration + 0.35;
    }

    // ============================================================
    // PHYSICAL OUTCOME RESOLUTION (Phase 23 & 26)
    // ============================================================
    // Visual outcome and logical outcome are guaranteed 100% IDENTICAL
    resolveShotOutcome() {
        this.state = 'RESULT_BANNER';
        const res = this.activeShotOutcome || {
            result: 'MISS',
            title: 'OFF TARGET!',
            subtitle: 'SHOT WIDE',
            points: 0
        };

        if (res.result === 'GOAL' || res.result === 'PERFECT') {
            this.goals++;
            this.currentStreak++;
            if (this.currentStreak > this.maxStreak) this.maxStreak = this.currentStreak;
            if (res.result === 'PERFECT') this.perfectGoals++;

            this.score += res.points;
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                localStorage.setItem('tiltkick_highscore', this.bestScore.toString());
            }

            if (this.gameMode === '2player') {
                if (this.currentPlayer === 1) {
                    this.player1Score += res.points;
                    this.player1Goals++;
                    this.player1Results.push('GOAL');
                } else {
                    this.player2Score += res.points;
                    this.player2Goals++;
                    this.player2Results.push('GOAL');
                }
            }

            soundEngine.playGoal();
            this.stadiumScene.triggerGoalCelebration(res.targetX || 0, res.targetY || 1.2);
        } else if (res.result === 'SAVED') {
            this.saves++;
            this.currentStreak = 0;
            if (this.gameMode === '2player') {
                if (this.currentPlayer === 1) this.player1Results.push('SAVED');
                else this.player2Results.push('SAVED');
            }
        } else {
            // MISS (Woodwork or Wide)
            this.misses++;
            this.currentStreak = 0;
            if (this.gameMode === '2player') {
                if (this.currentPlayer === 1) this.player1Results.push('MISS');
                else this.player2Results.push('MISS');
            }
            if (res.subType === 'CROSSBAR' || res.subType === 'POST') {
                soundEngine.playPost();
                this.stadiumScene.triggerPostClang();
            } else {
                soundEngine.playMiss();
            }
        }

        // Update Scoreboards
        if (this.gameMode === 'solo') {
            this.uiManager.updateSoloHUD(this.score, this.timeRemaining, this.bestScore);
        } else if (this.gameMode === '2player') {
            this.uiManager.updateTwoPlayerHUD(
                this.player1Score, this.player2Score,
                this.currentPlayer, this.timeRemaining
            );
        }

        // Show result banner
        this.uiManager.showShotResultBanner(res.title, res.subtitle, res.points, res.result);

        // Advance to next turn
        setTimeout(() => {
            if (this.state === 'RESULT_BANNER') {
                this.advanceTurn();
            }
        }, 2200);
    }

    advanceTurn() {
        if (this.gameMode === 'solo') {
            if (this.timeRemaining <= 0) {
                this.endGame();
            } else {
                this.beginAiming();
            }
        } else if (this.gameMode === 'practice') {
            this.beginAiming();
        } else if (this.gameMode === '2player') {
            if (this.timeRemaining <= 0) {
                if (this.currentPlayer === 1) {
                    this.currentPlayer = 2;
                    this.timeRemaining = this.matchLengthSec;
                    this.state = 'PLAYER_SWITCH';
                    this.inputManager.pauseProcessing(true);
                    this.uiManager.showPlayerSwitchModal(2, this.player1Score, () => {
                        this.inputManager.resetPlayerSession();
                        this.inputManager.pauseProcessing(false);
                        this.beginCalibration();
                    });
                } else {
                    this.endGame();
                }
            } else {
                this.beginAiming();
            }
        }
    }

    togglePause() {
        if (this.state === 'MAIN_MENU' || this.state === 'BOOT' || this.state === 'GAME_OVER') return;

        if (this.state === 'PAUSED') {
            this.resumeGame();
        } else {
            this.pauseGame();
        }
    }

    pauseGame() {
        this.prePauseState = this.state;
        this.state = 'PAUSED';
        this.inputManager.lockInput(true);
        this.inputManager.pauseProcessing(true);
        this.uiManager.showPauseModal();

        if (this.pauseSafetyTimer) clearTimeout(this.pauseSafetyTimer);
        this.pauseSafetyTimer = setTimeout(() => {
            if (this.state === 'PAUSED') {
                this.inputManager.stopCamera();
            }
        }, 60000);
    }

    async resumeGame() {
        if (this.pauseSafetyTimer) {
            clearTimeout(this.pauseSafetyTimer);
            this.pauseSafetyTimer = null;
        }
        this.uiManager.hidePauseModal();
        this.state = this.prePauseState === 'PAUSED' ? 'AIMING' : this.prePauseState;

        if (!this.inputManager.isCameraActive() && this.inputManager.cameraAllowed) {
            await this.inputManager.startCamera();
        }
        this.inputManager.pauseProcessing(false);
        this.inputManager.lockInput(false);
    }

    recalibrate() {
        if (this.pauseSafetyTimer) {
            clearTimeout(this.pauseSafetyTimer);
            this.pauseSafetyTimer = null;
        }
        this.uiManager.hidePauseModal();
        this.inputManager.resetCalibration();
        this.beginCalibration();
    }

    resetPracticeShot() {
        if (this.gameMode === 'practice') {
            this.beginAiming();
        }
    }

    togglePracticeKeeper() {
        this.practiceKeeper = !this.practiceKeeper;
        settingsManager.set('practiceKeeper', this.practiceKeeper);
        return this.practiceKeeper;
    }

    endGame() {
        if (this.pauseSafetyTimer) {
            clearTimeout(this.pauseSafetyTimer);
            this.pauseSafetyTimer = null;
        }
        this.state = 'GAME_OVER';
        this.inputManager.lockInput(true);
        this.inputManager.stopCamera();
        soundEngine.playWhistle();

        if (this.gameMode === 'solo') {
            const accuracy = this.shotsTaken > 0 ? Math.round((this.goals / this.shotsTaken) * 100) : 0;
            settingsManager.recordMatchResult({
                score: this.score,
                goals: this.goals,
                shots: this.shotsTaken,
                saves: this.saves,
                misses: this.misses,
                perfectGoals: this.perfectGoals,
                maxStreak: this.maxStreak
            });

            this.uiManager.showSoloGameOver({
                score: this.score,
                bestScore: this.bestScore,
                goals: this.goals,
                shotsTaken: this.shotsTaken,
                saves: this.saves,
                misses: this.misses,
                accuracy: accuracy
            });
        } else if (this.gameMode === '2player') {
            let winner = 'DRAW';
            if (this.player1Score > this.player2Score) winner = 'PLAYER 1 WINS';
            else if (this.player2Score > this.player1Score) winner = 'PLAYER 2 WINS';

            const p1Acc = this.player1Shots > 0 ? Math.round((this.player1Goals / this.player1Shots) * 100) : 0;
            const p2Acc = this.player2Shots > 0 ? Math.round((this.player2Goals / this.player2Shots) * 100) : 0;

            this.uiManager.showTwoPlayerGameOver({
                player1Score: this.player1Score,
                player2Score: this.player2Score,
                winner: winner,
                p1Goals: this.player1Goals,
                p2Goals: this.player2Goals,
                p1Shots: this.player1Shots,
                p2Shots: this.player2Shots,
                p1Accuracy: p1Acc,
                p2Accuracy: p2Acc,
                p1Results: this.player1Results,
                p2Results: this.player2Results
            });
        }
    }

    update(delta = 1 / 60) {
        if (this.state === 'PAUSED') return;

        // 1. Update Subsystems
        this.inputManager.update(delta);
        this.ball.update(delta);
        this.goalkeeper.update(delta);
        this.stadiumScene.update(delta);

        // 2. State Machine Handling
        if (this.state === 'CALIBRATION') {
            const posStatus = this.inputManager.getPositionStatus();
            const isTracking = this.inputManager.isTracking();
            const progress = this.inputManager.getCalibrationProgress();
            this.uiManager.updateCalibrationFeedback(posStatus, isTracking, progress, this.trackingMode);

            if (this.inputManager.isCalibrationComplete()) {
                this.onCalibrationComplete();
            }
        } else if (this.state === 'COUNTDOWN') {
            this.countdownTimer -= delta;
            if (this.countdownTimer <= 0) {
                this.countdownValue--;
                if (this.countdownValue > 0) {
                    this.countdownTimer = 0.95;
                    this.uiManager.showCountdown(this.countdownValue);
                    soundEngine.playCountdown(false);
                } else if (this.countdownValue === 0) {
                    this.countdownTimer = 0.8;
                    this.uiManager.showCountdown('KICK!');
                    soundEngine.playCountdown(true);
                } else {
                    this.uiManager.hideCountdown();
                    this.beginAiming();
                }
            }
        } else if (this.state === 'AIMING' || this.state === 'CHARGING') {
            if (this.gameMode === 'solo' || this.gameMode === '2player') {
                this.timeRemaining = Math.max(0, this.timeRemaining - delta);
                if (this.gameMode === 'solo') {
                    this.uiManager.updateSoloTime(this.timeRemaining);
                } else {
                    this.uiManager.updateTwoPlayerHUD(
                        this.player1Score, this.player2Score,
                        this.currentPlayer, this.timeRemaining
                    );
                }

                if (this.timeRemaining <= 0) {
                    this.advanceTurn();
                    return;
                }
            }

            const aim = this.inputManager.getAim();
            const power = this.inputManager.getPower();
            this.currentAim = aim;
            this.currentPower = power;

            // Contextual HUD Status
            if (this.gameMode !== 'practice') {
                if (power <= 0.05) {
                    this.uiManager.setStatusText(this.trackingMode === 'head' ? 'TILT TO AIM' : 'LEAN TO AIM');
                } else if (power < 0.35) {
                    this.uiManager.setStatusText(`CHARGING... ${Math.round(power * 100)}%`);
                } else if (power < 0.75) {
                    this.uiManager.setStatusText('TARGET LOCKED — NOD ↑ TO KICK');
                } else {
                    this.uiManager.setStatusText('MAX POWER — NOD ↑ TO KICK');
                }
            }

            // Goalkeeper anticipates when power builds
            if (power > 0.20) {
                this.goalkeeper.anticipate();
            }

            if (power > 0.1 && performance.now() - this.lastSoundChargeTime > 120) {
                soundEngine.playCharge(power);
                this.lastSoundChargeTime = performance.now();
            }

            this.uiManager.updateAimReticle(aim, power);
            this.uiManager.updatePowerMeter(power);

            // Execute Kick upon Deliberate Nod Trigger
            if (this.inputManager.isKickTriggered()) {
                this.executeKick(aim, power);
                this.inputManager.resetKickTrigger();
            }
        } else if (this.state === 'SHOT_IN_FLIGHT') {
            const keeperEnabled = (this.gameMode !== 'practice' || this.practiceKeeper);

            // 1. CONTINUOUS SWEPT TRAJECTORY KEEPER INTERCEPTION (Phase 23 & 24)
            if (!this.shotOutcomeResolved && keeperEnabled) {
                const collision = this.goalkeeper.checkSweptBallCollision(
                    this.ball.prevPosition,
                    this.ball.position,
                    this.ball.radius
                );

                if (collision && collision.hit) {
                    this.shotOutcomeResolved = true;
                    // PHYSICAL DEFLECTION: ball shoots away in world space!
                    this.ball.deflect(collision);
                    soundEngine.playSave();

                    this.activeShotOutcome = {
                        result: 'SAVED',
                        subType: 'KEEPER_SAVE',
                        title: 'SAVED!',
                        subtitle: collision.part === 'GLOVE' ? 'BRILLIANT GLOVE PARRY!' : 'BLOCKED BY THE KEEPER!',
                        points: 0
                    };
                }
            }

            // 2. GOAL LINE & NET ENTRY INTERACTION (Phase 26)
            // Goal line is at Z = -8.0; Goal width is ±3.66m; Goal height is 2.44m
            if (!this.shotOutcomeResolved && this.ball.position.z <= -7.95) {
                this.shotOutcomeResolved = true;

                const bx = this.ball.position.x;
                const by = this.ball.position.y;
                const absX = Math.abs(bx);

                const isPost = (absX >= 3.52 && absX <= 3.82 && by <= 2.50);
                const isCrossbar = (by >= 2.36 && by <= 2.62 && absX <= 3.75);
                const isInsideGoal = (absX < 3.52 && by < 2.36 && by > 0.05);

                if (isCrossbar) {
                    this.ball.reboundPost(true);
                    this.activeShotOutcome = {
                        result: 'MISS',
                        subType: 'CROSSBAR',
                        title: 'OFF THE CROSSBAR!',
                        subtitle: 'RATTLED THE WOODWORK!',
                        points: 0
                    };
                } else if (isPost) {
                    this.ball.reboundPost(false);
                    this.activeShotOutcome = {
                        result: 'MISS',
                        subType: 'POST',
                        title: 'OFF THE POST!',
                        subtitle: 'DENIED BY THE UPRIGHT!',
                        points: 0
                    };
                } else if (isInsideGoal) {
                    // GOAL SCORED!
                    const zone = this.activeShotMeta?.zone || 'CENTER';
                    let points = 100;
                    let title = 'GOAL!';
                    let subtitle = 'CLINICAL PENALTY!';
                    let resType = 'GOAL';

                    if (zone === 'TOP_LEFT_90' || zone === 'TOP_RIGHT_90') {
                        points = 150;
                        title = 'PERFECT!';
                        subtitle = 'UPPER 90 — UNSTOPPABLE!';
                        resType = 'PERFECT';
                    } else if (zone === 'BOTTOM_LEFT' || zone === 'BOTTOM_RIGHT') {
                        points = 120;
                        title = 'GOAL!';
                        subtitle = 'DRILLED INTO THE BOTTOM CORNER!';
                    } else if (this.activeShotMeta?.grade === 'GREAT') {
                        points = 110;
                        title = 'GOAL!';
                        subtitle = 'THUMPING FINISH!';
                    }

                    this.activeShotOutcome = {
                        result: resType,
                        subType: zone,
                        title,
                        subtitle,
                        points,
                        targetX: bx,
                        targetY: by
                    };
                } else {
                    // Off Target Miss
                    this.activeShotOutcome = {
                        result: 'MISS',
                        subType: 'WIDE',
                        title: 'OFF TARGET!',
                        subtitle: 'FIRED WIDE OF THE POSTS',
                        points: 0
                    };
                }
            }

            this.shotFlightTimer -= delta;
            if (this.shotFlightTimer <= 0) {
                this.resolveShotOutcome();
            }
        }
    }
}
