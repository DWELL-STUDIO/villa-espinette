/* ════════════════════════════════════════════════════════════════
   VILLA RHODE — Script principal (scroll-driven)

   Stack :
   - Lenis  : smooth scroll
   - GSAP   : moteur d'animation
   - ScrollTrigger : tout ce qui est piloté par le scroll

   Effets :
     · Barre de progression globale (haut de page)
     · Vidéo héro scrubbée par le scroll dans le hero
     · Parallax sur images marquées [data-parallax]
     · Reveal au scroll
     · Compteurs animés (chiffres clés)
     · Section ESPACES en scroll horizontal pinné (style Apple)
     · Vidéo cinématique scrubbée plein écran (section Film)
     · Galerie + lightbox
   ──────────────────────────────────────────────────────────────── */

window.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ───── 0 · Préférences utilisateur + détection mobile ─────
     Sur mobile, l'écriture de video.currentTime à chaque frame est très
     coûteuse (le décodeur hoquète). On bascule donc les vidéos en autoplay
     loop simple, et on simplifie certaines animations.
  */
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  const prefersReducedMotion = mq('(prefers-reduced-motion: reduce)');
  const isMobile = mq('(max-width: 880px)') || mq('(pointer: coarse)');

  /* ───── 1 · LENIS smooth scroll + GSAP tick sync ───── */
  let lenis = null;

  /* Lenis : uniquement sur desktop. Sur mobile, le scroll natif est déjà
     fluide et Lenis crée plus de problèmes (touch interference) qu'il n'en
     résout. Le scroll natif suffit largement. */
  if (typeof Lenis !== 'undefined' && !prefersReducedMotion && !isMobile) {
    lenis = new Lenis({
      lerp: 0.10,
      smoothWheel: true,
      wheelMultiplier: 1,
    });

    // GSAP ScrollTrigger doit suivre Lenis : on relaie le tick
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      // fallback : rAF natif
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  } else if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  const hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

  /* ───── 2 · NAV : état scrolled ───── */
  const nav = document.querySelector('[data-nav]');
  const onScrollNav = () => {
    if (!nav) return;
    const y = window.scrollY || document.documentElement.scrollTop;
    nav.classList.toggle('is-scrolled', y > 80);
  };
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ───── 3 · BARRE DE PROGRESSION globale ───── */
  const progressEl = document.querySelector('[data-progress]');
  if (progressEl) {
    const updateProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? (window.scrollY / max) * 100 : 0;
      progressEl.style.width = p + '%';
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
  }

  /* ───── 4 · REVEAL au scroll ───── */
  if (hasGSAP && !prefersReducedMotion) {
    gsap.utils.toArray('.reveal').forEach((el) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 1.1,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
        }
      );
    });
  } else {
    // fallback : IO
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('is-in')),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  }

  /* ───── 5 · PARALLAX sur images marquées ─────
     Chaque [data-parallax="0.2"] se déplace verticalement à une fraction
     de la course de scroll de sa section parente. */
  /* Parallax : DESKTOP UNIQUEMENT.
     Sur mobile, chaque scrub est un calcul à chaque frame de scroll qui
     ralentit le scroll natif et déclenche le "stop and go" iOS. */
  if (hasGSAP && !prefersReducedMotion && !isMobile) {
    gsap.utils.toArray('[data-parallax]').forEach((el) => {
      const speed = parseFloat(el.dataset.parallax) || 0.2;
      const trigger = el.closest('section') || el.parentElement;

      gsap.fromTo(
        el,
        { yPercent: -speed * 40 },
        {
          yPercent: speed * 40,
          ease: 'none',
          scrollTrigger: {
            trigger,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.5,
          },
        }
      );
    });
  }

  /* ───── HELPER · setupScrubVideo ─────
     Fixe les bugs classiques du scrub vidéo :
       - throttle des écritures currentTime (évite le hoquet du décodeur)
       - utilise gsap.ticker (frame-aligné, pas de rAF concurrent)
       - skip écriture si delta < 1 frame (~33ms à 30fps)
       - gère le ready state proprement (loadedmetadata + canplay)
       - pas de scrub GSAP intermédiaire : on lit la progression directement
  */
  const setupScrubVideo = (section, video, opts = {}) => {
    if (!section || !video || !hasGSAP || prefersReducedMotion) return;

    /* Mobile : on remplace le scrub par un autoplay loop, MAIS
       on délègue le play/pause à l'IntersectionObserver global (plus bas).
       Ça permet de ne décoder qu'une seule vidéo à la fois — sinon le
       téléphone est saturé par 6 vidéos qui essaient de jouer. */
    if (isMobile) {
      video.muted = true;
      video.loop = true;
      video.setAttribute('loop', '');
      video.setAttribute('playsinline', '');
      // Pas de play() ici : l'observer s'en charge quand la vidéo entre en vue.
      // Pour l'indicateur de progression visuel, on remplit depuis le scroll
      if (opts.onUpdate && hasGSAP) {
        ScrollTrigger.create({
          trigger: section,
          start: opts.start || 'top bottom',
          end:   opts.end   || 'bottom top',
          scrub: 0.4,
          onUpdate: (self) => opts.onUpdate(self.progress),
        });
      }
      return;
    }

    let dur = 0;
    let targetTime = 0;
    let lastWrite = -1;
    let progress = 0;
    const smooth = opts.smooth != null ? opts.smooth : 0.18;
    const minDelta = 1 / 30;            // 1 frame à 30fps : seuil d'écriture

    /* boucle frame-aligné (gsap.ticker, donc synchro avec ScrollTrigger) */
    const tickFn = () => {
      if (!dur) return;
      // lerp doux du currentTime vers la cible
      const cur = video.currentTime;
      const delta = targetTime - cur;

      // si vraiment proche, on ne touche pas
      if (Math.abs(delta) < 0.01) return;

      const next = cur + delta * smooth;

      // throttle : on n'écrit que si on bouge d'au moins 1 frame
      if (Math.abs(next - lastWrite) >= minDelta) {
        try {
          video.currentTime = next;
          lastWrite = next;
        } catch (_) { /* state transient */ }
      }
    };

    /* on attache au ticker GSAP : 1 seule frame par tick, partagée avec Lenis */
    let attached = false;
    const attach = () => {
      if (attached) return;
      attached = true;
      gsap.ticker.add(tickFn);
    };

    const onReady = () => {
      dur = video.duration || 0;
      if (!dur) return;
      // "prime" : play silencieux puis pause, autorise les écritures currentTime
      const p = video.play();
      const finalize = () => { try { video.pause(); } catch (_) {} attach(); };
      if (p && typeof p.then === 'function') p.then(finalize).catch(finalize);
      else finalize();

      ScrollTrigger.create({
        trigger: section,
        start: opts.start || 'top bottom',
        end:   opts.end   || 'bottom top',
        scrub: false,                 // PAS de scrub GSAP : on prend la progression brute
        onUpdate: (self) => {
          progress = self.progress;
          targetTime = progress * dur;
          if (opts.onUpdate) opts.onUpdate(progress);
        },
        invalidateOnRefresh: true,
      });
    };

    /* on attend canplay pour avoir la durée réelle ET un buffer minimal */
    if (video.readyState >= 2) onReady();
    else {
      const handler = () => onReady();
      video.addEventListener('loadedmetadata', handler, { once: true });
      video.addEventListener('canplay', handler, { once: true });
    }
  };

  /* ───── 6 · HERO — vidéo scrubbée par le scroll ───── */
  const hero = document.querySelector('[data-hero]');
  const heroVideo = document.querySelector('[data-hero-video]');
  const heroContent = document.querySelector('[data-hero-content]');

  if (hero && heroVideo) {
    setupScrubVideo(hero, heroVideo, {
      start: 'top top',
      end: 'bottom top',
      smooth: 0.18,
    });

    // contenu héro : parallax + fade au scroll (desktop uniquement)
    if (heroContent && hasGSAP && !prefersReducedMotion && !isMobile) {
      gsap.to(heroContent, {
        yPercent: -20,
        opacity: 0.4,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.5,
        },
      });
    }
  }

  /* ───── 6b · FILM STRIPS — transitions vidéo scrubbées + infos animées ───── */
  document.querySelectorAll('[data-strip]').forEach((section) => {
    const v = section.querySelector('[data-strip-video]');
    if (!v) return;

    // Vidéo scrubbée (helper gère lerp interne)
    setupScrubVideo(section, v, {
      start: 'top bottom',
      end: 'bottom top',
      smooth: 0.16,
    });

    if (hasGSAP && !prefersReducedMotion) {
      // Petit scale, scrub léger — desktop uniquement (scrub = jank sur iOS)
      if (!isMobile) {
        gsap.fromTo(
          v,
          { scale: 1.10 },
          {
            scale: 1.02,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 0.5,
            },
          }
        );
      }

      // Animation des blocs d'info : entrée stagger, sortie en bout de section
      const infoEls = section.querySelectorAll('[data-strip-anim]');
      if (infoEls.length) {
        gsap.fromTo(
          infoEls,
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            ease: 'expo.out',
            stagger: 0.06,
            scrollTrigger: {
              trigger: section,
              start: 'top 60%',
              toggleActions: 'play none none reverse',
            },
          }
        );

        gsap.to(infoEls, {
          y: -12,
          opacity: 0,
          ease: 'power1.in',
          duration: 0.5,
          stagger: 0.03,
          scrollTrigger: {
            trigger: section,
            start: 'bottom 60%',
            toggleActions: 'play none none reverse',
          },
        });
      }
    }
  });

  /* ───── 6c · PHOTOS animées en scroll-driven ─────
     Chaque [data-photo-anim] reçoit 2 couches scrubbées :
       1) clip-path qui s'ouvre du bas (mask reveal)
       2) scale 1.18 → 1 sur la traversée du viewport
     Scrub modéré (0.5–0.8) pour que ça suive sans retard.
  */
  /* Animations photos : DESKTOP UNIQUEMENT.
     Sur mobile, on remplace par un simple fade-in via reveal class déjà géré.
  */
  if (hasGSAP && !prefersReducedMotion && !isMobile) {
    gsap.utils.toArray('[data-photo-anim]').forEach((wrap) => {
      const img = wrap.querySelector('img');
      if (!img) return;

      gsap.fromTo(
        wrap,
        { clipPath: 'inset(0% 0% 20% 0%)' },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          ease: 'none',
          scrollTrigger: {
            trigger: wrap,
            start: 'top 85%',
            end: 'top 40%',
            scrub: 0.5,
          },
        }
      );

      gsap.fromTo(
        img,
        { scale: 1.18 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: wrap,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.8,
          },
        }
      );
    });
  }

  /* ───── 7 · COMPTEURS animés (chiffres clés) ───── */
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = parseInt(el.dataset.countTo, 10) || 0;
    const format = el.dataset.countFormat;

    const fmt = (n) => {
      if (format === 'thousands' && n >= 1000) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      }
      return String(n);
    };

    if (hasGSAP) {
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 1.6,
        ease: 'expo.out',
        snap: { v: 1 },
        onUpdate: () => { el.textContent = fmt(Math.round(obj.v)); },
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    } else {
      el.textContent = fmt(target);
    }
  });

  /* ───── 8 · SCRUB VIDEO (section Film, vidéo cinématique pinnée) ───── */
  const scrubSection = document.querySelector('[data-scrub]');
  const scrubVideo = document.querySelector('[data-scrub-video]');
  const scrubBar = document.querySelector('[data-scrub-progress]');

  if (scrubSection && scrubVideo) {
    setupScrubVideo(scrubSection, scrubVideo, {
      start: 'top top',
      end: 'bottom bottom',
      smooth: 0.16,
      onUpdate: (p) => { if (scrubBar) scrubBar.style.transform = `scaleX(${p})`; },
    });

    if (hasGSAP && !prefersReducedMotion) {
      gsap.fromTo(
        scrubVideo,
        { scale: 1.06 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: scrubSection,
            start: 'top top',
            end: '+=40%',
            scrub: 0.5,
          },
        }
      );
    }
  }

  /* ───── 9 · ESPACES — scroll horizontal pinné ───── */
  const spacesSection = document.querySelector('[data-spaces]');
  const spacesTrack = document.querySelector('[data-spaces-track]');
  const spacesBar = document.querySelector('[data-spaces-bar]');
  const spacesCurrent = document.querySelector('[data-spaces-current]');
  const spaceCards = spacesTrack ? spacesTrack.querySelectorAll('.space') : [];

  if (spacesSection && spacesTrack && hasGSAP) {
    // matchMedia : on n'active le pin que sur desktop
    const mm = gsap.matchMedia();

    mm.add('(min-width: 881px)', () => {
      const pin = spacesSection.querySelector('.spaces__pin');
      if (!pin) return;

      // distance horizontale à parcourir
      const getDistance = () =>
        spacesTrack.scrollWidth - window.innerWidth + 80;

      const tween = gsap.to(spacesTrack, {
        x: () => -getDistance(),
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          pin: true,
          anticipatePin: 1,
          start: 'top top',
          end: () => `+=${getDistance()}`,
          scrub: 0.5,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            // mise à jour du HUD
            if (spacesBar) spacesBar.style.transform = `scaleX(${self.progress})`;
            if (spacesCurrent && spaceCards.length) {
              const idx = Math.min(
                spaceCards.length - 1,
                Math.floor(self.progress * spaceCards.length + 0.0001)
              );
              const num = String(idx + 1).padStart(2, '0');
              if (spacesCurrent.textContent !== num) spacesCurrent.textContent = num;
            }
          },
        },
      });

      // mini-effet : chaque carte se "soulève" légèrement quand elle est centrée
      spaceCards.forEach((card) => {
        gsap.fromTo(
          card.querySelector('.space__media img'),
          { scale: 1.12 },
          {
            scale: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: card,
              containerAnimation: tween,
              start: 'left center',
              end: 'right center',
              scrub: true,
            },
          }
        );
      });

      return () => { tween.kill(); };
    });
  }

  /* ───── 10 · GALERIE — génération + reveal + lightbox ───── */
  const galleryEl = document.querySelector('[data-gallery]');

  // Galerie Villa Rhode-Saint-Genèse (réf. 7695994) — 35 photos officielles James Realty.
  const galleryItems = [
    // Les 2 premières gardent leur disposition d'ouverture (xl + md, 2 rangées).
    { src: 'assets/images/01.jpg', span: 'xl', alt: 'Villa moderniste — vue principale' },
    { src: 'assets/images/02.jpg', span: 'md', alt: 'Villa et son écrin paysager' },
    // Toutes les autres en sm — grille 3 par ligne, plus posée.
    { src: 'assets/images/03.jpg', span: 'sm', alt: 'Vue arrière vers les champs' },
    { src: 'assets/images/04.jpg', span: 'sm', alt: 'Salon — pièce de réception' },
    { src: 'assets/images/05.jpg', span: 'sm', alt: 'Salle à manger' },
    { src: 'assets/images/06.jpg', span: 'sm', alt: 'Séjour traversant' },
    { src: 'assets/images/07.jpg', span: 'sm', alt: 'Détail intérieur' },
    { src: 'assets/images/08.jpg', span: 'sm', alt: 'Cuisine contemporaine' },
    { src: 'assets/images/09.jpg', span: 'sm', alt: 'Espace ouvert' },
    { src: 'assets/images/10.jpg', span: 'sm', alt: 'Détail architecture' },
    { src: 'assets/images/11.jpg', span: 'sm', alt: 'Pièce de vie' },
    { src: 'assets/images/12.jpg', span: 'sm', alt: 'Suite parentale' },
    { src: 'assets/images/13.jpg', span: 'sm', alt: 'Chambre' },
    { src: 'assets/images/14.jpg', span: 'sm', alt: 'Espace bureau' },
    { src: 'assets/images/15.jpg', span: 'sm', alt: 'Salle de bains' },
    { src: 'assets/images/16.jpg', span: 'sm', alt: 'Détail sanitaire' },
    { src: 'assets/images/17.jpg', span: 'sm', alt: 'Chambre à l’étage' },
    { src: 'assets/images/18.jpg', span: 'sm', alt: 'Salle de bains attenante' },
    { src: 'assets/images/19.jpg', span: 'sm', alt: 'Cave à vins' },
    { src: 'assets/images/20.jpg', span: 'sm', alt: 'Buanderie' },
    { src: 'assets/images/21.jpg', span: 'sm', alt: 'Vestiaire' },
    { src: 'assets/images/22.jpg', span: 'sm', alt: 'Sous-sol — espaces techniques' },
    { src: 'assets/images/23.jpg', span: 'sm', alt: 'Détail' },
    { src: 'assets/images/24.jpg', span: 'sm', alt: 'Vue intérieure' },
    { src: 'assets/images/25.jpg', span: 'sm', alt: 'Couloir' },
    { src: 'assets/images/26.jpg', span: 'sm', alt: 'Garage' },
    { src: 'assets/images/27.jpg', span: 'sm', alt: 'Vue extérieure' },
    { src: 'assets/images/28.jpg', span: 'sm', alt: 'Terrasse' },
    { src: 'assets/images/29.jpg', span: 'sm', alt: 'Façade en lumière' },
    { src: 'assets/images/30.jpg', span: 'sm', alt: 'Vue aérienne' },
    { src: 'assets/images/31.jpg', span: 'sm', alt: 'Vue dans les champs' },
    { src: 'assets/images/32.jpg', span: 'sm', alt: 'Jardin paysager' },
    { src: 'assets/images/33.jpg', span: 'sm', alt: 'Vue large vers les champs' },
    { src: 'assets/images/34.jpg', span: 'sm', alt: 'Ensemble propriété' },
    { src: 'assets/images/35.jpg', span: 'sm', alt: 'Perspective générale' },
  ];
  const imgPath = (item) => item.src;

  if (galleryEl) {
    // Met à jour le compteur affiché dans le header
    const galleryCountEl = document.querySelector('[data-gallery-count]');
    if (galleryCountEl) galleryCountEl.textContent = String(galleryItems.length);

    const frag = document.createDocumentFragment();
    galleryItems.forEach((item, i) => {
      const fig = document.createElement('figure');
      fig.className = `gallery__item gallery__item--${item.span}`;
      fig.dataset.galleryIndex = String(i);
      const img = document.createElement('img');
      img.src = imgPath(item);
      img.alt = item.alt;
      img.loading = 'lazy';
      fig.appendChild(img);
      frag.appendChild(fig);
    });
    galleryEl.appendChild(frag);

    if (hasGSAP && !prefersReducedMotion) {
      gsap.utils.toArray('.gallery__item').forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 36 },
          {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'expo.out',
            delay: (i % 3) * 0.06,
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
          }
        );

        // Parallax sur les vignettes — désactivé sur mobile (18 ScrollTriggers
        // simultanés feraient lagger le scroll, sans gain visuel).
        if (!isMobile) {
          gsap.fromTo(
            el.querySelector('img'),
            { yPercent: -6 },
            {
              yPercent: 6,
              ease: 'none',
              scrollTrigger: {
                trigger: el,
                start: 'top bottom',
                end: 'bottom top',
                scrub: 0.6,
              },
            }
          );
        }
      });
    } else {
      galleryEl.querySelectorAll('.gallery__item').forEach((el) => el.classList.add('is-in'));
    }

    /* — LIGHTBOX — */
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
      <button class="lightbox__close" aria-label="Fermer">×</button>
      <button class="lightbox__nav lightbox__nav--prev" aria-label="Précédent">‹</button>
      <img class="lightbox__img" alt="" />
      <button class="lightbox__nav lightbox__nav--next" aria-label="Suivant">›</button>
    `;
    document.body.appendChild(lightbox);

    const lbImg = lightbox.querySelector('.lightbox__img');
    let lbIndex = 0;

    const openLB = (i) => {
      lbIndex = i;
      lbImg.src = imgPath(galleryItems[i]);
      lbImg.alt = galleryItems[i].alt;
      lightbox.classList.add('is-open');
      if (lenis) lenis.stop();
      else document.body.style.overflow = 'hidden';
    };
    const closeLB = () => {
      lightbox.classList.remove('is-open');
      if (lenis) lenis.start();
      else document.body.style.overflow = '';
    };
    const navLB = (dir) => {
      lbIndex = (lbIndex + dir + galleryItems.length) % galleryItems.length;
      lbImg.src = imgPath(galleryItems[lbIndex]);
      lbImg.alt = galleryItems[lbIndex].alt;
    };

    galleryEl.addEventListener('click', (e) => {
      const fig = e.target.closest('.gallery__item');
      if (!fig) return;
      openLB(parseInt(fig.dataset.galleryIndex, 10));
    });
    lightbox.querySelector('.lightbox__close').addEventListener('click', closeLB);
    lightbox.querySelector('.lightbox__nav--prev').addEventListener('click', () => navLB(-1));
    lightbox.querySelector('.lightbox__nav--next').addEventListener('click', () => navLB(1));
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLB(); });
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape')      closeLB();
      else if (e.key === 'ArrowLeft')  navLB(-1);
      else if (e.key === 'ArrowRight') navLB(1);
    });
  }

  /* ───── 11 · CONTACT FORM ───── */
  const form = document.querySelector('.contact__form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const subject = encodeURIComponent('Demande de visite — Villa Rhode (Réf. 12-0301)');
      const body = encodeURIComponent(
        `Nom : ${data.get('name') || ''}\n` +
        `E-mail : ${data.get('email') || ''}\n` +
        `Téléphone : ${data.get('phone') || ''}\n\n` +
        `${data.get('message') || ''}`
      );
      window.location.href = `mailto:contact@christiesrealestatebelgium.be?subject=${subject}&body=${body}`;
    });
  }

  /* ───── 12 · Liens ancres : on délègue à Lenis si présent ───── */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -20, duration: 1.2 });
      else target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  });

  /* ───── 13 · RAIL DE CHAPITRES & ÉTIQUETTE FLOTTANTE ─────
     - Met en surbrillance le chapitre actif
     - Met à jour l'étiquette flottante (bas-gauche)
     - Inverse les couleurs (clair/sombre) quand on traverse une section sombre */
  const rail = document.querySelector('[data-rail]');
  const chapterPill = document.querySelector('[data-chapter]');
  const chapterNum = document.querySelector('[data-chapter-num]');
  const chapterLab = document.querySelector('[data-chapter-lab]');
  const sections = Array.from(document.querySelectorAll('[data-section]'));

  // mapping pour l'étiquette flottante (nouvel ordre narratif)
  const chapterMap = {
    top:          { num: '00', lab: 'Index' },
    architecture: { num: '01', lab: 'Architecture' },
    mesures:      { num: '02', lab: 'Mesures' },
    espaces:      { num: '03', lab: 'Espaces' },
    film:         { num: '04', lab: 'Film' },
    galerie:      { num: '05', lab: 'Galerie' },
    localisation: { num: '06', lab: 'Localisation' },
    contact:      { num: '07', lab: 'Visite' },
  };

  // sections au fond foncé : on inverse la couleur du rail/étiquette
  const darkSections = new Set(['film', 'contact']);

  /* Détection des fonds sombres (strips vidéo + statement dark + contact + scrub)
     pour basculer rail/étiquette en mode "on-dark". */
  const darkBackgrounds = document.querySelectorAll(
    '.strip, .stmt--dark, .scrub, .contact'
  );

  const isOverDark = () => {
    const mid = window.innerHeight * 0.5;
    for (const el of darkBackgrounds) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) return true;
    }
    return false;
  };

  if (rail || chapterPill) {
    let currentKey = 'top';

    const setActive = (key) => {
      if (currentKey !== key) {
        currentKey = key;

        if (rail) {
          rail.querySelectorAll('.rail__item').forEach((li) => {
            li.classList.toggle('is-active', li.dataset.railTarget === key);
          });
        }

        if (chapterPill && chapterMap[key]) {
          chapterNum.textContent = chapterMap[key].num;
          chapterLab.textContent = chapterMap[key].lab;
        }
      }

      // basculement clair/sombre indépendant du chapitre :
      // se base sur la présence d'un bloc à fond sombre au centre de l'écran
      const onDark = isOverDark() || darkSections.has(key);
      if (rail) rail.classList.toggle('on-dark', onDark);
      if (chapterPill) chapterPill.classList.toggle('on-dark', onDark);
    };

    // détermine la section dont le centre est le plus proche du milieu de l'écran
    const updateActive = () => {
      const mid = window.innerHeight * 0.4;
      let closest = sections[0];
      let closestDist = Infinity;
      sections.forEach((sec) => {
        const r = sec.getBoundingClientRect();
        // on considère qu'une section est "active" si son top est passé en haut
        // et son bottom n'est pas encore sorti
        if (r.top <= mid && r.bottom >= mid) {
          const d = Math.abs(r.top - mid);
          if (d < closestDist) { closestDist = d; closest = sec; }
        }
      });
      const key = closest && closest.dataset.section ? closest.dataset.section : 'top';
      setActive(key);

      // visibilité du rail/étiquette : on les cache au tout début (hero)
      const scrolled = window.scrollY > window.innerHeight * 0.6;
      if (rail) rail.classList.toggle('is-visible', scrolled);
      if (chapterPill) chapterPill.classList.toggle('is-visible', scrolled);
    };

    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
  }

  /* ───── 13b · MOBILE : play/pause des vidéos par IntersectionObserver ─────
     Sur mobile, lire 6 vidéos en parallèle est impossible. On joue uniquement
     la vidéo qui est dans le viewport (avec un buffer de 50% au-dessus/en-dessous).
     Quand elle sort, on la met en pause + on libère le buffer (currentTime = 0).
     Résultat : un seul décodeur actif à la fois → fluidité retrouvée.
  */
  if (isMobile) {
    const allVideos = document.querySelectorAll('video');

    const videoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const v = entry.target;
          if (entry.isIntersecting) {
            // démarre la lecture (muet, en boucle)
            v.muted = true;
            v.loop = true;
            const p = v.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } else {
            // sort de l'écran : pause pour libérer le décodeur
            v.pause();
          }
        });
      },
      { threshold: 0.15, rootMargin: '20% 0px 20% 0px' }
    );

    allVideos.forEach((v) => {
      // s'assure des attributs essentiels iOS
      v.muted = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      videoObserver.observe(v);
    });

    /* Sur iOS, position:sticky dans un parent avec overflow-x: hidden
       casse parfois. On force le contexte de sticky proprement.
       Le fix CSS principal est dans style.css ; ici on aide en évitant
       les transforms parents qui briseraient le sticky. */
  }

  /* ───── 14 · Refresh ScrollTrigger sur événements clés ─────
     Sans ces refresh, les triggers calés sur des sections en bas de page
     peuvent être faux tant que les fonts/images ne sont pas chargées.
  */
  if (hasGSAP) {
    // après chargement complet (toutes les images, fonts, vidéos metadata)
    window.addEventListener('load', () => ScrollTrigger.refresh());

    // après chargement des fonts (impacte les hauteurs de titre)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => ScrollTrigger.refresh());
    }

    // après chargement de chaque image lazy (la grille galerie change de hauteur)
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      if (img.complete) return;
      img.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
    });

    // resize debounced
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
    });
  }
});

/* ───────────────────────────────────────────────────────────────
   JOUR / NUIT — comparateur (drag + toggle Jour / 50 / Nuit)
   ─────────────────────────────────────────────────────────────── */
(function initDayNightCompare() {
  const stages = document.querySelectorAll('[data-dn-compare]');
  if (!stages.length) return;

  stages.forEach((stage) => {
    const figure = stage.querySelector('.dn-compare');
    const handle = stage.querySelector('[data-dn-handle]');
    const toggles = stage.querySelectorAll('[data-dn-mode]');
    if (!figure || !handle) return;

    const setSplit = (pct, animated = true) => {
      const v = Math.max(0, Math.min(100, pct));
      if (!animated) figure.classList.add('is-dragging');
      stage.style.setProperty('--dn-split', v + '%');
      if (!animated) {
        // Forcer un reflow puis enlever la classe pour rétablir la transition
        // sur le prochain set après un drag.
      }
    };

    // Drag handle
    let dragging = false;
    const onDown = (e) => {
      dragging = true;
      figure.classList.add('is-dragging');
      onMove(e);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const rect = figure.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const pct = (x / rect.width) * 100;
      setSplit(pct, false);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      // Ne pas retirer immédiatement is-dragging (sinon transition rejoue),
      // mais on l'enlève après un tick pour que le prochain toggle anime.
      requestAnimationFrame(() => figure.classList.remove('is-dragging'));
    };

    handle.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    handle.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    // Aussi : clic sur l'image (en dehors de la poignée) déplace le slider
    figure.addEventListener('click', (e) => {
      if (e.target.closest('[data-dn-handle]')) return;
      const rect = figure.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      // Retirer "active" sur le toggle puisqu'on revient à un état libre
      toggles.forEach((b) => b.classList.remove('is-active'));
      setSplit(pct, true);
    });

    // Toggles : Jour (0%) / 50/50 (50%) / Nuit (100%)
    toggles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.dnMode;
        const pct = mode === 'day' ? 0 : mode === 'night' ? 100 : 50;
        toggles.forEach((b) => b.classList.toggle('is-active', b === btn));
        setSplit(pct, true);
      });
    });

    // Position initiale : 50%
    setSplit(50, true);
    // Force "50 / 50" toggle to be active
    toggles.forEach((b) => b.classList.toggle('is-active', b.dataset.dnMode === 'split'));
  });
})();

/* ───────────────────────────────────────────────────────────────
   AMENITIES — Modal détail (clic sur une raison → image agrandie + texte)
   ─────────────────────────────────────────────────────────────── */
(function initAmenityModal() {
  const modal = document.querySelector('[data-am-modal]');
  if (!modal) return;

  const imgEl    = modal.querySelector('[data-am-img]');
  const titleEl  = modal.querySelector('[data-am-title]');
  const detailEl = modal.querySelector('[data-am-detail]');
  const closeBtns = modal.querySelectorAll('[data-am-close]');
  let lastFocus = null;

  const open = (card) => {
    const img    = card.dataset.amenityImg    || '';
    const detail = card.dataset.amenityDetail || '';
    const title  = card.querySelector('.amenity__title')?.textContent.trim() || '';
    const desc   = card.querySelector('.amenity__desc')?.textContent.trim()  || '';

    imgEl.src    = img;
    imgEl.alt    = title;
    titleEl.textContent  = title;
    detailEl.textContent = detail || desc;

    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('am-modal-open');
    // tick : open class après reflow pour que la transition joue
    requestAnimationFrame(() => modal.classList.add('is-open'));
    modal.querySelector('.am-modal__close')?.focus({ preventScroll: true });
  };

  const close = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('am-modal-open');
    // attendre la fin de la transition pour masquer
    setTimeout(() => {
      if (!modal.classList.contains('is-open')) modal.hidden = true;
    }, 380);
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
  };

  // Bind clic + clavier sur chaque carte raison
  document.querySelectorAll('[data-amenity]').forEach((card) => {
    card.addEventListener('click', () => open(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(card);
      }
    });
  });

  // Fermeture
  closeBtns.forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
  });
})();

/* ───────────────────────────────────────────────────────────────
   CURSEUR personnalisé — TOUJOURS visible, identique partout.
   - Pas de masquage par opacité (les anciens handlers mouseleave/blur
     causaient des disparitions imprévues).
   - Pas de check média côté JS : le CSS désactive déjà l'affichage
     sur écrans tactiles via @media (hover: none).
   - Point + bague suivent ensemble (mêmes transforms via le parent).
   ─────────────────────────────────────────────────────────────── */
(function initCursor() {
  const cursorEl = document.querySelector('[data-cursor]');
  if (!cursorEl) return;

  // Toujours visible — on lève l'attribut hidden et on ne touche
  // plus jamais à opacity / display dans le JS.
  cursorEl.hidden = false;
  cursorEl.style.removeProperty('opacity');

  // Sélecteurs considérés comme "interactifs" → état hover (scale)
  const HOVER_SELECTOR = [
    'a', 'button', '[role="button"]', '[data-amenity]', '[data-space]',
    '.nav__link', '.nav__cta', '.gallery__item',
    '.dn-toggle', '.dn-compare__knob', '.dn-compare__handle',
    '.am-modal__close', '.am-modal__backdrop',
    '.sp-modal__close', '.sp-modal__backdrop', '.sp-modal__nav', '.sp-modal__thumb',
    '.spread__toggle', '.lecture-row__toggle',
    'input', 'textarea', 'select',
    '.contact__line', '.contact__cta-pill',
  ].join(',');

  // Position cible (souris) — initialisée au centre pour éviter
  // un curseur posé en (0,0) avant le premier mousemove.
  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;
  const ease = 0.35;

  window.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });

  // États clic (down/up uniquement — pas de masquage)
  window.addEventListener('mousedown', () => cursorEl.classList.add('is-down'));
  window.addEventListener('mouseup',   () => cursorEl.classList.remove('is-down'));

  // Hover sur cibles interactives — délégation au document
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SELECTOR)) {
      cursorEl.classList.add('is-hover');
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest(HOVER_SELECTOR)) {
      cursorEl.classList.remove('is-hover');
    }
  });

  // rAF loop : un seul transform sur le parent → point et bague restent
  // toujours alignés et toujours rendus.
  const tick = () => {
    rx += (mx - rx) * ease;
    ry += (my - ry) * ease;
    cursorEl.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

/* ───────────────────────────────────────────────────────────────
   SPACES — Modal détail (mini-galerie + texte au clic sur un univers)
   ─────────────────────────────────────────────────────────────── */
(function initSpaceModal() {
  const modal = document.querySelector('[data-sp-modal]');
  if (!modal) return;

  const mediaEl  = modal.querySelector('.sp-modal__media');
  const mainEl   = modal.querySelector('[data-sp-main]');
  const thumbsEl = modal.querySelector('[data-sp-thumbs]');
  const titleEl  = modal.querySelector('[data-sp-title]');
  const detailEl = modal.querySelector('[data-sp-detail]');
  const counterEl= modal.querySelector('[data-sp-counter]');
  const prevBtn  = modal.querySelector('[data-sp-prev]');
  const nextBtn  = modal.querySelector('[data-sp-next]');
  const closeBtns = modal.querySelectorAll('[data-sp-close]');

  let images = [];
  let index = 0;
  let lastFocus = null;

  const renderMain = (i, animate = true) => {
    if (!images.length) return;
    index = (i + images.length) % images.length;
    if (animate) mediaEl.classList.add('is-swapping');
    setTimeout(() => {
      mainEl.src = images[index];
      mainEl.alt = `${titleEl.textContent.trim()} — vue ${index + 1}`;
      if (animate) requestAnimationFrame(() => mediaEl.classList.remove('is-swapping'));
    }, animate ? 220 : 0);
    counterEl.textContent = `${index + 1} / ${images.length}`;
    thumbsEl.querySelectorAll('.sp-modal__thumb').forEach((b, j) => {
      b.classList.toggle('is-active', j === index);
    });
    if (images.length < 2) {
      prevBtn.setAttribute('disabled', '');
      nextBtn.setAttribute('disabled', '');
      counterEl.hidden = true;
    } else {
      prevBtn.removeAttribute('disabled');
      nextBtn.removeAttribute('disabled');
      counterEl.hidden = false;
    }
  };

  const buildThumbs = () => {
    thumbsEl.innerHTML = '';
    if (images.length < 2) { thumbsEl.hidden = true; return; }
    thumbsEl.hidden = false;
    images.forEach((src, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sp-modal__thumb';
      b.setAttribute('aria-label', `Vue ${i + 1}`);
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      b.appendChild(img);
      b.addEventListener('click', () => renderMain(i));
      thumbsEl.appendChild(b);
    });
  };

  const open = (card) => {
    const imgs   = (card.dataset.spaceImages || '').split(',').map((s) => s.trim()).filter(Boolean);
    const detail = card.dataset.spaceDetail || '';
    const title  = card.querySelector('.space__name')?.textContent.trim() || '';
    const desc   = card.querySelector('.space__desc')?.textContent.trim()  || '';
    if (!imgs.length) return;

    images = imgs;
    titleEl.textContent  = title;
    detailEl.textContent = detail || desc;

    buildThumbs();
    renderMain(0, false);

    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sp-modal-open');
    requestAnimationFrame(() => modal.classList.add('is-open'));
    modal.querySelector('.sp-modal__close')?.focus({ preventScroll: true });
  };

  const close = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sp-modal-open');
    setTimeout(() => {
      if (!modal.classList.contains('is-open')) modal.hidden = true;
    }, 380);
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
  };

  // Bind cartes espaces
  document.querySelectorAll('[data-space]').forEach((card) => {
    card.addEventListener('click', () => open(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(card);
      }
    });
  });

  // Navigation
  prevBtn.addEventListener('click', () => renderMain(index - 1));
  nextBtn.addEventListener('click', () => renderMain(index + 1));

  // Clavier ← / → / Échap
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft')  renderMain(index - 1);
    else if (e.key === 'ArrowRight') renderMain(index + 1);
  });

  closeBtns.forEach((b) => b.addEventListener('click', close));
})();

/* ───────────────────────────────────────────────────────────────
   ATLAS · SPREADS — toggle Jour/Nuit par atmosphère
   ─────────────────────────────────────────────────────────────── */
(function initSpreadToggle() {
  const spreads = document.querySelectorAll('[data-spread]');
  spreads.forEach((spread) => {
    const btn   = spread.querySelector('[data-spread-toggle]');
    const label = spread.querySelector('[data-spread-label]');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isNight = spread.classList.toggle('is-night');
      btn.setAttribute('aria-pressed', isNight ? 'true' : 'false');
      if (label) label.textContent = isNight ? 'Voir le jour' : 'Voir la nuit';
    });
  });
})();

/* ───────────────────────────────────────────────────────────────
   i18n — Traduction FR / EN / NL via walker de text-nodes.
   Dictionnaire keyé par le texte FRANÇAIS exact (tel qu'il apparaît
   dans le HTML, après trim). Les originaux sont stockés dans une
   WeakMap afin de pouvoir revenir au FR à tout moment.
   ─────────────────────────────────────────────────────────────── */
(function initI18n() {
  const TRANSLATIONS = {
    en: {
      /* Nav */
      'Mesures': 'Measures',
      'Atlas': 'Atlas',
      'Espaces': 'Spaces',
      'Galerie': 'Gallery',
      'Localisation': 'Location',
      'Réservez votre visite': 'Book your visit',

      /* Hero */
      'Rhode-Saint-Genèse · Belgique': 'Rhode-Saint-Genèse · Belgium',
      'Disponible': 'Available',
      'Villa contemporaine': 'Contemporary villa',
      'Réf. 12/0339': 'Ref. 12/0339',

      /* Specs */
      'Fiche technique': 'Property facts',
      'Surface habitable': 'Living surface',
      'Terrain': 'Land',
      'Façades': 'Façades',
      'Chambres': 'Bedrooms',
      'Salles de bains': 'Bathrooms',
      'Garage': 'Garage',
      'Style': 'Style',
      'Construction': 'Construction',
      'Configuration': 'Configuration',
      'PEB': 'EPC',
      'Chauffage': 'Heating',
      'Sous-sol': 'Basement',
      'Stationnement': 'Parking',
      'Contemporain & durable': 'Contemporary & sustainable',
      '1960, rénovée 2021-2022': '1960, renovated 2021-2022',
      'Vie de plain-pied': 'Single-storey living',
      'A — exemplaire': 'A — exemplary',
      'Gaz': 'Gas',
      '100 m² (cave à vins)': '100 m² (wine cellar)',
      '2 garages + 4 places': '2 garages + 4 spaces',
      'Rhode-Saint-Genèse — Grande Espinette': 'Rhode-Saint-Genèse — Grande Espinette',

      /* Atlas / Spreads */
      '— Atlas': '— Atlas',
      'La villa,': 'The villa,',
      'en quatre atmosphères.': 'in four atmospheres.',
      'Atmosphère 01': 'Atmosphere 01',
      'Atmosphère 02': 'Atmosphere 02',
      'Atmosphère 03': 'Atmosphere 03',
      'Atmosphère 04': 'Atmosphere 04',
      "L'aérien.": 'The aerial.',
      "L'entrée.": 'The entrance.',
      'La piscine.': 'The pool.',
      'Le jardin.': 'The garden.',
      "Au bout d'un cul-de-sac privé, sans aucun vis-à-vis.": 'At the end of a private cul-de-sac, with no overlook.',
      "L'esprit moderniste, en brique noire et verre.": 'A modernist spirit, in black brick and glass.',
      'Le jardin au rythme des saisons.': 'The garden through the seasons.',
      "1 900 m² d'écrin paysager, sans vis-à-vis.": '1,900 m² of landscaped grounds, with no overlook.',
      'Voir la nuit': 'See at night',
      'Voir le jour': 'See in daylight',
      '— Grande Espinette · Rhode-Saint-Genèse': '— Grande Espinette · Rhode-Saint-Genèse',
      '— Rénovée 2021-2022': '— Renovated 2021-2022',
      '— Plein sud': '— South-facing',
      '— Éclairage architectural intégré': '— Integrated architectural lighting',

      /* Six univers */
      'Six univers,': 'Six worlds,',
      'un même langage.': 'one shared language.',
      'Faites défiler — la villa se déploie horizontalement.': 'Scroll — the villa unfolds horizontally.',
      'Le séjour traversant': 'The through-living room',
      'La cuisine contemporaine': 'The contemporary kitchen',
      'La suite parentale': 'The master suite',
      'La piscine': 'The pool',
      'La cave à vins': 'The wine cellar',
      'Le jardin & les champs': 'The garden & the fields',
      "Pièce de vie inondée de lumière, ouverte sur la terrasse et les champs. Le cœur paisible de la maison.": 'A living space bathed in light, opening onto the terrace and the fields. The peaceful heart of the home.',
      "Cuisine entièrement équipée, ouverte sur la salle à manger, en dialogue permanent avec le paysage.": 'Fully equipped kitchen, open to the dining room, in constant dialogue with the landscape.',
      "Chambre, dressing et salle de bains attenante. Une suite de plain-pied, retirée du monde.": 'Bedroom, dressing room and en-suite bathroom. A single-level master suite, set apart from the world.',
      "Bassin extérieur, plage en pierre claire, ouvert sur le jardin et les haies taillées.": 'Outdoor pool, light-stone deck, opening onto the garden and the trimmed hedges.',
      "Climatisée, taillée pour les amateurs. Une parenthèse minérale au sous-sol.": 'Climate-controlled, made for enthusiasts. A mineral interlude in the basement.',
      "2.420 m² de terrain en lisière des champs ouverts. Une sensation d'évasion, à dix minutes de Bruxelles.": '2,420 m² of land along the open fields. A sense of escape, ten minutes from Brussels.',

      /* Amenities */
      'Neuf raisons': 'Nine reasons',
      'de visiter.': 'to visit.',
      'Une villa moderniste rénovée avec soin, des volumes généreux, une vie de plain-pied et des vues ouvertes sur les champs — chaque détail compte.':
        'A modernist villa renovated with care — generous volumes, single-storey living, and open views over the fields. Every detail counts.',
      'Architecture moderniste': 'Modernist architecture',
      'Rénovation et extension neuve, volumes contemporains.': 'Renovation and new extension, contemporary volumes.',
      'Vues sur les champs': 'Views over the fields',
      "Vues ouvertes, sensation d'évasion permanente.": 'Open views, a permanent sense of escape.',
      "L'essentiel de la maison sur un seul niveau.": 'The essentials of the home on a single level.',
      'Cinq chambres': 'Five bedrooms',
      "Une suite parentale et quatre chambres à l'étage.": 'A master suite and four bedrooms upstairs.',
      'Performance énergétique': 'Energy performance',
      'Panneaux solaires, PEB A, confort optimal en toute saison.': 'Photovoltaic panels, EPC A, optimal comfort all year round.',
      'Garage 2 voitures': '2-car garage',
      "Intégré à la villa, accès direct depuis l'entrée.": 'Integrated into the villa, direct access from the entrance.',
      'Cave à vins climatisée': 'Climate-controlled wine cellar',
      'Espace dédié, température maîtrisée.': 'Dedicated space, controlled temperature.',
      '2.420 m² de terrain': '2,420 m² of land',
      'Jardin, terrasse et nature environnante.': 'Garden, terrace and surrounding nature.',
      'Cul-de-sac': 'Cul-de-sac',
      'Aucune circulation, tranquillité absolue.': 'No traffic, absolute tranquility.',

      /* Gallery */
      'vues': 'views',
      'Trente-cinq regards': 'Thirty-five views',
      'sur la villa.': 'of the villa.',
      "Cliquez sur une image pour l'ouvrir en plein écran.": 'Click an image to open it full-screen.',

      /* Day / Night */
      '— Le jour · la nuit': '— Day · night',
      'Une villa qui change': 'A villa that changes',
      'avec la lumière.': 'with the light.',
      "Au plein soleil, les volumes blancs et la brique noire se découpent dans le vert du jardin. À la tombée du jour, les éclairages architecturaux prennent le relais — la maison devient scénographique. Faites glisser le curseur, ou basculez d'une lumière à l'autre.":
        "In full sunlight, the white volumes and black brick stand out against the green garden. At nightfall, the architectural lighting takes over — the house becomes a stage. Drag the slider, or switch from one light to the other.",
      'Jour': 'Day',
      'Nuit': 'Night',
      "Vue d'ensemble": 'Overall view',
      "La villa, du soleil à la nuit tombée.": 'The villa, from sunlight to nightfall.',
      "Quand l'eau s'illumine au crépuscule.": 'When the water lights up at dusk.',

      /* Localisation */
      'Rhode-Saint-Genèse,': 'Rhode-Saint-Genèse,',
      "au bout d'un cul-de-sac.": 'at the end of a cul-de-sac.',
      'Moderniste rénové': 'Renovated modernist',
      'Bruxelles centre': 'Brussels city centre',
      'Aéroport': 'Airport',
      'Forêt de Soignes': 'Sonian Forest',
      'à proximité': 'nearby',

      /* Contact */
      '— Visite privée': '— Private viewing',
      'Organiser une visite.': 'Arrange a viewing.',
      'Votre interlocutrice': 'Your contact',
      "Christie's International Real Estate": "Christie's International Real Estate",
      'Bureau': 'Office',
      'Mobile': 'Mobile',
      'E-mail': 'E-mail',
      'Demander une visite': 'Request a viewing',
    },

    nl: {
      /* Nav */
      'Mesures': 'Kenmerken',
      'Atlas': 'Atlas',
      'Espaces': 'Ruimtes',
      'Galerie': 'Galerij',
      'Localisation': 'Locatie',
      'Réservez votre visite': 'Plan uw bezoek',

      /* Hero */
      'Rhode-Saint-Genèse · Belgique': 'Rhode-Saint-Genesius-Rode · België',
      'Disponible': 'Beschikbaar',
      'Villa contemporaine': 'Hedendaagse villa',
      'Réf. 12/0339': 'Ref. 12/0339',

      /* Specs */
      'Fiche technique': 'Technische fiche',
      'Surface habitable': 'Bewoonbare oppervlakte',
      'Terrain': 'Grondoppervlakte',
      'Façades': 'Gevels',
      'Chambres': 'Slaapkamers',
      'Salles de bains': 'Badkamers',
      'Garage': 'Garage',
      'Style': 'Stijl',
      'Construction': 'Bouwjaar',
      'Configuration': 'Configuratie',
      'PEB': 'EPB',
      'Chauffage': 'Verwarming',
      'Sous-sol': 'Kelder',
      'Stationnement': 'Parkeren',
      'Contemporain & durable': 'Hedendaags & duurzaam',
      '1960, rénovée 2021-2022': '1960, gerenoveerd 2021-2022',
      'Vie de plain-pied': 'Gelijkvloers leven',
      'A — exemplaire': 'A — uitmuntend',
      'Gaz': 'Gas',
      '100 m² (cave à vins)': '100 m² (wijnkelder)',
      '2 garages + 4 places': '2 garages + 4 plaatsen',
      'Rhode-Saint-Genèse — Grande Espinette': 'Sint-Genesius-Rode — Grote Hut',

      /* Atlas / Spreads */
      '— Atlas': '— Atlas',
      'La villa,': 'De villa,',
      'en quatre atmosphères.': 'in vier sferen.',
      'Atmosphère 01': 'Sfeer 01',
      'Atmosphère 02': 'Sfeer 02',
      'Atmosphère 03': 'Sfeer 03',
      'Atmosphère 04': 'Sfeer 04',
      "L'aérien.": 'Van bovenaf.',
      "L'entrée.": 'De inkom.',
      'La piscine.': 'Het zwembad.',
      'Le jardin.': 'De tuin.',
      "Au bout d'un cul-de-sac privé, sans aucun vis-à-vis.": 'Aan het einde van een privédoodlopende straat, zonder inkijk.',
      "L'esprit moderniste, en brique noire et verre.": 'Modernistische geest, in zwarte baksteen en glas.',
      'Le jardin au rythme des saisons.': 'De tuin op het ritme van de seizoenen.',
      "1 900 m² d'écrin paysager, sans vis-à-vis.": '1 900 m² aangelegde tuin, zonder inkijk.',
      'Voir la nuit': "'s Nachts bekijken",
      'Voir le jour': 'Overdag bekijken',
      '— Grande Espinette · Rhode-Saint-Genèse': '— Grote Hut · Sint-Genesius-Rode',
      '— Rénovée 2021-2022': '— Gerenoveerd 2021-2022',
      '— Plein sud': '— Pal zuid',
      '— Éclairage architectural intégré': '— Geïntegreerde architecturale verlichting',

      /* Six univers */
      'Six univers,': 'Zes werelden,',
      'un même langage.': 'één gemeenschappelijke taal.',
      'Faites défiler — la villa se déploie horizontalement.': 'Scroll — de villa ontvouwt zich horizontaal.',
      'Le séjour traversant': 'De doorlopende leefruimte',
      'La cuisine contemporaine': 'De hedendaagse keuken',
      'La suite parentale': 'De master-suite',
      'La piscine': 'Het zwembad',
      'La cave à vins': 'De wijnkelder',
      'Le jardin & les champs': 'De tuin & de velden',
      "Pièce de vie inondée de lumière, ouverte sur la terrasse et les champs. Le cœur paisible de la maison.": 'Lichtdoorvloeide leefruimte, open naar het terras en de velden. Het rustige hart van het huis.',
      "Cuisine entièrement équipée, ouverte sur la salle à manger, en dialogue permanent avec le paysage.": 'Volledig uitgeruste keuken, open naar de eetkamer, in voortdurende dialoog met het landschap.',
      "Chambre, dressing et salle de bains attenante. Une suite de plain-pied, retirée du monde.": 'Slaapkamer, dressing en aansluitende badkamer. Een gelijkvloerse suite, afgezonderd van de buitenwereld.',
      "Bassin extérieur, plage en pierre claire, ouvert sur le jardin et les haies taillées.": 'Buitenzwembad, terras in lichte natuursteen, open naar de tuin en gesnoeide hagen.',
      "Climatisée, taillée pour les amateurs. Une parenthèse minérale au sous-sol.": 'Geklimatiseerd, op maat voor liefhebbers. Een minerale onderbreking in de kelder.',
      "2.420 m² de terrain en lisière des champs ouverts. Une sensation d'évasion, à dix minutes de Bruxelles.": '2 420 m² grond aan de rand van de open velden. Een gevoel van ontsnapping, op tien minuten van Brussel.',

      /* Amenities */
      'Neuf raisons': 'Negen redenen',
      'de visiter.': 'om te bezoeken.',
      'Une villa moderniste rénovée avec soin, des volumes généreux, une vie de plain-pied et des vues ouvertes sur les champs — chaque détail compte.':
        'Een zorgvuldig gerenoveerde modernistische villa — royale volumes, gelijkvloers leven en open uitzicht op de velden. Elk detail telt.',
      'Architecture moderniste': 'Modernistische architectuur',
      'Rénovation et extension neuve, volumes contemporains.': 'Renovatie en nieuwbouw, hedendaagse volumes.',
      'Vues sur les champs': 'Uitzicht op de velden',
      "Vues ouvertes, sensation d'évasion permanente.": 'Open uitzicht, permanent gevoel van ontsnapping.',
      "L'essentiel de la maison sur un seul niveau.": 'Het essentiële van het huis op één niveau.',
      'Cinq chambres': 'Vijf slaapkamers',
      "Une suite parentale et quatre chambres à l'étage.": 'Een master-suite en vier slaapkamers op de verdieping.',
      'Performance énergétique': 'Energieprestatie',
      'Panneaux solaires, PEB A, confort optimal en toute saison.': 'Zonnepanelen, EPB A, optimaal comfort in elk seizoen.',
      'Garage 2 voitures': 'Garage voor 2 wagens',
      "Intégré à la villa, accès direct depuis l'entrée.": 'Geïntegreerd in de villa, directe toegang vanuit de inkom.',
      'Cave à vins climatisée': 'Geklimatiseerde wijnkelder',
      'Espace dédié, température maîtrisée.': 'Aparte ruimte, beheerste temperatuur.',
      '2.420 m² de terrain': '2 420 m² grond',
      'Jardin, terrasse et nature environnante.': 'Tuin, terras en omringende natuur.',
      'Cul-de-sac': 'Doodlopende straat',
      'Aucune circulation, tranquillité absolue.': 'Geen verkeer, absolute rust.',

      /* Gallery */
      'vues': "weergaven",
      'Trente-cinq regards': 'Vijfendertig blikken',
      'sur la villa.': 'op de villa.',
      "Cliquez sur une image pour l'ouvrir en plein écran.": 'Klik op een beeld om het op volledig scherm te openen.',

      /* Day / Night */
      '— Le jour · la nuit': '— Dag · nacht',
      'Une villa qui change': 'Een villa die verandert',
      'avec la lumière.': 'met het licht.',
      "Au plein soleil, les volumes blancs et la brique noire se découpent dans le vert du jardin. À la tombée du jour, les éclairages architecturaux prennent le relais — la maison devient scénographique. Faites glisser le curseur, ou basculez d'une lumière à l'autre.":
        'In volle zon steken de witte volumes en de zwarte baksteen af tegen het groen van de tuin. Bij valavond neemt de architecturale verlichting het over — het huis wordt scenografisch. Sleep de cursor, of schakel tussen de twee lichten.',
      'Jour': 'Dag',
      'Nuit': 'Nacht',
      "Vue d'ensemble": 'Overzicht',
      "La villa, du soleil à la nuit tombée.": 'De villa, van zon tot valavond.',
      "Quand l'eau s'illumine au crépuscule.": 'Wanneer het water bij schemering oplicht.',

      /* Localisation */
      'Rhode-Saint-Genèse,': 'Sint-Genesius-Rode,',
      "au bout d'un cul-de-sac.": 'aan het einde van een doodlopende straat.',
      'Moderniste rénové': 'Gerenoveerd modernistisch',
      'Bruxelles centre': 'Centrum van Brussel',
      'Aéroport': 'Luchthaven',
      'Forêt de Soignes': 'Zoniënwoud',
      'à proximité': 'in de buurt',

      /* Contact */
      '— Visite privée': '— Privébezichtiging',
      'Organiser une visite.': 'Een bezoek plannen.',
      'Votre interlocutrice': 'Uw contactpersoon',
      "Christie's International Real Estate": "Christie's International Real Estate",
      'Bureau': 'Kantoor',
      'Mobile': 'GSM',
      'E-mail': 'E-mail',
      'Demander une visite': 'Een bezoek aanvragen',
    },
  };

  // Stockage des valeurs originales par node (pour restaurer le FR)
  const ORIGINALS = new WeakMap();
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

  const isInSvg = (el) => {
    let n = el;
    while (n) {
      if (n.tagName && n.tagName.toLowerCase() === 'svg') return true;
      n = n.parentElement;
    }
    return false;
  };

  function walkTextNodes(root, cb) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        if (isInSvg(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) cb(n);
  }

  function applyLang(lang) {
    // 1. On restaure tout au FR original
    walkTextNodes(document.body, (node) => {
      if (ORIGINALS.has(node)) node.nodeValue = ORIGINALS.get(node);
    });

    // Attribut html lang pour SEO / accessibilité
    document.documentElement.setAttribute('lang', lang);

    if (lang === 'fr') return; // déjà en FR, terminé

    const dict = TRANSLATIONS[lang];
    if (!dict) return;

    walkTextNodes(document.body, (node) => {
      const orig = node.nodeValue;
      const trimmed = orig.trim();
      if (!trimmed) return;
      const replaced = dict[trimmed];
      if (replaced && replaced !== trimmed) {
        if (!ORIGINALS.has(node)) ORIGINALS.set(node, orig);
        node.nodeValue = orig.replace(trimmed, replaced);
      }
    });
  }

  // Activation des boutons
  const switcher = document.querySelector('[data-lang]');
  if (!switcher) return;
  const btns = switcher.querySelectorAll('[data-lang-set]');

  const setActive = (lang) => {
    btns.forEach((b) => {
      const on = b.dataset.langSet === lang;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  btns.forEach((b) => {
    b.addEventListener('click', () => {
      const lang = b.dataset.langSet;
      applyLang(lang);
      setActive(lang);
      try { localStorage.setItem('villa-lang', lang); } catch (_) {}
    });
  });

  // Au chargement : restaurer la langue précédente (sinon FR)
  let initial = 'fr';
  try {
    const saved = localStorage.getItem('villa-lang');
    if (saved && (saved === 'fr' || saved === 'en' || saved === 'nl')) initial = saved;
  } catch (_) {}
  // Sur le 1er passage on doit d'abord scanner les originaux pour les stocker.
  // applyLang('fr') ne fait rien (pas de dictionnaire), mais on veut un seed.
  if (initial !== 'fr') {
    applyLang(initial);
    setActive(initial);
  }
})();
