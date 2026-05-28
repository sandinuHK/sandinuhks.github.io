/* ============================================================
   SAVINA SANDINU PORTFOLIO — script.js
   
   PERFORMANCE NOTES:
   - Star field uses ImageData pixel buffer (zero canvas state changes)
   - Single rAF loop — no duplicate timers
   - Warp streaks use ctx.beginPath batching (single stroke call per frame)
   - DOM reads (getBoundingClientRect) happen in rAF, not scroll handler
   - Scroll handler is passive, only writes velocity
   ============================================================ */

/* ============================================================
   STAR FIELD — pixel-buffer renderer (zero lag)
   ============================================================ */
const canvas = document.getElementById('starCanvas');
const ctx    = canvas.getContext('2d', { alpha: true, desynchronized: true });

let W = 0, H = 0;
const STAR_COUNT = 260;
let stars        = [];
let pixelBuf     = null;   // Uint8ClampedArray reused every frame
let imgData      = null;

// Scroll velocity for warp effect — written by scroll handler
let scrollVel    = 0;
let lastScrollY  = window.scrollY;
let warp         = 0;      // 0..1 eased value

// Mouse position — written by mousemove handler
let mx = 0.5, my = 0.5;

function resizeCanvas() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  // Pre-allocate pixel buffer once per resize
  imgData  = ctx.createImageData(W, H);
  pixelBuf = imgData.data;
  initStars();
}

// Read accent star colour from CSS variables once per theme change
function getStarRGB() {
  const s = getComputedStyle(document.documentElement);
  return [
    parseInt(s.getPropertyValue('--star-r').trim()) || 220,
    parseInt(s.getPropertyValue('--star-g').trim()) || 200,
    parseInt(s.getPropertyValue('--star-b').trim()) || 255,
  ];
}

let SR = 220, SG = 200, SB = 255;

function initStars() {
  [SR, SG, SB] = getStarRGB();
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x:       Math.random() * W,
      y:       Math.random() * H,
      z:       Math.random() * W,      // depth (W=near, 0=far)
      pz:      0,
      vx:      (Math.random() - 0.5) * 0.08,
      vy:      Math.random() * 0.12 + 0.04,
      twinkle: Math.random() * Math.PI * 2,
      size:    Math.random() * 1.6 + 0.5,
    });
  }
}

// Draw a soft 2x2 pixel "star dot" into the pixel buffer
function plotPixel(px, py, r, g, b, a) {
  if (px < 0 || py < 0 || px >= W - 1 || py >= H - 1) return;
  const i = (~~py * W + ~~px) * 4;
  const ia = a / 255;
  pixelBuf[i]   = r; pixelBuf[i+1] = g;
  pixelBuf[i+2] = b; pixelBuf[i+3] = a;
  // adjacent pixel half-alpha for soft glow
  const j = (~~py * W + ~~px + 1) * 4;
  pixelBuf[j]   = r; pixelBuf[j+1] = g;
  pixelBuf[j+2] = b; pixelBuf[j+3] = a >> 1;
  const k = ((~~py + 1) * W + ~~px) * 4;
  pixelBuf[k]   = r; pixelBuf[k+1] = g;
  pixelBuf[k+2] = b; pixelBuf[k+3] = a >> 1;
}

// Warp streaks are drawn with canvas lines (few calls, not per-pixel)
// They are rendered AFTER the pixel buffer is flushed
function drawWarpStreaks(starsCopy) {
  ctx.save();
  ctx.globalAlpha = Math.min(warp * 1.4, 1);
  ctx.lineWidth   = 1;
  ctx.beginPath();

  for (const s of starsCopy) {
    if (!s._warp) continue;
    ctx.moveTo(s._x1, s._y1);
    ctx.lineTo(s._x2, s._y2);
  }

  ctx.strokeStyle = `rgba(${SR},${SG},${SB},0.85)`;
  ctx.stroke();
  ctx.restore();
}

let lastFrameTime = 0;

function frame(now) {
  const dt = Math.min(now - lastFrameTime, 50); // cap at 50ms (20fps min)
  lastFrameTime = now;

  // --- ease warp factor ---
  const targetWarp = Math.min(Math.abs(scrollVel) / 20, 1);
  warp += (targetWarp - warp) * 0.10;
  scrollVel *= 0.85; // decay velocity

  // --- clear pixel buffer (fill alpha=0) ---
  pixelBuf.fill(0);

  const warpMode = warp > 0.06;

  for (const s of stars) {
    s.twinkle += 0.016;
    const alpha = Math.round((0.30 + 0.50 * Math.abs(Math.sin(s.twinkle))) * 255);

    if (warpMode) {
      // --- Warp: perspective projection, draw streaks ---
      s.pz  = s.z;
      s.z  -= (2.5 + warp * 14) * (dt / 16);
      if (s.z <= 1) { s.z = W; s.pz = W; s.x = Math.random() * W; s.y = Math.random() * H; }

      const sx  = (s.x - W / 2) / s.z  * W + W / 2;
      const sy  = (s.y - H / 2) / s.z  * H + H / 2;
      const sx0 = (s.x - W / 2) / s.pz * W + W / 2;
      const sy0 = (s.y - H / 2) / s.pz * H + H / 2;

      s._warp = true;
      s._x1 = sx0; s._y1 = sy0;
      s._x2 = sx;  s._y2 = sy;

      // Also plot tip pixel
      plotPixel(sx, sy, SR, SG, SB, alpha);

    } else {
      // --- Normal drift: gentle float ---
      s._warp = false;
      s.z     = W; // reset depth for re-entry into warp
      s.pz    = W;

      // subtle mouse parallax
      const px = (mx - 0.5) * 0.5 * (dt / 16);
      const py = (my - 0.5) * 0.3 * (dt / 16);

      s.x += s.vx * (dt / 16) + px;
      s.y += s.vy * (dt / 16) + py;

      if (s.y > H) { s.y = 0;  s.x = Math.random() * W; }
      if (s.x < 0) s.x = W;
      if (s.x > W) s.x = 0;

      // Draw star as 1–2 px bright dot
      plotPixel(~~s.x, ~~s.y, SR, SG, SB, alpha);
      if (s.size > 1.2) plotPixel(~~s.x + 1, ~~s.y, SR, SG, SB, alpha >> 1);
    }
  }

  // --- flush pixel buffer ---
  ctx.putImageData(imgData, 0, 0);

  // --- warp streaks on top (canvas lines, few draw calls) ---
  if (warpMode) drawWarpStreaks(stars);

  requestAnimationFrame(frame);
}

// Event listeners — passive, write-only (no layout reads)
window.addEventListener('scroll', () => {
  const sy  = window.scrollY;
  scrollVel = sy - lastScrollY;
  lastScrollY = sy;
}, { passive: true });

window.addEventListener('mousemove', e => {
  mx = e.clientX / (W || 1);
  my = e.clientY / (H || 1);
}, { passive: true });

window.addEventListener('resize', resizeCanvas);

// Re-init stars on theme change
new MutationObserver(() => { [SR, SG, SB] = getStarRGB(); }).observe(
  document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
);

resizeCanvas();
requestAnimationFrame(frame);

/* ============================================================
   THEME SWITCHER
   ============================================================ */
const themeBtns  = document.querySelectorAll('.theme-btn');
const html       = document.documentElement;

const savedTheme = localStorage.getItem('ss-theme') || 'dark';
html.setAttribute('data-theme', savedTheme);
themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === savedTheme));

themeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.theme;
    html.setAttribute('data-theme', t);
    localStorage.setItem('ss-theme', t);
    themeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

/* ============================================================
   NAV shrink on scroll
   ============================================================ */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

/* ============================================================
   HERO GALAXY ZOOM — driven by scroll, reads in rAF
   ============================================================ */
const heroName    = document.getElementById('heroName');
const heroMeta    = document.getElementById('heroMeta');
const heroSection = document.getElementById('hero');

/* ============================================================
   PROFILE FACE TILT — driven by scroll, reads in rAF
   ============================================================ */
const profileImg = document.getElementById('profileImg');

/* ============================================================
   UNIFIED rAF LOOP for DOM animations (separate from canvas)
   ============================================================ */
let scrollY_cached = window.scrollY;
window.addEventListener('scroll', () => { scrollY_cached = window.scrollY; }, { passive: true });

function domFrame() {
  const sy    = scrollY_cached;
  const heroH = heroSection.offsetHeight;
  const prog  = Math.min(Math.max(sy / heroH, 0), 1);

  // Galaxy zoom
  heroName.style.transform = `scale(${1 + prog * 5.5})`;
  heroName.style.opacity   = String(Math.max(0, 1 - Math.max(0, (prog - 0.32) / 0.32)));
  heroMeta.style.opacity   = String(Math.max(0, 1 - prog * 2.8));

  // Profile face tilt
  if (profileImg) {
    const wrap = profileImg.closest('.about-photo-wrap');
    if (wrap) {
      const rect  = wrap.getBoundingClientRect();
      const c     = Math.max(-1, Math.min(1, 1 - (rect.top + rect.height / 2) / window.innerHeight));
      profileImg.style.transform = `perspective(800px) rotateY(${c * 9}deg) rotateX(${c * 3}deg)`;
    }
  }

  requestAnimationFrame(domFrame);
}
requestAnimationFrame(domFrame);

/* ============================================================
   REVEAL UP — IntersectionObserver
   ============================================================ */
const revealEls = document.querySelectorAll('.reveal-up');

new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const el = entry.target;
    if (entry.isIntersecting) {
      el.classList.add('visible');
      el.classList.remove('hidden-up');
    } else {
      if (el.getBoundingClientRect().top < 0) {
        el.classList.add('hidden-up');
        el.classList.remove('visible');
      } else {
        el.classList.remove('visible', 'hidden-up');
      }
    }
  });
}, { threshold: 0.10, rootMargin: '0px 0px -50px 0px' }).observe
  && revealEls.forEach(el => {
    new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target;
        if (entry.isIntersecting) {
          el.classList.add('visible');
          el.classList.remove('hidden-up');
        } else {
          if (el.getBoundingClientRect().top < 0) {
            el.classList.add('hidden-up');
            el.classList.remove('visible');
          } else {
            el.classList.remove('visible');
            el.classList.remove('hidden-up');
          }
        }
      });
    }, { threshold: 0.10, rootMargin: '0px 0px -50px 0px' }).observe(el);
  });

/* ============================================================
   TILT CARD — mouse parallax, content shifts opposite to mouse
   ============================================================ */
document.querySelectorAll('.tilt-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r    = card.getBoundingClientRect();
    const dx   = e.clientX - (r.left + r.width  / 2);
    const dy   = e.clientY - (r.top  + r.height / 2);
    const sX   = (dx / r.width)  * -16;
    const sY   = (dy / r.height) * -10;
    const rX   = (dy / r.height) * -4.5;
    const rY   = (dx / r.width)  *  5.5;
    card.style.transform  = `perspective(700px) rotateX(${rX}deg) rotateY(${rY}deg) translate(${sX}px,${sY}px)`;
    card.style.transition = 'transform 0.08s ease-out';
  }, { passive: true });

  card.addEventListener('mouseleave', () => {
    card.style.transform  = 'perspective(700px) rotateX(0) rotateY(0) translate(0,0)';
    card.style.transition = 'transform 0.55s cubic-bezier(0.4,0,0.2,1)';
  });
});

/* ============================================================
   SMOOTH ANCHOR SCROLL
   ============================================================ */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const t = document.querySelector(link.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
  });
});

/* ============================================================
   NAV ACTIVE LINK
   ============================================================ */
const navLinks = document.querySelectorAll('.nav-links a');
document.querySelectorAll('.section').forEach(s => {
  new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting)
        navLinks.forEach(a => a.classList.toggle('active-link', a.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { threshold: 0.35 }).observe(s);
});