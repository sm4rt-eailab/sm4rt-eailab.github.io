// Method 3.1: the three ways to write the motion of frame 1's pixels (paper, Sec. 3.2), on a top-down toy scene.
// Arrows are the regression targets at each point, drawn on camera 1's axes. Drag "camera motion" to see which
// definitions change when the camera moves.
(() => {
    const svg = document.getElementById('flow-svg');
    if (!svg) return;
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const NS = 'http://www.w3.org/2000/svg';
    const C = { stat: '#8193ae', car: '#ff794e', cam: '#e8b93b', ink: '#eef2f8', muted: '#94a3b8', faint: '#5b6b84', edge: '#2e3f5e' };
    const el = (tag, attrs = {}, parent = svg, text) => {
        const n = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        if (text !== undefined) n.textContent = text;
        parent.appendChild(n);
        return n;
    };
    // world: camera 1's frame seen from above (x right, z forward); 1 unit = U px
    const U = 36;
    const SX = (x) => 320 + x * U, SY = (z) => 398 - z * U;

    // ------------------------------------------------------------ toy scene
    const statics = [];
    for (let x = -5.8; x <= 5.9; x += 1.45) statics.push([x, 8.9]);
    statics.push([-5.4, 4.6], [5.6, 5.6], [-4.0, 6.8], [4.3, 2.8]);
    const CAR = [-2.6, 4.2], M = [2.7, 0.35]; // car centre at t1, its motion t1 -> t2
    const carPts = [[-1.05, -0.45], [0, -0.5], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]].map(([dx, dz]) => [CAR[0] + dx, CAR[1] + dz]);
    const MOTION2 = (a) => ({ T: [1.4 * a, 0.55 * a], th: 0.2 * a }); // camera 2 pose relative to camera 1

    const defs = el('defs');
    [['s', C.cam], ['c', C.car]].forEach(([k, col]) => {
        const m = el('marker', { id: `fa-${k}`, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6.5, markerHeight: 6.5, orient: 'auto' }, defs);
        el('path', { d: 'M0 0 L10 5 L0 10 z', fill: col }, m);
    });

    // ground grid
    const grid = el('g', { stroke: C.edge, 'stroke-width': 1, opacity: 0.45 });
    for (let x = -8; x <= 8; x++) el('line', { x1: SX(x), y1: SY(0), x2: SX(x), y2: SY(10.4) }, grid);
    for (let z = 0; z <= 10; z++) el('line', { x1: SX(-8.6), y1: SY(z), x2: SX(8.6), y2: SY(z) }, grid);

    // cameras
    function frustum(parent, col, dash) {
        const g = el('g', {}, parent);
        el('path', { d: 'M0 0 L-17 -30 L17 -30 Z', fill: col, 'fill-opacity': 0.12, stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': dash || '' }, g);
        el('rect', { x: -9, y: -4, width: 18, height: 12, rx: 3, fill: col }, g);
        return g;
    }
    const cam1 = frustum(svg, C.ink);
    cam1.setAttribute('transform', `translate(${SX(0)} ${SY(0)})`);
    el('text', { x: SX(0) + 24, y: SY(0) + 2, fill: C.ink, 'font-size': 16, class: 'math' }, svg, 'π₁');
    const cam2g = el('g', {});
    frustum(cam2g, C.cam);
    const ax = el('g', { opacity: 0.85 }, cam2g); // camera 2's axes
    el('line', { x1: 0, y1: 0, x2: 34, y2: 0, stroke: C.cam, 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }, ax);
    el('line', { x1: 0, y1: 0, x2: 0, y2: -44, stroke: C.cam, 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }, ax);
    const cam2l = el('text', { fill: C.cam, 'font-size': 16, class: 'math' }, svg, 'π₂');

    // car at t1 (solid) and t2 (ghost)
    const carBody = (g, dash, op) => el('rect', { x: SX(CAR[0] - 1.25), y: SY(CAR[1] + 0.68), width: 2.5 * U, height: 1.36 * U, rx: 12, fill: C.car, 'fill-opacity': 0.1 * op, stroke: C.car, 'stroke-opacity': op, 'stroke-width': 1.6, 'stroke-dasharray': dash || '' }, g);
    carBody(svg, '', 0.8);
    const ghost = el('g', { transform: `translate(${M[0] * U} ${-M[1] * U})` });
    carBody(ghost, '5 5', 0.55);
    el('text', { x: SX(CAR[0]), y: SY(CAR[1] - 1.15), fill: C.car, 'font-size': 13, 'text-anchor': 'middle', 'fill-opacity': 0.85 }, svg, 'car at t₁');
    el('text', { x: SX(CAR[0] + M[0]), y: SY(CAR[1] + M[1] + 0.95), fill: C.car, 'font-size': 13, 'text-anchor': 'middle', 'fill-opacity': 0.6 }, svg, 't₂');

    // arrows + points
    const pts = statics.map((p) => ({ p, m: [0, 0], col: C.stat, mk: 'url(#fa-s)', arrowCol: C.cam }))
        .concat(carPts.map((p) => ({ p, m: M, col: C.car, mk: 'url(#fa-c)', arrowCol: C.car })));
    const arrowG = el('g', {});
    const zeroG = el('g', {});
    pts.forEach((o) => {
        o.line = el('line', { x1: SX(o.p[0]), y1: SY(o.p[1]), stroke: o.arrowCol, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'marker-end': o.mk }, arrowG);
        o.zero = el('circle', { cx: SX(o.p[0]), cy: SY(o.p[1]), r: 9.5, fill: 'none', stroke: C.ink, 'stroke-width': 1.3, 'stroke-dasharray': '2.5 3' }, zeroG);
        el('circle', { cx: SX(o.p[0]), cy: SY(o.p[1]), r: 5, fill: o.col }, svg);
    });

    // ------------------------------------------------------------ targets per definition
    function target(mode, o, a) {
        const { T, th } = MOTION2(a);
        const right = [Math.cos(th), -Math.sin(th)], fwd = [Math.sin(th), Math.cos(th)];
        const inCam2 = (q) => [(q[0] - T[0]) * right[0] + (q[1] - T[1]) * right[1], (q[0] - T[0]) * fwd[0] + (q[1] - T[1]) * fwd[1]];
        if (mode === 'object') return o.m.slice();
        if (mode === 'cross') return [o.m[0] * right[0] + o.m[1] * right[1], o.m[0] * fwd[0] + o.m[1] * fwd[1]];
        const e = inCam2([o.p[0] + o.m[0], o.p[1] + o.m[1]]);
        return [e[0] - o.p[0], e[1] - o.p[1]];
    }

    const read = document.getElementById('flow-read');
    const camIn = document.getElementById('flow-cam');
    const buttons = [...document.querySelectorAll('#flow-defs .def')];
    const NOTE = {
        scene: 'Mixes object and camera motion: every static point “moves” as soon as the camera does.',
        cross: 'Static points are zero, but the motion is written in camera 2’s axes, so the model must also infer the relative pose.',
        object: 'Static points are zero by construction and no pose is involved. This is what SM4RT predicts.',
    };
    let mode = 'object', a = 1;
    const cur = pts.map((o) => target(mode, o, a));

    function render() {
        const { T, th } = MOTION2(a);
        cam2g.setAttribute('transform', `translate(${SX(T[0])} ${SY(T[1])}) rotate(${(th * 180) / Math.PI})`);
        cam2g.style.opacity = a < 0.02 ? 0 : 1;
        cam2l.setAttribute('x', SX(T[0]) + 26); cam2l.setAttribute('y', SY(T[1]) + 2);
        cam2l.style.opacity = a < 0.02 ? 0 : 1;
        let sum = 0, n = 0;
        pts.forEach((o, i) => {
            const v = cur[i], len = Math.hypot(v[0], v[1]);
            const vis = len > 0.12;
            o.line.style.opacity = vis ? 1 : 0;
            const k = vis ? (len - 0.24) / len : 0; // stop short of the arrowhead tip
            o.line.setAttribute('x2', SX(o.p[0] + v[0] * k));
            o.line.setAttribute('y2', SY(o.p[1] + v[1] * k));
            o.zero.style.opacity = vis ? 0 : 0.9;
            if (o.col === C.stat) { sum += len; n++; }
        });
        const s = sum / n;
        read.innerHTML = `static points: <b>${s < 0.005 ? '0' : s.toFixed(2)}</b> <span class="s">mean |flow|</span>`;
        read.classList.toggle('zero', s < 0.005);
    }

    let raf = 0, from = null, t0 = 0;
    function animateTo() {
        const goal = pts.map((o) => target(mode, o, a));
        if (REDUCED) { goal.forEach((g, i) => { cur[i] = g; }); render(); return; }
        from = cur.map((v) => v.slice());
        t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / 420);
            const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            goal.forEach((g, i) => { cur[i] = [from[i][0] + (g[0] - from[i][0]) * e, from[i][1] + (g[1] - from[i][1]) * e]; });
            render();
            raf = p < 1 ? requestAnimationFrame(step) : 0;
        };
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(step);
    }

    function setMode(m) {
        mode = m;
        buttons.forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        document.getElementById('flow-note').textContent = NOTE[m];
        svg.dataset.mode = m;
        animateTo();
    }
    buttons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    camIn.addEventListener('input', () => {
        a = camIn.value / 100;
        camIn.style.setProperty('--v', camIn.value + '%');
        cancelAnimationFrame(raf);
        pts.forEach((o, i) => { cur[i] = target(mode, o, a); });
        render();
    });
    camIn.style.setProperty('--v', camIn.value + '%');
    setMode('scene');
})();
