import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import './App.css';

const API = 'https://api.evomirror.com';

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

export default function App() {
    const mountRef = useRef(null);

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
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

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

    // Restore session from server on load
    useEffect(() => {
        apiCall('/api/me')
            .then((me) => {
                if (me && me.portable) setCurrentUser(me);
            })
            .catch(() => setCurrentUser(null));
    }, []);

    // Fetch live C++ / PennyLane Quantum Evolution Output on load
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

        // Starfield
        const starCount = 1400;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 400.0;
            positions[i + 1] = (Math.random() - 0.5) * 400.0;
            positions[i + 2] = (Math.random() - 0.5) * 300.0;
        }
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMat = new THREE.PointsMaterial({ color: 0x00f3ff, size: 0.5, transparent: true, opacity: 0.35 });
        scene.add(new THREE.Points(starGeo, starMat));

        // Wiregrid Ocean Plane
        const gridGeo = new THREE.PlaneGeometry(120, 120, 100, 100);
        const baseGridVertices = gridGeo.attributes.position.clone();
        const wiregridMat = new THREE.MeshBasicMaterial({
            color: 0x39ff14,
            transparent: true,
            opacity: 0.88,
            wireframe: true,
            side: THREE.DoubleSide
        });
        const wiregridMesh = new THREE.Mesh(gridGeo, wiregridMat);
        wiregridMesh.rotation.x = -Math.PI / 2.3;
        scene.add(wiregridMesh);

        // Sacred Geometry Group
        const sacredGroup = new THREE.Group();
        sacredGroup.position.set(0.0, 11.0, 0.0);

        const torusMat = new THREE.MeshBasicMaterial({
            wireframe: true,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const knotRadius = window.innerWidth < 600 ? 5.2 : 7.5;
        const symbolGeo = new THREE.TorusKnotGeometry(knotRadius, 0.65, 128, 18, 2, 3);
        const symbolMesh = new THREE.Mesh(symbolGeo, torusMat);
        symbolMesh.rotation.x = Math.PI / 2;
        sacredGroup.add(symbolMesh);
        scene.add(sacredGroup);

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

            colorAccumulatorRef.current = (colorAccumulatorRef.current + 0.0012 + highValRef.current * 0.01 + touchVelocityRef.current * 0.003) % 1.0;
            const activeColor = new THREE.Color().setHSL(colorAccumulatorRef.current, 0.95, 0.5);
            wiregridMat.color.copy(activeColor);

            const time = Date.now() * 0.0012;
            const posAttr = gridGeo.attributes.position;

            // Extract quantum evolution delta and expectation values safely
            const qDelta = quantumDataRef.current?.quantum_evolution_delta ?? 1.0;
            const qExpectation = quantumDataRef.current?.quantum_expectation_values?.[0] ?? 0.0;

            for (let i = 0; i < posAttr.count; i++) {
                const bx = baseGridVertices.getX(i);
                const by = baseGridVertices.getY(i);
                const bz = baseGridVertices.getZ(i);

                const waveX = Math.sin(by * 0.22 + time * 3.0) * (0.8 + bassValRef.current * 4.0 + qExpectation);
                const waveY = Math.cos(bx * 0.22 + time * 2.5) * (0.8 + midValRef.current * 3.0);
                const distFromCenter = Math.sqrt(bx * bx + by * by);
                const vortexFunnel = Math.max(0, 16.0 - distFromCenter * 0.35) * (0.4 + bassValRef.current * 1.4) * qDelta * 0.2;

                posAttr.setZ(i, bz + waveX + waveY + vortexFunnel);
            }
            posAttr.needsUpdate = true;

            sacredGroup.position.y = 11.0 + Math.sin(time * 1.2) * 1.8;
            symbolMesh.rotation.z += 0.006 + touchVelocityRef.current * 0.02 + bassValRef.current * 0.02;
            symbolMesh.rotation.x += 0.002;

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', updateCamera);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('touchmove', onTouchMove);
            renderer.dispose();
        };
    }, []);

    const handleListen = async () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioCtx();
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;

            const source = audioContextRef.current.createMediaStreamSource(stream);
            source.connect(analyserRef.current);

            setIsListening(true);
            setRealmText('✦ REALM: AZURE THROAT MATRIX (SONIC TRUTH) ✦');
            setOracleText('Your vocal portal is active. Audio frequency decoding in progress...');
        } catch (err) {
            console.warn('Microphone error:', err);
            setOracleText('Microphone access blocked. Please check your browser permissions.');
        }
    };

    const handleCaptureVideo = () => {
        if (!isRecording) {
            recordedChunksRef.current = [];
            const canvasEl = mountRef.current;
            const stream = canvasEl.captureStream(30);
            mediaRecorderRef.current = new MediaRecorder(stream);

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `AuEvo_Resonance_Clip_${Date.now()}.mp4`;
                a.click();
                setCaptureStatus('CAPTURED.');
                setTimeout(() => setCaptureStatus('CAPTURE'), 2500);
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setCaptureStatus('⏺ REC (15s)');
            setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    setIsRecording(false);
                }
            }, 15000);
        }
    };

    const handleSealThis = () => {
        setSealStatus('SEALED.');
        setTimeout(() => setSealStatus('SEAL THIS'), 2500);
    };

    return (
        <div className="app-root">
            <canvas ref={mountRef} id="bg" />

            {/* Account & Archive Buttons */}
            <button className={`account-btn ${currentUser ? 'logged-in' : ''}`} onClick={() => setIsAuthOpen(true)}>
                {currentUser ? sealerName(currentUser).split('@')[0].toUpperCase() : 'ENTER'}
            </button>
            <button className="toggle-vault-btn" onClick={() => setIsVaultOpen(!isVaultOpen)}>
                📁 YOUR ARCHIVE
            </button>

            {/* Top Header */}
            <div className="ambient-header" aria-hidden="true">
                <div className="ambient-title">AU·EVO·AUJOUL·EVOL</div>
            </div>
            <a href="https://lisajevolving.com" className="personal-seal-link" target="_blank" rel="noreferrer">
                ✧ lisajevolving.com ✧
            </a>

            {/* Dashboard */}
            <section className="dashboard" aria-label="Mirror controls">
                <div className="oracle-box">
                    <div className="oracle-realm">{realmText}</div>
                    <div className="oracle-text">{oracleText}</div>
                </div>

                <div className="control-row">
                    <button className="btn-core secondary" onClick={handleListen}>
                        {isListening ? 'LISTENING' : 'LISTEN'}
                    </button>
                    <button className="btn-core primary" onClick={handleSealThis} disabled={!isListening}>
                        {sealStatus}
                    </button>
                    <button className={`btn-core recording-btn ${isRecording ? 'active-rec' : ''}`} onClick={handleCaptureVideo} disabled={!isListening}>
                        {captureStatus}
                    </button>
                </div>
            </section>

            {/* Auth Passkey Modal */}
            {isAuthOpen && (
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
                <p className="vault-description">Tap any seal to return to that moment — its shape and color awaken again, here, now.</p>
                <div id="gallery-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px', marginTop: '15px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', textAlign: 'center', padding: '20px' }}>
                        Nothing here yet. Your first seal is waiting to be born.
                    </p>
                </div>
            </div>
        </div>
    );
}