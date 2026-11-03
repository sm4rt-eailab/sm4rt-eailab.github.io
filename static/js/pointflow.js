// Shared WebGL renderer for SM4RT predictions: a point map whose moving points travel along the predicted
// object flow (t = 0 -> 1), with soft glow and flow trails. Used by the hero and the results explorer.
// Data: static/data/scenes/{id}_{fwd,bwd}.bin (header layout in the export script).
window.PointFlow = (() => {
    const POINT_VS = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aFlow;
uniform mat4 uView, uProj; uniform float uFlow, uZ0, uSize, uShift, uFmax;
varying vec3 vCol; varying float vFog, vMag;
void main() {
  vec3 p = aPos + aFlow * uFlow;
  vec4 mv = uView * vec4(p, 1.0);
  vec4 clip = uProj * mv;
  clip.x += uShift * clip.w;
  gl_Position = clip;
  gl_PointSize = max(1.0, uSize * -aPos.z / -mv.z);
  vCol = aCol;
  vFog = clamp((-mv.z / uZ0 - 0.75) / 1.6, 0.0, 1.0);
  vMag = clamp(length(aFlow) / uFmax, 0.0, 1.0);
}`;
    // uMode: 0 = image colours (optionally tinted), 1 = muted grey (static points), 2 = colour by flow magnitude
    const POINT_FS = `
precision mediump float;
varying vec3 vCol; varying float vFog, vMag;
uniform vec3 uTint, uBg; uniform float uTintAmt, uGain, uFade, uAlpha, uSoft, uMode, uFogAmt;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  vec3 col;
  if (uMode < 0.5) col = mix(vCol, uTint, uTintAmt);
  else if (uMode < 1.5) col = uTint * (0.35 + 0.75 * dot(vCol, vec3(0.3, 0.55, 0.15)));
  else {
    col = mix(vec3(0.42, 0.47, 0.56), vec3(1.0, 0.475, 0.306), smoothstep(0.0, 0.3, vMag));
    col = mix(col, vec3(1.0, 0.86, 0.55), smoothstep(0.45, 1.0, vMag));
  }
  col *= uGain;
  col = mix(col, uBg, vFog * uFogAmt);
  col = mix(uBg, col, uFade);
  float a = uAlpha * (uSoft > 0.5 ? exp(-r2 * 16.0) : 1.0);
  gl_FragColor = vec4(col * a, a);
}`;
    const TRAIL_VS = `
attribute vec3 aPos; attribute vec3 aFlow; attribute float aEnd;
uniform mat4 uView, uProj; uniform float uFlow, uShift;
varying float vT;
void main() {
  vec3 p = aPos + aFlow * uFlow * aEnd;
  vec4 clip = uProj * uView * vec4(p, 1.0);
  clip.x += uShift * clip.w;
  gl_Position = clip;
  vT = aEnd;
}`;
    const TRAIL_FS = `
precision mediump float;
varying float vT; uniform vec3 uTint; uniform float uAlpha;
void main() { float a = uAlpha * vT * vT; gl_FragColor = vec4(uTint * a, a); }`;

    // ------------------------------------------------------------ data
    const cache = new Map();
    function load(url) {
        if (!cache.has(url)) {
            cache.set(url, fetch(url)
                .then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.arrayBuffer(); })
                .then(parse)
                .catch((e) => { cache.delete(url); throw e; }));
        }
        return cache.get(url);
    }

    function parse(buf) {
        const h = new Float32Array(buf, 0, 20);
        const Ns = h[0], Nd = h[1];
        const bmin = [h[4], h[5], h[6]], bmax = [h[7], h[8], h[9]], fscale = h[10] / 32767;
        let off = 80;
        const deq = (q, n) => {
            const out = new Float32Array(n * 3);
            for (let i = 0; i < n * 3; i++) { const k = i % 3; out[i] = bmin[k] + (q[i] / 65535) * (bmax[k] - bmin[k]); }
            return out;
        };
        const Ps = deq(new Uint16Array(buf, off, Ns * 3), Ns); off += Ns * 6;
        const Pd = deq(new Uint16Array(buf, off, Nd * 3), Nd); off += Nd * 6;
        const fq = new Int16Array(buf, off, Nd * 3); off += Nd * 6;
        const Fd = new Float32Array(Nd * 3);
        for (let i = 0; i < Nd * 3; i++) Fd[i] = fq[i] * fscale;
        const Cs = new Uint8Array(buf, off, Ns * 3);
        const Cd = new Uint8Array(buf, off + Ns * 3, Nd * 3);

        // colour scale for flow magnitude: 95th percentile of the moving points
        const mags = new Float32Array(Nd);
        for (let i = 0; i < Nd; i++) mags[i] = Math.hypot(Fd[3 * i], Fd[3 * i + 1], Fd[3 * i + 2]);
        const sorted = mags.slice().sort();
        const fmax = Math.max(1e-6, sorted[Math.floor(0.95 * (Nd - 1))] || 0);

        // trails: an even subset of the moving points, one segment each (start, end)
        const stride = Math.max(1, Math.round(Nd / 1600));
        const Nt = Math.floor(Nd / stride);
        const Tp = new Float32Array(Nt * 6), Tf = new Float32Array(Nt * 6), Te = new Float32Array(Nt * 2);
        for (let j = 0; j < Nt; j++) {
            const i = j * stride;
            for (let k = 0; k < 3; k++) {
                Tp[j * 6 + k] = Tp[j * 6 + 3 + k] = Pd[i * 3 + k];
                Tf[j * 6 + k] = Tf[j * 6 + 3 + k] = Fd[i * 3 + k];
            }
            Te[j * 2 + 1] = 1;
        }
        return {
            Ns, Nd, Nt, z0: h[2], tanHalf: h[3], iw: h[11], ih: h[12], f: h[13], splat: h[14], total: h[15], moving: h[16],
            fmax, Ps, Pd, Fd, Cs, Cd, Tp, Tf, Te,
        };
    }

    // ------------------------------------------------------------ math (column-major 4x4)
    function perspective(tanHalfY, aspect, near, far) {
        const f = 1 / tanHalfY, nf = 1 / (near - far);
        return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    }
    function lookAt(e, t) {
        let fx = t[0] - e[0], fy = t[1] - e[1], fz = t[2] - e[2];
        let l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
        let rx = -fz, ry = 0, rz = fx; // f x up(0,1,0)
        l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
        const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
        return new Float32Array([rx, ux, -fx, 0, ry, uy, -fy, 0, rz, uz, -fz, 0,
            -(rx * e[0] + ry * e[1] + rz * e[2]), -(ux * e[0] + uy * e[1] + uz * e[2]), fx * e[0] + fy * e[1] + fz * e[2], 1]);
    }
    // Camera orbiting a pivot on the input camera's optical axis; yaw = pitch = 0, dist = 1 is the input view.
    function orbit(z0, yaw, pitch, dist) {
        const r = z0 * dist;
        const v = [Math.sin(yaw) * Math.cos(pitch) * r, -Math.sin(pitch) * r, Math.cos(yaw) * Math.cos(pitch) * r];
        return lookAt([v[0], v[1], v[2] - z0], [0, 0, -z0]);
    }

    // ------------------------------------------------------------ renderer
    function create(canvas, { maxPixels = 4.2e6 } = {}) {
        const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
        if (!gl) return null;

        function program(vs, fs) {
            const p = gl.createProgram();
            [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([type, src]) => {
                const s = gl.createShader(type);
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
                gl.attachShader(p, s);
            });
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            const loc = {};
            const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
            for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i).name; loc[u] = gl.getUniformLocation(p, u); }
            const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
            for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i).name; loc[a] = gl.getAttribLocation(p, a); }
            return { p, loc };
        }
        function attrib(loc, buf, size, type = gl.FLOAT, norm = false) {
            if (loc === undefined || loc < 0) return;
            if (!buf) { gl.disableVertexAttribArray(loc); gl.vertexAttrib3f(loc, 0, 0, 0); return; }
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
        }

        const pts = program(POINT_VS, POINT_FS);
        const trl = program(TRAIL_VS, TRAIL_FS);
        let S = null, B = null, W = 1, H = 1;

        function setScene(data) {
            if (B) Object.values(B).forEach((b) => gl.deleteBuffer(b));
            const buffer = (arr) => {
                const b = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, b);
                gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
                return b;
            };
            S = data;
            B = {
                ps: buffer(data.Ps), cs: buffer(data.Cs), pd: buffer(data.Pd), cd: buffer(data.Cd), fd: buffer(data.Fd),
                tp: buffer(data.Tp), tf: buffer(data.Tf), te: buffer(data.Te),
            };
        }

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = canvas.clientWidth, h = canvas.clientHeight;
            const scale = Math.min(dpr, Math.sqrt(maxPixels / Math.max(1, w * h)));
            W = Math.max(1, Math.round(w * scale));
            H = Math.max(1, Math.round(h * scale));
            if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
            return { W, H };
        }

        // o: { yaw, pitch, dist, flow, tanHalfY, shift, fade, bg, colour: 'image' | 'motion',
        //      staticTint, staticTintAmt, staticGain, movingTint, movingTintAmt, glow, trails, sizeScale }
        function draw(o) {
            if (!S) return;
            const aspect = W / H;
            const proj = perspective(o.tanHalfY, aspect, 0.02 * S.z0, 60 * S.z0);
            const vmat = orbit(S.z0, o.yaw, o.pitch, o.dist);
            // screen pixels per source pixel, times the per-scene splat factor (sparser scenes get bigger points)
            const size = ((H / 2) / o.tanHalfY / S.f) * S.splat * (o.sizeScale || 1);
            const motion = o.colour === 'motion';
            const bg = o.bg;

            gl.viewport(0, 0, W, H);
            gl.clearColor(bg[0], bg[1], bg[2], 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);

            const U = pts.loc;
            gl.useProgram(pts.p);
            gl.uniformMatrix4fv(U.uView, false, vmat);
            gl.uniformMatrix4fv(U.uProj, false, proj);
            gl.uniform1f(U.uZ0, S.z0);
            gl.uniform1f(U.uShift, o.shift || 0);
            gl.uniform1f(U.uFmax, S.fmax);
            gl.uniform3fv(U.uBg, bg);
            gl.uniform1f(U.uFade, o.fade ?? 1);
            gl.uniform1f(U.uFogAmt, o.fog ?? 0.6);

            // static points
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(true);
            attrib(U.aPos, B.ps, 3);
            attrib(U.aCol, B.cs, 3, gl.UNSIGNED_BYTE, true);
            attrib(U.aFlow, null, 3);
            gl.uniform1f(U.uFlow, 0);
            gl.uniform1f(U.uSize, size);
            gl.uniform1f(U.uMode, motion ? 1 : 0);
            gl.uniform3fv(U.uTint, motion ? [0.62, 0.68, 0.78] : o.staticTint || [0, 0, 0]);
            gl.uniform1f(U.uTintAmt, motion ? 0 : o.staticTintAmt || 0);
            gl.uniform1f(U.uGain, motion ? 0.8 : o.staticGain ?? 1);
            gl.uniform1f(U.uAlpha, 1);
            gl.uniform1f(U.uSoft, 0);
            gl.drawArrays(gl.POINTS, 0, S.Ns);

            // moving points, displaced along their flow
            attrib(U.aPos, B.pd, 3);
            attrib(U.aCol, B.cd, 3, gl.UNSIGNED_BYTE, true);
            attrib(U.aFlow, B.fd, 3);
            gl.uniform1f(U.uFlow, o.flow);
            gl.uniform1f(U.uMode, motion ? 2 : 0);
            gl.uniform3fv(U.uTint, o.movingTint || [1.0, 0.475, 0.306]);
            gl.uniform1f(U.uTintAmt, motion ? 0 : o.movingTintAmt || 0);
            gl.uniform1f(U.uGain, motion ? 1.1 : o.movingGain ?? 1.1);
            gl.drawArrays(gl.POINTS, 0, S.Nd);

            // glow and trails, additive
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.depthMask(false);
            if (o.glow > 0) {
                gl.uniform1f(U.uSize, size * 3.2);
                gl.uniform1f(U.uMode, motion ? 2 : 0);
                gl.uniform1f(U.uTintAmt, motion ? 0 : 0.85);
                gl.uniform1f(U.uGain, 1.0);
                gl.uniform1f(U.uAlpha, o.glow);
                gl.uniform1f(U.uSoft, 1);
                gl.drawArrays(gl.POINTS, 0, S.Nd);
            }
            attrib(U.aFlow, null, 3);

            if (o.trails > 0 && S.Nt > 0) {
                const T = trl.loc;
                gl.useProgram(trl.p);
                gl.uniformMatrix4fv(T.uView, false, vmat);
                gl.uniformMatrix4fv(T.uProj, false, proj);
                gl.uniform1f(T.uFlow, o.flow);
                gl.uniform1f(T.uShift, o.shift || 0);
                gl.uniform3fv(T.uTint, o.trailTint || [1.0, 0.475, 0.306]);
                gl.uniform1f(T.uAlpha, o.trails);
                attrib(T.aPos, B.tp, 3);
                attrib(T.aFlow, B.tf, 3);
                gl.bindBuffer(gl.ARRAY_BUFFER, B.te);
                gl.enableVertexAttribArray(T.aEnd);
                gl.vertexAttribPointer(T.aEnd, 1, gl.FLOAT, false, 0, 0);
                gl.drawArrays(gl.LINES, 0, S.Nt * 2);
                gl.disableVertexAttribArray(T.aEnd);
            }
            gl.depthMask(true);
        }

        return { gl, setScene, resize, draw, get scene() { return S; }, get size() { return { W, H }; } };
    }

    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    return { load, parse, create, ease };
})();
