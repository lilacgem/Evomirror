import * as THREE from 'three';
import JSZip from 'jszip';

export function initVisualizer() {
    const BrandConfig = {
        name: 'AuEvo',
        legal: 'AuEvo Collective',
        project: 'AuEvo Mirror'
    };

    const Identity = {
        entity: 'AuEvo Resonance Entity',
        sovereignID: 'AUEVO-0001',
        handshake: 'EVO-CORE-HANDSHAKE',
        frequency: '432Hz',
        lineage: 'Evolving Roots'
    };

    const Metadata = {
        identity: { id: 'AUEVO-ROOT' },
        technical_specs: {
            engine: 'three.js r128',
            audioCodec: 'webm',
            fps: 30,
            resolution: 'dynamic'
        },
        multipliers: {
            sovereign_tags: ['awareness', 'resonance', 'audio-visual', 'protocol']
        }
    };

    // --- 1. CORE SYSTEM SCENE SETTING ---
    const canvasEl = document.querySelector('#bg');
    if (!canvasEl) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        alpha: true,
        preserveDrawingBuffer: true
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000002, 1);
    camera.position.z = 44;

    let mouseX = 0, mouseY = 0;
    let dynamicFactor = 0.05;
    let colorAccumulator = 0.5;
    let coreBrilliance = 1.0;
    let baseStarSpeed = 0.0005;

    const resonanceSettings = {
        hueOffset: 0.08,
        sensitivity: 2.0,
        colorBoost: 0.22
    };

    const handleMouseMove = (event) => {
        mouseX = (event.clientX / window.innerWidth) * 2 - 1;
        mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // --- 2. KINETIC DRIFT STARFIELD SYSTEM ---
    const starCount = 3500;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        starPositions[i] = (Math.random() - 0.5) * 200;
        starPositions[i + 1] = (Math.random() - 0.5) * 200;
        starPositions[i + 2] = (Math.random() - 0.5) * 100 - 50;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.45,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // --- 3. HIGH-INTENSITY PROCEDURAL SHADERS ---
    const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vScreenPos;
  varying vec3 vLocalPos;
  uniform float time;
  uniform float factor;

  vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ; m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vUv = uv; vNormal = normalize(normalMatrix * normal); vLocalPos = position;
    vec3 pos = position;
    float noiseFreq = 0.12;
    float noiseAmp = factor * 4.5;
    float displacement = snoise(pos.xy * noiseFreq + time * 1.0) * noiseAmp;
    displacement += sin(pos.z * 0.3 + time * 2.0) * (factor * 1.5);
    vec3 morphed = pos + normal * displacement;
    vec4 mvPosition = modelViewMatrix * vec4(morphed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vScreenPos = gl_Position.xyz / gl_Position.w;
  }
  `;

    const fragmentShader = `
  uniform float time; uniform float factor; uniform float satMul; uniform float lightMul; uniform float hueShift; uniform float brilliance;
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vScreenPos; varying vec3 vLocalPos;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
  }

  void main() {
    vec3 nNormal = normalize(vNormal);
    float surfaceNoise = sin(vLocalPos.x * 0.1 + time * 0.2) * cos(vLocalPos.y * 0.1 + time * 0.2);
    float sat = clamp(0.85 * satMul, 0.0, 1.0);
    float light = clamp(0.45 * lightMul, 0.0, 1.0);
    vec3 fluidBaseColor = hsl2rgb(vec3(mod(hueShift + surfaceNoise, 1.0), sat, light));
    float lightAngle = max(dot(nNormal, vec3(0.3, 0.3, 1.0)), 0.0);
    vec3 dynamicEmissive = fluidBaseColor * (0.7 + lightAngle * 1.0 + factor * 1.5);
    float currentLine = abs(sin(vLocalPos.x * 0.3 + time * 2.0) * cos(vLocalPos.y * 0.3 - time * 2.5));
    float currentGlow = pow(1.0 - smoothstep(0.0, 0.12 + (factor * 0.2), currentLine), 3.0);
    vec3 plasmaCurrentColor = hsl2rgb(vec3(mod(hueShift + 0.2, 1.0), 0.9, 0.6)) * currentGlow * (factor * 2.5);
    float fresnel = pow(1.0 - max(dot(nNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    vec3 outerHaloColor = hsl2rgb(vec3(mod(hueShift + 0.15, 1.0), 0.9, 0.5));
    vec3 atmosphericHalo = outerHaloColor * fresnel * (1.8 + factor * 4.0) * (brilliance * 0.6);
    float radialDistance = length(vScreenPos.xy);
    float coreSoftFlare = pow(max(1.0 - radialDistance, 0.0), 4.0);
    vec3 centralLightBoost = vec3(0.95, 0.95, 1.0) * coreSoftFlare * (0.2 + factor * 2.0);
    vec3 finalMix = mix(dynamicEmissive, atmosphericHalo, 0.3 + fresnel * 0.4) + plasmaCurrentColor + centralLightBoost;
    finalMix *= 1.25; finalMix = clamp(finalMix, 0.0, 1.0); finalMix = pow(finalMix, vec3(0.92));
    gl_FragColor = vec4(finalMix, 0.98);
  }
  `;

    // --- 4. ENGINE GEOMETRY COMPILATION ---
    const geometry = new THREE.SphereGeometry(16, 96, 96);
    const mirrorMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 }, factor: { value: 0.05 }, hueShift: { value: 0.5 },
            satMul: { value: 1.0 }, lightMul: { value: 1.0 }, brilliance: { value: 1.0 }
        },
        vertexShader: vertexShader, fragmentShader: fragmentShader, transparent: true, side: THREE.DoubleSide
    });
    const mirrorSphere = new THREE.Mesh(geometry, mirrorMaterial);
    scene.add(mirrorSphere);

    // --- 5. TELEMETRY LABS & SOUND DECODER ---
    let audioContext, analyser, dataArray;
    let micStream = null; let canvasStream = null; let recordingStream = null;
    let mediaRecorder = null; let recordedChunks = [];
    const micButton = document.getElementById('micButton');
    const recordButton = document.getElementById('recordButton');

    if (micButton) {
        micButton.onclick = async () => {
            if (audioContext) return;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                micStream = stream;
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(stream);

                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                dataArray = new Uint8Array(analyser.frequencyBinCount);

                source.connect(analyser);
                canvasStream = canvasEl.captureStream ? canvasEl.captureStream(30) : canvasEl.mozCaptureStream(30);

                micButton.innerText = "MIRROR CORE ENGAGED";
                micButton.style.border = "1px solid #00ffaa"; micButton.style.color = "#00ffaa";

                const status = document.getElementById('micStatus');
                if (status) status.innerText = 'ENGAGED';
                if (recordButton) {
                    recordButton.disabled = false;
                    recordButton.innerText = 'START RECORDING';
                }
            } catch (err) {
                console.error("Microphone linkage failure:", err);
                micButton.innerText = "HARDWARE SYNC ERROR";
                const status = document.getElementById('micStatus');
                if (status) status.innerText = 'ERROR';
            }
        };
    }

    setTimeout(() => {
        const md = document.getElementById('awarenessDisplay'); if (md) md.innerText = 'RESONANT';
        const brandEl = document.getElementById('brandName'); if (brandEl) brandEl.innerText = BrandConfig.name;
    }, 100);

    let recordingStartTime = 0;

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.style.display = 'none'; anchor.href = url; anchor.download = filename;
        document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    function createAssetMetadata(durationMs) {
        const assetId = `${Metadata.identity.id}-${Date.now()}`;
        return {
            assetId, createdAt: new Date().toISOString(), creator: BrandConfig.name,
            creatorLegal: BrandConfig.legal, projectName: BrandConfig.name, entity: Identity.entity,
            sovereignID: Identity.sovereignID, handshake: Identity.handshake, frequency: Identity.frequency,
            lineage: Identity.lineage, createdWith: 'AuEvo Mirror', provenance: Metadata.identity.id,
            durationMs, lastHue: Math.round((colorAccumulator % 1.0) * 360), resonance: Number(dynamicFactor.toFixed(4)),
            rootValue: document.getElementById('rootDisplay')?.innerText || '-', activationMode: 'audio-video-resonance',
            format: 'video/webm', videoFrameRate: 30,
            resolution: {
                width: canvasEl.width || window.innerWidth,
                height: canvasEl.height || window.innerHeight
            },
            technicalSpecs: Metadata.technical_specs, tags: Metadata.multipliers.sovereign_tags
        };
    }

    function createNftMetadata(assetMetadata) {
        return {
            name: `${assetMetadata.projectName} ${assetMetadata.assetId}`,
            description: `A live audio-video resonance session created by ${assetMetadata.creator}.`,
            creator: assetMetadata.creator, creatorLegal: assetMetadata.creatorLegal, provenance: assetMetadata.provenance,
            assetId: assetMetadata.assetId, createdAt: assetMetadata.createdAt, durationMs: assetMetadata.durationMs,
            attributes: [
                { trait_type: 'Resonance', value: assetMetadata.resonance },
                { trait_type: 'Last Hue', value: assetMetadata.lastHue },
                { trait_type: 'Root Value', value: assetMetadata.rootValue },
                { trait_type: 'Frame Rate', value: assetMetadata.videoFrameRate },
                { trait_type: 'Resolution', value: `${assetMetadata.resolution.width}x${assetMetadata.resolution.height}` }
            ],
            tags: assetMetadata.tags, format: assetMetadata.format, animation_url: `${assetMetadata.assetId}.webm`
        };
    }

    async function saveRecording() {
        if (!recordedChunks.length) return;
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const durationMs = Date.now() - recordingStartTime;
        const timestamp = Date.now();
        const assetFilename = `evo_mirror_asset_${timestamp}.webm`;

        const assetMetadata = createAssetMetadata(durationMs);
        const metadataJson = JSON.stringify(assetMetadata, null, 2);

        const nftMetadata = createNftMetadata(assetMetadata);
        const nftJson = JSON.stringify(nftMetadata, null, 2);

        if (JSZip) {
            const zip = new JSZip();
            zip.file(assetFilename, blob);
            zip.file(`asset_metadata_${timestamp}.json`, metadataJson);
            zip.file(`nft_metadata_${timestamp}.json`, nftJson);
            zip.file('README.txt', `AuEvo Mirror asset bundle\nCreator: ${assetMetadata.creator}\nAsset ID: ${assetMetadata.assetId}\n`);
            const zipContent = await zip.generateAsync({ type: 'blob' });
            downloadBlob(zipContent, `evo_mirror_bundle_${timestamp}.zip`);
        } else {
            downloadBlob(blob, assetFilename);
            downloadBlob(new Blob([metadataJson], { type: 'application/json' }), `asset_metadata_${timestamp}.json`);
            downloadBlob(new Blob([nftJson], { type: 'application/json' }), `nft_metadata_${timestamp}.json`);
        }
        recordedChunks = [];
    }

    function toggleRecording() {
        if (!micStream) { alert('Start the mirror first before recording.'); return; }
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            recordedChunks = []; recordingStartTime = Date.now();
            if (canvasStream && micStream) {
                recordingStream = new MediaStream([...canvasStream.getVideoTracks(), ...micStream.getAudioTracks()]);
            } else {
                alert('Recording is not available yet.'); return;
            }
            try {
                mediaRecorder = new MediaRecorder(recordingStream);
            } catch (err) {
                console.error(err); alert('Recording is not supported in this browser.'); return;
            }
            mediaRecorder.ondataavailable = event => { if (event.data && event.data.size > 0) recordedChunks.push(event.data); };
            mediaRecorder.onstop = () => { saveRecording(); if (recordButton) recordButton.innerText = 'START RECORDING'; };
            mediaRecorder.start();
            if (recordButton) recordButton.innerText = 'STOP RECORDING';
        } else {
            mediaRecorder.stop();
        }
    }

    if (recordButton) recordButton.addEventListener('click', toggleRecording);

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(v => { const s = v.toString(16); return s.length === 1 ? '0' + s : s; }).join('');
    }

    function hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    function calculateDigitalRoot(n) { return n === 0 ? 0 : 1 + ((n - 1) % 9); }

    function processVocalTelemetry() {
        const hueDisplay = document.getElementById('hueDisplay');
        const resDisplay = document.getElementById('resDisplay');

        if (!analyser) {
            colorAccumulator = (colorAccumulator + 0.0005) % 1.0;
            mirrorMaterial.uniforms.hueShift.value = colorAccumulator;
            if (hueDisplay) hueDisplay.innerText = `${Math.round(colorAccumulator * 360)}°`;
            return;
        }

        analyser.getByteFrequencyData(dataArray);
        let totalVolume = 0;
        for (let i = 0; i < dataArray.length; i++) { totalVolume += dataArray[i]; }

        const normalizedVol = totalVolume / (dataArray.length * 255);
        const resonance = resonanceSettings;
        dynamicFactor = THREE.MathUtils.lerp(dynamicFactor, normalizedVol * 3.4 * resonance.sensitivity + 0.02, 0.22);

        const volumeTrigger = Math.max(6, totalVolume * 0.12);
        if (totalVolume > volumeTrigger) {
            let accelerationScale = 0.004 + (dynamicFactor * 0.02);
            colorAccumulator = (colorAccumulator + accelerationScale) % 1.0;
            baseStarSpeed = THREE.MathUtils.lerp(baseStarSpeed, 0.01 + (dynamicFactor * 0.04) * resonance.sensitivity, 0.15);

            const numericRoot = calculateDigitalRoot(totalVolume);
            const rootEl = document.getElementById('rootDisplay');
            if (rootEl) rootEl.innerText = numericRoot;

            if ([3, 6, 9].includes(numericRoot)) {
                coreBrilliance = THREE.MathUtils.lerp(coreBrilliance, 4.0, 0.25);
                if (rootEl) rootEl.style.color = '#00ffaa';
            } else {
                coreBrilliance = THREE.MathUtils.lerp(coreBrilliance, 1.0, 0.1);
                if (rootEl) rootEl.style.color = '#ffd700';
            }
        } else {
            dynamicFactor = THREE.MathUtils.lerp(dynamicFactor, 0.01, 0.1);
            coreBrilliance = THREE.MathUtils.lerp(coreBrilliance, 1.0, 0.1);
            baseStarSpeed = THREE.MathUtils.lerp(baseStarSpeed, 0.0005, 0.05);
        }

        let centroid = 0, magSum = 0;
        const sr = audioContext ? (audioContext.sampleRate || 44100) : 44100;
        for (let i = 0; i < dataArray.length; i++) {
            const mag = dataArray[i]; const freq = i * (sr / analyser.fftSize);
            centroid += freq * mag; magSum += mag;
        }
        let centroidNorm = 0.5;
        if (magSum > 0) centroidNorm = (centroid / magSum) / (sr / 2);

        const timeData = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeData);
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] - 128) / 128; sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / timeData.length);

        const targetHue = (centroidNorm * 1.4 + colorAccumulator * 0.6 + resonance.hueOffset) % 1.0;
        const currentHue = mirrorMaterial.uniforms.hueShift.value;
        const newHue = THREE.MathUtils.lerp(currentHue, targetHue, 0.22);

        mirrorMaterial.uniforms.hueShift.value = newHue;
        colorAccumulator = newHue;

        const targetSatMul = 0.85 + Math.min(1, rms * 2.2);
        const targetLightMul = 0.78 + Math.min(1, rms * 1.6);
        mirrorMaterial.uniforms.satMul.value = THREE.MathUtils.lerp(mirrorMaterial.uniforms.satMul.value, targetSatMul, 0.24);
        mirrorMaterial.uniforms.lightMul.value = THREE.MathUtils.lerp(mirrorMaterial.uniforms.lightMul.value, targetLightMul, 0.24);

        try {
            const rgb = hslToRgb(newHue, Math.min(1, mirrorMaterial.uniforms.satMul.value), Math.min(0.95, mirrorMaterial.uniforms.lightMul.value * 0.72));
            stars.material.color.set(rgbToHex(rgb.r, rgb.g, rgb.b));
            stars.material.size = 0.45 + (rms * 0.8);
        } catch (e) { }

        if (hueDisplay) hueDisplay.innerText = `${Math.round((newHue % 1.0) * 360)}°`;
        if (resDisplay) resDisplay.innerText = dynamicFactor.toFixed(3);
    }

    // --- 6. MASTER FLUID RUNTIME SYSTEM LOOP ---
    let animId;
    function animate() {
        animId = requestAnimationFrame(animate);
        processVocalTelemetry();

        camera.position.x += (mouseX * 5 - camera.position.x) * 0.04;
        camera.position.y += (mouseY * 5 - camera.position.y) * 0.04;
        camera.lookAt(mirrorSphere.position);

        const positions = starGeometry.attributes.position.array;
        for (let i = 2; i < positions.length; i += 3) {
            positions[i] += baseStarSpeed * 110.0;
            if (positions[i] > 50) {
                positions[i] = -50;
                positions[i - 1] = (Math.random() - 0.5) * 200; positions[i - 2] = (Math.random() - 0.5) * 200;
            }
        }
        starGeometry.attributes.position.needsUpdate = true;
        stars.rotation.z += 0.0002;

        mirrorSphere.rotation.y += 0.003 + (dynamicFactor * 0.015);
        mirrorSphere.rotation.x += 0.001 + (dynamicFactor * 0.005);

        mirrorMaterial.uniforms.time.value = Date.now() * 0.001;
        mirrorMaterial.uniforms.factor.value = dynamicFactor;
        mirrorMaterial.uniforms.brilliance.value = coreBrilliance;

        renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', handleResize);
        renderer.dispose();
    };
}