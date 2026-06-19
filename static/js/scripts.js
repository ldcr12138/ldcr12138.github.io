const content_dir = 'contents/';
const config_file = 'config.yml';
const section_names = ['home', 'publications', 'awards'];

const state = {
    revealObserver: null,
    visibleSections: [],
    needsMath: false
};

window.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupNavigation();
    setupScrollFeedback();
    setupPointerEffects();
    setupRevealObserver();
    document.documentElement.classList.add('js-ready');
    observeRevealElements();

    loadConfig();
    loadSections();
});

function setupThemeToggle() {
    const toggle = document.getElementById('theme-toggle');

    if (!toggle) {
        return;
    }

    const getTheme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const syncToggle = () => {
        const isDark = getTheme() === 'dark';
        toggle.setAttribute('aria-pressed', String(isDark));
        toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    };

    toggle.addEventListener('click', () => {
        const nextTheme = getTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = nextTheme;

        try {
            localStorage.setItem('theme', nextTheme);
        } catch {
            console.log('Theme preference could not be saved.');
        }

        syncToggle();
    });

    syncToggle();
}

function loadConfig() {
    fetch(content_dir + config_file)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Unable to load ${config_file}`);
            }
            return response.text();
        })
        .then(text => {
            if (containsMath(text)) {
                state.needsMath = true;
            }

            const yml = parseSimpleYaml(text);
            Object.entries(yml).forEach(([key, value]) => applyConfigValue(key, value));
        })
        .catch(error => console.log(error));
}

function parseSimpleYaml(text) {
    return text.split(/\r?\n/).reduce((config, line) => {
        if (!line.trim() || line.trimStart().startsWith('#')) {
            return config;
        }

        const delimiter = line.indexOf(':');

        if (delimiter === -1) {
            return config;
        }

        const key = line.slice(0, delimiter).trim();
        let value = line.slice(delimiter + 1).trim();

        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }

        if (key) {
            config[key] = value;
        }

        return config;
    }, {});
}

function applyConfigValue(key, value) {
    const html = value == null ? '' : String(value);
    const targets = new Set();
    const idTarget = document.getElementById(key);

    if (idTarget) {
        targets.add(idTarget);
    }

    document.querySelectorAll(`[data-config-key="${key}"]`).forEach(target => targets.add(target));

    targets.forEach(target => {
        target.innerHTML = html;
    });

    if (key === 'title') {
        const helper = document.createElement('span');
        helper.innerHTML = html;
        document.title = helper.textContent || html;
    }
}

function loadSections() {
    const loadTasks = section_names.map(name => {
        return fetch(content_dir + name + '.md')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Unable to load ${name}.md`);
                }
                return response.text();
            })
            .then(markdown => {
                if (containsMath(markdown)) {
                    state.needsMath = true;
                }

                renderMarkdownSection(name, markdown);
            })
            .catch(error => console.log(error));
    });

    Promise.all(loadTasks).then(() => {
        refreshVisibleSections();
        updateActiveNavigation();
        observeRevealElements();

        if (state.needsMath) {
            typesetMath();
        }
    });
}

function renderMarkdownSection(name, markdown) {
    const section = document.getElementById(name);
    const container = document.getElementById(name + '-md');

    if (!section || !container) {
        return;
    }

    if (!markdown.trim()) {
        section.hidden = true;
        hideNavLink(name);
        return;
    }

    if (marked.use) {
        marked.use({ mangle: false, headerIds: false });
    }

    const mathProtected = protectMathSegments(markdown);
    const renderedHtml = marked.parse(mathProtected.markdown);

    container.innerHTML = restoreMathSegments(renderedHtml, mathProtected.segments);
    enhanceMarkdown(container);
    enhanceLinks(container);
}

function protectMathSegments(markdown) {
    const segments = [];
    const mathPattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\\begin\{([a-zA-Z*]+)\}[\s\S]+?\\end\{\2\})/g;

    return {
        markdown: markdown.replace(mathPattern, match => {
            const token = `@@MATH_SEGMENT_${segments.length}@@`;
            segments.push(match);
            return token;
        }),
        segments
    };
}

function restoreMathSegments(html, segments) {
    return html.replace(/@@MATH_SEGMENT_(\d+)@@/g, (_, index) => {
        return escapeHtml(segments[Number(index)] || '');
    });
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function enhanceMarkdown(container) {
    const children = Array.from(container.children);
    const hasSubsections = children.some(node => node.tagName === 'H4');

    if (!hasSubsections) {
        return;
    }

    const intro = document.createElement('div');
    const grid = document.createElement('div');
    let currentBlock = null;

    intro.className = 'markdown-intro';
    grid.className = 'info-grid';

    children.forEach(node => {
        if (node.tagName === 'H4') {
            currentBlock = document.createElement('article');
            currentBlock.className = 'info-block reveal';

            const heading = document.createElement('h3');
            heading.textContent = node.textContent;
            currentBlock.appendChild(heading);
            grid.appendChild(currentBlock);
            return;
        }

        if (currentBlock) {
            currentBlock.appendChild(node);
        } else {
            intro.appendChild(node);
        }
    });

    Array.from(grid.children).forEach(block => {
        const hasBody = Array.from(block.children).some(child => {
            return child.tagName !== 'H3' && child.textContent.trim().length > 0;
        });

        if (!hasBody) {
            block.remove();
        }
    });

    container.innerHTML = '';

    if (intro.childNodes.length > 0) {
        container.appendChild(intro);
    }

    if (grid.childNodes.length > 0) {
        container.appendChild(grid);
    }
}

function enhanceLinks(container) {
    container.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');

        if (/^https?:\/\//i.test(href)) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
}

function hideNavLink(sectionName) {
    document.querySelectorAll(`a[href="#${sectionName}"]`).forEach(link => {
        const item = link.closest('.nav-item');

        if (item) {
            item.hidden = true;
        }
    });
}

function setupNavigation() {
    const nav = document.getElementById('mainNav');
    const navbarToggler = document.body.querySelector('.site-toggler');
    const responsiveNavItems = Array.from(document.querySelectorAll('#navbarResponsive .nav-link'));

    if (nav && navbarToggler) {
        navbarToggler.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('menu-open');
            navbarToggler.setAttribute('aria-expanded', String(isOpen));
        });
    }

    responsiveNavItems.forEach(navItem => {
        navItem.addEventListener('click', () => {
            if (nav && navbarToggler) {
                nav.classList.remove('menu-open');
                navbarToggler.setAttribute('aria-expanded', 'false');
            }
        });
    });

    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', event => {
            const target = document.querySelector(link.getAttribute('href'));

            if (!target) {
                return;
            }

            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    const backToTop = document.getElementById('back-to-top');

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

function setupScrollFeedback() {
    let ticking = false;

    const update = () => {
        updateNavState();
        updateProgress();
        updateActiveNavigation();
        ticking = false;
    };

    const requestUpdate = () => {
        if (!ticking) {
            window.requestAnimationFrame(update);
            ticking = true;
        }
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', () => {
        refreshVisibleSections();
        requestUpdate();
    });
}

function setupPointerEffects() {
    const field = document.getElementById('cursor-field');
    const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const supportsTouchPointer = window.matchMedia('(pointer: coarse)').matches
        || 'ontouchstart' in window
        || navigator.maxTouchPoints > 0;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!field || reduceMotion || (!supportsFinePointer && !supportsTouchPointer)) {
        return;
    }

    const root = document.documentElement;
    const maxParticles = supportsFinePointer ? 10 : 7;
    const moveSpawnDelay = supportsFinePointer ? 260 : 420;
    const burstSpawnDelay = supportsFinePointer ? 520 : 680;
    const particleTypes = ['tableau', 'tableau', 'tableau', 'schur'];
    const schurLabels = [
        { base: 'S', sub: '\u03BB' },
        { base: 's', sub: '\u03BC' },
        { base: 's', sub: '(2,1)' },
        { base: 'S', sub: '\u03BD' }
    ];
    const tableauShapes = [
        [4, 3, 1],
        [4, 2],
        [3, 3, 1],
        [3, 2, 1],
        [3, 2],
        [4, 3, 2]
    ];
    let activeParticles = 0;
    let lastParticleTime = 0;
    let lastBurstTime = 0;
    let frame = 0;
    let hideTimer = 0;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;

    const updatePointerPosition = () => {
        root.style.setProperty('--cursor-x', `${pointerX}px`);
        root.style.setProperty('--cursor-y', `${pointerY}px`);
        frame = 0;
    };

    const showField = (x, y, temporary = false) => {
        pointerX = x;
        pointerY = y;
        root.classList.add('pointer-ready');

        if (!frame) {
            frame = window.requestAnimationFrame(updatePointerPosition);
        }

        if (temporary) {
            window.clearTimeout(hideTimer);
            hideTimer = window.setTimeout(() => {
                root.classList.remove('pointer-ready');
            }, 980);
        }
    };

    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const buildTableauParticle = () => {
        const shape = tableauShapes[Math.floor(Math.random() * tableauShapes.length)];
        const values = [];
        const tableau = document.createElement('span');

        tableau.className = 'tableau-grid';
        tableau.style.setProperty('--tableau-cols', shape[0]);

        shape.forEach((rowLength, rowIndex) => {
            const row = document.createElement('span');
            const rowValues = [];

            row.className = 'tableau-row';

            for (let columnIndex = 0; columnIndex < rowLength; columnIndex += 1) {
                const left = columnIndex > 0 ? rowValues[columnIndex - 1] : 1 + rowIndex;
                const above = rowIndex > 0 && values[rowIndex - 1][columnIndex] != null
                    ? values[rowIndex - 1][columnIndex] + 1
                    : 1;
                const value = Math.min(9, Math.max(left, above) + randomInt(0, 1));
                const cell = document.createElement('span');

                cell.className = 'tableau-cell';
                cell.textContent = value;
                rowValues.push(value);
                row.appendChild(cell);
            }

            values.push(rowValues);
            tableau.appendChild(row);
        });

        return tableau;
    };

    const buildSchurParticle = () => {
        const label = schurLabels[Math.floor(Math.random() * schurLabels.length)];
        const base = document.createElement('span');
        const sub = document.createElement('span');
        const wrapper = document.createElement('span');

        wrapper.className = 'schur-label';
        base.className = 'schur-base';
        sub.className = 'schur-sub';
        base.textContent = label.base;
        sub.textContent = label.sub;
        wrapper.append(base, sub);

        return wrapper;
    };

    const spawnParticle = (x, y, options = {}) => {
        const now = performance.now();
        const particleLimit = options.force ? maxParticles + 2 : maxParticles;

        if (activeParticles >= particleLimit || (!options.force && now - lastParticleTime < moveSpawnDelay)) {
            return;
        }

        lastParticleTime = now;
        activeParticles += 1;

        const particle = document.createElement('span');
        const particleType = options.type || particleTypes[Math.floor(Math.random() * particleTypes.length)];
        const angle = Math.random() * Math.PI * 2;
        const distance = 24 + Math.random() * 46;

        particle.className = `cursor-particle is-${particleType}`;
        particle.style.setProperty('--particle-x', `${x}px`);
        particle.style.setProperty('--particle-y', `${y}px`);
        particle.style.setProperty('--particle-dx', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--particle-dy', `${Math.sin(angle) * distance}px`);
        particle.style.setProperty('--particle-rotate', `${Math.random() * 46 - 23}deg`);
        particle.style.setProperty('--particle-spin', `${Math.random() * 42 - 21}deg`);

        if (particleType === 'tableau') {
            particle.appendChild(buildTableauParticle());
        }

        if (particleType === 'schur') {
            particle.appendChild(buildSchurParticle());
        }

        field.appendChild(particle);

        window.setTimeout(() => {
            particle.remove();
            activeParticles = Math.max(0, activeParticles - 1);
        }, 1020);
    };

    const spawnBurst = (x, y) => {
        const now = performance.now();
        const amount = 2;

        if (now - lastBurstTime < burstSpawnDelay) {
            return;
        }

        lastBurstTime = now;

        for (let index = 0; index < amount; index += 1) {
            const jitterX = x + randomInt(-14, 14);
            const jitterY = y + randomInt(-14, 14);
            const type = index === amount - 1 ? 'schur' : 'tableau';

            spawnParticle(jitterX, jitterY, { force: true, type });
        }
    };

    window.addEventListener('pointermove', event => {
        if (!supportsFinePointer || (event.pointerType && event.pointerType !== 'mouse')) {
            return;
        }

        showField(event.clientX, event.clientY);
        spawnParticle(pointerX, pointerY);
    }, { passive: true });

    window.addEventListener('pointerdown', event => {
        showField(event.clientX, event.clientY, event.pointerType !== 'mouse');
        spawnBurst(event.clientX, event.clientY);
    }, { passive: true });

    if (!window.PointerEvent) {
        window.addEventListener('touchstart', event => {
            const touch = event.touches[0];

            if (!touch) {
                return;
            }

            showField(touch.clientX, touch.clientY, true);
            spawnBurst(touch.clientX, touch.clientY);
        }, { passive: true });
    }

    document.addEventListener('mouseleave', () => {
        root.classList.remove('pointer-ready');
    });
}

function updateNavState() {
    const nav = document.getElementById('mainNav');
    const backToTop = document.getElementById('back-to-top');
    const isScrolled = window.scrollY > 24;

    if (nav) {
        nav.classList.toggle('navbar-scrolled', isScrolled);
    }

    if (backToTop) {
        backToTop.classList.toggle('is-visible', window.scrollY > 520);
    }
}

function updateProgress() {
    const progress = document.getElementById('scroll-progress');

    if (!progress) {
        return;
    }

    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    progress.style.width = `${Math.min(1, Math.max(0, ratio)) * 100}%`;
}

function refreshVisibleSections() {
    state.visibleSections = Array.from(document.querySelectorAll('main section:not([hidden])'));
}

function updateActiveNavigation() {
    const sections = state.visibleSections.length ? state.visibleSections : Array.from(document.querySelectorAll('main section:not([hidden])'));
    const anchorOffset = window.scrollY + 120;
    let activeId = 'page-top';

    sections.forEach(section => {
        if (section.offsetTop <= anchorOffset) {
            activeId = section.id;
        }
    });

    if (window.scrollY < 220) {
        activeId = 'page-top';
    }

    document.querySelectorAll('#navbarResponsive .nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${activeId}`);
    });
}

function setupRevealObserver() {
    if (!('IntersectionObserver' in window)) {
        document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
        return;
    }

    state.revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                state.revealObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px'
    });
}

function observeRevealElements(root = document) {
    const items = root.querySelectorAll('.reveal:not(.is-visible)');

    if (!state.revealObserver) {
        items.forEach(item => item.classList.add('is-visible'));
        return;
    }

    items.forEach(item => state.revealObserver.observe(item));
}

function containsMath(text) {
    return /(^|[^\\])\$\$(.|\n)*?\$\$/.test(text)
        || /(^|[^\\])\$(?!\s)[^$\n]+\$/.test(text)
        || /\\\(|\\\[|\\begin\{/.test(text);
}

function typesetMath() {
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise().catch(error => console.log(error));
        return;
    }

    window.MathJax = {
        tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']],
            processEscapes: true,
            processEnvironments: true,
            processRefs: true,
            tags: 'ams',
            tagSide: 'right',
            tagIndent: '0.8em',
            useLabelIds: true,
            maxMacros: 10000,
            maxBuffer: 5 * 1024
        }
    };

    const script = document.createElement('script');
    script.src = 'static/js/tex-svg.js';
    script.async = true;
    script.onload = () => {
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise().catch(error => console.log(error));
        }
    };
    script.onerror = error => console.log(error);
    document.head.appendChild(script);
}
