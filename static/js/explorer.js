// Results explorer: every project-page prediction as a live 4D point cloud.
// Pick a scene, scrub time t1 <-> t2, flip the direction (frame 1 -> 2 or 2 -> 1), colour by image or by
// predicted motion, orbit / zoom. Data: static/data/scenes/{id}_{fwd,bwd}.bin, rendered with PointFlow.
(() => {
    const root = document.getElementById('explorer');
    if (!root || !window.PointFlow) return;
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const $ = (id) => document.getElementById(id);
    const canvas = $('ex-canvas');
    // default view per dataset (yaw, pitch, dist around the pivot; 0, 0, 1 is the input camera)
    const SCENES = [
        { group: 'Waymo', note: 'real driving, LiDAR-sparse labels', items: ['wl98', 'w8', 'w18', 'w74'], home: { yaw: -0.55, pitch: -0.38, dist: 1.25 } },
        { group: 'Point Odyssey', note: 'synthetic, long-range motion', items: ['p3', 'p22'], home: { yaw: -0.45, pitch: -0.12, dist: 1.1 } },
        { group: 'Kubric-F', note: 'synthetic, many moving objects', items: ['k5', 'k26', 'k28', 'k33'], home: { yaw: -0.42, pitch: 0.3, dist: 1.04 } },
    ];
    const groupOf = (id) => SCENES.find((g) => g.items.includes(id));
    const BG = [11 / 255, 16 / 255, 29 / 255];
    const INPUT = { yaw: 0, pitch: 0, dist: 1 };
    const home = () => groupOf(st.id).home;
    const { ease } = PointFlow;

    // ------------------------------------------------------------ picker
    const picker = $('scene-picker');
    const picks = [];
    SCENES.forEach(({ group, items }) => {
        const g = document.createElement('div');
        g.className = 'pgroup';
        g.innerHTML = `<span class="gl">${group}</span><div class="row"></div>`;
        items.forEach((id, k) => {
            const b = document.createElement('button');
            b.className = 'pick';
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-label', `${group} scene ${k + 1}`);
            b.dataset.id = id;
            b.innerHTML = `<img src="static/images/thumbs/${id}.jpg" alt="" loading="lazy"><span>${k + 1}</span>`;
            b.addEventListener('click', () => select(id));
            g.querySelector('.row').appendChild(b);
            picks.push(b);
        });
        picker.appendChild(g);
    });

    // ------------------------------------------------------------ state
    const st = { id: 'w74', dir: 'fwd', colour: 'image', trails: true, t: 0, playing: !REDUCED };
    const cam = { ...home() }, goal = { ...home() };
    let phase = 0, hold = 0.6, dirn = 1; // auto-play: ping-pong with holds
    let R = null, visible = false, raf = 0, last = 0, dirty = true, interacted = false, loadSeq = 0;

    const f1 = $('ex-f1'), f2 = $('ex-f2');
    const timeIn = $('ex-time'), playBtn = $('ex-play');
    function labels() {
        const g = groupOf(st.id);
        $('ex-ds').textContent = g.group;
        $('ex-note').textContent = g.note;
        const fwd = st.dir === 'fwd';
        $('ex-ta').textContent = fwd ? 't₁' : 't₂';
        $('ex-tb').textContent = fwd ? 't₂' : 't₁';
        f1.classList.toggle('src', fwd);
        f2.classList.toggle('src', !fwd);
        $('ex-dl').href = `static/visualizations/${st.id}/${fwd ? 'forward' : 'backward'}.glb`;
        $('ex-dl').setAttribute('download', `sm4rt_${st.id}_${fwd ? 'forward' : 'backward'}.glb`);
        root.dataset.colour = st.colour;
    }
    function meta(S) {
        const k = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 1e5 ? 0 : 1) + 'k' : String(Math.round(n)));
        $('ex-meta').textContent = `${k(S.total)} points · ${S.iw}×${S.ih}`;
    }

    function select(id) {
        picks.forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        if (id !== st.id || !R || !R.scene) {
            const changed = id !== st.id;
            st.id = id;
            f1.querySelector('img').src = `static/visualizations/${id}/view1.png`;
            f2.querySelector('img').src = `static/visualizations/${id}/view2.png`;
            if (changed) Object.assign(goal, home());
        }
        labels();
        load();
    }

    function load() {
        if (!R) return;
        const seq = ++loadSeq;
        const url = `static/data/scenes/${st.id}_${st.dir}.bin`;
        const spin = setTimeout(() => root.classList.add('loading'), 150);
        PointFlow.load(url).then((S) => {
            if (seq !== loadSeq) return;
            R.setScene(S);
            meta(S);
            dirty = true;
            schedule();
        }).catch((e) => {
            console.warn('scene unavailable:', e);
            root.classList.add('failed');
        }).finally(() => {
            clearTimeout(spin);
            if (seq === loadSeq) root.classList.remove('loading');
        });
        // warm the cache for the other direction
        PointFlow.load(`static/data/scenes/${st.id}_${st.dir === 'fwd' ? 'bwd' : 'fwd'}.bin`).catch(() => {});
    }

    // ------------------------------------------------------------ render loop
    function setTime(v, fromUser) {
        st.t = Math.max(0, Math.min(1, v));
        if (!fromUser) timeIn.value = Math.round(st.t * 1000);
        timeIn.style.setProperty('--v', (st.t * 100).toFixed(2) + '%');
        dirty = true;
    }
    function setPlaying(v) {
        st.playing = v;
        playBtn.classList.toggle('playing', v);
        playBtn.setAttribute('aria-label', v ? 'Pause' : 'Play');
        if (v) { phase = st.t; dirn = st.t >= 0.999 ? -1 : 1; hold = 0.3; }
        schedule();
    }

    function frame(now) {
        raf = 0;
        if (!visible || !R || !R.scene) return;
        const dt = Math.min(0.05, (now - (last || now)) / 1000);
        last = now;
        let moving = false;
        if (st.playing) {
            if (hold > 0) hold -= dt;
            else {
                phase += (dirn * dt) / 2.2;
                if (phase >= 1) { phase = 1; dirn = -1; hold = 0.9; }
                if (phase <= 0) { phase = 0; dirn = 1; hold = 0.9; }
            }
            setTime(ease(phase));
            moving = true;
        }
        // gentle sway until the first interaction
        const sway = !interacted && !REDUCED ? 0.1 * Math.sin(now / 1000 * 0.35) : 0;
        const k = 1 - Math.pow(0.0008, dt);
        for (const key of ['yaw', 'pitch', 'dist']) {
            const target = goal[key] + (key === 'yaw' ? sway : 0);
            const d = target - cam[key];
            if (Math.abs(d) > 1e-4) { cam[key] += d * k; moving = true; }
        }
        if (dirty || moving) {
            const S = R.scene;
            const { W, H } = R.size;
            const tanV = S.tanHalf * S.ih / S.iw;
            const motion = st.colour === 'motion';
            R.draw({
                yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, flow: st.t, bg: BG, fog: 0.45,
                tanHalfY: Math.max(tanV, S.tanHalf / (W / H)) / 0.9,
                colour: st.colour, movingTintAmt: 0.1 + 0.3 * st.t, movingGain: 1.08,
                glow: motion ? 0.07 : 0.05 * (0.4 + 0.6 * st.t),
                trails: st.trails ? (motion ? 0.4 : 0.5) : 0,
                trailTint: motion ? [1.0, 0.7, 0.45] : undefined,
            });
            dirty = false;
        }
        if (moving) schedule();
    }
    function schedule() { if (visible && !raf) raf = requestAnimationFrame(frame); }

    // ------------------------------------------------------------ controls
    timeIn.addEventListener('input', () => { setPlaying(false); setTime(timeIn.value / 1000, true); schedule(); });
    playBtn.addEventListener('click', () => setPlaying(!st.playing));
    function seg(id, key, after) {
        $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
            $(id).querySelectorAll('button').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b); });
            st[key] = b.dataset.v;
            labels();
            dirty = true;
            if (after) after();
            schedule();
        }));
    }
    seg('ex-dir', 'dir', load);
    seg('ex-col', 'colour');
    $('ex-trails').addEventListener('click', (e) => {
        st.trails = !st.trails;
        e.currentTarget.classList.toggle('on', st.trails);
        e.currentTarget.setAttribute('aria-pressed', st.trails);
        dirty = true; schedule();
    });
    const go = (v) => { Object.assign(goal, v); touch(); schedule(); };
    $('ex-home').addEventListener('click', () => go(home()));
    $('ex-input').addEventListener('click', () => go(INPUT));
    $('ex-full').addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => { root.classList.toggle('full', document.fullscreenElement === root); });
    if (!root.requestFullscreen) $('ex-full').hidden = true;

    function touch() {
        if (!interacted) { interacted = true; root.classList.add('touched'); }
    }

    // orbit (drag), zoom (wheel / pinch), reset (double-click)
    const ptrs = new Map();
    let drag = null, pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, yaw: goal.yaw, pitch: goal.pitch };
        if (ptrs.size === 2) {
            const [a, b] = [...ptrs.values()];
            pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: goal.dist };
            drag = null;
        }
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = canvas.getBoundingClientRect();
        if (pinch && ptrs.size === 2) {
            const [a, b] = [...ptrs.values()];
            goal.dist = Math.max(0.25, Math.min(3, pinch.dist * pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y))));
        } else if (drag) {
            goal.yaw = drag.yaw - ((e.clientX - drag.x) / r.width) * 3.0;
            goal.pitch = Math.max(-0.7, Math.min(1.25, drag.pitch - ((e.clientY - drag.y) / r.height) * 2.0));
        }
        cam.yaw = goal.yaw; cam.pitch = goal.pitch; cam.dist = goal.dist;
        touch(); dirty = true; schedule();
    });
    const up = (e) => {
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) pinch = null;
        if (ptrs.size === 1) { const p = [...ptrs.values()][0]; drag = { x: p.x, y: p.y, yaw: goal.yaw, pitch: goal.pitch }; }
        if (!ptrs.size) drag = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        goal.dist = Math.max(0.25, Math.min(3, goal.dist * Math.exp(e.deltaY * 0.0012)));
        touch(); schedule();
    }, { passive: false });
    canvas.addEventListener('dblclick', () => go(home()));

    // ------------------------------------------------------------ start
    R = PointFlow.create(canvas);
    if (!R) root.classList.add('no-webgl');
    else {
        new ResizeObserver(() => { R.resize(); dirty = true; schedule(); }).observe(canvas);
        R.resize();
    }
    playBtn.classList.toggle('playing', st.playing);
    setTime(0);
    // load the first scene when the explorer comes near the viewport; render only while visible
    let started = false;
    new IntersectionObserver((es) => {
        visible = es[0].isIntersecting;
        if (visible && !started) { started = true; select(st.id); }
        if (visible) { last = 0; schedule(); }
    }, { rootMargin: '200px 0px' }).observe(root);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; schedule(); } });
    picks.forEach((b) => { if (b.dataset.id === st.id) b.classList.add('on'); });
    labels();
})();
