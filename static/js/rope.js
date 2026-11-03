// Method 3.3: 2D vs 3D RoPE neighbourhoods on SM4RT's predicted point map (Kubric-F k5).
// Left: the 16 x 16 patch grid; right: the same tokens placed at the mean of their patch's predicted 3D points.
// Highlighted tokens are the query's nearest neighbours: Gaussian in patch distance (sigma 1.3) vs. in 3D (sigma 0.13).
(() => {
    const c2 = document.getElementById('rope-2d');
    const c3 = document.getElementById('rope-3d');
    if (!c2 || !c3) return;
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const MOTION = '#ff794e', INK = '#eef2f8';
    const TOP = 14;

    const img = new Image();
    const ready = Promise.all([
        fetch('static/data/rope_k5.json').then((r) => r.json()),
        new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'static/visualizations/k5/view1.png'; }),
    ]);

    ready.then(([D]) => init(D)).catch((e) => console.warn('RoPE widget unavailable:', e));

    function init(D) {
        const G = D.grid, N = G * G, ps = D.iw / G, z0 = D.pivot;
        const cen = [];
        for (let i = 0; i < N; i++) cen.push([D.tokens[3 * i], D.tokens[3 * i + 1], D.tokens[3 * i + 2]]);
        const plane = cen.map((p) => p.map((v) => v * (z0 / -p[2])));
        const rows = [], cols = [];
        for (let i = 0; i < N; i++) { rows.push(Math.floor(i / G)); cols.push(i % G); }

        let q = 6 * G + 7;
        let w2 = new Float32Array(N), w3 = new Float32Array(N);
        const s2 = new Float32Array(N), s3 = new Float32Array(N); // displayed (smoothed) weights
        let top2 = [], top3 = [];
        function weights() {
            for (let j = 0; j < N; j++) {
                const d2 = Math.hypot(rows[j] - rows[q], cols[j] - cols[q]);
                w2[j] = j === q ? 0 : Math.exp(-(d2 * d2) / (2 * 1.3 * 1.3));
                const d3 = Math.hypot(cen[j][0] - cen[q][0], cen[j][1] - cen[q][1], cen[j][2] - cen[q][2]);
                w3[j] = j === q ? 0 : Math.exp(-(d3 * d3) / (2 * 0.13 * 0.13));
            }
            const idx = [...Array(N).keys()];
            top2 = idx.slice().sort((a, b) => w2[b] - w2[a]).slice(0, TOP);
            top3 = idx.slice().sort((a, b) => w3[b] - w3[a]).slice(0, TOP);
        }
        weights();

        // canvas sizing
        const ctx2 = c2.getContext('2d'), ctx3 = c3.getContext('2d');
        let S = 400, dpr = 1;
        function resize() {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            S = c2.clientWidth || 400;
            [c2, c3].forEach((c) => { c.width = Math.round(S * dpr); c.height = Math.round(S * dpr); });
        }
        new ResizeObserver(resize).observe(c2);
        resize();
        const geo = () => { const IMG = S * 0.8; return { IMG, ox: (S - IMG) / 2, oy: (S - IMG) / 2, tile: IMG / G }; };

        // camera (orbit around the pivot on the input camera's axis; yaw = pitch = 0 is the input view)
        const cam = { yaw: 0, pitch: 0, dist: 1 };
        const user = { yaw: 0, pitch: 0 };
        function project(X, IMG) {
            const r = z0 * cam.dist, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
            const eye = [sy * cp * r, -sp * r, -z0 + cy * cp * r];
            let f = [-eye[0], -eye[1], -z0 - eye[2]]; // towards the pivot (0, 0, -z0)
            const fl = Math.hypot(...f); f = f.map((v) => v / fl);
            let rt = [-f[2], 0, f[0]]; // f x (0,1,0)
            const rl = Math.hypot(...rt); rt = rt.map((v) => v / rl);
            const up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
            const fr = D.f * IMG / D.iw;
            return X.map((p) => {
                const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
                const x = d[0] * rt[0] + d[1] * rt[1] + d[2] * rt[2];
                const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
                const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
                return { x: S / 2 + fr * x / z, y: S / 2 - fr * y / z, z, fr };
            });
        }

        let lift = 1, liftTarget = 1, liftFrom = 1, liftT0 = 0;
        let fit = null;
        function computeFit() {
            const saved = { ...cam }, savedLift = lift;
            Object.assign(cam, BASE); lift = 1;
            const pr = project(cen, geo().IMG);
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            pr.forEach((p, j) => {
                const h = (p.fr * (ps / D.f) * -cen[j][2]) / p.z / 2;
                x0 = Math.min(x0, p.x - h); x1 = Math.max(x1, p.x + h);
                y0 = Math.min(y0, p.y - h); y1 = Math.max(y1, p.y + h);
            });
            Object.assign(cam, saved); lift = savedLift;
            fit = { S, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z: Math.min((0.9 * S) / (x1 - x0), (0.9 * S) / (y1 - y0)) };
        }
        const a2 = 1, a3 = 1, qa = 1; // attention / query visibility
        let proj = [], sides = [], order = [];

        function drawQuery(ctx, x, y, side, t) {
            const pulse = 1 + 0.12 * Math.sin(t * 5);
            ctx.globalAlpha = qa;
            ctx.strokeStyle = INK;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x - side / 2, y - side / 2, side, side);
            ctx.globalAlpha = 0.5 * qa;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, side * 0.95 * pulse, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        function attLines(ctx, x0, y0, pts, top, w, a) {
            if (a <= 0) return;
            ctx.strokeStyle = MOTION;
            top.forEach((j) => {
                ctx.globalAlpha = (0.25 + 0.7 * w[j]) * a;
                ctx.lineWidth = 1 + 2.4 * w[j];
                ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
            });
            ctx.globalAlpha = 1;
        }

        function draw2D(t) {
            const ctx = ctx2;
            const { IMG, ox, oy, tile } = geo();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, S, S);
            ctx.save();
            ctx.beginPath(); ctx.roundRect(ox, oy, IMG, IMG, 6); ctx.clip();
            ctx.drawImage(img, ox, oy, IMG, IMG);
            for (let j = 0; j < N; j++) {
                if (s2[j] * a2 < 0.04) continue;
                ctx.fillStyle = MOTION;
                ctx.globalAlpha = 0.55 * s2[j] * a2;
                ctx.fillRect(ox + cols[j] * tile + 1, oy + rows[j] * tile + 1, tile - 2, tile - 2);
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(10,15,28,.8)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let k = 0; k <= G; k++) {
                ctx.moveTo(ox + k * tile, oy); ctx.lineTo(ox + k * tile, oy + IMG);
                ctx.moveTo(ox, oy + k * tile); ctx.lineTo(ox + IMG, oy + k * tile);
            }
            ctx.stroke();
            ctx.restore();
            const pts = cen.map((_, j) => ({ x: ox + (cols[j] + 0.5) * tile, y: oy + (rows[j] + 0.5) * tile }));
            attLines(ctx, pts[q].x, pts[q].y, pts, top2, s2, a2);
            drawQuery(ctx, pts[q].x, pts[q].y, tile, t);
        }

        function draw3D(t) {
            const ctx = ctx3;
            const { IMG } = geo();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, S, S);
            const X = cen.map((p, j) => [0, 1, 2].map((k) => plane[j][k] * (1 - lift) + p[k] * lift));
            if (!fit || fit.S !== S) computeFit();
            const z = fit.z, fx = fit.cx, fy = fit.cy;
            proj = project(X, IMG).map((p) => ({ x: (p.x - fx) * z + S / 2, y: (p.y - fy) * z + S / 2, z: p.z, fr: p.fr * z }));
            sides = proj.map((p, j) => {
                const world = (ps / D.f) * (z0 * (1 - lift) + -cen[j][2] * lift);
                return p.fr * world / p.z * 0.88;
            });
            order = [...Array(N).keys()].sort((a, b) => proj[b].z - proj[a].z);
            for (const j of order) {
                const p = proj[j], sd = sides[j];
                if (p.z <= 0.05) continue;
                const dim = j === q ? 1 : 1 - 0.6 * a3 * (1 - Math.min(1, s3[j] * 1.5));
                ctx.globalAlpha = dim;
                ctx.drawImage(img, cols[j] * ps, rows[j] * ps, ps, ps, p.x - sd / 2, p.y - sd / 2, sd, sd);
                if (s3[j] * a3 > 0.04 && j !== q) {
                    ctx.globalAlpha = 0.5 * s3[j] * a3;
                    ctx.fillStyle = MOTION;
                    ctx.fillRect(p.x - sd / 2, p.y - sd / 2, sd, sd);
                }
            }
            ctx.globalAlpha = 1;
            attLines(ctx, proj[q].x, proj[q].y, proj, top3, s3, a3);
            drawQuery(ctx, proj[q].x, proj[q].y, Math.max(8, sides[q]), t);
        }

        // ------------------------------------------------------------ render loop (only while visible)
        const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
        const BASE = { yaw: 0.42, pitch: 0.52, dist: 0.98 };
        Object.assign(cam, BASE);
        s2.set(w2); s3.set(w3);
        let t0 = null, running = false, raf = 0, interacted = false;
        function frame(now) {
            raf = 0;
            if (!running) return;
            if (t0 === null) t0 = now;
            const t = (now - t0) / 1000;
            const k = 0.14;
            if (liftT0) {
                const p = ease((now - liftT0) / 1100);
                lift = liftFrom + (liftTarget - liftFrom) * p;
                if (p >= 1) liftT0 = 0;
            }
            const wob = REDUCED || interacted ? 0 : 0.08 * Math.sin(t * 0.5);
            cam.yaw += (BASE.yaw + user.yaw + wob - cam.yaw) * k;
            cam.pitch += (Math.max(-0.3, Math.min(1.3, BASE.pitch + user.pitch)) - cam.pitch) * k;
            cam.dist += (BASE.dist - cam.dist) * k;
            for (let j = 0; j < N; j++) { s2[j] += (w2[j] - s2[j]) * 0.25; s3[j] += (w3[j] - s3[j]) * 0.25; }
            draw2D(t);
            draw3D(t);
            if (running) raf = requestAnimationFrame(frame);
        }
        const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
        new IntersectionObserver((es) => {
            running = es[0].isIntersecting;
            if (running) start();
        }, { threshold: 0.1 }).observe(c2);
        draw2D(0); draw3D(0);

        // ------------------------------------------------------------ interaction
        function setQuery(j) {
            if (j === q || j < 0) return;
            q = j;
            weights();
            interacted = true;
            start();
        }
        function local(c, e) { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
        function hover2(e) {
            const [x, y] = local(c2, e);
            const { ox, oy, tile } = geo();
            const cc = Math.floor((x - ox) / tile), rr = Math.floor((y - oy) / tile);
            if (cc >= 0 && cc < G && rr >= 0 && rr < G) setQuery(rr * G + cc);
        }
        c2.addEventListener('pointermove', hover2);
        c2.addEventListener('pointerdown', hover2);
        function pick3(x, y) {
            for (let i = order.length - 1; i >= 0; i--) {
                const j = order[i], p = proj[j], h = sides[j] / 2;
                if (Math.abs(x - p.x) <= h && Math.abs(y - p.y) <= h) return j;
            }
            return -1;
        }
        let drag = null;
        c3.addEventListener('pointerdown', (e) => {
            c3.setPointerCapture(e.pointerId);
            drag = { x: e.clientX, y: e.clientY, yaw: user.yaw, pitch: user.pitch, moved: false };
        });
        c3.addEventListener('pointermove', (e) => {
            if (drag) {
                const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                if (Math.hypot(dx, dy) > 4) drag.moved = true;
                if (drag.moved) {
                    interacted = true;
                    user.yaw = drag.yaw - (dx / S) * 2.2;
                    user.pitch = drag.pitch + (dy / S) * 1.6;
                    start();
                }
                return;
            }
            if (e.pointerType === 'mouse') { const [x, y] = local(c3, e); setQuery(pick3(x, y)); }
        });
        const up = (e) => {
            if (drag && !drag.moved) { const [x, y] = local(c3, e); setQuery(pick3(x, y)); }
            drag = null;
        };
        c3.addEventListener('pointerup', up);
        c3.addEventListener('pointercancel', () => { drag = null; });

        document.querySelectorAll('#rope-lift button').forEach((b) => b.addEventListener('click', () => {
            document.querySelectorAll('#rope-lift button').forEach((o) => o.classList.toggle('on', o === b));
            liftFrom = lift; liftTarget = parseFloat(b.dataset.v); liftT0 = performance.now();
            if (REDUCED) { lift = liftTarget; liftT0 = 0; }
            start();
        }));
    }
})();
