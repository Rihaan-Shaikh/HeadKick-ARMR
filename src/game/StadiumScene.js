// Three.js Stadium Environment for TILT KICK
// 1. Dual Atmosphere Engine: Full Day & Night Presentation
// 2. High-Readability Balanced Lighting Hierarchy (Ball, Keeper, Goal always prominent)
// 3. Realistic Turf with Striping & FIFA White Markings
// 4. Reactive 3D Goal Net with Physics Bulge & Micro-Oscillations
// 5. Dynamic Camera Shake & Confetti Celebrations

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { settingsManager } from '../utils/SettingsManager.js';

export class StadiumScene {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.currentTheme = 'night';

        // Lighting references
        this.ambientLight = null;
        this.hemiLight = null;
        this.sunLight = null;
        this.goalSpot = null;
        this.cornerSpots = [];
        this.beamMeshes = [];

        // Mesh references
        this.pitchMesh = null;
        this.dayPitchTexture = null;
        this.nightPitchTexture = null;
        this.standMeshes = [];
        this.adMesh = null;

        // Goal & Net
        this.goalGroup = null;
        this.netMesh = null;
        this.netOriginalPositions = null;
        this.netDisplacementTime = 0;
        this.netImpactPoint = new THREE.Vector3(0, 1.2, -8.0);

        // Particle systems
        this.crowdParticles = null;
        this.flashParticles = null;
        this.flashTimer = 0;
        this.confettiParticles = null;
        this.confettiVelocities = [];

        // Camera animation
        this.baseCameraPos = new THREE.Vector3(0, 1.45, 7.8);
        this.targetCameraLook = new THREE.Vector3(0, 1.25, -8.0);
        this.cameraShakeIntensity = 0;

        this.init();
    }

    init() {
        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a1120);
        this.scene.fog = new THREE.FogExp2(0x0a1120, 0.015);

        // 2. Camera
        const aspect = this.container.offsetWidth / this.container.offsetHeight;
        this.camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 140);
        this.camera.position.copy(this.baseCameraPos);
        this.camera.lookAt(this.targetCameraLook);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.22;
        this.renderer.domElement.id = 'stadiumCanvas';
        this.container.appendChild(this.renderer.domElement);

        // 4. Lighting & Environment Setup
        this.setupLighting();

        // 5. Pitch
        this.createPitch();

        // 6. Goal & Net
        this.createGoal();

        // 7. Stadium Backdrop & Floodlights
        this.createStadiumStructure();

        // 8. Confetti System
        this.createConfetti();

        // Apply initial theme from settings
        const initialTheme = settingsManager.getEffectiveTheme ? settingsManager.getEffectiveTheme() : 'night';
        this.applyTheme(initialTheme);

        // Subscribe to theme setting updates
        settingsManager.subscribe(() => {
            const effective = settingsManager.getEffectiveTheme ? settingsManager.getEffectiveTheme() : 'night';
            if (effective !== this.currentTheme) {
                this.applyTheme(effective);
            }
        });

        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        // Ambient Light (Provides balanced fill so scene is never muddy black)
        this.ambientLight = new THREE.AmbientLight(0x354a66, 1.6);
        this.scene.add(this.ambientLight);

        // Hemisphere light (Sky / Grass ground reflection)
        this.hemiLight = new THREE.HemisphereLight(0x5678a3, 0x1d3d22, 1.1);
        this.scene.add(this.hemiLight);

        // Sunlight Directional Light (Active in Day Mode)
        this.sunLight = new THREE.DirectionalLight(0xfffaee, 3.0);
        this.sunLight.position.set(-14, 28, 16);
        this.sunLight.target.position.set(0, 1.2, -6);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 5;
        this.sunLight.shadow.camera.far = 65;
        this.sunLight.shadow.camera.left = -16;
        this.sunLight.shadow.camera.right = 16;
        this.sunLight.shadow.camera.top = 16;
        this.sunLight.shadow.camera.bottom = -16;
        this.sunLight.shadow.bias = -0.0004;
        this.scene.add(this.sunLight);
        this.scene.add(this.sunLight.target);

        // Dedicated Goal Spotlight (Highlights Goalkeeper, Goal Posts & Net)
        this.goalSpot = new THREE.SpotLight(0xffffff, 2.8);
        this.goalSpot.position.set(0, 12, 0);
        this.goalSpot.target.position.set(0, 1.2, -8.0);
        this.goalSpot.angle = Math.PI / 4.2;
        this.goalSpot.penumbra = 0.40;
        this.goalSpot.castShadow = true;
        this.goalSpot.shadow.mapSize.width = 1024;
        this.goalSpot.shadow.mapSize.height = 1024;
        this.scene.add(this.goalSpot);
        this.scene.add(this.goalSpot.target);

        // 4 Corner Stadium Floodlight Spotlights
        const addCornerSpot = (x, y, z, tx, ty, tz) => {
            const spot = new THREE.SpotLight(0xf2f7ff, 2.8);
            spot.position.set(x, y, z);
            spot.target.position.set(tx, ty, tz);
            spot.angle = Math.PI / 4.6;
            spot.penumbra = 0.45;
            spot.decay = 1.3;
            spot.distance = 80;
            spot.castShadow = true;
            spot.shadow.mapSize.width = 1024;
            spot.shadow.mapSize.height = 1024;
            spot.shadow.bias = -0.0006;
            this.scene.add(spot);
            this.scene.add(spot.target);
            this.cornerSpots.push(spot);

            // Volumetric beam cone
            const beamGeo = new THREE.CylinderGeometry(0.25, 4.4, 18, 16, 1, true);
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0xcbe0ff,
                transparent: true,
                opacity: 0.08,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const beamMesh = new THREE.Mesh(beamGeo, beamMat);
            beamMesh.position.set(x * 0.75, y * 0.65, z * 0.75);
            beamMesh.lookAt(tx, ty, tz);
            beamMesh.rotateX(Math.PI / 2);
            this.scene.add(beamMesh);
            this.beamMeshes.push(beamMesh);
        };

        addCornerSpot(-12, 16, 12, 0, 1.2, -6);
        addCornerSpot(12, 16, 12, 0, 1.2, -6);
        addCornerSpot(-10, 14, -18, 0, 1.0, -4);
        addCornerSpot(10, 14, -18, 0, 1.0, -4);
    }

    createPitch() {
        const buildPitchCanvas = (isDay) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 1024;
            const ctx = canvas.getContext('2d');

            // Grass base tone
            ctx.fillStyle = isDay ? '#2b7835' : '#1a4624';
            ctx.fillRect(0, 0, 1024, 1024);

            // Striping
            const stripeCount = 14;
            const stripeH = 1024 / stripeCount;
            for (let i = 0; i < stripeCount; i++) {
                if (isDay) {
                    ctx.fillStyle = i % 2 === 0 ? '#328c3e' : '#287332';
                } else {
                    ctx.fillStyle = i % 2 === 0 ? '#1e522a' : '#184221';
                }
                ctx.fillRect(0, i * stripeH, 1024, stripeH);
            }

            // Fine turf texture grain
            const noiseAlpha = isDay ? 0.025 : 0.035;
            for (let i = 0; i < 28000; i++) {
                const nx = Math.random() * 1024;
                const ny = Math.random() * 1024;
                ctx.fillStyle = `rgba(255, 255, 255, ${noiseAlpha * Math.random()})`;
                ctx.fillRect(nx, ny, 2, 2);
            }

            // Pristine FIFA White Lines
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';

            // Goal line
            ctx.beginPath();
            ctx.moveTo(80, 120);
            ctx.lineTo(944, 120);
            ctx.stroke();

            // 18-yard penalty box
            ctx.strokeRect(212, 120, 600, 480);

            // 6-yard goal area box
            ctx.strokeRect(362, 120, 300, 180);

            // Penalty spot
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(512, 420, 10, 0, Math.PI * 2);
            ctx.fill();

            // Penalty D-arc
            ctx.beginPath();
            ctx.arc(512, 420, 140, 0.42 * Math.PI, 0.58 * Math.PI, false);
            ctx.stroke();

            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            return tex;
        };

        this.dayPitchTexture = buildPitchCanvas(true);
        this.nightPitchTexture = buildPitchCanvas(false);

        const pitchGeo = new THREE.PlaneGeometry(36, 42);
        const pitchMat = new THREE.MeshStandardMaterial({
            map: this.nightPitchTexture,
            roughness: 0.72,
            metalness: 0.04
        });

        this.pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
        this.pitchMesh.rotation.x = -Math.PI / 2;
        this.pitchMesh.position.set(0, 0, -4);
        this.pitchMesh.receiveShadow = true;
        this.scene.add(this.pitchMesh);
    }

    createGoal() {
        this.goalGroup = new THREE.Group();
        this.goalGroup.position.set(0, 0, -8.0);

        const postRadius = 0.075;
        const goalWidth = 7.32;
        const goalHeight = 2.44;
        const goalDepth = 2.2;

        const postMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.30,
            roughness: 0.12
        });

        // 1. Left Post
        const leftPostGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalHeight, 20);
        const leftPost = new THREE.Mesh(leftPostGeo, postMaterial);
        leftPost.position.set(-goalWidth / 2, goalHeight / 2, 0);
        leftPost.castShadow = true;
        this.goalGroup.add(leftPost);

        // 2. Right Post
        const rightPost = leftPost.clone();
        rightPost.position.set(goalWidth / 2, goalHeight / 2, 0);
        this.goalGroup.add(rightPost);

        // 3. Crossbar
        const crossbarGeo = new THREE.CylinderGeometry(postRadius, postRadius, goalWidth + postRadius * 2, 20);
        const crossbar = new THREE.Mesh(crossbarGeo, postMaterial);
        crossbar.rotation.z = Math.PI / 2;
        crossbar.position.set(0, goalHeight, 0);
        crossbar.castShadow = true;
        this.goalGroup.add(crossbar);

        // 4. Stanchions
        const stanchionMat = new THREE.MeshStandardMaterial({ color: 0x485668, roughness: 0.45 });
        const createStanchion = (x) => {
            const barGeo = new THREE.CylinderGeometry(0.045, 0.045, goalDepth * 1.3, 12);
            const bar = new THREE.Mesh(barGeo, stanchionMat);
            bar.rotation.x = Math.PI / 3.4;
            bar.position.set(x, goalHeight * 0.55, -goalDepth * 0.5);
            return bar;
        };
        this.goalGroup.add(createStanchion(-goalWidth / 2 + 0.1));
        this.goalGroup.add(createStanchion(goalWidth / 2 - 0.1));

        // 5. 3D Reactive Net
        const netCanvas = document.createElement('canvas');
        netCanvas.width = 128;
        netCanvas.height = 128;
        const nCtx = netCanvas.getContext('2d');
        nCtx.fillStyle = 'rgba(255, 255, 255, 0)';
        nCtx.fillRect(0, 0, 128, 128);
        nCtx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
        nCtx.lineWidth = 3.5;
        nCtx.strokeRect(0, 0, 64, 64);
        nCtx.strokeRect(64, 64, 64, 64);
        nCtx.strokeRect(64, 0, 64, 64);
        nCtx.strokeRect(0, 64, 64, 64);

        const netTexture = new THREE.CanvasTexture(netCanvas);
        netTexture.wrapS = THREE.RepeatWrapping;
        netTexture.wrapT = THREE.RepeatWrapping;
        netTexture.repeat.set(16, 8);

        const netMat = new THREE.MeshStandardMaterial({
            map: netTexture,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            roughness: 0.80,
            depthWrite: false
        });

        // Net Back Plane
        const netGeo = new THREE.PlaneGeometry(goalWidth, goalHeight, 24, 16);
        this.netMesh = new THREE.Mesh(netGeo, netMat);
        this.netMesh.position.set(0, goalHeight / 2, -goalDepth);
        this.goalGroup.add(this.netMesh);
        this.netOriginalPositions = this.netMesh.geometry.attributes.position.clone();

        // Net Roof
        const netRoofGeo = new THREE.PlaneGeometry(goalWidth, goalDepth, 16, 8);
        const netRoof = new THREE.Mesh(netRoofGeo, netMat);
        netRoof.rotation.x = Math.PI / 2;
        netRoof.position.set(0, goalHeight, -goalDepth / 2);
        this.goalGroup.add(netRoof);

        // Net Sides
        const netSideGeo = new THREE.PlaneGeometry(goalDepth, goalHeight, 8, 8);
        const netSideLeft = new THREE.Mesh(netSideGeo, netMat);
        netSideLeft.rotation.y = Math.PI / 2;
        netSideLeft.position.set(-goalWidth / 2, goalHeight / 2, -goalDepth / 2);
        this.goalGroup.add(netSideLeft);

        const netSideRight = netSideLeft.clone();
        netSideRight.position.x = goalWidth / 2;
        this.goalGroup.add(netSideRight);

        this.scene.add(this.goalGroup);
    }

    createStadiumStructure() {
        const adWidth = 28;
        const adHeight = 1.25;
        const adCanvas = document.createElement('canvas');
        adCanvas.width = 1024;
        adCanvas.height = 128;
        const actx = adCanvas.getContext('2d');

        actx.fillStyle = '#080d14';
        actx.fillRect(0, 0, 1024, 128);
        actx.fillStyle = '#00e676';
        actx.font = 'bold 50px sans-serif';
        actx.textAlign = 'center';
        actx.fillText('TILT KICK  •  HEAD. TILT. KICK.  •  CHAMPIONSHIP  •  TILT KICK', 512, 80);

        const adTexture = new THREE.CanvasTexture(adCanvas);
        const adMat = new THREE.MeshStandardMaterial({
            map: adTexture,
            emissive: 0x00e676,
            emissiveMap: adTexture,
            emissiveIntensity: 0.38,
            roughness: 0.35
        });
        this.adMesh = new THREE.Mesh(new THREE.PlaneGeometry(adWidth, adHeight), adMat);
        this.adMesh.position.set(0, adHeight / 2, -11.5);
        this.scene.add(this.adMesh);

        // Tiered Stadium Stands
        const standMat = new THREE.MeshStandardMaterial({ color: 0x0c131f, roughness: 0.85 });
        for (let i = 0; i < 4; i++) {
            const tierGeo = new THREE.BoxGeometry(36, 1.4, 2.8);
            const tierMesh = new THREE.Mesh(tierGeo, standMat);
            tierMesh.position.set(0, 1.4 + i * 1.35, -13.0 - i * 2.3);
            this.scene.add(tierMesh);
            this.standMeshes.push(tierMesh);
        }

        // Crowd Spectators
        const crowdCount = 180;
        const crowdGeo = new THREE.BufferGeometry();
        const crowdPos = new Float32Array(crowdCount * 3);
        const crowdColors = new Float32Array(crowdCount * 3);

        const crowdPalette = [
            [0.12, 0.22, 0.35],
            [0.18, 0.30, 0.46],
            [0.25, 0.38, 0.55],
            [0.10, 0.16, 0.24],
            [0.90, 0.85, 0.60]
        ];

        for (let i = 0; i < crowdCount; i++) {
            const tier = i % 4;
            crowdPos[i * 3 + 0] = (Math.random() - 0.5) * 32;
            crowdPos[i * 3 + 1] = 2.1 + tier * 1.35 + (Math.random() - 0.5) * 0.4;
            crowdPos[i * 3 + 2] = -12.8 - tier * 2.3 + (Math.random() - 0.5) * 0.8;

            const c = crowdPalette[Math.floor(Math.random() * crowdPalette.length)];
            crowdColors[i * 3 + 0] = c[0];
            crowdColors[i * 3 + 1] = c[1];
            crowdColors[i * 3 + 2] = c[2];
        }

        crowdGeo.setAttribute('position', new THREE.BufferAttribute(crowdPos, 3));
        crowdGeo.setAttribute('color', new THREE.BufferAttribute(crowdColors, 3));

        const crowdMat = new THREE.PointsMaterial({
            size: 0.35,
            vertexColors: true,
            transparent: true,
            opacity: 0.85
        });

        this.crowdParticles = new THREE.Points(crowdGeo, crowdMat);
        this.scene.add(this.crowdParticles);

        // Flashbulbs
        const flashCount = 16;
        const flashGeo = new THREE.BufferGeometry();
        const flashPos = new Float32Array(flashCount * 3);
        for (let i = 0; i < flashCount; i++) {
            const tier = Math.floor(Math.random() * 4);
            flashPos[i * 3 + 0] = (Math.random() - 0.5) * 30;
            flashPos[i * 3 + 1] = 2.2 + tier * 1.35;
            flashPos[i * 3 + 2] = -12.5 - tier * 2.3;
        }
        flashGeo.setAttribute('position', new THREE.BufferAttribute(flashPos, 3));
        this.flashParticles = new THREE.Points(flashGeo, new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.55,
            transparent: true,
            opacity: 0.0
        }));
        this.scene.add(this.flashParticles);

        // Floodlight Towers
        const towerMat = new THREE.MeshBasicMaterial({ color: 0x2e3d54 });
        const leftTower = new THREE.Mesh(new THREE.BoxGeometry(0.8, 20, 0.8), towerMat);
        leftTower.position.set(-16, 10, -18);
        this.scene.add(leftTower);

        const rightTower = leftTower.clone();
        rightTower.position.x = 16;
        this.scene.add(rightTower);
    }

    createConfetti() {
        const count = 220;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        const palette = [
            [0.0, 0.9, 0.46],
            [1.0, 0.84, 0.0],
            [1.0, 1.0, 1.0],
            [0.0, 0.7, 1.0]
        ];

        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = (Math.random() - 0.5) * 8;
            positions[i * 3 + 1] = -10;
            positions[i * 3 + 2] = -8 + (Math.random() - 0.5) * 3;

            const c = palette[i % palette.length];
            colors[i * 3 + 0] = c[0];
            colors[i * 3 + 1] = c[1];
            colors[i * 3 + 2] = c[2];

            this.confettiVelocities.push({
                vx: (Math.random() - 0.5) * 4,
                vy: 4 + Math.random() * 5,
                vz: (Math.random() - 0.5) * 2
            });
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 0.18,
            vertexColors: true,
            transparent: true,
            opacity: 0.9
        });

        this.confettiParticles = new THREE.Points(geo, mat);
        this.scene.add(this.confettiParticles);
    }

    // ============================================================
    // DAY + NIGHT ATMOSPHERIC ENGINE (Phase 30)
    // ============================================================
    applyTheme(themeKey) {
        this.currentTheme = themeKey;
        console.log(`[StadiumScene] Applying visual atmosphere theme: ${themeKey}`);

        if (themeKey === 'day') {
            // DAY THEME:
            // High-noon clear stadium sky, bright sunlight, vibrant green pitch
            this.scene.background.setHex(0x5a94cc);
            this.scene.fog.color.setHex(0x7daee0);
            this.scene.fog.density = 0.006;

            // Ambient & hemisphere
            this.ambientLight.color.setHex(0xb5d8fa);
            this.ambientLight.intensity = 1.6;

            this.hemiLight.color.setHex(0x99ccff);
            this.hemiLight.groundColor.setHex(0x386d3e);
            this.hemiLight.intensity = 1.2;

            // Sun directional light
            this.sunLight.visible = true;
            this.sunLight.intensity = 3.2;

            // Goal spot & floodlights dimmed for daylight
            this.goalSpot.intensity = 0.8;
            this.cornerSpots.forEach(s => { s.intensity = 0.6; });
            this.beamMeshes.forEach(b => { b.visible = false; });

            // Swap to Day pitch
            if (this.pitchMesh && this.dayPitchTexture) {
                this.pitchMesh.material.map = this.dayPitchTexture;
                this.pitchMesh.material.needsUpdate = true;
            }

            // Day stadium architecture
            this.standMeshes.forEach(mesh => {
                mesh.material.color.setHex(0x233144);
            });

            if (this.flashParticles) this.flashParticles.visible = false;
            this.renderer.toneMappingExposure = 1.15;
        } else {
            // NIGHT THEME:
            // Champions League floodlit night, deep navy sky, crisp beam cones, goal spotlight
            this.scene.background.setHex(0x0a1120);
            this.scene.fog.color.setHex(0x0a1120);
            this.scene.fog.density = 0.015;

            this.ambientLight.color.setHex(0x354a66);
            this.ambientLight.intensity = 1.6;

            this.hemiLight.color.setHex(0x5678a3);
            this.hemiLight.groundColor.setHex(0x1d3d22);
            this.hemiLight.intensity = 1.1;

            // Sun light disabled
            this.sunLight.visible = false;
            this.sunLight.intensity = 0;

            // Goal spot & floodlights in full brilliance
            this.goalSpot.intensity = 2.8;
            this.cornerSpots.forEach(s => { s.intensity = 2.8; });
            this.beamMeshes.forEach(b => { b.visible = true; });

            // Swap to Night pitch
            if (this.pitchMesh && this.nightPitchTexture) {
                this.pitchMesh.material.map = this.nightPitchTexture;
                this.pitchMesh.material.needsUpdate = true;
            }

            this.standMeshes.forEach(mesh => {
                mesh.material.color.setHex(0x0c131f);
            });

            if (this.flashParticles) this.flashParticles.visible = true;
            this.renderer.toneMappingExposure = 1.22;
        }

        // Apply theme attribute to DOM for unified broadcast UI styling
        document.documentElement.setAttribute('data-theme', themeKey);
    }

    triggerGoalCelebration(impactTargetX = 0, impactTargetY = 1.2) {
        this.cameraShakeIntensity = 0.14;
        this.netDisplacementTime = 1.0;
        this.netImpactPoint.set(impactTargetX, impactTargetY, -8.0);

        // Confetti burst
        const pos = this.confettiParticles.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            pos.setXYZ(i, (Math.random() - 0.5) * 5, 1.0 + Math.random() * 1.5, -8.0);
            this.confettiVelocities[i] = {
                vx: (Math.random() - 0.5) * 5,
                vy: 5 + Math.random() * 6,
                vz: (Math.random() - 0.5) * 3
            };
        }
        pos.needsUpdate = true;
    }

    triggerPostClang() {
        this.cameraShakeIntensity = 0.08;
    }

    update(delta = 1 / 60) {
        // Camera shake decay
        if (this.cameraShakeIntensity > 0.001) {
            this.camera.position.x = this.baseCameraPos.x + (Math.random() - 0.5) * this.cameraShakeIntensity;
            this.camera.position.y = this.baseCameraPos.y + (Math.random() - 0.5) * this.cameraShakeIntensity;
            this.cameraShakeIntensity *= 0.91;
        } else {
            this.camera.position.copy(this.baseCameraPos);
        }

        // Net impact bulge & ripple oscillation
        if (this.netDisplacementTime > 0.01) {
            this.netDisplacementTime -= delta * 1.5;
            const posAttr = this.netMesh.geometry.attributes.position;
            const origAttr = this.netOriginalPositions;
            const wobble = Math.sin(this.netDisplacementTime * 16) * this.netDisplacementTime * 0.48;

            for (let i = 0; i < posAttr.count; i++) {
                const ox = origAttr.getX(i);
                const oy = origAttr.getY(i);
                const oz = origAttr.getZ(i);

                const distToImpact = Math.hypot(ox - this.netImpactPoint.x, oy - this.netImpactPoint.y);
                const falloff = Math.max(0, 1.0 - distToImpact / 3.2);

                posAttr.setZ(i, oz - wobble * falloff);
            }
            posAttr.needsUpdate = true;
        }

        // Confetti physics
        if (this.confettiParticles) {
            const pos = this.confettiParticles.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let cy = pos.getY(i);
                if (cy > -5) {
                    const vel = this.confettiVelocities[i];
                    vel.vy -= 9.8 * delta;
                    pos.setX(i, pos.getX(i) + vel.vx * delta);
                    pos.setY(i, cy + vel.vy * delta);
                    pos.setZ(i, pos.getZ(i) + vel.vz * delta);
                }
            }
            pos.needsUpdate = true;
        }

        // Ambient crowd flashbulbs twinkle (night mode only)
        if (this.flashParticles && this.flashParticles.visible) {
            this.flashTimer += delta;
            if (this.flashTimer > 0.4) {
                this.flashParticles.material.opacity = Math.random() > 0.65 ? 0.9 : 0.0;
                this.flashTimer = 0;
            }
        }
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const w = this.container.offsetWidth;
        const h = this.container.offsetHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}
