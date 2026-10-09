import { el } from './dom.js';
import type { UIStrings } from './i18n.js';

const TOUR_SEEN_KEY = 'hm-tour-seen';

export interface CoachmarkStep {
  target: string;
  title: (ui: UIStrings) => string;
  desc: (ui: UIStrings) => string;
}

const STEPS: CoachmarkStep[] = [
  {
    target: '#seg-mode',
    title: (ui) => ui.tourStepModeTitle,
    desc: (ui) => ui.tourStepModeDesc,
  },
  {
    target: '#dataset',
    title: (ui) => ui.tourStepCampaignTitle,
    desc: (ui) => ui.tourStepCampaignDesc,
  },
  {
    target: '#help-btn',
    title: (ui) => ui.tourStepPrefsTitle,
    desc: (ui) => ui.tourStepPrefsDesc,
  },
];

export class CoachmarkTour {
  private currentStep = 0;
  private active = false;
  private backdropEl: HTMLElement | null = null;
  private spotlightEl: HTMLElement | null = null;
  private cardEl: HTMLElement | null = null;
  private arrowEl: HTMLElement | null = null;
  private getUI: () => UIStrings;
  private onModeRequested?: (mode: 'story' | 'explore') => void;

  constructor(getUI: () => UIStrings, onModeRequested?: (mode: 'story' | 'explore') => void) {
    this.getUI = getUI;
    this.onModeRequested = onModeRequested;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleReposition = this.handleReposition.bind(this);
  }

  public hasSeen(): boolean {
    try {
      return localStorage.getItem(TOUR_SEEN_KEY) === 'true';
    } catch {
      return false;
    }
  }

  public markSeen(): void {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, 'true');
    } catch {
      /* private browsing */
    }
  }

  public start(force = true): void {
    if (!force && this.hasSeen()) return;
    this.currentStep = 0;
    this.active = true;
    this.createElements();
    this.renderStep();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleReposition);
    window.addEventListener('scroll', this.handleReposition, { passive: true });
  }

  public stop(): void {
    this.active = false;
    this.markSeen();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleReposition);
    window.removeEventListener('scroll', this.handleReposition);
    this.removeElements();
  }

  public next(): void {
    if (this.currentStep < STEPS.length - 1) {
      this.currentStep++;
      this.renderStep();
    } else {
      this.stop();
    }
  }

  public prev(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.renderStep();
    }
  }

  public updateText(): void {
    if (this.active) {
      this.renderStep();
    }
  }

  private createElements(): void {
    if (this.backdropEl) return;

    this.backdropEl = el('div', { class: 'hm-tour-backdrop' });
    this.backdropEl.addEventListener('click', () => this.stop());

    this.spotlightEl = el('div', { class: 'hm-tour-spotlight' });

    this.cardEl = el('div', {
      class: 'hm-tour-card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'hm-tour-title',
      'aria-describedby': 'hm-tour-desc',
    });

    this.arrowEl = el('div', { class: 'hm-tour-arrow' });
    this.cardEl.append(this.arrowEl);

    document.body.append(this.backdropEl, this.spotlightEl, this.cardEl);
  }

  private removeElements(): void {
    this.backdropEl?.remove();
    this.spotlightEl?.remove();
    this.cardEl?.remove();
    this.backdropEl = null;
    this.spotlightEl = null;
    this.cardEl = null;
    this.arrowEl = null;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.stop();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      this.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.prev();
    }
  }

  private handleReposition(): void {
    if (!this.active) return;
    this.positionElements();
  }

  private renderStep(): void {
    if (!this.cardEl || !this.active) return;
    const ui = this.getUI();
    const step = STEPS[this.currentStep];
    const total = STEPS.length;
    const isLast = this.currentStep === total - 1;

    // Build card content
    const content = el('div', { class: 'hm-tour-content' });

    // Header with roman numeral step index & close button
    const roman = ['I', 'II', 'III', 'IV'][this.currentStep] ?? String(this.currentStep + 1);
    const header = el('div', { class: 'hm-tour-header' },
      el('span', { class: 'hm-tour-step-badge', text: `${roman} / ${['I', 'II', 'III', 'IV'][total - 1] ?? total}` }),
      el('button', {
        class: 'hm-tour-close',
        'aria-label': ui.dismiss,
        onclick: () => this.stop(),
      }, '×')
    );

    const title = el('h3', { id: 'hm-tour-title', class: 'hm-tour-title', text: step.title(ui) });

    // Render description with bold formatting if any markdown bold is present
    const descText = step.desc(ui);
    const desc = el('p', { id: 'hm-tour-desc', class: 'hm-tour-desc' });
    const parts = descText.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        desc.append(el('strong', { text: part.slice(2, -2) }));
      } else {
        desc.append(part);
      }
    }

    // Actions row
    const footer = el('div', { class: 'hm-tour-footer' });
    const skipBtn = el('button', {
      class: 'hm-tour-btn-text',
      onclick: () => this.stop(),
      text: ui.tourSkip,
    });

    const btnGroup = el('div', { class: 'hm-tour-nav-group' });
    if (this.currentStep > 0) {
      btnGroup.append(el('button', {
        class: 'btn hm-tour-btn-prev',
        onclick: () => this.prev(),
        text: ui.tourPrev,
      }));
    }
    btnGroup.append(el('button', {
      class: 'btn hm-tour-btn-next',
      onclick: () => this.next(),
      text: isLast ? ui.tourDone : ui.tourNext,
    }));

    footer.append(skipBtn, btnGroup);

    content.append(header, title, desc, footer);

    // Keep the arrow element, replace the content
    this.cardEl.replaceChildren(this.arrowEl!, content);

    // Position popover and spotlight
    this.positionElements();
  }

  private positionElements(): void {
    if (!this.cardEl || !this.spotlightEl) return;
    const step = STEPS[this.currentStep];
    const targetEl = document.querySelector<HTMLElement>(step.target);

    if (!targetEl) {
      // Target not found on page, center card
      this.spotlightEl.style.display = 'none';
      this.cardEl.style.top = '100px';
      this.cardEl.style.left = '50%';
      this.cardEl.style.transform = 'translateX(-50%)';
      if (this.arrowEl) this.arrowEl.style.display = 'none';
      return;
    }

    const rect = targetEl.getBoundingClientRect();

    // Spotlight position
    this.spotlightEl.style.display = 'block';
    this.spotlightEl.style.top = `${Math.max(0, rect.top - 4)}px`;
    this.spotlightEl.style.left = `${Math.max(0, rect.left - 4)}px`;
    this.spotlightEl.style.width = `${rect.width + 8}px`;
    this.spotlightEl.style.height = `${rect.height + 8}px`;

    // Card position
    const cardRect = this.cardEl.getBoundingClientRect();
    const cardWidth = cardRect.width || 340;
    const cardHeight = cardRect.height || 180;
    const pad = 12;

    let top = rect.bottom + pad;
    let placeAbove = false;
    if (top + cardHeight > window.innerHeight - 16 && rect.top - cardHeight - pad > 16) {
      top = rect.top - cardHeight - pad;
      placeAbove = true;
    }

    // Horizontal positioning: align arrow with target center
    const targetCenter = rect.left + rect.width / 2;
    let left = targetCenter - cardWidth / 2;
    left = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, left));

    this.cardEl.style.transform = 'none';
    this.cardEl.style.top = `${top}px`;
    this.cardEl.style.left = `${left}px`;

    // Arrow positioning
    if (this.arrowEl) {
      this.arrowEl.style.display = 'block';
      const arrowX = Math.max(16, Math.min(cardWidth - 24, targetCenter - left - 6));
      this.arrowEl.style.left = `${arrowX}px`;
      if (placeAbove) {
        this.arrowEl.classList.add('arrow-bottom');
        this.arrowEl.classList.remove('arrow-top');
      } else {
        this.arrowEl.classList.add('arrow-top');
        this.arrowEl.classList.remove('arrow-bottom');
      }
    }
  }
}
