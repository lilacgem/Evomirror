import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './App.css';
import { applyIdentity, IdentitySeal } from './identity.js';
import { BrandConfig } from './brand.config.js';
import AujouleMetadata from './metadata.js';
import { saveSeal, loadSeals, downloadBlob, exportSeal } from './sealArchive.js';
import { createImprintField, imprintProvenance } from './imprintField.js';
import { sampleAudioInfluence, audioInfluenceProvenance } from './audioInfluence.js';
import { createInnerGlowTexture, innerGlowProvenance } from './innerGlow.js';
import { createDeepSpace, spaceProvenance } from './deepSpace.js';
import { cosmicOrbFragment } from './cosmicOrb.js';
import { createMistMaterial, createResonantRays } from './resonantMist.js';
import { startCanvasRecording } from './canvasRecording.js';

const API = 'https://api.evomirror.com';
// Preserve the unfinished account code, but do not expose or call it in this prototype.
const ACCOUNTS_ENABLED = false;
const ORB_SCALE = .78 * 1.4;
const ORB_RADIUS = 6.8;
const ORB_CENTER_Y = 3.5;

// WebAuthn base64url helpers
const b64uToBuf = (s) => {
    const p = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
    return Uint8Array.from(atob(p), (c) => c.charCodeAt(0)).buffer;
};
const bufToB64u = (b) =>
    btoa(String.fromCharCode(...new Uint8Array(b)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

async function apiCall(path, opts = {}) {
    const res = await fetch(API + path, {
        credentials: 'include',
        headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
        ...opts
    });
    if (!res.ok) {
        let msg = 'Request failed';
        try {
            msg = (await res.json()).error || msg;
        } catch (e) { }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return res.status === 204 ? null : res.json();
}

function SealCard({ seal, onError }) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        const imageUrl = URL.createObjectURL(seal.image); setUrl(imageUrl);
        return () => URL.revokeObjectURL(imageUrl);
    }, [seal.image]);
    return <article className="seal-card">
        <a href={url} target="_blank" rel="noreferrer" aria-label="Open saved seal image"><img src={url || undefined} alt={`EvoMirror seal saved ${new Date(seal.createdAt).toLocaleString()}`} /></a>
        <time dateTime={seal.createdAt}>{new Date(seal.createdAt).toLocaleString()}</time>
        <div className="seal-downloads">
            <button onClick={() => downloadBlob(seal.image, `EvoMirror-Seal-${seal.id}.png`)}>IMAGE</button>
            <button onClick={() => exportSeal(seal).catch(() => onError('Download failed. Your saved seal is still in this browser.'))}>FULL SEAL</button>
        </div>
    </article>;
}

export default function App() {
    const mountRef = useRef(null);
    const visualSnapshotRef = useRef(null);
    const savingSealRef = useRef(false);
    const [seals, setSeals] = useState([]);
    const [archiveError, setArchiveError] = useState('');
    const [archiveLoading, setArchiveLoading] = useState(true);
    const [isSavingSeal, setIsSavingSeal] = useState(false);
    useEffect(() => {
        let active = true;
        loadSeals().then(records => { if (active) setSeals(records); })
            .catch(() => { if (active) setArchiveError('This browser could not open the local archive. Nothing has been removed.'); })
            .finally(() => { if (active) setArchiveLoading(false); });
        return () => { active = false; };
    }, []);

    // Auth & UI States
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [isVaultOpen, setIsVaultOpen] = useState(false);
    const [authTab, setAuthTab] = useState('signin');
    const [authEmail, setAuthEmail] = useState('');
    const [authError, setAuthError] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    // Audio & Interactive Controls State
    const [isListening, setIsListening] = useState(false);
    const [isMicPending, setIsMicPending] = useState(false);
    const [micMessage, setMicMessage] = useState('');
    const micRequestRef = useRef(0);
    const micPendingRef = useRef(false);
    const [realmText, setRealmText] = useState('✦ REALM: INITIALIZING MATRIX... ✦');
    const [oracleText, setOracleText] = useState('Touch screen or speak to allow the wiregrid ocean to decode your frequency...');
    const [sealStatus, setSealStatus] = useState('SEAL THIS');
    const [captureStatus, setCaptureStatus] = useState('CAPTURE');
    const [isRecording, setIsRecording] = useState(false);

    // Telemetry Refs
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const dataArrayRef = useRef(null);
    const micStreamRef = useRef(null);
    const recordingSessionRef = useRef(null);
    const [isFinalizingCapture, setIsFinalizingCapture] = useState(false);
    const [captureMessage, setCaptureMessage] = useState('');

    // Quantum Output Ref
    const quantumDataRef = useRef(null);

    const colorAccumulatorRef = useRef(0.5);
    const dynamicFactorRef = useRef(0.18);
    const bassValRef = useRef(0);
    const midValRef = useRef(0);
    const highValRef = useRef(0);
    const touchVectorRef = useRef({ x: 0, y: 0 });
    const lastTouchVectorRef = useRef({ x: 0, y: 0 });
    const touchVelocityRef = useRef(0);
    const targetVelocityRef = useRef(0);

    useEffect(() => { applyIdentity(); }, []);

    // Restore session from server on load
    useEffect(() => {
        if (!ACCOUNTS_ENABLED) return;
        apiCall('/api/me')
            .then((me) => {
                if (me && me.portable) setCurrentUser(me);
            })
            .catch(() => setCurrentUser(null));
    }, []);

    // Load the existing precomputed visual parameters (not a live quantum engine).
    useEffect(() => {
        fetch('/quantum_evolution_output.json')
            .then((res) => res.json())
            .then((data) => {
                console.log("=== Loaded AUEVO Quantum Output ===", data);
                quantumDataRef.current = data;
            })
            .catch((err) => console.error("Error loading quantum metrics:", err));
    }, []);

    // Passkey Registration (Sign Up)
    const registerPasskey = async (email) => {
        const opts = await apiCall('/api/auth/register/begin', {
            method: 'POST',
            body: JSON.stringify({ label: email })
        });

        const publicKey = {
            ...opts,
            challenge: b64uToBuf(opts.challenge),
            user: { ...opts.user, id: b64uToBuf(opts.user.id) },
            excludeCredentials: (opts.excludeCredentials || []).map((c) => ({
                ...c,
                id: b64uToBuf(c.id)
            }))
        };

        const cred = await navigator.credentials.create({ publicKey });
        await apiCall('/api/auth/register/finish', {
            method: 'POST',
            body: JSON.stringify({
                id: cred.id,
                rawId: bufToB64u(cred.rawId),
                type: cred.type,
                response: {
                    clientDataJSON: bufToB64u(cred.response.clientDataJSON),
                    attestationObject: bufToB64u(cred.response.attestationObject)
                }
            })
        });

        const me = await apiCall('/api/me');
        try {
            if (email) localStorage.setItem('AuEvo_Label', email);
        } catch (e) { }
        return { ...me, email };
    };

    // Passkey Login (Sign In)
    const loginPasskey = async (email) => {
        const { handle, options } = await apiCall('/api/auth/login/begin', { method: 'POST' });

        const cred = await navigator.credentials.get({
            publicKey: {
                ...options,
                challenge: b64uToBuf(options.challenge),
                allowCredentials: (options.allowCredentials || []).map((c) => ({
                    ...c,
                    id: b64uToBuf(c.id)
                }))
            }
        });

        await apiCall('/api/auth/login/finish', {
            method: 'POST',
            body: JSON.stringify({
                handle,
                id: cred.id,
                rawId: bufToB64u(cred.rawId),
                type: cred.type,
                response: {
                    clientDataJSON: bufToB64u(cred.response.clientDataJSON),
                    authenticatorData: bufToB64u(cred.response.authenticatorData),
                    signature: bufToB64u(cred.response.signature),
                    userHandle: cred.response.userHandle ? bufToB64u(cred.response.userHandle) : null
                }
            })
        });

        const me = await apiCall('/api/me');
        try {
            if (email) localStorage.setItem('AuEvo_Label', email);
        } catch (e) { }
        return { ...me, email };
    };

    // Handle Auth Submit Button
    const submitAuth = async () => {
        const email = authEmail.trim();
        setAuthError('');

        if (!email) {
            setAuthError('Enter your email.');
            return;
        }

        if (!window.PublicKeyCredential) {
            setAuthError('This browser does not support passkeys. Try Chrome, Edge or Safari.');
            return;
        }

        setAuthLoading(true);
        try {
            const user = authTab === 'signup' ? await registerPasskey(email) : await loginPasskey(email);
            setCurrentUser(user);
            setIsAuthOpen(false);
        } catch (err) {
            setAuthError(
                err && err.name === 'NotAllowedError'
                    ? 'Cancelled. Nothing was changed.'
                    : err.message || 'Something went wrong.'
            );
        } finally {
            setAuthLoading(false);
        }
    };

    const signOutAccount = async () => {
        try {
            await apiCall('/api/auth/logout', { method: 'POST' });
        } catch (e) { }
        try {
            localStorage.removeItem('AuEvo_Label');
        } catch (e) { }
        setCurrentUser(null);
    };

    const sealerName = (user) => {
        if (!user) return 'ACCOUNT';
        if (user.email) return user.email;
        let saved = null;
        try {
            saved = localStorage.getItem('AuEvo_Label');
        } catch (e) { }
        if (saved) return saved;
        if (user.handle) return user.handle;
        return user.id ? 'seal-' + String(user.id).slice(0, 8) : 'sealed';
    };

    // Set up 3D Scene
    useEffect(() => {
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000002, 0.008);

        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000.0);
        const renderer = new THREE.WebGLRenderer({
            canvas: mountRef.current,
            alpha: false,
            preserveDrawingBuffer: true,
            antialias: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
        renderer.setClearColor(0x000002, 1.0);

        const updateCamera = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            camera.aspect = w / h;
            if (w < 600) {
                camera.fov = 68;
                camera.position.set(0.0, -1.0, 54.0);
            } else {
                camera.fov = 60;
                camera.position.set(0.0, -1.0, 36.0);
            }
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        updateCamera();
        window.addEventListener('resize', updateCamera);

        // Deep, seeded surrounding space; no flat background image.
        scene.add(createDeepSpace());

        // The former grid becomes a diffuse, flowing numerical field.
        const gridGeo = new THREE.PlaneGeometry(120, 120, 100, 100);
        const scattered = gridGeo.attributes.position;
        for (let i = 0; i < scattered.count; i++) {
            const jitter = (offset) => { const n = Math.sin(i * 127.1 + offset) * 43758.5453; return (n - Math.floor(n) - .5) * 1.5; };
            scattered.setXYZ(i, scattered.getX(i) + jitter(3.1), scattered.getY(i) + jitter(7.4), jitter(12.8) * .5);
        }
        const baseGridVertices = scattered.clone();
        const wiregridMat = createMistMaterial();
        const wiregridMesh = new THREE.Points(gridGeo, wiregridMat);
        wiregridMesh.frustumCulled = false;
        wiregridMesh.rotation.x = -Math.PI / 2.3;
        scene.add(wiregridMesh);
        const rays = createResonantRays();
        scene.add(rays.object);

        // Sacred Geometry Group
        const sacredGroup = new THREE.Group();
        sacredGroup.position.set(0.0, ORB_CENTER_Y, 0.0);
        sacredGroup.scale.setScalar(ORB_SCALE);

        const torusMat = new THREE.MeshBasicMaterial({
            wireframe: true,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const knotRadius = window.innerWidth < 600 ? 5.2 : 7.5;
        const symbolGeo = new THREE.TorusKnotGeometry(knotRadius, 0.65, 128, 18, 2, 3);
        const symbolMesh = new THREE.Mesh(symbolGeo, torusMat);
        symbolMesh.rotation.x = Math.PI / 2;
        sacredGroup.add(symbolMesh);
        scene.add(sacredGroup);

        // A living core within the existing symbolic geometry.
        const imprintField = createImprintField();
        const innerGlowTexture = createInnerGlowTexture();
        const orbGeometry = new THREE.SphereGeometry(ORB_RADIUS, 96, 64);
        const orbMaterial = new THREE.ShaderMaterial({
            uniforms: { innerGlow: { value: innerGlowTexture }, imprint: { value: imprintField.texture }, detailImprint: { value: imprintField.detailTexture }, depthImprint: { value: imprintField.depthTexture }, time: { value: 0 }, energy: { value: 0 }, tint: { value: new THREE.Color('#bd72ff') } },
            vertexShader: `
                uniform sampler2D imprint; uniform sampler2D detailImprint; uniform sampler2D depthImprint; uniform float time; uniform float energy;
                varying vec3 vNormal; varying vec3 vView; varying vec3 vPosition; varying vec2 vImprintUV;
                void main() {
                    vec3 p = position;
                    vImprintUV = uv;
                    float mark = texture2D(imprint, vec2(uv.x + time * .009, uv.y)).r;
                    float nested = texture2D(imprint, uv * 2. + vec2(-time * .006, time * .003)).g;
                    float seal = texture2D(imprint, uv + vec2(time * .004, 0.)).b;
                    float ridges = texture2D(depthImprint, uv * 1.5 + vec2(0., time * .004)).g;
                    p += normal * ((mark - .4) * .10 + (nested - .4) * .07 + (seal - .4) * .05 + (ridges - .4) * .04) * (1. + energy * .25);
                    float wave = sin(p.x * 1.3 + time) * cos(p.y * 1.4 - time * .7) * sin(p.z + time * .5);
                    p += normal * wave * (.055 + energy * .10);
                    vec4 view = modelViewMatrix * vec4(p, 1.);
                    vNormal = normalize(normalMatrix * normal); vView = normalize(-view.xyz); vPosition = p;
                    gl_Position = projectionMatrix * view;
                }`,
            fragmentShader: cosmicOrbFragment,
            transparent: true,
            depthWrite: false,
        });
        const orb = new THREE.Mesh(orbGeometry, orbMaterial);
        sacredGroup.add(orb);
        // Soft radial glow has no hard sphere edge.
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = glowCanvas.height = 128;
        const glowContext = glowCanvas.getContext('2d');
        const glowGradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
        glowGradient.addColorStop(0, 'rgba(255,255,255,.35)');
        glowGradient.addColorStop(.35, 'rgba(255,255,255,.16)');
        glowGradient.addColorStop(1, 'rgba(255,255,255,0)');
        glowContext.fillStyle = glowGradient; glowContext.fillRect(0, 0, 128, 128);
        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: '#ad66ff', blending: THREE.AdditiveBlending, depthWrite: false });
        const glow = new THREE.Sprite(glowMaterial); glow.scale.set(17, 17, 1); sacredGroup.add(glow);


        // Touch & Mouse Handling
        const handleMove = (clientX, clientY) => {
            lastTouchVectorRef.current = { ...touchVectorRef.current };
            touchVectorRef.current.x = (clientX / window.innerWidth) * 2.0 - 1.0;
            touchVectorRef.current.y = -(clientY / window.innerHeight) * 2.0 + 1.0;
            const dx = touchVectorRef.current.x - lastTouchVectorRef.current.x;
            const dy = touchVectorRef.current.y - lastTouchVectorRef.current.y;
            targetVelocityRef.current = Math.min(Math.sqrt(dx * dx + dy * dy) * 14.0, 4.0);
        };

        const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
        const onTouchMove = (e) => {
            if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchmove', onTouchMove, { passive: true });

        const gridRotationInverse = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2.3);
        const fusedPosition = new THREE.Vector3();
        const motionClock = new THREE.Clock();
        let previousFrameTime = 0;
        let animId;
        const animate = () => {
            animId = requestAnimationFrame(animate);

            touchVelocityRef.current = THREE.MathUtils.lerp(touchVelocityRef.current, targetVelocityRef.current, 0.08);
            targetVelocityRef.current *= 0.94;

            if (analyserRef.current && dataArrayRef.current) {
                analyserRef.current.getByteFrequencyData(dataArrayRef.current);
                let bSum = 0, mSum = 0, hSum = 0;
                for (let i = 0; i < 8; i++) bSum += dataArrayRef.current[i];
                for (let i = 8; i < 40; i++) mSum += dataArrayRef.current[i];
                for (let i = 40; i < 128; i++) hSum += dataArrayRef.current[i];

                bassValRef.current = Math.min(1.0, (bSum / (8 * 255.0)) * 2.2);
                midValRef.current = Math.min(1.0, (mSum / (32 * 255.0)) * 2.0);
                highValRef.current = Math.min(1.0, (hSum / (88 * 255.0)) * 2.0);

                dynamicFactorRef.current = THREE.MathUtils.lerp(
                    dynamicFactorRef.current,
                    bassValRef.current * 2.5 + midValRef.current * 1.5 + 0.15,
                    0.2
                );
            }

            const time = motionClock.getElapsedTime();
            const delta = Math.min(.1, Math.max(0, time - previousFrameTime));
            previousFrameTime = time;
            const song = sampleAudioInfluence(time);
            const songEnergy = song.energy;
            colorAccumulatorRef.current = (colorAccumulatorRef.current + delta * (.04 + song.brightness * .045 + song.change * .025 + highValRef.current * .6 + touchVelocityRef.current * .18)) % 1.0;
            const activeColor = new THREE.Color().setHSL(colorAccumulatorRef.current, 0.95, 0.5);
            wiregridMat.uniforms.tint.value.copy(activeColor).lerp(new THREE.Color("#8d9fe5"), .65);

            const resonance = Math.min(1, bassValRef.current * .7 + midValRef.current * .3 + songEnergy * .35);
            // One field breathes between an open ocean and a gathered spherical membrane.
            const breath = THREE.MathUtils.clamp((.5 - .5 * Math.cos(time * .24)) * .82 + songEnergy * .14 + song.change * .04, 0, 1);
            const gathering = THREE.MathUtils.smoothstep(breath, .08, .92);
            const fusion = Math.min(.99, gathering * .99 + resonance * .07);
            const pulse = 1 + Math.sin(time * 1.8) * .035 + resonance * .16 + songEnergy * song.bass * .075;
            const centerY = ORB_CENTER_Y + Math.sin(time * 1.2) * .55;
            const shellRadius = ORB_RADIUS * ORB_SCALE * pulse;
            orbMaterial.uniforms.tint.value.copy(activeColor);
            wiregridMat.uniforms.time.value = time;
            wiregridMat.uniforms.fusion.value = fusion;
            wiregridMat.uniforms.energy.value = resonance;
            rays.update(time, centerY, shellRadius, resonance, song.high);
            const posAttr = gridGeo.attributes.position;

            // Extract quantum evolution delta and expectation values safely
            const qDelta = quantumDataRef.current?.quantum_evolution_delta ?? 1.0;
            const qExpectation = quantumDataRef.current?.quantum_expectation_values?.[0] ?? 0.0;

            for (let i = 0; i < posAttr.count; i++) {
                const bx = baseGridVertices.getX(i);
                const by = baseGridVertices.getY(i);
                const bz = baseGridVertices.getZ(i);

                const waveX = Math.sin(by * 0.22 + time * 3.0) * (0.8 + bassValRef.current * 4.0 + songEnergy * song.bass * 1.3 + qExpectation);
                const waveY = Math.cos(bx * 0.22 + time * 2.5) * (0.8 + midValRef.current * 3.0 + songEnergy * song.mid * .9);
                const distFromCenter = Math.sqrt(bx * bx + by * by);
                const vortexFunnel = Math.max(0, 16.0 - distFromCenter * 0.35) * (0.4 + bassValRef.current * 1.4) * qDelta * 0.2;

                const theta = (bx / 120 + .5) * Math.PI * 2;
                const phi = (by / 120 + .5) * Math.PI;
                const surfaceFlow = 1 + Math.sin(theta * 5 + time * 1.4) * Math.sin(phi * 4 - time) * (.035 + resonance * .07);
                const imprintU = bx / 120 + .5 + time * .009;
                const imprintV = by / 120 + .5;
                const mark = imprintField.sample(imprintU, imprintV);
                const nested = imprintField.sample((bx / 120 + .5) * 2 - time * .006, imprintV * 2 + time * .003, 1);
                const seal = imprintField.sample(imprintU * .8, imprintV, 2);
                const branches = imprintField.sample(imprintU * 1.5, imprintV * 1.5 - time * .003, 4);
                const ridges = imprintField.sample(imprintU * 1.5, imprintV * 1.5 + time * .004, 7);
                const contour = (mark - .4) * .045 + (nested - .4) * .025 + (seal - .4) * .015 + (ridges - .4) * .015 + (branches - .4) * .01;
                const radius = shellRadius * (surfaceFlow + contour) * 1.055;
                fusedPosition.set(
                    Math.sin(phi) * Math.cos(theta + time * .08) * radius,
                    centerY + Math.cos(phi) * radius,
                    Math.sin(phi) * Math.sin(theta + time * .08) * radius
                ).applyQuaternion(gridRotationInverse);
                posAttr.setXYZ(i,
                    THREE.MathUtils.lerp(bx, fusedPosition.x, fusion),
                    THREE.MathUtils.lerp(by, fusedPosition.y, fusion),
                    THREE.MathUtils.lerp(bz + waveX + waveY + vortexFunnel + contour * 5, fusedPosition.z, fusion));
            }
            posAttr.needsUpdate = true;

            orbMaterial.uniforms.time.value = time;
            orbMaterial.uniforms.energy.value = bassValRef.current + midValRef.current * .5 + songEnergy * .4 + song.change * .12;
            orbMaterial.uniforms.tint.value.setHSL(colorAccumulatorRef.current, .75, .58);
            glowMaterial.color.copy(orbMaterial.uniforms.tint.value).lerp(new THREE.Color(1, .65, .32), .25);
            orb.rotation.y += delta * (.12 + songEnergy * .06 + song.change * .04);
            const breathing = pulse;
            orb.scale.setScalar(breathing);
            glow.scale.setScalar(25 * pulse * (1 + fusion * .12));
            glowMaterial.opacity = .65 + resonance * .35;
            symbolMesh.visible = false; // The spherical wire membrane now carries the geometry.
            orbMaterial.uniforms.energy.value += fusion * .45;
            sacredGroup.position.y = ORB_CENTER_Y + Math.sin(time * 1.2) * .55;
            symbolMesh.rotation.z += 0.006 + touchVelocityRef.current * 0.02 + bassValRef.current * 0.02;
            symbolMesh.rotation.x += 0.002;

            renderer.render(scene, camera);
            visualSnapshotRef.current = {
                fieldStyle: "mist-rays/1", orbRadius: ORB_RADIUS, orbCenterY: ORB_CENTER_Y, orbScale: ORB_SCALE, audioInfluence: song, timeSeconds: time, hue: colorAccumulatorRef.current, resonance, fusion, pulse,
                audioBands: { bass: bassValRef.current, mid: midValRef.current, high: highValRef.current },
                touch: { ...touchVectorRef.current },
                orbRotation: orb.rotation.toArray(),
                camera: { position: camera.position.toArray(), fov: camera.fov, aspect: camera.aspect },
                viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: renderer.getPixelRatio() },
                precomputedParameters: quantumDataRef.current ? structuredClone(quantumDataRef.current) : null,
            };
        };
        animate();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', updateCamera);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('touchmove', onTouchMove);
            scene.traverse((object) => {
                object.geometry?.dispose();
                if (object.material) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach((material) => material.dispose());
                }
            });
            innerGlowTexture.dispose();
            imprintField.dispose();
            glowTexture.dispose();
            renderer.dispose();
        };
    }, []);

    const releaseMicrophone = () => {
        recordingSessionRef.current?.stop();
        micStreamRef.current?.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
        analyserRef.current?.disconnect();
        analyserRef.current = null; dataArrayRef.current = null;
        const context = audioContextRef.current;
        audioContextRef.current = null;
        if (context && context.state !== 'closed') context.close().catch(() => {});
        bassValRef.current = midValRef.current = highValRef.current = 0;
        dynamicFactorRef.current = .18;
    };

    useEffect(() => () => {
        micRequestRef.current++;
        recordingSessionRef.current?.cancel(); recordingSessionRef.current = null;
        releaseMicrophone();
    }, []);

    const handleListen = async () => {
        if (micPendingRef.current || micStreamRef.current) {
            micRequestRef.current++;
            micPendingRef.current = false; setIsMicPending(false);
            releaseMicrophone(); setIsListening(false);
            setMicMessage('Microphone off.');
            return;
        }
        const requestId = ++micRequestRef.current;
        micPendingRef.current = true; setIsMicPending(true); setMicMessage('');
        let stream = null, context = null;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx || !navigator.mediaDevices?.getUserMedia) throw new Error('UNSUPPORTED');
            context = new AudioCtx();
            if (context.state === 'suspended') await context.resume();
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (requestId !== micRequestRef.current) {
                stream.getTracks().forEach(track => track.stop());
                if (context.state !== 'closed') await context.close();
                return;
            }
            const analyser = context.createAnalyser(); analyser.fftSize = 256;
            context.createMediaStreamSource(stream).connect(analyser);
            audioContextRef.current = context; micStreamRef.current = stream;
            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
            setIsListening(true); setMicMessage('Microphone on. Sound shapes the mirror; no audio is uploaded.');
            stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
                if (micStreamRef.current !== stream) return;
                releaseMicrophone(); setIsListening(false); setMicMessage('Microphone disconnected. You can listen again.');
            }));
        } catch (error) {
            stream?.getTracks().forEach(track => track.stop());
            if (context && context.state !== 'closed') await context.close().catch(() => {});
            if (requestId !== micRequestRef.current) return;
            releaseMicrophone(); setIsListening(false);
            setMicMessage(error.name === 'NotAllowedError'
                ? 'Microphone permission was not granted. The mirror still works without it.'
                : error.name === 'NotFoundError' ? 'No microphone found. Connect one and try again.'
                : error.name === 'NotReadableError' ? 'Microphone is unavailable or in use by another app.'
                : 'Microphone could not start in this browser. You can try again.');
        } finally {
            if (requestId === micRequestRef.current) { micPendingRef.current = false; setIsMicPending(false); }
        }
    };

    const handleCaptureVideo = () => {
        if (recordingSessionRef.current) { recordingSessionRef.current.stop(); return; }
        if (isFinalizingCapture) return;
        setCaptureMessage('');
        const failed = (error) => {
            recordingSessionRef.current = null;
            setIsRecording(false); setIsFinalizingCapture(false); setCaptureStatus('CAPTURE');
            setCaptureMessage(error.message || 'Recording failed. Please try again.');
        };
        try {
            recordingSessionRef.current = startCanvasRecording({
                canvas: mountRef.current, microphone: micStreamRef.current,
                onStopping: () => { setIsRecording(false); setIsFinalizingCapture(true); setCaptureStatus('SAVING...'); },
                onError: failed,
                onComplete: ({ blob, extension }) => {
                    recordingSessionRef.current = null; setIsRecording(false); setIsFinalizingCapture(false);
                    downloadBlob(blob, `EvoMirror_Resonance_Clip_${Date.now()}.${extension}`);
                    setCaptureStatus('CAPTURE');
                    setCaptureMessage('Video + microphone audio downloaded.');
                },
            });
            setIsRecording(true); setCaptureStatus('STOP REC');
            setCaptureMessage('Recording video + microphone audio. Stops after 15 seconds, or tap STOP REC.');
        } catch (error) { failed(error); }
    };

    const handleSealThis = async () => {
        if (savingSealRef.current) return;
        if (!visualSnapshotRef.current) { setArchiveError('The scene is still preparing. Try again in a moment.'); setIsVaultOpen(true); return; }
        savingSealRef.current = true; setIsSavingSeal(true); setSealStatus('SAVING...'); setArchiveError('');
        try {
            // toBlob snapshots the current canvas when called, before asynchronous storage begins.
            const visual = structuredClone(visualSnapshotRef.current);
            const image = await new Promise((resolve, reject) => mountRef.current.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image capture failed.')), 'image/png'));
            const seal = {
                schema: 'EvoMirror-Seal/v1', prototypeVersion: 'cosmic-mist-archive/6',
                id: crypto.randomUUID(), createdAt: new Date().toISOString(), image,
                identity: { ...IdentitySeal }, brand: structuredClone(BrandConfig.identity),
                brandArchitecture: structuredClone(BrandConfig.architecture),
                metadata: structuredClone(AujouleMetadata),
                tags: document.querySelector('meta[name="keywords"]').content.split(',').map(tag => tag.trim()),
                artworkProvenance: structuredClone(imprintProvenance),
                audioInfluenceProvenance: structuredClone(audioInfluenceProvenance),
                innerGlowProvenance: structuredClone(innerGlowProvenance),
                spaceProvenance: structuredClone(spaceProvenance),
                visual, audioRecorded: false,
                replay: 'Still image and visual parameters only; exact animated replay is not implemented.',
            };
            await saveSeal(seal);
            setSeals(previous => [seal, ...previous]); setSealStatus('SEALED.'); setIsVaultOpen(true);
        } catch (error) {
            setSealStatus('NOT SAVED'); setIsVaultOpen(true);
            setArchiveError(error.name === 'QuotaExceededError' ? 'Browser storage is full. This seal was not saved. Download existing seals to back them up.' : 'This seal could not be saved. Check browser storage permissions and try again.');
        } finally {
            savingSealRef.current = false; setIsSavingSeal(false);
            setTimeout(() => setSealStatus('SEAL THIS'), 2500);
        }
    };

    return (
        <div className="app-root">
            <canvas ref={mountRef} id="bg" />

            {/* Account & Archive Buttons */}
            {ACCOUNTS_ENABLED && <button className={`account-btn ${currentUser ? 'logged-in' : ''}`} onClick={() => setIsAuthOpen(true)}>
                {currentUser ? sealerName(currentUser).split('@')[0].toUpperCase() : 'ENTER'}
            </button>}
            <button className="toggle-vault-btn" onClick={() => setIsVaultOpen(!isVaultOpen)}>
                📁 YOUR ARCHIVE
            </button>

            {/* Top Header */}
            <div className="ambient-header" aria-hidden="true">
                <div className="ambient-title">AU·EVO·AUJOUL·EVOL</div>
            </div>
            <a href="https://evomirror.com" className="personal-seal-link" target="_blank" rel="noreferrer">
                ✧ evomirror.com ✧
            </a>

            {/* Dashboard */}
            <section className="dashboard" aria-label="Mirror controls">
                <div className="oracle-box sr-only">
                    <div className="oracle-realm">{realmText}</div>
                    <div className="oracle-text">{oracleText}</div>
                </div>

                <div className="control-row">
                    <button className="btn-core secondary" onClick={handleListen} aria-pressed={isListening} aria-label={isMicPending ? "Cancel microphone request" : isListening ? "Stop listening" : "Start listening"}>
                        {isMicPending ? 'CANCEL MIC' : isListening ? 'STOP LISTENING' : 'LISTEN'}
                    </button>
                    <button className="btn-core primary" onClick={handleSealThis} disabled={isSavingSeal}>
                        {sealStatus}
                    </button>
                    <button className={`btn-core recording-btn ${isRecording ? 'active-rec' : ''}`} onClick={handleCaptureVideo} disabled={isFinalizingCapture || (!isListening && !isRecording)}>
                        {captureStatus}
                    </button>
                </div>
                <p className="mic-feedback" role="status" aria-live="polite">{captureMessage || micMessage}</p>
            </section>

            {/* Auth Passkey Modal */}
            {ACCOUNTS_ENABLED && isAuthOpen && (
                <div className="auth-modal-overlay open">
                    <div className="auth-modal-card">
                        {!currentUser ? (
                            <div>
                                <div className="auth-modal-title">Your Reflection Awaits</div>
                                <div className="auth-tabs">
                                    <button className={`auth-tab ${authTab === 'signin' ? 'active' : ''}`} onClick={() => { setAuthTab('signin'); setAuthError(''); }}>
                                        Return
                                    </button>
                                    <button className={`auth-tab ${authTab === 'signup' ? 'active' : ''}`} onClick={() => { setAuthTab('signup'); setAuthError(''); }}>
                                        Begin
                                    </button>
                                </div>
                                <div className="auth-input-group">
                                    <input
                                        className="auth-input"
                                        type="email"
                                        placeholder="your email"
                                        value={authEmail}
                                        onChange={(e) => setAuthEmail(e.target.value)}
                                    />
                                </div>
                                <button className="auth-submit-btn" onClick={submitAuth} disabled={authLoading}>
                                    {authLoading ? 'Waiting for device...' : authTab === 'signin' ? 'Return' : 'Begin'}
                                </button>
                                {authError && <div className="auth-error">{authError}</div>}
                                <div className="auth-close-btn" style={{ marginTop: '10px', color: 'rgba(0,243,255,0.55)', fontSize: '11px', lineHeight: '1.4', cursor: 'default' }}>
                                    No password. Your device unlocks this with your face, fingerprint or PIN — nothing to forget, nothing to steal.
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="auth-signed-in-label">You Are</div>
                                <div className="auth-signed-in-email">{sealerName(currentUser)}</div>
                                <button className="auth-signout-btn" onClick={signOutAccount}>
                                    Sign Out
                                </button>
                            </div>
                        )}
                        <button className="auth-close-btn" onClick={() => setIsAuthOpen(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Vault Panel */}
            <div className={`vault-panel ${isVaultOpen ? 'open' : ''}`}>
                <h3 className="vault-header">
                    <span>📁 Everything You've Become</span>
                    <button className="vault-close-btn" onClick={() => setIsVaultOpen(false)}>
                        ✕
                    </button>
                </h3>
                <p className="vault-description">Saved in this browser on this device. Clearing site data removes this archive. Download FULL SEAL for an image and metadata backup; IMAGE saves a PNG. No cloud sync or animated replay yet.</p>
                <p className="archive-feedback" role="status" aria-live="polite">{archiveError || (archiveLoading ? 'Opening your archive...' : `${seals.length} saved ${seals.length === 1 ? 'seal' : 'seals'}`)}</p>
                <div id="gallery-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px', marginTop: '15px' }}>
                    {seals.map(seal => <SealCard key={seal.id} seal={seal} onError={setArchiveError} />)}
                    {!archiveLoading && !archiveError && seals.length === 0 && <p className="vault-description">Your first seal is waiting to be born.</p>}
                </div>
            </div>
        </div>
    );
}