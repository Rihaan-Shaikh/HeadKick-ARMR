// Realistic 3D Football Ballistics for TILT KICK
// 32-Panel Match Ball Texture, Dynamic Turf Contact Shadow,
// Parabolic Gravity Ballistics, Magnus Curve Spin, Net Bulge Interaction,
// and Physical Articulated Goalkeeper Deflections.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

export class Ball {
    constructor(scene) {
        this.scene = scene;
        this.radius = 0.22;
        this.penaltySpot = new THREE.Vector3(0, this.radius, 2.5);

        this.mesh = null;
        this.shadowMesh = null;
        this.trailPoints = [];
        this.trailLine = null;

        // Physics State
        this.position = this.penaltySpot.clone();
        this.prevPosition = this.penaltySpot.clone(); // Crucial for continuous swept collision
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.angularVelocity = new THREE.Vector3(0, 0, 0);
        this.isShotActive = false;
        this.isSettled = true;

        this.targetPosition = new THREE.Vector3(0, 1.2, -8.0);
        this.flightDuration = 0;
        this.flightElapsed = 0;
        this.shotPower = 0.8;

        this.init();
    }

    init() {
        // 1. Procedural 32-Panel Match Football Texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Crisp white leather base with subtle panel grain
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, 512, 512);

        // Bold black pentagons with gold athletic accents
        ctx.fillStyle = '#10141d';
        ctx.strokeStyle = '#d4af37'; // Gold trim
        ctx.lineWidth = 3;

        const drawPentagon = (x, y, r) => {
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                const px = x + r * Math.cos(angle);
                const py = y + r * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };

        drawPentagon(256, 120, 50);
        drawPentagon(120, 320, 48);
        drawPentagon(392, 320, 48);
        drawPentagon(256, 440, 46);
        drawPentagon(60, 100, 42);
        drawPentagon(452, 100, 42);

        // Seams
        ctx.strokeStyle = '#b0bec5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(256, 170); ctx.lineTo(256, 260);
        ctx.moveTo(150, 280); ctx.lineTo(230, 260);
        ctx.moveTo(362, 280); ctx.lineTo(282, 260);
        ctx.stroke();

        const ballTexture = new THREE.CanvasTexture(canvas);

        const geo = new THREE.SphereGeometry(this.radius, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
            map: ballTexture,
            roughness: 0.32,
            metalness: 0.08
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.mesh.position.copy(this.penaltySpot);
        this.scene.add(this.mesh);

        // 2. Dynamic Contact Shadow on Turf
        const shadowCanvas = document.createElement('canvas');
        shadowCanvas.width = 128;
        shadowCanvas.height = 128;
        const sCtx = shadowCanvas.getContext('2d');
        const grad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
        grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sCtx.fillStyle = grad;
        sCtx.fillRect(0, 0, 128, 128);

        const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
        const shadowGeo = new THREE.PlaneGeometry(0.72, 0.72);
        const shadowMat = new THREE.MeshBasicMaterial({
            map: shadowTexture,
            transparent: true,
            depthWrite: false
        });

        this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadowMesh.rotation.x = -Math.PI / 2;
        this.shadowMesh.position.set(this.penaltySpot.x, 0.015, this.penaltySpot.z);
        this.scene.add(this.shadowMesh);

        // 3. High-Speed Flight Trail
        const maxTrail = 18;
        const trailPositions = new Float32Array(maxTrail * 3);
        const trailGeo = new THREE.BufferGeometry();
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));

        const trailMat = new THREE.LineBasicMaterial({
            color: 0x00e676,
            transparent: true,
            opacity: 0.0,
            linewidth: 2
        });

        this.trailLine = new THREE.Line(trailGeo, trailMat);
        this.scene.add(this.trailLine);
    }

    reset() {
        this.isShotActive = false;
        this.isSettled = true;
        this.position.copy(this.penaltySpot);
        this.prevPosition.copy(this.penaltySpot);
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.mesh.position.copy(this.position);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.scale.set(1, 1, 1);

        this.shadowMesh.position.set(this.position.x, 0.015, this.position.z);
        this.shadowMesh.scale.set(1, 1, 1);
        this.shadowMesh.material.opacity = 0.75;

        this.trailPoints = [];
        if (this.trailLine) this.trailLine.material.opacity = 0.0;
    }

    shoot(targetX, targetY, power = 0.8) {
        this.isShotActive = true;
        this.isSettled = false;
        this.flightElapsed = 0;
        this.shotPower = power;
        this.prevPosition.copy(this.position);

        // Speed scaled strictly by power: 18m/s (driven) to 34m/s (missile)
        const speed = 18 + power * 16;
        const targetZ = -8.0;

        this.targetPosition.set(targetX, targetY, targetZ);

        const distanceZ = targetZ - this.position.z;
        this.flightDuration = Math.abs(distanceZ) / speed;

        const gravity = 9.8;
        const totalTime = this.flightDuration;

        const vx = (targetX - this.position.x) / totalTime;
        const vz = distanceZ / totalTime;
        const vy = (targetY - this.position.y + 0.5 * gravity * totalTime * totalTime) / totalTime;

        this.velocity.set(vx, vy, vz);

        // Realistic ball spin
        const spinSide = -targetX * 9.2;
        const spinTop = speed * 0.8;
        this.angularVelocity.set(spinTop, spinSide, 0);

        this.trailPoints = [];
        if (this.trailLine && power > 0.65) {
            this.trailLine.material.opacity = 0.55;
        }
    }

    update(delta = 1 / 60) {
        if (!this.isShotActive && this.isSettled) return;

        this.flightElapsed += delta;
        this.prevPosition.copy(this.position);

        // Aerodynamic gravity
        this.velocity.y -= 9.8 * delta;

        // Magnus effect (subtle aerodynamic curl)
        this.velocity.x += this.angularVelocity.y * delta * 0.065;

        // Position integration
        this.position.addScaledVector(this.velocity, delta);

        // Ground bounce & roll
        if (this.position.y <= this.radius) {
            this.position.y = this.radius;
            this.velocity.y = -this.velocity.y * 0.44;
            this.velocity.x *= 0.86;
            this.velocity.z *= 0.86;

            // Squash & stretch on grass impact
            this.mesh.scale.set(1.18, 0.82, 1.18);
            setTimeout(() => { if (this.mesh) this.mesh.scale.set(1, 1, 1); }, 65);

            if (Math.abs(this.velocity.y) < 0.2) {
                this.velocity.y = 0;
            }
        }

        // Net collision & deceleration
        if (this.position.z < -8.15 && this.position.z > -10.2 &&
            this.position.y < 2.44 && Math.abs(this.position.x) < 3.8) {
            this.velocity.z *= 0.28;
            this.velocity.x *= 0.55;
            this.velocity.y = Math.min(0.2, this.velocity.y);
            if (this.trailLine) this.trailLine.material.opacity = 0.0;
        }

        this.mesh.position.copy(this.position);

        // Dynamic 3D ball spin rotation
        this.mesh.rotation.x += this.angularVelocity.x * delta * 0.06;
        this.mesh.rotation.y += this.angularVelocity.y * delta * 0.06;

        // Turf Contact Shadow Tracking
        this.shadowMesh.position.x = this.position.x;
        this.shadowMesh.position.z = this.position.z;

        const heightAboveGround = Math.max(0, this.position.y - this.radius);
        const shadowScale = 1.0 + heightAboveGround * 0.52;
        this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
        this.shadowMesh.material.opacity = Math.max(0.1, 0.75 / (1.0 + heightAboveGround * 1.4));

        // High-Speed Flight Trail
        if (this.trailLine && this.trailLine.material.opacity > 0.01) {
            this.trailPoints.unshift(this.position.clone());
            if (this.trailPoints.length > 18) this.trailPoints.pop();

            const posAttr = this.trailLine.geometry.attributes.position;
            for (let i = 0; i < 18; i++) {
                const pt = this.trailPoints[i] || this.position;
                posAttr.setXYZ(i, pt.x, pt.y, pt.z);
            }
            posAttr.needsUpdate = true;
        }
    }

    deflect(contactInfo = null) {
        // Physical Goalkeeper Save Deflection (Phase 23 & 24)
        if (contactInfo && contactInfo.part === 'GLOVE') {
            // Glove punch / fingertip parry: explosive redirection
            this.velocity.z = -this.velocity.z * 0.45;
            this.velocity.x += (contactInfo.normal?.x || (Math.random() - 0.5)) * 9.5;
            this.velocity.y = 4.8 + Math.random() * 2.8;
        } else if (contactInfo && contactInfo.part === 'TORSO') {
            // Torso block: rebounds forward / down
            this.velocity.z = Math.abs(this.velocity.z) * 0.38; // bounces outward
            this.velocity.x += (Math.random() - 0.5) * 4.5;
            this.velocity.y = 2.2 + Math.random() * 1.5;
        } else if (contactInfo && contactInfo.part === 'LEG') {
            // Leg deflection
            this.velocity.z = Math.abs(this.velocity.z) * 0.35;
            this.velocity.x += (contactInfo.normal?.x || (Math.random() - 0.5)) * 7.0;
            this.velocity.y = 1.8 + Math.random() * 1.2;
        } else {
            // Generic deflection
            this.velocity.z = -this.velocity.z * 0.42;
            this.velocity.x += (Math.random() - 0.5) * 8.5;
            this.velocity.y = 3.6 + Math.random() * 2.8;
        }

        this.angularVelocity.multiplyScalar(-1.5);
        if (this.trailLine) this.trailLine.material.opacity = 0.0;

        // Visual Impact squash & stretch
        this.mesh.scale.set(0.85, 1.20, 0.85);
        setTimeout(() => { if (this.mesh) this.mesh.scale.set(1, 1, 1); }, 75);
    }

    reboundPost(isCrossbar = false) {
        if (isCrossbar) {
            this.velocity.y = -this.velocity.y * 0.58;
            this.velocity.z = -this.velocity.z * 0.38;
        } else {
            this.velocity.x = -this.velocity.x * 0.68;
            this.velocity.z = -this.velocity.z * 0.35;
        }
        if (this.trailLine) this.trailLine.material.opacity = 0.0;

        this.mesh.scale.set(0.85, 1.15, 0.85);
        setTimeout(() => { if (this.mesh) this.mesh.scale.set(1, 1, 1); }, 65);
    }
}
