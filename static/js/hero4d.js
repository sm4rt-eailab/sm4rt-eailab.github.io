// Hero: SM4RT's real prediction on Kubric-F (k26), rendered live with PointFlow.
// The camera starts at the input view and swings to an oblique one; the moving points travel along the
// predicted object flow t1 -> t2 and back. Drag to orbit.
(() => {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas || !window.PointFlow) return;
    const hero = canvas.closest('.hero');
    const hud = document.getElementById('hero-hud');
    const R = PointFlow.create(canvas);
    if (!R) { hero.classList.add('no-webgl'); return; }
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const BG = [6 / 255, 9 / 255, 18 / 255];
    const { ease } = PointFlow;
    const seg = (t, a, b) => ease((t - a) / (b - a));

    PointFlow.load('static/data/scenes/k26_fwd.bin')
        .then((data) => { R.setScene(data); init(data); })
        .catch((e) => { console.warn('hero point cloud unavailable:', e); hero.classList.add('no-webgl'); });

    function init(S) {
        const user = { yaw: 0, pitch: 0 };
        const par = { x: 0, y: 0, tx: 0, ty: 0 };
        let start = null, running = false, visible = true, raf = 0;

        new ResizeObserver(() => { R.resize(); schedule(); }).observe(canvas);
        R.resize();

        // on wide screens the cloud sits right of the title, on narrow screens it fills the background
        function layout() {
            const { W, H } = R.size;
            const aspect = W / H;
            const wide = canvas.clientWidth > 900;
            const fillH = wide ? 0.84 : 0.8;
            return { tanHalfY: Math.max(S.tanHalf / fillH, S.tanHalf / (1.25 * aspect)), shift: wide ? 0.31 : 0.0 };
        }

        // object flow over time: hold at t1, move to t2, hold, move back
        const CYCLE = 7.0;
        function autoFlow(t) {
            const u = ((t % CYCLE) + CYCLE) % CYCLE;
            if (u < 1.0) return 0;
            if (u < 3.4) return ease((u - 1.0) / 2.4);
            if (u < 4.6) return 1;
            return 1 - ease((u - 4.6) / 2.4);
        }

        function frame(now) {
            raf = 0;
            if (!running) return;
            if (start === null) start = now;
            const t = (now - start) / 1000;
            const L = layout();
            const fade = REDUCED ? 1 : seg(t, 0.1, 1.0);
            const sw = REDUCED ? 1 : seg(t, 0.6, 3.8);
            const tl = Math.max(0, t - 3.2);
            par.x += (par.tx - par.x) * 0.05;
            par.y += (par.ty - par.y) * 0.05;
            const drift = REDUCED ? 0 : 1;
            const flow = REDUCED ? 1 : autoFlow(tl);

            R.draw({
                yaw: sw * (-0.5 + drift * 0.2 * Math.sin(tl * 0.16)) + user.yaw + par.x * 0.14,
                pitch: Math.max(-0.2, Math.min(1.1, sw * (0.42 + drift * 0.05 * Math.sin(tl * 0.11)) + user.pitch + par.y * 0.08)),
                dist: 1 + 0.06 * sw,
                flow, fade, bg: BG, tanHalfY: L.tanHalfY, shift: L.shift,
                // static points dimmed and cooled so the title stays readable; moving points tinted as they travel
                staticTint: [0.10, 0.16, 0.30], staticTintAmt: 0.22, staticGain: 0.78,
                movingTintAmt: 0.3 + 0.45 * flow, movingGain: 1.12,
                glow: 0.1 * (0.5 + 0.5 * flow), trails: 0.55 * fade,
            });
            if (t > 1.2) hud.classList.add('on');
            schedule();
        }

        function schedule() {
            if (running && visible && !raf) raf = requestAnimationFrame(frame);
        }

        // pause when off screen or in a background tab
        new IntersectionObserver((es) => {
            running = es[0].isIntersecting;
            schedule();
        }).observe(hero);
        document.addEventListener('visibilitychange', () => { visible = !document.hidden; schedule(); });

        let drag = null;
        canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'mouse' && !e.isPrimary) return;
            drag = { x: e.clientX, y: e.clientY, yaw: user.yaw, pitch: user.pitch, id: e.pointerId };
            if (e.pointerType === 'mouse') canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', (e) => {
            const r = canvas.getBoundingClientRect();
            par.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
            par.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
            if (!drag || drag.id !== e.pointerId) return;
            user.yaw = drag.yaw - ((e.clientX - drag.x) / r.width) * 2.4;
            user.pitch = drag.pitch - ((e.clientY - drag.y) / r.height) * 1.6;
        });
        const endDrag = () => { drag = null; };
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);
        hero.addEventListener('pointerleave', () => { par.tx = 0; par.ty = 0; });

        running = true;
        schedule();
    }
})();
