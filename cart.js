/* ---------- UNBOUND cart engine ---------- */
/* Persists cart across pages via localStorage, with an in-memory fallback
   if storage is unavailable (e.g. private browsing / sandboxed preview). */

const UB_CART_KEY = 'unbound_cart_v1';
let _memoryCart = null; // fallback store, lives only for this page load

function ubStorageAvailable(){
  try{
    const t = '__ub_test__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return true;
  }catch(e){
    return false;
  }
}
const UB_HAS_STORAGE = ubStorageAvailable();

function ubGetCart(){
  let cart;
  if(UB_HAS_STORAGE){
    try{
      const raw = window.localStorage.getItem(UB_CART_KEY);
      cart = raw ? JSON.parse(raw) : [];
    }catch(e){
      cart = _memoryCart || [];
    }
  }else{
    cart = _memoryCart || [];
  }
  // Migration: carts saved before variantId existed only have `id`.
  // Backfill so old carts don't silently break qty/remove buttons.
  let migrated = false;
  cart.forEach(item => {
    if(!item.variantId){
      item.variantId = item.size ? `${item.id}::${item.size}` : item.id;
      migrated = true;
    }
  });
  if(migrated) ubSaveCart(cart);
  return cart;
}

function ubSaveCart(cart){
  if(UB_HAS_STORAGE){
    try{
      window.localStorage.setItem(UB_CART_KEY, JSON.stringify(cart));
      return;
    }catch(e){ /* fall through to memory */ }
  }
  _memoryCart = cart;
}

function ubFormatNaira(n){
  return '₦' + n.toLocaleString('en-NG');
}

function ubAddToCart(product){
  // product: {id, name, price (number or null if TBD), img, meta, size}
  // variantId keys by product + size, so the same tee in two different
  // sizes becomes two separate cart lines instead of silently merging
  // into one (which used to lose the size the customer picked).
  const cart = ubGetCart();
  const variantId = product.size ? `${product.id}::${product.size}` : product.id;
  const existing = cart.find(i => i.variantId === variantId);
  if(existing){
    existing.qty += 1;
  }else{
    cart.push({...product, variantId, qty: 1});
  }
  ubSaveCart(cart);
  ubRenderCartCount();
  ubRenderCartDrawer();
  ubBumpCartIcon();
}

function ubChangeQty(variantId, delta){
  const cart = ubGetCart();
  const item = cart.find(i => i.variantId === variantId);
  if(!item) return;
  item.qty += delta;
  const next = item.qty < 1 ? cart.filter(i => i.variantId !== variantId) : cart;
  ubSaveCart(next);
  ubRenderCartCount();
  ubRenderCartDrawer();
  ubBumpCartIcon();
}

function ubRemoveFromCart(variantId){
  const cart = ubGetCart().filter(i => i.variantId !== variantId);
  ubSaveCart(cart);
  ubRenderCartCount();
  ubRenderCartDrawer();
  ubBumpCartIcon();
}

function ubCartCount(){
  return ubGetCart().reduce((sum, i) => sum + i.qty, 0);
}

function ubCartSubtotal(){
  return ubGetCart().reduce((sum, i) => sum + (i.price || 0) * i.qty, 0);
}

function ubRenderCartCount(){
  document.querySelectorAll('.cart-count').forEach(el => {
    el.textContent = ubCartCount();
  });
}

function ubRenderCartDrawer(){
  const wrap = document.getElementById('cartItems');
  const foot = document.getElementById('cartFoot');
  if(!wrap) return;
  const cart = ubGetCart();

  if(cart.length === 0){
    wrap.innerHTML = '<div class="cart-empty">Your cart is empty.<br>Time to fix that.</div>';
    if(foot) foot.style.display = 'none';
    return;
  }
  if(foot) foot.style.display = 'block';

  wrap.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.img}" alt="${item.name}">
      <div>
        <div class="ci-name">${item.name}</div>
        <div class="ci-meta">${item.size ? 'Size: ' + item.size : (item.meta || '')}</div>
        <div class="qty-control">
          <button onclick="ubChangeQty('${item.variantId}', -1)" aria-label="Decrease quantity">–</button>
          <span>${item.qty}</span>
          <button onclick="ubChangeQty('${item.variantId}', 1)" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <div>
        <div class="ci-price">${item.price ? ubFormatNaira(item.price * item.qty) : 'TBD'}</div>
        <button class="ci-remove" onclick="ubRemoveFromCart('${item.variantId}')">Remove</button>
      </div>
    </div>
  `).join('');

  const subtotalEl = document.getElementById('cartSubtotal');
  if(subtotalEl) subtotalEl.textContent = ubFormatNaira(ubCartSubtotal());
}

function ubOpenCart(){
  document.getElementById('cartOverlay')?.classList.add('open');
  document.getElementById('cartDrawer')?.classList.add('open');
  ubRenderCartDrawer();
}
function ubCloseCart(){
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.getElementById('cartDrawer')?.classList.remove('open');
}

/* cart icon bump — small confirmation pulse, called whenever cart contents change */
function ubBumpCartIcon(){
  const counts = document.querySelectorAll('.cart-count');
  if(counts.length === 0) return;
  if(UB_HAS_GSAP){
    gsap.fromTo(counts, {scale:1}, {scale:1.35, duration:0.18, ease:'power2.out', yoyo:true, repeat:1});
  }else{
    counts.forEach(el => {
      el.style.transition = 'transform 180ms ease';
      el.style.transform = 'scale(1.35)';
      setTimeout(() => { el.style.transform = 'scale(1)'; }, 180);
    });
  }
}

/* ================= GSAP SETUP ================= */
const UB_HAS_GSAP = !!(window.gsap && window.ScrollTrigger);
if(UB_HAS_GSAP){
  gsap.registerPlugin(ScrollTrigger);
}

/* scroll reveal, shared across pages */
function ubInitReveal(){
  const els = Array.from(document.querySelectorAll('.reveal'))
    .filter(el => !el.classList.contains('in'))
    .filter(el => !el.closest('.product-grid'));
  if(els.length === 0) return;

  if(!UB_HAS_GSAP){
    if(!('IntersectionObserver' in window)){
      els.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, {threshold: 0.15});
    els.forEach(el => io.observe(el));
    return;
  }

  els.forEach(el => {
    el.style.transition = 'none';
    gsap.fromTo(el,
      {opacity:0, y:28},
      {
        opacity:1, y:0, duration:0.9, ease:'power3.out',
        scrollTrigger:{trigger:el, start:'top 85%', once:true}
      }
    );
  });
}

/* ================= PAGE TRANSITIONS ================= */
function ubWrapPageContent(){
  let wrapper = document.getElementById('pageContent');
  if(wrapper) return wrapper;
  wrapper = document.createElement('div');
  wrapper.id = 'pageContent';
  const keepOutside = ['.corner-logo', '.corner-badge', 'nav', '.cart-overlay', '.cart-drawer'];
  const toMove = Array.from(document.body.childNodes).filter(n => {
    if(n.nodeName === 'SCRIPT') return false;
    if(n.nodeType !== 1) return true;
    return !keepOutside.some(sel => n.matches && n.matches(sel));
  });
  toMove.forEach(n => wrapper.appendChild(n));
  document.body.insertBefore(wrapper, document.body.firstChild);
  return wrapper;
}

function ubInitPageTransitions(){
  const wrapper = ubWrapPageContent();

  let overlay = document.getElementById('pageTransitionOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'pageTransitionOverlay';
    overlay.className = 'page-transition-overlay';
    document.body.appendChild(overlay);
  }

  if(UB_HAS_GSAP){
    gsap.set(overlay, {opacity:1, pointerEvents:'auto'});
    gsap.set(wrapper, {opacity:0, y:18});
    gsap.to(overlay, {opacity:0, pointerEvents:'none', duration:0.55, ease:'power2.out', delay:0.05});
    gsap.to(wrapper, {opacity:1, y:0, duration:0.7, ease:'power3.out', delay:0.12});
  }else{
    overlay.style.transition = 'none';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 0.55s cubic-bezier(.4,0,.2,1)';
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        wrapper.classList.add('page-entered');
      });
    });
  }

  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if(!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
    if(a.target === '_blank') return;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if(UB_HAS_GSAP){
        gsap.to(wrapper, {opacity:0, y:-14, duration:0.4, ease:'power2.in'});
        gsap.to(overlay, {
          opacity:1, pointerEvents:'auto', duration:0.4, ease:'power2.in',
          onComplete:() => { window.location.href = href; }
        });
      }else{
        wrapper.classList.remove('page-entered');
        wrapper.classList.add('page-exiting');
        overlay.style.transition = 'opacity 0.4s ease';
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'auto';
        setTimeout(() => { window.location.href = href; }, 420);
      }
    });
  });
}

/* ================= MOBILE NAV ================= */
function ubInitMobileNav(){
  const navWrap = document.querySelector('nav .wrap');
  const navlinks = navWrap ? navWrap.querySelector('.navlinks') : null;
  if(!navWrap || !navlinks || document.querySelector('.nav-toggle')) return;

  const toggle = document.createElement('button');
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Open menu');
  toggle.innerHTML = '<span></span><span></span><span></span>';
  navWrap.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'mobile-nav-panel';
  panel.innerHTML = navlinks.innerHTML;
  document.body.appendChild(panel);

  const links = Array.from(panel.querySelectorAll('a'));

  toggle.addEventListener('click', () => {
    const isOpen = !panel.classList.contains('open');
    panel.classList.toggle('open', isOpen);
    toggle.classList.toggle('active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';

    if(UB_HAS_GSAP){
      if(isOpen){
        gsap.fromTo(links, {opacity:0, y:16}, {opacity:1, y:0, duration:0.4, ease:'power3.out', stagger:0.07, delay:0.15});
      }
    }
  });

  links.forEach(a => {
    a.addEventListener('click', () => {
      panel.classList.remove('open');
      toggle.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

/* ================= IMAGE MASK REVEAL ================= */
function ubInitImageReveal(){
  const targets = document.querySelectorAll('.p-shot, .drop-shot');
  targets.forEach(el => el.classList.add('img-reveal'));

  if(!UB_HAS_GSAP){
    if(!('IntersectionObserver' in window)){
      targets.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, {threshold: 0.2});
    targets.forEach(el => io.observe(el));
    return;
  }

  targets.forEach(el => {
    const img = el.querySelector('img');
    el.style.transition = 'none';
    gsap.fromTo(el,
      {clipPath:'inset(100% 0 0 0)'},
      {clipPath:'inset(0% 0 0 0)', duration:1.0, ease:'power3.out',
       scrollTrigger:{trigger:el, start:'top 88%', once:true}}
    );
    if(img){
      img.style.transition = 'none';
      gsap.fromTo(img,
        {scale:1.05},
        {scale:1, duration:1.3, ease:'power3.out',
         scrollTrigger:{trigger:el, start:'top 88%', once:true}}
      );
    }
  });
}

/* ================= HEADING LINE REVEAL ================= */
function ubSplitHeadingLines(el){
  const text = el.textContent.trim();
  const words = text.split(/\s+/).filter(Boolean);
  if(words.length === 0) return;

  // temporarily render words to measure line breaks
  el.innerHTML = words.map(w => `<span class="ub-word" style="display:inline-block;">${w}&nbsp;</span>`).join('');
  const wordEls = Array.from(el.querySelectorAll('.ub-word'));
  const lines = [];
  let currentTop = null, currentLine = [];
  wordEls.forEach(w => {
    const top = w.offsetTop;
    if(currentTop === null || Math.abs(top - currentTop) < 2){
      currentLine.push(w.textContent);
      currentTop = top;
    }else{
      lines.push(currentLine.join('').trim());
      currentLine = [w.textContent];
      currentTop = top;
    }
  });
  if(currentLine.length) lines.push(currentLine.join('').trim());

  el.innerHTML = '';
  lines.forEach((line, i) => {
    const outer = document.createElement('span');
    outer.className = 'split-line';
    const inner = document.createElement('span');
    inner.className = 'split-line-inner';
    inner.textContent = line;
    inner.style.transitionDelay = (i * 0.09) + 's';
    outer.appendChild(inner);
    el.appendChild(outer);
  });
}

function ubInitHeadingReveal(){
  const headings = document.querySelectorAll('h2.split-target, .shop-hero h1, .about-hero h1, .contact-hero h1, .models-hero h1');
  headings.forEach(h => {
    if(h.dataset.split) return;
    h.dataset.split = 'true';
    ubSplitHeadingLines(h);
    h.classList.add('split-heading');
  });
  const targets = document.querySelectorAll('.split-heading');

  if(!UB_HAS_GSAP){
    if(!('IntersectionObserver' in window)){
      targets.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){ entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, {threshold: 0.3});
    targets.forEach(el => io.observe(el));
    return;
  }

  targets.forEach(h => {
    const lines = h.querySelectorAll('.split-line-inner');
    lines.forEach(l => { l.style.transition = 'none'; });
    gsap.fromTo(lines,
      {yPercent:100, opacity:0},
      {
        yPercent:0, opacity:1, duration:0.85, ease:'power3.out', stagger:0.09,
        scrollTrigger:{trigger:h, start:'top 85%', once:true}
      }
    );
  });
}

/* ================= HOMEPAGE ENTRANCE SEQUENCE ================= */
function ubHomeEntrance(){
  const logo = document.querySelector('.corner-logo');
  const badge = document.querySelector('.corner-badge');
  const heroImg = document.querySelector('.hero-visual .frame img');
  const heroLines = document.querySelectorAll('.hero-copy h1 .ln');
  const lede = document.querySelector('.hero-copy .lede');
  const ctas = document.querySelector('.hero-copy .hero-ctas');
  const tagRow = document.querySelector('.hero-copy .hero-tag');
  const navEl = document.querySelector('nav');
  if(!logo || !heroImg) return; // only runs on the homepage

  if(!UB_HAS_GSAP){
    // graceful fallback: show everything immediately, no entrance choreography
    [logo, badge, heroImg, lede, ctas, tagRow].forEach(el => {
      if(!el) return;
      el.style.opacity = '1'; el.style.transform = 'none'; el.style.clipPath = 'none';
    });
    heroLines.forEach(l => { l.style.opacity = '1'; l.style.transform = 'none'; });
    return;
  }

  [logo, badge, heroImg, lede, ctas, tagRow].forEach(el => { if(el) el.style.transition = 'none'; });
  heroLines.forEach(l => { l.style.transition = 'none'; l.style.display = 'block'; });
  if(navEl) navEl.style.pointerEvents = 'none';

  const tl = gsap.timeline({defaults:{ease:'power3.out'}});

  tl.fromTo(logo, {opacity:0}, {opacity:1, duration:0.4}, 0);
  if(badge) tl.fromTo(badge, {opacity:0}, {opacity:1, duration:0.4}, 0.06);
  tl.fromTo(heroImg,
    {clipPath:'inset(100% 0 0 0)', scale:1.05},
    {clipPath:'inset(0% 0 0 0)', scale:1, duration:1.2, ease:'power4.out'},
    0.2
  );
  tl.fromTo(heroLines, {opacity:0, y:24}, {opacity:1, y:0, duration:0.75, stagger:0.11}, 0.5);
  if(lede) tl.fromTo(lede, {opacity:0, y:14}, {opacity:1, y:0, duration:0.6}, '-=0.3');
  if(ctas) tl.fromTo(ctas, {opacity:0, y:12}, {opacity:1, y:0, duration:0.4}, '-=0.25');
  if(tagRow) tl.fromTo(tagRow, {opacity:0}, {opacity:1, duration:0.4}, '-=0.2');
  tl.add(() => { if(navEl) navEl.style.pointerEvents = 'auto'; });
}

/* ================= HERO PARALLAX ================= */
function ubInitHeroParallax(){
  const hero = document.querySelector('.hero');
  if(!hero) return;
  if(window.matchMedia('(max-width: 760px)').matches) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const bgWord = hero.querySelector('.bg-word');
  const graffiti = hero.querySelector('.graffiti-layer');
  const halftone = hero.querySelector('.halftone-bg');
  const copy = hero.querySelector('.hero-copy');

  if(UB_HAS_GSAP){
    const tl = gsap.timeline({
      scrollTrigger:{trigger:hero, start:'top top', end:'bottom top', scrub:0.6}
    });
    if(bgWord) tl.to(bgWord, {y:140, rotate:-4, ease:'none'}, 0);
    if(graffiti) tl.to(graffiti, {y:60, ease:'none'}, 0);
    if(halftone) tl.to(halftone, {y:36, ease:'none'}, 0);
    if(copy) tl.to(copy, {y:-24, ease:'none'}, 0);
    return;
  }

  // fallback: manual rAF-throttled scroll parallax
  let ticking = false;
  function update(){
    const rect = hero.getBoundingClientRect();
    if(rect.bottom < 0 || rect.top > window.innerHeight){ ticking = false; return; }
    const y = window.scrollY;
    if(bgWord) bgWord.style.transform = `rotate(-4deg) translateY(${y * 0.18}px)`;
    if(graffiti) graffiti.style.transform = `translateY(${y * 0.08}px)`;
    if(halftone) halftone.style.transform = `translateY(${y * 0.05}px)`;
    if(copy) copy.style.transform = `translateY(${y * -0.03}px)`;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if(!ticking){ window.requestAnimationFrame(update); ticking = true; }
  }, {passive:true});
}

/* ================= SCROLL CUE ================= */
function ubInitScrollCue(){
  const hero = document.querySelector('.hero');
  if(!hero || hero.querySelector('.scroll-cue')) return;
  const cue = document.createElement('div');
  cue.className = 'scroll-cue';
  cue.innerHTML = '<span class="cue-label">Scroll</span><span class="cue-line"></span>';
  hero.appendChild(cue);
}

/* ================= CUSTOM CURSOR (scoped, desktop only) ================= */
function ubInitCustomCursor(){
  if(!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const zones = document.querySelectorAll('.hero-visual, .p-shot, .drop-shot');
  if(zones.length === 0) return;

  const cursor = document.createElement('div');
  cursor.className = 'ub-cursor';
  document.body.appendChild(cursor);

  if(UB_HAS_GSAP){
    gsap.set(cursor, {xPercent:-50, yPercent:-50});
    const xTo = gsap.quickTo(cursor, 'x', {duration:0.45, ease:'power3'});
    const yTo = gsap.quickTo(cursor, 'y', {duration:0.45, ease:'power3'});
    window.addEventListener('mousemove', (e) => { xTo(e.clientX); yTo(e.clientY); });
  }else{
    let mx = 0, my = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; });
    function loop(){
      cx += (mx - cx) * 0.18;
      cy += (my - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  zones.forEach(zone => {
    const label = zone.classList.contains('hero-visual') ? 'View' : 'Shop';
    zone.addEventListener('mouseenter', () => {
      zone.style.cursor = 'none';
      cursor.classList.add('visible', 'expand');
      cursor.textContent = label;
    });
    zone.addEventListener('mouseleave', () => {
      zone.style.cursor = '';
      cursor.classList.remove('visible', 'expand');
      cursor.textContent = '';
    });
  });
}

/* ================= PRODUCT GRID STAGGER REVEAL ================= */
function ubInitProductGridReveal(){
  const cards = document.querySelectorAll('.product-grid .p-card');
  if(cards.length === 0) return;

  if(!UB_HAS_GSAP){
    if(!('IntersectionObserver' in window)){
      cards.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if(entry.isIntersecting){
          setTimeout(() => entry.target.classList.add('in'), i * 60);
          io.unobserve(entry.target);
        }
      });
    }, {threshold: 0.15});
    cards.forEach(el => io.observe(el));
    return;
  }

  cards.forEach(el => { el.style.transition = 'none'; });
  ScrollTrigger.batch('.product-grid .p-card', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => {
      gsap.fromTo(batch,
        {opacity:0, y:34, scale:0.97},
        {opacity:1, y:0, scale:1, duration:0.7, ease:'power3.out', stagger:0.09}
      );
    }
  });
}

/* ================= PRODUCT CARD HOVER (quick-add cue) ================= */
function ubInitProductCardHover(){
  document.querySelectorAll('.product-grid .p-card').forEach(card => {
    const shot = card.querySelector('.p-shot');
    if(!shot || shot.querySelector('.p-quickcue')) return;
    const btn = card.querySelector('.p-add');
    if(!btn || btn.disabled) return; // no quick-add cue for coming-soon items
    const cue = document.createElement('div');
    cue.className = 'p-quickcue';
    cue.textContent = 'Quick Add';
    shot.appendChild(cue);
    cue.addEventListener('click', (e) => {
      e.preventDefault();
      btn.click();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ubInitPageTransitions();
  ubRenderCartCount();
  ubInitReveal();
  ubInitMobileNav();
  ubInitImageReveal();
  ubInitHeadingReveal();
  ubInitScrollCue();
  ubHomeEntrance();
  ubInitHeroParallax();
  ubInitCustomCursor();
  ubInitProductGridReveal();
  ubInitProductCardHover();
});

