// Advanced 3D Football Goalkeeper for TILT KICK
// 1. High-Fidelity Athletic 3D Goalkeeper Model (PBR Materials, Skeletal Articulation)
// 2. Strict Single World-Space Coordinate System (Co-located with Goal & Ball)
// 3. Realistic Goalkeeper AI (Trajectory Prediction, Reaction Latency, Controlled Uncertainty)
// 4. Multi-Volume Articulated Hitboxes (Gloves, Arms, Torso, Legs)
// 5. Continuous Swept Capsule-Trajectory Collision Interception

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Goalkeeper {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();

        // Animation Lifecycle State:
        // 'IDLE' | 'ANTICIPATE' | 'REACTING' | 'DIVING' | 'CONTACT' | 'LANDED' | 'RECOVERING'
        this.state = 'IDLE';
        // Base position: 0.25m in front of the goal line (Z = -8.0)
        this.basePosition = new THREE.Vector3(0, 0, -7.75);
        this.diveTarget = new THREE.Vector3();
        this.diveProgress = 0;
        this.diveDuration = 0.44; // Athletic explosive dive

        this.reactionTimer = 0;
        this.targetShot = null;
        this.difficulty = 'medium';

        // Skeletal Articulation Sub-Hierarchies
        this.torsoGroup = null;
        this.headGroup = null;
        this.leftShoulder = null;
        this.rightShoulder = null;
        this.leftArm = null;
        this.rightArm = null;
        this.leftForearm = null;
        this.rightForearm = null;
        this.leftGlove = null;
        this.rightGlove = null;
        this.leftLeg = null;
        this.rightLeg = null;
        this.leftBoot = null;
        this.rightBoot = null;

        this.animTime = 0;
        this.landTimer = 0;
        this.contactMade = false;

        this.init();
    }

    init() {
        this.group.position.copy(this.basePosition);
        // Athletic goalkeeper scale (1.92m professional keeper height in world coordinates)
        this.group.scale.set(1.15, 1.15, 1.15);

        // High-Quality PBR Materials
        // Goalkeeper Jersey: Electric Volt with deep Charcoal athletic paneling
        const jerseyMat = new THREE.MeshStandardMaterial({
            color: 0xffea00, // Electric Volt
            emissive: 0xffea00,
            emissiveIntensity: 0.14,
            roughness: 0.38,
            metalness: 0.06
        });
        const jerseyTrimMat = new THREE.MeshStandardMaterial({
            color: 0x111622,
            roughness: 0.45,
            metalness: 0.1
        });
        const shortsMat = new THREE.MeshStandardMaterial({
            color: 0x0c121e, // Deep Navy/Charcoal
            roughness: 0.55
        });
        const skinMat = new THREE.MeshStandardMaterial({
            color: 0xd69975, // Natural skin tone
            roughness: 0.68
        });
        const hairMat = new THREE.MeshStandardMaterial({
            color: 0x1c130d, // Dark hair
            roughness: 0.8
        });
        const glovePalmMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, // White latex foam
            roughness: 0.32,
            metalness: 0.0
        });
        const gloveBackMat = new THREE.MeshStandardMaterial({
            color: 0x00e676, // Neon green embossed backhand
            emissive: 0x00e676,
            emissiveIntensity: 0.22,
            roughness: 0.30,
            metalness: 0.1
        });
        const bootMat = new THREE.MeshStandardMaterial({
            color: 0x141416, // Matte black boot
            roughness: 0.35
        });
        const bootAccentMat = new THREE.MeshStandardMaterial({
            color: 0xffea00,
            roughness: 0.3
        });
        const padMat = new THREE.MeshStandardMaterial({
            color: 0x242d3d,
            roughness: 0.5
        });

        // ============================================================
        // 1. TORSO & ATHLETIC JERSEY
        // ============================================================
        this.torsoGroup = new THREE.Group();
        this.torsoGroup.position.y = 1.35;

        // Upper Chest (V-taper athletic frame)
        const chestGeo = new THREE.BoxGeometry(0.72, 0.48, 0.36);
        const chestMesh = new THREE.Mesh(chestGeo, jerseyMat);
        chestMesh.position.y = 0.20;
        chestMesh.castShadow = true;
        chestMesh.receiveShadow = true;
        this.torsoGroup.add(chestMesh);

        // Ribs / Abdomen taper
        const waistGeo = new THREE.BoxGeometry(0.60, 0.38, 0.32);
        const waistMesh = new THREE.Mesh(waistGeo, jerseyMat);
        waistMesh.position.y = -0.20;
        waistMesh.castShadow = true;
        this.torsoGroup.add(waistMesh);

        // Collar accent
        const collarGeo = new THREE.CylinderGeometry(0.18, 0.20, 0.10, 16);
        const collarMesh = new THREE.Mesh(collarGeo, jerseyTrimMat);
        collarMesh.position.y = 0.44;
        this.torsoGroup.add(collarMesh);

        // Keeper Number 1 on back
        const numGeo = new THREE.PlaneGeometry(0.20, 0.30);
        const numMat = new THREE.MeshBasicMaterial({ color: 0x111622, side: THREE.DoubleSide });
        const numMesh = new THREE.Mesh(numGeo, numMat);
        numMesh.position.set(0, 0.20, -0.19);
        numMesh.rotation.y = Math.PI;
        this.torsoGroup.add(numMesh);

        this.group.add(this.torsoGroup);

        // ============================================================
        // 2. HEAD, HAIR & ATHLETIC HEADBAND
        // ============================================================
        this.headGroup = new THREE.Group();
        this.headGroup.position.y = 1.98;

        const headGeo = new THREE.SphereGeometry(0.17, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.castShadow = true;
        this.headGroup.add(headMesh);

        // Athletic Hair / Cap
        const hairGeo = new THREE.SphereGeometry(0.176, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
        const hairMesh = new THREE.Mesh(hairGeo, hairMat);
        hairMesh.position.y = 0.03;
        this.headGroup.add(hairMesh);

        // Headband
        const bandGeo = new THREE.CylinderGeometry(0.182, 0.182, 0.06, 16);
        const bandMesh = new THREE.Mesh(bandGeo, jerseyTrimMat);
        bandMesh.position.y = 0.06;
        this.headGroup.add(bandMesh);

        this.group.add(this.headGroup);

        // ============================================================
        // 3. ARTICULATED ARMS & PROFESSIONAL GOALKEEPER GLOVES
        // ============================================================
        const armGeo = new THREE.CylinderGeometry(0.082, 0.074, 0.40, 12);
        const forearmGeo = new THREE.CylinderGeometry(0.074, 0.068, 0.36, 12);

        // LEFT ARM (Keeper's Right from viewer's perspective)
        this.leftShoulder = new THREE.Group();
        this.leftShoulder.position.set(-0.44, 1.66, 0);

        this.leftArm = new THREE.Mesh(armGeo, jerseyMat);
        this.leftArm.position.y = -0.18;
        this.leftArm.castShadow = true;
        this.leftShoulder.add(this.leftArm);

        this.leftForearm = new THREE.Group();
        this.leftForearm.position.set(0, -0.38, 0);

        const lForeMesh = new THREE.Mesh(forearmGeo, skinMat);
        lForeMesh.position.y = -0.16;
        lForeMesh.castShadow = true;
        this.leftForearm.add(lForeMesh);

        // Left Glove (Sculpted Padded Keeper Glove)
        const gloveBodyGeo = new THREE.BoxGeometry(0.25, 0.27, 0.14);
        this.leftGlove = new THREE.Mesh(gloveBodyGeo, gloveBackMat);
        this.leftGlove.position.y = -0.42;
        this.leftGlove.castShadow = true;

        // White latex palm
        const palmGeo = new THREE.PlaneGeometry(0.23, 0.25);
        const lPalm = new THREE.Mesh(palmGeo, glovePalmMat);
        lPalm.position.set(0, 0, 0.072);
        this.leftGlove.add(lPalm);

        // Glove Wrist Strap
        const strapGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.08, 12);
        const lStrap = new THREE.Mesh(strapGeo, jerseyTrimMat);
        lStrap.position.y = 0.16;
        this.leftGlove.add(lStrap);

        this.leftForearm.add(this.leftGlove);
        this.leftShoulder.add(this.leftForearm);
        this.group.add(this.leftShoulder);

        // RIGHT ARM
        this.rightShoulder = new THREE.Group();
        this.rightShoulder.position.set(0.44, 1.66, 0);

        this.rightArm = new THREE.Mesh(armGeo, jerseyMat);
        this.rightArm.position.y = -0.18;
        this.rightArm.castShadow = true;
        this.rightShoulder.add(this.rightArm);

        this.rightForearm = new THREE.Group();
        this.rightForearm.position.set(0, -0.38, 0);

        const rForeMesh = new THREE.Mesh(forearmGeo, skinMat);
        rForeMesh.position.y = -0.16;
        rForeMesh.castShadow = true;
        this.rightForearm.add(rForeMesh);

        // Right Glove
        this.rightGlove = new THREE.Mesh(gloveBodyGeo, gloveBackMat);
        this.rightGlove.position.y = -0.42;
        this.rightGlove.castShadow = true;

        const rPalm = new THREE.Mesh(palmGeo, glovePalmMat);
        rPalm.position.set(0, 0, 0.072);
        this.rightGlove.add(rPalm);

        const rStrap = new THREE.Mesh(strapGeo, jerseyTrimMat);
        rStrap.position.y = 0.16;
        this.rightGlove.add(rStrap);

        this.rightForearm.add(this.rightGlove);
        this.rightShoulder.add(this.rightForearm);
        this.group.add(this.rightShoulder);

        // ============================================================
        // 4. LEGS, SHORTS & FOOTBALL BOOTS
        // ============================================================
        const thighGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.44, 12);
        const calfGeo = new THREE.CylinderGeometry(0.10, 0.08, 0.46, 12);

        // Left Leg
        this.leftLeg = new THREE.Group();
        this.leftLeg.position.set(-0.22, 1.05, 0);

        const lThigh = new THREE.Mesh(thighGeo, shortsMat);
        lThigh.position.y = -0.20;
        lThigh.castShadow = true;
        this.leftLeg.add(lThigh);

        // Knee Pad
        const padGeo = new THREE.SphereGeometry(0.095, 12, 12);
        const lPad = new THREE.Mesh(padGeo, padMat);
        lPad.position.set(0, -0.42, 0.04);
        this.leftLeg.add(lPad);

        const lCalf = new THREE.Mesh(calfGeo, jerseyTrimMat);
        lCalf.position.y = -0.66;
        lCalf.castShadow = true;
        this.leftLeg.add(lCalf);

        // Left Football Boot
        const bootGeo = new THREE.BoxGeometry(0.15, 0.12, 0.32);
        this.leftBoot = new THREE.Mesh(bootGeo, bootMat);
        this.leftBoot.position.set(0, -0.92, 0.08);
        this.leftBoot.castShadow = true;
        this.leftLeg.add(this.leftBoot);

        this.group.add(this.leftLeg);

        // Right Leg
        this.rightLeg = new THREE.Group();
        this.rightLeg.position.set(0.22, 1.05, 0);

        const rThigh = new THREE.Mesh(thighGeo, shortsMat);
        rThigh.position.y = -0.20;
        rThigh.castShadow = true;
        this.rightLeg.add(rThigh);

        const rPad = new THREE.Mesh(padGeo, padMat);
        rPad.position.set(0, -0.42, 0.04);
        this.rightLeg.add(rPad);

        const rCalf = new THREE.Mesh(calfGeo, jerseyTrimMat);
        rCalf.position.y = -0.66;
        rCalf.castShadow = true;
        this.rightLeg.add(rCalf);

        // Right Football Boot
        this.rightBoot = new THREE.Mesh(bootGeo, bootMat);
        this.rightBoot.position.set(0, -0.92, 0.08);
        this.rightBoot.castShadow = true;
        this.rightLeg.add(this.rightBoot);

        this.group.add(this.rightLeg);

        this.scene.add(this.group);
    }

    reset() {
        this.state = 'IDLE';
        this.group.position.copy(this.basePosition);
        this.group.rotation.set(0, 0, 0);
        this.torsoGroup.rotation.set(0, 0, 0);
        this.leftShoulder.rotation.set(0, 0, 0);
        this.rightShoulder.rotation.set(0, 0, 0);
        this.leftForearm.rotation.set(0, 0, 0);
        this.rightForearm.rotation.set(0, 0, 0);
        this.leftLeg.rotation.set(0, 0, 0);
        this.rightLeg.rotation.set(0, 0, 0);
        this.diveProgress = 0;
        this.reactionTimer = 0;
        this.contactMade = false;
        this.targetShot = null;
    }

    anticipate() {
        if (this.state === 'IDLE') {
            this.state = 'ANTICIPATE';
        }
    }

    // ============================================================
    // GOALKEEPER AI (Phase 27)
    // ============================================================
    // Observes shot trajectory and initiates dive with difficulty-tuned reaction delay
    // Note: NEVER pre-determines goal vs save via a dice roll!
    reactToShot(targetX, targetY, difficulty = 'medium') {
        this.state = 'REACTING';
        this.difficulty = difficulty;
        this.contactMade = false;

        // Difficulty Tuning (Reaction Delay & Prediction Error)
        let reactionDelay = 0.16; // default medium
        let predictionErrorX = 0;
        let predictionErrorY = 0;

        if (difficulty === 'easy') {
            reactionDelay = 0.26;
            // Easy AI has larger uncertainty/guess error
            predictionErrorX = (Math.random() - 0.5) * 1.1;
            predictionErrorY = -0.35 + (Math.random() - 0.5) * 0.4; // tends to dive low/late
        } else if (difficulty === 'hard') {
            reactionDelay = 0.08;
            // Hard AI reacts quickly with minimal estimation error
            predictionErrorX = (Math.random() - 0.5) * 0.15;
            predictionErrorY = (Math.random() - 0.5) * 0.15;
        } else {
            // Medium
            predictionErrorX = (Math.random() - 0.5) * 0.45;
            predictionErrorY = (Math.random() - 0.5) * 0.35;
        }

        const predictedX = targetX + predictionErrorX;
        const predictedY = Math.max(0.3, targetY + predictionErrorY);

        this.reactionTimer = reactionDelay;
        this.targetShot = { predictedX, predictedY };
    }

    startDive(reachX, reachY) {
        this.state = 'DIVING';
        this.diveProgress = 0;
        this.contactMade = false;

        this.diveTarget.set(
            Math.max(-3.5, Math.min(3.5, reachX)),
            Math.max(0.30, Math.min(2.35, reachY)),
            this.basePosition.z
        );
    }

    // ============================================================
    // CONTINUOUS SWEPT CAPSULE / VOLUME COLLISION (Phase 23 & 24)
    // ============================================================
    // Tests trajectory segment (prevBallPos -> currBallPos) against articulated keeper volumes
    checkSweptBallCollision(prevBallPos, currBallPos, ballRadius = 0.22) {
        if (this.state !== 'DIVING' && this.state !== 'REACTING' && this.state !== 'IDLE' && this.state !== 'ANTICIPATE') {
            return null;
        }

        // Distance from a 3D point P to a line segment AB
        const distPointToSegment = (p, a, b) => {
            const ab = new THREE.Vector3().subVectors(b, a);
            const ap = new THREE.Vector3().subVectors(p, a);
            const abLenSq = ab.lengthSq();
            if (abLenSq < 0.00001) return p.distanceTo(a);
            const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
            const proj = new THREE.Vector3().copy(a).addScaledVector(ab, t);
            return p.distanceTo(proj);
        };

        // 1. LEFT GLOVE HITBOX (Padded mitt sphere)
        const lGlovePos = new THREE.Vector3();
        this.leftGlove.getWorldPosition(lGlovePos);
        const lDist = distPointToSegment(lGlovePos, prevBallPos, currBallPos);
        if (lDist < (ballRadius + 0.28)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return {
                hit: true,
                part: 'GLOVE',
                contactPos: lGlovePos,
                normal: new THREE.Vector3(0.3, 0.6, 0.74).normalize()
            };
        }

        // 2. RIGHT GLOVE HITBOX
        const rGlovePos = new THREE.Vector3();
        this.rightGlove.getWorldPosition(rGlovePos);
        const rDist = distPointToSegment(rGlovePos, prevBallPos, currBallPos);
        if (rDist < (ballRadius + 0.28)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return {
                hit: true,
                part: 'GLOVE',
                contactPos: rGlovePos,
                normal: new THREE.Vector3(-0.3, 0.6, 0.74).normalize()
            };
        }

        // 3. TORSO HITBOX (Athletic V-taper volume)
        const torsoPos = new THREE.Vector3();
        this.torsoGroup.getWorldPosition(torsoPos);
        const torsoDist = distPointToSegment(torsoPos, prevBallPos, currBallPos);
        if (torsoDist < (ballRadius + 0.44)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return {
                hit: true,
                part: 'TORSO',
                contactPos: torsoPos,
                normal: new THREE.Vector3(0, 0.2, 0.98).normalize()
            };
        }

        // 4. LEFT / RIGHT LEG HITBOXES
        const lBootPos = new THREE.Vector3();
        this.leftBoot.getWorldPosition(lBootPos);
        if (distPointToSegment(lBootPos, prevBallPos, currBallPos) < (ballRadius + 0.24)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return {
                hit: true,
                part: 'LEG',
                contactPos: lBootPos,
                normal: new THREE.Vector3(0.4, 0.2, 0.9).normalize()
            };
        }

        const rBootPos = new THREE.Vector3();
        this.rightBoot.getWorldPosition(rBootPos);
        if (distPointToSegment(rBootPos, prevBallPos, currBallPos) < (ballRadius + 0.24)) {
            this.state = 'CONTACT';
            this.contactMade = true;
            return {
                hit: true,
                part: 'LEG',
                contactPos: rBootPos,
                normal: new THREE.Vector3(-0.4, 0.2, 0.9).normalize()
            };
        }

        return null;
    }

    update(delta = 1 / 60) {
        this.animTime += delta;

        if (this.state === 'IDLE') {
            // Natural athletic bounce, weight shifting & ready hands posture
            const bounce = Math.sin(this.animTime * 4.6) * 0.035;
            this.group.position.y = bounce;
            this.group.position.x = Math.sin(this.animTime * 1.5) * 0.12;
            this.group.rotation.y = Math.sin(this.animTime * 1.2) * 0.04;

            // Ready hands
            this.leftShoulder.rotation.z = 0.36 + Math.sin(this.animTime * 4.6) * 0.04;
            this.rightShoulder.rotation.z = -0.36 - Math.sin(this.animTime * 4.6) * 0.04;
            this.leftShoulder.rotation.x = 0.30;
            this.rightShoulder.rotation.x = 0.30;
            this.leftForearm.rotation.x = -0.42;
            this.rightForearm.rotation.x = -0.42;
        } else if (this.state === 'ANTICIPATE') {
            // Crouch down into focused spring stance
            this.group.position.y = -0.14;
            this.group.position.x *= 0.88;
            this.leftShoulder.rotation.z = 0.58;
            this.rightShoulder.rotation.z = -0.58;
            this.leftShoulder.rotation.x = 0.55;
            this.rightShoulder.rotation.x = 0.55;
            this.leftForearm.rotation.x = -0.65;
            this.rightForearm.rotation.x = -0.65;
            this.leftLeg.rotation.x = 0.20;
            this.rightLeg.rotation.x = 0.20;
        } else if (this.state === 'REACTING') {
            this.reactionTimer -= delta;
            if (this.targetShot) {
                const dir = Math.sign(this.targetShot.predictedX);
                // Shift weight aggressively in shot direction
                this.group.position.x += dir * delta * 1.2;
                this.group.rotation.z = -dir * 0.16;
            }
            if (this.reactionTimer <= 0 && this.targetShot) {
                this.startDive(this.targetShot.predictedX, this.targetShot.predictedY);
            }
        } else if (this.state === 'DIVING') {
            this.diveProgress += delta / this.diveDuration;
            const t = Math.min(1.0, this.diveProgress);

            // Explosive leap easing (Cubic Ease Out)
            const ease = 1 - Math.pow(1 - t, 3);

            this.group.position.x = this.basePosition.x + (this.diveTarget.x - this.basePosition.x) * ease;
            this.group.position.y = Math.max(0, (this.diveTarget.y - 1.0) * ease);

            // 3D Body Tilt & Full Arm Reach Extension
            const diveDir = Math.sign(this.diveTarget.x);
            const isHighShot = this.diveTarget.y > 1.55;

            if (Math.abs(this.diveTarget.x) > 0.30) {
                this.group.rotation.z = -diveDir * ease * (isHighShot ? 1.30 : 1.10);
                this.group.rotation.x = ease * 0.28;

                if (diveDir > 0) {
                    // Diving Right: full extension of right arm
                    this.rightShoulder.rotation.z = isHighShot ? -1.80 : -1.45;
                    this.rightForearm.rotation.x = -0.10;
                    this.leftShoulder.rotation.z = -0.88;
                    this.rightLeg.rotation.z = 0.38;
                    this.leftLeg.rotation.z = 0.20;
                } else {
                    // Diving Left: full extension of left arm
                    this.leftShoulder.rotation.z = isHighShot ? 1.80 : 1.45;
                    this.leftForearm.rotation.x = -0.10;
                    this.rightShoulder.rotation.z = 0.88;
                    this.leftLeg.rotation.z = -0.38;
                    this.rightLeg.rotation.z = -0.20;
                }
            } else {
                // Central jump or reflex save
                this.group.rotation.z = 0;
                this.leftShoulder.rotation.z = 1.30;
                this.rightShoulder.rotation.z = -1.30;
                this.leftForearm.rotation.x = -0.20;
                this.rightForearm.rotation.x = -0.20;
            }

            if (t >= 1.0) {
                this.state = 'LANDED';
                this.landTimer = 0.60;
            }
        } else if (this.state === 'CONTACT') {
            this.group.position.z = this.basePosition.z - 0.10; // Recoil pushback
            this.state = 'LANDED';
            this.landTimer = 0.65;
        } else if (this.state === 'LANDED') {
            this.landTimer -= delta;
            this.group.position.y = 0.04;
            if (this.landTimer <= 0) {
                this.state = 'RECOVERING';
            }
        } else if (this.state === 'RECOVERING') {
            this.group.position.lerp(this.basePosition, delta * 3.8);
            this.group.rotation.z *= 0.88;
            this.group.rotation.x *= 0.88;
            this.leftShoulder.rotation.z = THREE.MathUtils.lerp(this.leftShoulder.rotation.z, 0.36, delta * 4);
            this.rightShoulder.rotation.z = THREE.MathUtils.lerp(this.rightShoulder.rotation.z, -0.36, delta * 4);

            if (this.group.position.distanceTo(this.basePosition) < 0.14) {
                this.reset();
            }
        }
    }
}
