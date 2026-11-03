// Method 3.2: the two-stage cascade as an explorable diagram. Pick a component (tabs or click the diagram) to
// focus it and read what it does; flip the input order to see how the backward flow is obtained.
(() => {
    const svg = document.getElementById('arch-svg');
    if (!svg) return;
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const NS = 'http://www.w3.org/2000/svg';
    const C = { geom: '#509ef5', motion: '#ff794e', ink: '#eef2f8', muted: '#94a3b8', faint: '#5b6b84', wire: '#7c8aa3' };
    const IMG = 'static/images/method/';

    // ------------------------------------------------------------ layout (viewBox 1600 x 640)
    const R = [190, 450];
    const X = { inp: 20, enc: 200, dec: 380, dpt: 580, pm: 690, cas: 1020, fh: 1220, out: 1320 };
    const W = { inp: 120, enc: 130, dec: 150, dpt: 56, pm: 160, cas: 160, fh: 56, out: 160 };
    const BH = 120, DH = 90;
    const cx = (k) => X[k] + W[k] / 2;
    const BY = [96, 588]; // bypass wires (tokens G1 / G2)

    function el(tag, attrs = {}, parent = svg, text) {
        const n = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        if (text !== undefined) n.textContent = text;
        parent.appendChild(n);
        return n;
    }
    const parts = { inputs: [], geometry: [], rope: [], motion: [] };
    const tag = (part, ...nodes) => nodes.flat().forEach((n) => { n.dataset.part = part; parts[part].push(n); });

    const defs = el('defs');
    const arrows = {};
    [['geom', C.geom], ['motion', C.motion], ['wire', C.wire]].forEach(([k, col]) => {
        const m = el('marker', { id: `ah-${k}`, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
        el('path', { d: 'M0 0 L10 5 L0 10 z', fill: col }, m);
        arrows[k] = `url(#ah-${k})`;
    });
    [['hatch-g', C.geom, 0], ['hatch-o', C.motion, 45]].forEach(([id, col, rot]) => {
        const p = el('pattern', { id, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${rot})` }, defs);
        el('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: col, 'stroke-width': 1.2, 'stroke-opacity': 0.35 }, p);
    });

    // ------------------------------------------------------------ building blocks
    function stageFrame(x, w, col, title) {
        const g = el('g', { class: 'frame' });
        el('rect', { x, y: 30, width: w, height: 590, rx: 22, fill: col, 'fill-opacity': 0.035, stroke: col, 'stroke-opacity': 0.55, 'stroke-width': 1.6, 'stroke-dasharray': '9 7' }, g);
        el('text', { x: x + 22, y: 60, fill: col, 'font-size': 14, 'font-weight': 700, 'letter-spacing': '2.4' }, g, title);
        return g;
    }
    function block(key, row, col, lines, h = BH, hatch) {
        const x = X[key], w = W[key], y = R[row] - h / 2;
        const g = el('g', { class: 'blk' });
        el('rect', { class: 'body', x, y, width: w, height: h, rx: 14, fill: col, 'fill-opacity': 0.13, stroke: col, 'stroke-width': 2 }, g);
        if (hatch) el('rect', { x: x + 1, y: y + 1, width: w - 2, height: h - 2, rx: 13, fill: `url(#${hatch})` }, g);
        const [title, sub] = lines;
        const tl = title.split('\n');
        const y0 = R[row] - (tl.length - 1) * 11 - (sub ? 8 : 0) + 6;
        tl.forEach((t, i) => el('text', { x: x + w / 2, y: y0 + i * 22, fill: C.ink, 'font-size': w < 80 ? 14 : 18, 'font-weight': 700, 'text-anchor': 'middle' }, g, t));
        if (sub) el('text', { x: x + w / 2, y: y0 + tl.length * 22 - 2, fill: C.muted, 'font-size': 13, 'text-anchor': 'middle' }, g, sub);
        return g;
    }
    function wire(pts, col = 'wire', { both = false, dash = null, arrow = true, opacity = 1 } = {}) {
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
        const stroke = col === 'wire' ? C.wire : C[col];
        const p = el('path', { class: 'wire', d, fill: 'none', stroke, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-opacity': opacity });
        if (dash) p.setAttribute('stroke-dasharray', dash);
        if (arrow) { p.setAttribute('marker-end', arrows[col]); if (both) p.setAttribute('marker-start', arrows[col]); }
        return p;
    }
    const math = (x, y, txt, col, size = 17, parent = svg) => el('text', { x, y, fill: col, 'font-size': size, class: 'math', 'text-anchor': 'middle' }, parent, txt);

    // ------------------------------------------------------------ diagram
    tag('geometry', stageFrame(168, 772, C.geom, 'STAGE 1 · GEOMETRY'));
    tag('motion', stageFrame(960, 620, C.motion, 'STAGE 2 · MOTION'));

    for (let r = 0; r < 2; r++) {
        tag('inputs', wire([[X.inp + W.inp + 6, R[r]], [X.enc - 4, R[r]]]));
        tag('geometry', wire([[X.enc + W.enc + 4, R[r]], [X.dec - 4, R[r]]]), wire([[X.dec + W.dec + 4, R[r]], [X.dpt - 4, R[r]]]),
            wire([[X.dpt + W.dpt + 4, R[r]], [X.pm - 6, R[r]]]));
    }
    tag('geometry', wire([[cx('dec'), R[0] + BH / 2 + 4], [cx('dec'), R[1] - BH / 2 - 4]], 'geom', { both: true }),
        wire([[cx('enc'), R[0] + BH / 2 + 4], [cx('enc'), R[1] - BH / 2 - 4]], 'wire', { dash: '5 6', arrow: false }));
    const s1Labels = el('g');
    el('text', { x: cx('dec') + 10, y: 324, fill: C.muted, 'font-size': 13 }, s1Labels, 'cross-attn');
    el('text', { x: cx('enc') + 10, y: 324, fill: C.faint, 'font-size': 13 }, s1Labels, 'shared');
    tag('geometry', s1Labels);

    // stage 2: tokens bypass the heads, 3D positions come from the point maps
    tag('motion', wire([[cx('dec'), R[0] - BH / 2 - 2], [cx('dec'), BY[0]], [cx('cas'), BY[0]], [cx('cas'), R[0] - BH / 2 - 4]], 'motion', { opacity: 0.8 }),
        wire([[cx('dec'), R[1] + BH / 2 + 2], [cx('dec'), BY[1]], [cx('cas'), BY[1]], [cx('cas'), R[1] + BH / 2 + 4]], 'motion', { opacity: 0.8 }));
    for (let r = 0; r < 2; r++) tag('rope', wire([[X.pm + W.pm + 6, R[r]], [X.cas - 4, R[r]]], 'geom'));
    tag('motion', wire([[cx('cas'), R[0] + BH / 2 + 4], [cx('cas'), R[1] - BH / 2 - 4]], 'motion', { both: true }),
        wire([[X.cas + W.cas + 4, R[0]], [X.fh - 4, R[0]]], 'motion'), wire([[X.fh + W.fh + 4, R[0]], [X.out - 6, R[0]]], 'motion'));
    const s2Labels = el('g');
    el('text', { x: cx('cas') + 10, y: 324, fill: C.muted, 'font-size': 13 }, s2Labels, 'cross-attn');
    el('text', { x: 760, y: BY[0] - 9, fill: C.motion, 'font-size': 14, 'text-anchor': 'middle', 'fill-opacity': 0.9 }, s2Labels, 'tokens G₁');
    el('text', { x: 760, y: BY[1] + 21, fill: C.motion, 'font-size': 14, 'text-anchor': 'middle', 'fill-opacity': 0.9 }, s2Labels, 'tokens G₂');
    tag('motion', s2Labels);

    for (let r = 0; r < 2; r++) {
        tag('geometry', block('enc', r, C.geom, ['ViT\nencoder']), block('dec', r, C.geom, ['Decoder', 'DUSt3R']), block('dpt', r, C.geom, ['DPT'], DH, 'hatch-g'));
        tag('motion', block('cas', r, C.motion, ['Cascaded\ndecoder']));
    }
    tag('motion', block('fh', 0, C.motion, ['DPT'], DH, 'hatch-o'));

    // inputs (they swap rows with the input order)
    const inputs = [0, 1].map((r) => {
        const g = el('g');
        const y = R[r] - W.inp / 2;
        el('rect', { x: X.inp - 1, y: y - 1, width: W.inp + 2, height: W.inp + 2, rx: 14, fill: 'none', stroke: 'rgba(255,255,255,.18)' }, g);
        const clip = el('clipPath', { id: `clip-in${r}` }, defs);
        el('rect', { x: X.inp, y, width: W.inp, height: W.inp, rx: 13 }, clip);
        el('image', { href: IMG + `k26_v${r + 1}.jpg`, x: X.inp, y, width: W.inp, height: W.inp, 'clip-path': `url(#clip-in${r})`, preserveAspectRatio: 'xMidYMid slice' }, g);
        el('text', { x: cx('inp'), y: R[r] + W.inp / 2 + 28, fill: C.ink, 'font-size': 18, class: 'math', 'text-anchor': 'middle' }, g, r ? 'I₂' : 'I₁');
        tag('inputs', g);
        return g;
    });

    // point maps (stage 1 output) and object flow (stage 2 output)
    const pms = [0, 1].map((r) => {
        const g = el('g');
        const inner = el('g', {}, g);
        el('image', { href: IMG + `pm${r + 1}_k26.webp`, x: X.pm, y: R[r] - W.pm / 2, width: W.pm, height: W.pm, preserveAspectRatio: 'xMidYMid slice' }, inner);
        tag('geometry', g);
        return { g, inner };
    });
    const pmLabels = [0, 1].map((r) => {
        const g = el('g');
        const y = R[r] + W.pm / 2 + 26;
        const a = math(cx('pm'), y, r ? 'P₂(t₂, π₁)' : 'P₁(t₁, π₁)', C.geom, 18, g);
        const b = math(cx('pm'), y, r ? 'P₁(t₁, π₂)' : 'P₂(t₂, π₂)', C.geom, 18, g);
        b.style.opacity = 0;
        tag('geometry', g);
        return { a, b };
    });
    const out = el('g');
    const outA = el('image', { href: IMG + 'flow1_k26.webp', x: X.out, y: R[0] - W.out / 2, width: W.out, height: W.out }, out);
    const outB = el('image', { href: IMG + 'flow2_k26.webp', x: X.out, y: R[0] - W.out / 2, width: W.out, height: W.out }, out);
    outB.style.opacity = 0;
    const outLA = math(cx('out'), R[0] + W.out / 2 + 26, 'F₁(t₁, t₂)', C.motion, 18, out);
    const outLB = math(cx('out'), R[0] + W.out / 2 + 26, 'F₂(t₂, t₁)', C.motion, 18, out);
    outLB.style.opacity = 0;
    tag('motion', out);

    // 3D RoPE pills on the wires that carry the predicted 3D positions into the cascaded decoder
    const ropeX = (X.pm + W.pm + X.cas) / 2;
    [0, 1].forEach((r) => {
        const y = R[r] + (r ? 30 : -30);
        const g = el('g');
        el('rect', { x: ropeX - 44, y: y - 13, width: 88, height: 26, rx: 13, fill: C.geom }, g);
        el('text', { x: ropeX, y: y + 5, fill: '#0a1020', 'font-size': 13, 'font-weight': 800, 'text-anchor': 'middle' }, g, '3D RoPE');
        tag('rope', g);
    });

    // ------------------------------------------------------------ input order
    let swap = 0, swapRaf = 0;
    function setSwap(v) {
        swap = v;
        const d = (R[1] - R[0]) * v;
        inputs[0].setAttribute('transform', `translate(0 ${d})`);
        inputs[1].setAttribute('transform', `translate(0 ${-d})`);
        pms[0].inner.setAttribute('transform', `translate(0 ${d})`);
        pms[1].inner.setAttribute('transform', `translate(0 ${-d})`);
        pmLabels.forEach((l) => { l.a.style.opacity = 1 - v; l.b.style.opacity = v; });
        outA.style.opacity = 1 - v; outB.style.opacity = v;
        outLA.style.opacity = 1 - v; outLB.style.opacity = v;
    }
    function animateSwap(to) {
        cancelAnimationFrame(swapRaf);
        if (REDUCED) { setSwap(to); return; }
        const from = swap, t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / 750);
            setSwap(from + (to - from) * (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2));
            if (p < 1) swapRaf = requestAnimationFrame(step);
        };
        swapRaf = requestAnimationFrame(step);
    }

    // ------------------------------------------------------------ focus + details
    const DETAIL = {
        all: {
            h: 'One network, two stages',
            p: 'Stage 1 is DUSt3R: it reconstructs where every pixel of both frames is in 3D. Stage 2 reuses its tokens and those 3D positions to predict how each pixel of <span class="m">I₁</span> moves. Running the same weights on the swapped pair gives frame 2’s motion.',
            io: ['in · <span class="m">I₁, I₂</span>', 'out · <span class="m">P₁(t₁, π₁), P₂(t₂, π₁), F₁(t₁, t₂)</span>'],
        },
        inputs: {
            h: 'Inputs',
            p: 'Two RGB frames of a video, taken at <span class="m">t₁</span> and <span class="m">t₂</span>. No camera poses, intrinsics or depth. During training, pairs are sampled up to 15 frames apart and resized to 512 px wide (288 to 512 px high).',
            io: ['in · <span class="m">I₁, I₂</span>'],
        },
        geometry: {
            h: 'Stage 1 · geometry (DUSt3R)',
            p: 'A shared ViT encoder turns each frame into patch tokens. Two decoders exchange information through cross-attention, giving tokens <span class="m">G₁, G₂</span>. DPT heads regress both point maps in camera 1’s frame, plus a per-pixel confidence. During motion fine-tuning, an EMA teacher distils the static-scene geometry, so the backbone does not forget it.',
            io: ['out · <span class="m">P₁(t₁, π₁), P₂(t₂, π₁)</span>, confidence <span class="m">C</span>'],
        },
        rope: {
            h: '3D RoPE',
            p: 'Each token covers an image patch. Its 3D position is the mean of the patch’s predicted points. Rotary embeddings of these positions modulate the motion decoder’s attention, so tokens attend more to tokens that are close in 3D, not only in the image. <a href="#m-rope">Try it below ↓</a>',
            io: ['ablation · 2D instead of 3D positions: Waymo EPE 0.006 → 0.039'],
        },
        motion: {
            h: 'Stage 2 · motion',
            p: 'The tokens <span class="m">G₁, G₂</span> bypass the geometry heads and enter a second transformer decoder that cross-attends between the frames, with 3D RoPE. A DPT head projects <span class="m">G₁</span> to object flow. The flow head starts from the depth head’s weights, and shrink-and-perturb periodically mixes in fresh weights so it can move beyond the static prior.',
            io: ['out · <span class="m">F₁(t₁, t₂) = P₁(t₂, π₁) − P₁(t₁, π₁)</span>'],
        },
    };
    const SWAPPED = 'Swapped input order <span class="m">(I₂, I₁)</span>: the same weights give <span class="m">P₂(t₂, π₂)</span>, <span class="m">P₁(t₁, π₂)</span> and the backward flow <span class="m">F₂(t₂, t₁) = P₂(t₁, π₂) − P₂(t₂, π₂)</span>, frame 2’s motion in its own camera.';

    const tabs = [...document.querySelectorAll('#arch-tabs button')];
    const detail = document.getElementById('arch-detail');
    let focus = 'all';
    function render() {
        const d = DETAIL[focus];
        detail.innerHTML = `<h4>${d.h}</h4><p>${d.p}</p>${swap > 0.5 ? `<p class="swapped">${SWAPPED}</p>` : ''}<div class="io">${d.io.map((s) => `<span>${s}</span>`).join('')}</div>`;
    }
    function setFocus(p) {
        focus = p;
        svg.classList.toggle('focusing', p !== 'all');
        Object.entries(parts).forEach(([k, nodes]) => nodes.forEach((n) => n.classList.toggle('on', k === p)));
        tabs.forEach((b) => { const on = b.dataset.part === p; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        render();
    }
    tabs.forEach((b) => b.addEventListener('click', () => setFocus(b.dataset.part)));
    svg.addEventListener('click', (e) => {
        const n = e.target.closest('[data-part]');
        setFocus(n && n.dataset.part !== focus ? n.dataset.part : 'all');
    });
    svg.addEventListener('pointerover', (e) => {
        const n = e.target.closest('[data-part]');
        Object.entries(parts).forEach(([k, nodes]) => nodes.forEach((m) => m.classList.toggle('hover', !!n && k === n.dataset.part)));
    });
    svg.addEventListener('pointerleave', () => Object.values(parts).flat().forEach((m) => m.classList.remove('hover')));

    document.querySelectorAll('#arch-order button').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('#arch-order button').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b); });
        animateSwap(parseFloat(b.dataset.v));
        swap = parseFloat(b.dataset.v); // the detail text follows the target state
        render();
    }));

    setSwap(0);
    setFocus('all');
})();
