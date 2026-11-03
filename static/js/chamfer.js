// Method 4: what the voxel Chamfer loss does (paper, Sec. 3.4 and appendix), on a bird's-eye toy scene at t2 in
// camera 1's frame. X = P1(t1, π1) + F1 holds every pixel of frame 1 moved by its predicted flow; Y = P̃2(t2, π1) is
// frame 2's ground-truth point map. Inside each voxel every x is pulled to its nearest y and every y pulls its nearest
// x; a voxel holding only one of the two sets contributes nothing. Only three car pixels have motion labels, which the
// regression loss keeps in place. "Global" runs the same Chamfer distance without voxels, for comparison.
(() => {
    const canvas = document.getElementById('chamfer-canvas');
    if (!canvas) return;
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const C = { geom: '#509ef5', label: '#dc71c2', ink: '#eef2f8', muted: '#94a3b8', faint: '#5b6b84', bad: '#e8b93b', motion: '#ff794e' };
    const W = 900, H = 330;
    const STEPS = 24, RATE = 0.22, VOX = 34, GX = 12, GY = 23, WRONG = 26;

    // deterministic random numbers
    let seed = 11;
    const rand = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const normal = (s) => s * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    // ------------------------------------------------------------ scene (camera 1's frame, seen from above)
    const WALL_Y = 40, FOV = 0.82;
    const CAM = [[410, 318], [480, 318]]; // camera 1, camera 2 (it moved right)
    const D = [150, 0]; // the car's motion t1 -> t2
    const carAt = (cx) => ({ x0: cx - 65, x1: cx + 65, y0: 96, y1: 142 });
    const CAR = [carAt(280), carAt(280 + D[0])];
    const PARKED = { x0: 588, x1: 652, y0: 60, y1: 96 }; // a static parked car

    const inFov = (c, p) => Math.abs(Math.atan2(p[0] - c[0], c[1] - p[1])) < FOV;
    function hitsRect(a, b, r) { // segment a-b crosses the rectangle's interior (Liang-Barsky)
        let t0 = 0, t1 = 1;
        const dx = b[0] - a[0], dy = b[1] - a[1], e = 0.5;
        const P = [-dx, dx, -dy, dy], Q = [a[0] - (r.x0 + e), (r.x1 - e) - a[0], a[1] - (r.y0 + e), (r.y1 - e) - a[1]];
        for (let i = 0; i < 4; i++) {
            if (P[i] === 0) { if (Q[i] < 0) return false; continue; }
            const t = Q[i] / P[i];
            if (P[i] < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
            if (t0 > t1) return false;
        }
        return true;
    }
    // is surface point s (outward normal n, on object `own`) seen by camera c while the car is at `car`?
    function seen(c, s, car) {
        if (!inFov(c, s.p)) return false;
        if ((s.n[0] * (c[0] - s.p[0]) + s.n[1] * (c[1] - s.p[1])) <= 0) return false;
        return (s.own === 'car' || !hitsRect(c, s.p, car)) && (s.own === 'parked' || !hitsRect(c, s.p, PARKED));
    }
    // surface samples; `phase` offsets them so the two frames' pixels land on different spots
    function surface(car, phase) {
        const out = [];
        for (let x = 24 + phase * 14; x < W - 20; x += 14) out.push({ p: [x, WALL_Y], n: [0, 1], own: 'wall' });
        const box = (r, own) => {
            const edge = (x0, y0, x1, y1, n) => {
                const m = Math.floor(Math.hypot(x1 - x0, y1 - y0) / 11);
                for (let i = 0; i < m; i++) { const f = (i + 0.5 + phase * 0.5) / m; out.push({ p: [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f], n, own }); }
            };
            edge(r.x0, r.y1, r.x1, r.y1, [0, 1]); edge(r.x0, r.y0, r.x1, r.y0, [0, -1]);
            edge(r.x0, r.y0, r.x0, r.y1, [-1, 0]); edge(r.x1, r.y0, r.x1, r.y1, [1, 0]);
        };
        box(PARKED, 'parked'); box(car, 'car');
        return out;
    }
    const shift = (s, d) => ({ ...s, p: [s.p[0] + d[0], s.p[1] + d[1]] });

    // X: frame 1's pixels; `truth` is where each really is at t2 (P1(t1, π1) + true flow)
    const X = surface(CAR[0], 0).filter((s) => seen(CAM[0], s, CAR[0])).map((s) => {
        const moving = s.own === 'car', t = moving ? shift(s, D) : s;
        return { truth: t.p, own: s.own, car: moving, only: !seen(CAM[1], t, CAR[1]) }; // only: frame 2 does not see it
    });
    // Y: frame 2's ground-truth points at t2, in camera 1's frame
    const Y = surface(CAR[1], 0.2).filter((s) => seen(CAM[1], s, CAR[1])).map((s) => {
        const moving = s.own === 'car', back = moving ? shift(s, [-D[0], -D[1]]) : s;
        return { p: s.p, own: s.own, car: moving, only: !seen(CAM[0], back, CAR[0]) }; // only: frame 1 does not see it
    });
    // stretches of wall seen by one frame only, with the reason, for the drawing
    const STRETCHES = [];
    [[X.map((x) => x.truth), X, 1], [Y.map((y) => y.p), Y, 0]].forEach(([pos, set, other]) => {
        let run = null;
        const close = () => {
            if (run && run[2] >= 3) {
                const mid = [(run[0] + run[1]) / 2, WALL_Y], c = CAM[other];
                STRETCHES.push([mid[0], !inFov(c, mid) ? `outside camera ${other + 1}'s view`
                    : hitsRect(c, mid, PARKED) ? 'behind the parked car' : other ? 'hidden by the car at t₂' : 'revealed as the car moved']);
            }
            run = null;
        };
        set.forEach((s, i) => {
            if (s.own !== 'wall') return;
            const x = pos[i][0];
            if (!s.only || (run && x - run[1] > 20)) close();
            if (s.only) run = run ? [run[0], x, run[2] + 1] : [x, x, 1];
        });
        close();
    });
    // predicted flow early in training: right on the three labelled car pixels, inconsistent on the rest of the car
    const carIdx = X.map((x, i) => (x.car ? i : -1)).filter((i) => i >= 0);
    const near = carIdx.filter((i) => Math.abs(X[i].truth[1] - CAR[1].y1) < 1);
    const labelled = new Set([near[1], near[Math.floor(near.length / 2)], near[near.length - 2]]);
    const X0 = X.map((x, i) => {
        if (!x.car) return [x.truth[0] + normal(1.2), x.truth[1] + normal(1.2)];
        if (labelled.has(i)) return x.truth.slice();
        const s = 0.86 + 0.22 * rand();
        return [x.truth[0] - D[0] * (1 - s), x.truth[1] + normal(10)];
    });

    // ------------------------------------------------------------ the loss, run for a few steps
    const key = (p) => Math.floor((p[0] - GX) / VOX) + ',' + Math.floor((p[1] - GY) / VOX);
    const ky = Y.map((y) => key(y.p));
    const carErr = (P) => carIdx.reduce((a, i) => a + dist(P[i], X[i].truth), 0) / carIdx.length; // object-flow EPE on the car
    function simulate(voxels) {
        let P = X0;
        const frames = [];
        for (let step = 0; step <= STEPS; step++) {
            const kx = P.map(key);
            const fwd = new Array(P.length).fill(-1), bwd = new Array(Y.length).fill(-1);
            let checks = 0;
            P.forEach((p, i) => { // each x -> nearest y
                let bd = Infinity;
                for (let j = 0; j < Y.length; j++) {
                    if (voxels && ky[j] !== kx[i]) continue;
                    checks++;
                    const d = (Y[j].p[0] - p[0]) ** 2 + (Y[j].p[1] - p[1]) ** 2;
                    if (d < bd) { bd = d; fwd[i] = j; }
                }
            });
            Y.forEach((y, j) => { // each y -> nearest x
                let bd = Infinity;
                for (let i = 0; i < P.length; i++) {
                    if (voxels && ky[j] !== kx[i]) continue;
                    checks++;
                    const d = (y.p[0] - P[i][0]) ** 2 + (y.p[1] - P[i][1]) ** 2;
                    if (d < bd) { bd = d; bwd[j] = i; }
                }
            });
            // a match is invalid if either end has no counterpart in the other frame, or it joins different surfaces
            const bad = (i, j) => X[i].only || Y[j].only || dist(X[i].truth, Y[j].p) > WRONG;
            const badF = fwd.map((j, i) => j >= 0 && bad(i, j)), badB = bwd.map((i, j) => i >= 0 && bad(i, j));
            frames.push({ P, kx, fwd, bwd, badF, badB, checks, err: carErr(P) });
            const pulls = P.map(() => []);
            fwd.forEach((j, i) => { if (j >= 0) pulls[i].push(Y[j].p); });
            bwd.forEach((i, j) => { if (i >= 0) pulls[i].push(Y[j].p); });
            P = P.map((p, i) => {
                const ps = pulls[i];
                if (!ps.length || labelled.has(i)) return p;
                const mx = ps.reduce((a, q) => a + q[0], 0) / ps.length, my = ps.reduce((a, q) => a + q[1], 0) / ps.length;
                return [p[0] + RATE * (mx - p[0]), p[1] + RATE * (my - p[1])];
            });
        }
        return frames;
    }
    const RUNS = { voxel: simulate(true), global: simulate(false) };

    // ------------------------------------------------------------ drawing
    const ctx = canvas.getContext('2d');
    let scale = 1, css = 1, mode = 'voxel', u = REDUCED ? STEPS : 0, hover = null;
    let view = { x0: 0, w: W }; // narrow screens crop to the middle of the scene
    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = canvas.clientWidth || W;
        view = cw < 600 ? { x0: 165, w: 625 } : { x0: 0, w: W };
        canvas.style.aspectRatio = `${view.w} / ${H}`;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round((cw * dpr * H) / view.w);
        scale = (cw * dpr) / view.w; css = cw / view.w;
        draw();
    }
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    function rect(r, dash) { ctx.setLineDash(dash || []); ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); ctx.setLineDash([]); }
    function camera(c, col, label) {
        ctx.save(); ctx.translate(c[0], c[1]);
        ctx.globalAlpha = 0.16; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
        [-FOV, FOV].forEach((a) => line([0, 0], [Math.sin(a) * 420, -Math.cos(a) * 420]));
        ctx.setLineDash([]);
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -24); ctx.lineTo(14, -24); ctx.closePath();
        ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
        ctx.fillRect(-8, -3, 16, 10);
        ctx.font = `italic 500 ${Math.max(16, 12 / css)}px "STIX Two Text", serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, 20, -6);
        ctx.restore();
    }

    const read = document.getElementById('chamfer-read'), hint = document.getElementById('chamfer-hint');
    function draw() {
        const run = RUNS[mode], k = Math.min(STEPS, Math.floor(u)), f = u - k, A = run[k], B = run[Math.min(STEPS, k + 1)];
        const P = A.P.map((p, i) => [p[0] + (B.P[i][0] - p[0]) * f, p[1] + (B.P[i][1] - p[1]) * f]);
        const vox = mode === 'voxel';
        ctx.setTransform(scale, 0, 0, scale, -view.x0 * scale, 0);
        ctx.clearRect(view.x0, 0, view.w, H);

        // voxels: grid, with the ones holding only one of the two sets hatched (skipped)
        if (vox) {
            const occX = new Set(A.kx), occY = new Set(ky);
            ctx.globalAlpha = 0.16; ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = GX; x <= W; x += VOX) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
            for (let y = GY; y <= H; y += VOX) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
            ctx.stroke();
            new Set([...occX, ...occY]).forEach((kk) => {
                if (occX.has(kk) && occY.has(kk)) return;
                const [gx, gy] = kk.split(',').map(Number), rx = GX + gx * VOX, ry = GY + gy * VOX;
                ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, VOX, VOX); ctx.clip();
                ctx.globalAlpha = 0.2; ctx.fillStyle = C.faint; ctx.fillRect(rx, ry, VOX, VOX);
                ctx.globalAlpha = 0.45; ctx.strokeStyle = C.faint; ctx.lineWidth = 1.2; ctx.beginPath();
                for (let q = -VOX; q < VOX; q += 8) { ctx.moveTo(rx + q, ry + VOX); ctx.lineTo(rx + q + VOX, ry); }
                ctx.stroke(); ctx.restore();
            });
        }

        // context: cameras, the parked car, the moving car at t1 (dashed) and t2, its motion, why stretches are skipped
        camera(CAM[0], C.ink, 'π₁'); camera(CAM[1], C.bad, 'π₂');
        ctx.globalAlpha = 0.4; ctx.strokeStyle = C.muted; ctx.lineWidth = 1.4; rect(CAR[0], [5, 5]); rect(PARKED);
        ctx.globalAlpha = 0.5; ctx.strokeStyle = C.ink; rect(CAR[1]);
        const fs = Math.max(13, 11 / css), ay = CAR[0].y1 + 26;
        const tfs = Math.max(11, 10.5 / css);
        ctx.font = `500 ${tfs}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tag = (t, x, y) => {
            const w = ctx.measureText(t).width + tfs;
            x = Math.max(view.x0 + w / 2 + 4, Math.min(view.x0 + view.w - w / 2 - 4, x));
            ctx.globalAlpha = 0.85; ctx.fillStyle = '#0a1020';
            ctx.beginPath(); ctx.roundRect(x - w / 2, y - tfs * 0.72, w, tfs * 1.44, tfs * 0.72); ctx.fill();
            ctx.globalAlpha = 0.85; ctx.fillStyle = C.muted; ctx.fillText(t, x, y + 0.5);
        };
        let right = -Infinity, row = 0; // a label that would overlap the previous one drops to a second row
        STRETCHES.slice().sort((a, b) => a[0] - b[0]).forEach(([x, t]) => {
            const w = ctx.measureText(t).width + tfs * 1.6;
            x = Math.max(view.x0 + w / 2, Math.min(view.x0 + view.w - w / 2, x));
            row = x - w / 2 < right && row === 0 ? 1 : 0;
            if (row === 0) right = x + w / 2;
            tag(t, x, WALL_Y + 22 + row * tfs * 1.7);
        });
        tag('parked car', (PARKED.x0 + PARKED.x1) / 2, PARKED.y1 + 16);
        const ax0 = (CAR[0].x0 + CAR[0].x1) / 2, ax1 = (CAR[1].x0 + CAR[1].x1) / 2;
        ctx.globalAlpha = 0.8; ctx.strokeStyle = C.motion; ctx.fillStyle = C.motion; ctx.lineWidth = 2;
        line([ax0, ay], [ax1 - 8, ay]);
        ctx.beginPath(); ctx.moveTo(ax1, ay); ctx.lineTo(ax1 - 9, ay - 5); ctx.lineTo(ax1 - 9, ay + 5); ctx.closePath(); ctx.fill();
        ctx.font = `500 ${fs}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'bottom';
        ctx.textAlign = 'right'; ctx.globalAlpha = 0.75; ctx.fillStyle = C.muted; ctx.fillText('car at t₁', ax0 - 6, ay + fs * 0.45);
        ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText('car at t₂', ax1 + 6, ay + fs * 0.45);

        // matches: ring -> nearest dot (blue), dot -> nearest ring (pink), invalid ones gold
        const lit = (kk) => !hover || kk === hover;
        const pairs = [];
        A.fwd.forEach((j, i) => { if (j >= 0) pairs.push([P[i], Y[j].p, A.badF[i], C.geom, A.kx[i]]); });
        A.bwd.forEach((i, j) => { if (i >= 0) pairs.push([Y[j].p, P[i], A.badB[j], C.label, ky[j]]); });
        pairs.sort((a, b) => a[2] - b[2]).forEach(([a, b, isBad, col, kk]) => {
            ctx.globalAlpha = (isBad ? 0.9 : 0.75) * (lit(kk) ? 1 : 0.15);
            ctx.strokeStyle = isBad ? C.bad : col; ctx.lineWidth = isBad ? 1.6 : 1.3;
            line(a, b);
        });

        // points: dots = P̃2, rings = P1 + F1 (filled where the pixel has a motion label)
        ctx.fillStyle = C.label;
        Y.forEach((y, j) => { ctx.globalAlpha = lit(ky[j]) ? 1 : 0.3; ctx.beginPath(); ctx.arc(y.p[0], y.p[1], 3.8, 0, 7); ctx.fill(); });
        P.forEach((p, i) => {
            ctx.globalAlpha = lit(A.kx[i]) ? 1 : 0.3;
            ctx.strokeStyle = C.geom; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p[0], p[1], 5.2, 0, 7); ctx.stroke();
            if (labelled.has(i)) { ctx.fillStyle = C.geom; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 7); ctx.fill(); }
        });
        if (hover && vox) {
            const [gx, gy] = hover.split(',').map(Number);
            ctx.globalAlpha = 0.9; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
            ctx.strokeRect(GX + gx * VOX, GY + gy * VOX, VOX, VOX);
        }
        ctx.globalAlpha = 1;

        const d = Math.round((carErr(P) / run[0].err - 1) * 100);
        const nBad = A.badF.filter(Boolean).length + A.badB.filter(Boolean).length;
        const skipped = A.fwd.filter((j) => j < 0).length + A.bwd.filter((i) => i < 0).length;
        read.innerHTML = `<span class="${d < -2 ? 'ok' : d > 2 ? 'bad' : ''}"><b>${d < 0 ? '−' : d > 0 ? '+' : '±'}${Math.abs(d)}%</b> flow error on the car</span>`
            + `<span class="${nBad ? 'bad' : 'ok'}"><b>${nBad}</b> invalid matches</span>`
            + (vox ? `<span><b>${skipped}</b> points skipped</span>` : '')
            + `<span><b>${A.checks.toLocaleString('en-US')}</b> distance checks${vox ? ` (${Math.round(RUNS.global[k].checks / A.checks)}× fewer)` : ''}</span>`;
        if (hover && vox) {
            const nx = A.kx.filter((kk) => kk === hover).length, ny = ky.filter((kk) => kk === hover).length;
            hint.innerHTML = !nx && !ny ? 'Empty voxel.'
                : nx && ny ? `This voxel: <b>${nx}</b> ring${nx > 1 ? 's' : ''} and <b>${ny}</b> dot${ny > 1 ? 's' : ''}, matched only with each other.`
                : `This voxel holds only ${nx ? 'rings' : 'dots'}: a surface seen in one frame only, so it is skipped.`;
        } else {
            hint.textContent = vox ? 'Hover or tap a voxel to see its terms.' : 'Without voxels, every point searches the whole scene.';
        }
    }

    // ------------------------------------------------------------ controls
    const stepIn = document.getElementById('chamfer-step'), kOut = document.getElementById('chamfer-k'), play = document.getElementById('chamfer-play');
    const fill = (inp) => inp.style.setProperty('--v', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%');
    stepIn.max = STEPS * 10;
    function setStep(v) {
        u = Math.max(0, Math.min(STEPS, v));
        stepIn.value = Math.round(u * 10); fill(stepIn);
        kOut.textContent = Math.round(u);
        draw();
    }
    let raf = 0, last = 0, hold = 0;
    function stop() { cancelAnimationFrame(raf); raf = 0; play.classList.remove('playing'); play.setAttribute('aria-label', 'Play'); }
    function start(delay = 0) {
        if (u >= STEPS) setStep(0);
        hold = delay; last = performance.now();
        play.classList.add('playing'); play.setAttribute('aria-label', 'Pause');
        const tick = (now) => {
            const dt = now - last; last = now;
            if (hold > 0) hold -= dt; else setStep(u + (dt / 3600) * STEPS);
            if (u >= STEPS) { stop(); return; }
            raf = requestAnimationFrame(tick);
        };
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
    }
    play.addEventListener('click', () => (raf ? stop() : start()));
    stepIn.addEventListener('input', () => { stop(); setStep(stepIn.value / 10); });
    document.querySelectorAll('#chamfer-mode button').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('#chamfer-mode button').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b); });
        mode = b.dataset.v; hover = null;
        draw();
    }));
    const pick = (e) => {
        if (mode !== 'voxel') return;
        const r = canvas.getBoundingClientRect();
        const kk = key([view.x0 + ((e.clientX - r.left) / r.width) * view.w, ((e.clientY - r.top) / r.height) * H]);
        if (kk !== hover) { hover = kk; draw(); }
    };
    canvas.addEventListener('pointermove', pick);
    canvas.addEventListener('pointerdown', pick);
    canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; draw(); } });

    setStep(u);
    new ResizeObserver(resize).observe(canvas);
    if (!REDUCED) { // play once the first time the widget comes into view
        const io = new IntersectionObserver((es) => {
            if (!es.some((e) => e.isIntersecting)) return;
            io.disconnect();
            start(900);
        }, { threshold: 0.45 });
        io.observe(canvas);
    }
})();
