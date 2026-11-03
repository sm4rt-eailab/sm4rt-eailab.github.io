// Page-level behaviour: nav, scroll reveals, More Works dropdown, BibTeX copy.
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// More Works dropdown
function toggleMoreWorks() {
    const dropdown = document.getElementById('moreWorksDropdown');
    const button = document.querySelector('.more-works-btn');
    const open = !dropdown.classList.contains('show');
    dropdown.classList.toggle('show', open);
    button.classList.toggle('active', open);
}

document.addEventListener('click', function(event) {
    const container = document.querySelector('.more-works-container');
    if (container && !container.contains(event.target)) {
        document.getElementById('moreWorksDropdown').classList.remove('show');
        document.querySelector('.more-works-btn').classList.remove('active');
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        document.getElementById('moreWorksDropdown').classList.remove('show');
        document.querySelector('.more-works-btn').classList.remove('active');
    }
});

// Copy BibTeX to clipboard
function copyBibTeX() {
    const bibtexElement = document.getElementById('bibtex-code');
    const button = document.querySelector('.copy-bibtex-btn');
    const copyText = button.querySelector('.copy-text');
    const done = function() {
        button.classList.add('copied');
        copyText.textContent = 'Copied!';
        setTimeout(function() {
            button.classList.remove('copied');
            copyText.textContent = 'Copy';
        }, 2000);
    };
    navigator.clipboard.writeText(bibtexElement.textContent).then(done).catch(function() {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = bibtexElement.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        done();
    });
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
}

// ------------------------------------------------------------------ nav + scroll state
function setupNav() {
    const nav = document.getElementById('topnav');
    const toTop = document.querySelector('.scroll-to-top');
    const hero = document.getElementById('top');
    const update = () => {
        const y = window.scrollY;
        nav.classList.toggle('solid', y > hero.offsetHeight - 90);
        toTop.classList.toggle('visible', y > 600);
    };
    window.addEventListener('scroll', update, { passive: true });
    update();

    const links = [...document.querySelectorAll('.nav-links a')];
    const targets = links.map((a) => document.querySelector(a.getAttribute('href')));
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting) return;
            const i = targets.indexOf(e.target);
            links.forEach((a, k) => a.classList.toggle('active', k === i));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach((t) => t && io.observe(t));
}

function setupReveal() {
    const els = document.querySelectorAll('.reveal');
    if (REDUCED_MOTION) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
    setupNav();
    setupReveal();
});
