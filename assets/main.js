(function () {
    'use strict';

    const RECIPIENT = 'a.i.kononov@yandex.ru';

    /* ---------- Навигация: фон при прокрутке ---------- */
    const nav = document.getElementById('nav');
    const isCasePage = document.body.classList.contains('case-page');
    const onScroll = () => {
        if (!nav || isCasePage) return;
        if (window.scrollY > 24) {
            nav.classList.add('is-scrolled');
        } else {
            nav.classList.remove('is-scrolled');
        }
    };
    if (!isCasePage) {
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ---------- Бургер-меню ---------- */
    const burger = document.getElementById('navBurger');
    const menu = document.getElementById('navMenu');

    if (burger && menu) {
        const closeMenu = () => {
            burger.classList.remove('is-open');
            menu.classList.remove('is-open');
            burger.setAttribute('aria-expanded', 'false');
        };
        const openMenu = () => {
            burger.classList.add('is-open');
            menu.classList.add('is-open');
            burger.setAttribute('aria-expanded', 'true');
        };

        burger.addEventListener('click', () => {
            if (menu.classList.contains('is-open')) closeMenu();
            else openMenu();
        });

        menu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menu.classList.contains('is-open')) {
                closeMenu();
            }
        });
    }

    /* ---------- Плавная прокрутка к якорям ---------- */
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();
            const navHeight = nav ? nav.offsetHeight : 0;
            const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight + 1;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });

    /* ---------- Кнопка «наверх» ---------- */
    const toTop = document.getElementById('toTop');
    if (toTop) {
        const onScrollTop = () => {
            if (window.scrollY > 600) toTop.classList.add('is-visible');
            else toTop.classList.remove('is-visible');
        };
        window.addEventListener('scroll', onScrollTop, { passive: true });
        toTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        onScrollTop();
    }

    /* ---------- Форма обратной связи (mailto) ---------- */
    const form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = (form.elements.name?.value || '').trim();
            const email = (form.elements.email?.value || '').trim();
            const topic = (form.elements.topic?.value || '').trim();
            const message = (form.elements.message?.value || '').trim();

            if (!name || !email || !message) {
                alert('Пожалуйста, заполните имя, e-mail и сообщение.');
                return;
            }

            const subject = topic
                ? `[Сайт ИНВЕНТУМ] ${topic} — ${name}`
                : `[Сайт ИНВЕНТУМ] Сообщение от ${name}`;

            const bodyLines = [
                `Имя: ${name}`,
                `E-mail для ответа: ${email}`,
                topic ? `Тема: ${topic}` : null,
                '',
                'Сообщение:',
                message,
                '',
                '— Отправлено с сайта ИНВЕНТУМ'
            ].filter((l) => l !== null);

            const mailto = 'mailto:' + RECIPIENT
                + '?subject=' + encodeURIComponent(subject)
                + '&body=' + encodeURIComponent(bodyLines.join('\n'));

            window.location.href = mailto;
        });
    }

    /* ---------- Подсветка активного раздела в меню ---------- */
    const sections = document.querySelectorAll('section[id], header[id]');
    const navLinks = document.querySelectorAll('.nav__menu a[href^="#"]');

    if ('IntersectionObserver' in window && sections.length && navLinks.length) {
        const linkById = {};
        navLinks.forEach((l) => {
            const id = l.getAttribute('href').slice(1);
            linkById[id] = l;
        });

        const setActive = (id) => {
            navLinks.forEach((l) => l.classList.remove('is-active'));
            if (linkById[id]) linkById[id].classList.add('is-active');
        };

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActive(entry.target.id);
                    }
                });
            },
            { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
        );

        sections.forEach((s) => observer.observe(s));
    }

    /* ---------- Появление карточек при прокрутке ---------- */
    if ('IntersectionObserver' in window) {
        const reveal = document.querySelectorAll(
            '.concept-card, .feature-card, .roadmap-card, .cooperation-card, .timeline__item, .concept-illustration, .concept-highlight'
        );
        reveal.forEach((el) => el.classList.add('reveal'));

        const revealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        revealObserver.unobserve(entry.target);
                    }
                });
            },
            { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
        );

        reveal.forEach((el) => revealObserver.observe(el));
    }
})();
