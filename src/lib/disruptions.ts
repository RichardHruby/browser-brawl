import type { DisruptionDefinition } from '@/types/disruptions';

export const DISRUPTIONS: DisruptionDefinition[] = [
  {
    id: 'popup-overlay',
    name: 'Session Expired Popup',
    description: 'Deploys a fullscreen fake "Session Expired" overlay',
    minDifficulty: 'easy',
    healthDamage: 8,
    cooldownMs: 12000,
    generatePayload: () => `
      (function() {
        const existing = document.getElementById('__bb_overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = '__bb_overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.88);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:sans-serif;';
        overlay.innerHTML = '<div style="background:#0d0d18;border:2px solid #ff003c;padding:48px 56px;border-radius:12px;text-align:center;color:#e8e8f0;max-width:420px;box-shadow:0 0 40px rgba(255,0,60,0.3);"><div style="font-size:48px;margin-bottom:16px;">⚠️</div><div style="font-size:22px;font-weight:700;color:#ff003c;margin-bottom:8px;letter-spacing:2px;">SESSION EXPIRED</div><div style="font-size:14px;color:#888;margin-bottom:24px;">Your session has timed out due to inactivity.<br>Please refresh the page to continue.</div><button onclick="this.closest(\'#__bb_overlay\').remove()" style="background:#ff003c;color:white;border:none;padding:12px 32px;border-radius:6px;font-size:14px;cursor:pointer;letter-spacing:1px;">REFRESH</button></div>';
        document.body.appendChild(overlay);
      })();
    `,
  },
  {
    id: 'fake-loading-spinner',
    name: 'Fake Loading Screen',
    description: 'Blocks the viewport with a fake loading spinner for 7 seconds',
    minDifficulty: 'easy',
    healthDamage: 6,
    cooldownMs: 15000,
    generatePayload: () => `
      (function() {
        const existing = document.getElementById('__bb_spinner');
        if (existing) return;
        const spinner = document.createElement('div');
        spinner.id = '__bb_spinner';
        spinner.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;';
        spinner.innerHTML = '<div style="width:56px;height:56px;border:5px solid #eee;border-top-color:#0066cc;border-radius:50%;animation:__bb_spin 0.8s linear infinite;margin-bottom:20px;"></div><div style="font-size:16px;color:#333;">Loading, please wait...</div><style>@keyframes __bb_spin{to{transform:rotate(360deg)}}</style>';
        document.body.appendChild(spinner);
        setTimeout(() => spinner.remove(), 7000);
      })();
    `,
  },
  {
    id: 'button-camouflage',
    name: 'Button Camouflage',
    description: 'Makes all buttons invisible by matching the background color',
    minDifficulty: 'medium',
    healthDamage: 8,
    cooldownMs: 18000,
    generatePayload: () => `
      (function() {
        const bg = getComputedStyle(document.body).backgroundColor || '#ffffff';
        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a.button, .btn').forEach(el => {
          el.style.setProperty('background', bg, 'important');
          el.style.setProperty('background-color', bg, 'important');
          el.style.setProperty('color', bg, 'important');
          el.style.setProperty('border-color', bg, 'important');
          el.style.setProperty('box-shadow', 'none', 'important');
        });
        setTimeout(() => {
          document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(el => {
            el.style.removeProperty('background');
            el.style.removeProperty('background-color');
            el.style.removeProperty('color');
            el.style.removeProperty('border-color');
            el.style.removeProperty('box-shadow');
          });
        }, 10000);
      })();
    `,
  },
  {
    id: 'scroll-hijack',
    name: 'Scroll Hijack',
    description: 'Randomly scrolls the page for 6 seconds',
    minDifficulty: 'medium',
    healthDamage: 10,
    cooldownMs: 20000,
    generatePayload: () => `
      (function() {
        let count = 0;
        const interval = setInterval(() => {
          window.scrollTo({ top: Math.random() * document.body.scrollHeight, behavior: 'smooth' });
          count++;
          if (count >= 18) clearInterval(interval);
        }, 350);
      })();
    `,
  },
  {
    id: 'modal-dialog',
    name: 'Dialog Barrage',
    description: 'Fires 3 staggered confirmation dialogs',
    minDifficulty: 'hard',
    healthDamage: 12,
    cooldownMs: 25000,
    generatePayload: () => `
      (function() {
        const messages = [
          'Are you sure you want to leave this page?',
          'Your changes may not be saved. Continue?',
          'Warning: This action cannot be undone.'
        ];
        messages.forEach((msg, i) => {
          setTimeout(() => {
            const d = document.createElement('dialog');
            d.style.cssText = 'border:1px solid #ccc;border-radius:8px;padding:24px;font-family:sans-serif;background:white;max-width:340px;z-index:' + (2147483640 + i);
            d.innerHTML = '<p style="margin:0 0 16px;font-size:15px;">' + msg + '</p><div style="display:flex;gap:10px;justify-content:flex-end;"><button onclick="this.closest(\'dialog\').close()" style="padding:8px 18px;border:1px solid #ccc;background:#f5f5f5;border-radius:4px;cursor:pointer;">Cancel</button><button onclick="this.closest(\'dialog\').close()" style="padding:8px 18px;background:#0066cc;color:white;border:none;border-radius:4px;cursor:pointer;">OK</button></div>';
            document.body.appendChild(d);
            d.showModal();
          }, i * 1800);
        });
      })();
    `,
  },
  {
    id: 'element-removal',
    name: 'Element Obliterator',
    description: 'Removes key interactive elements from the page',
    minDifficulty: 'hard',
    healthDamage: 20,
    cooldownMs: 30000,
    generatePayload: (options) => `
      (function() {
        const selector = ${JSON.stringify(options?.targetSelector || 'form button[type="submit"], input[type="submit"], [data-action="add-to-cart"], #add-to-cart, .add-to-cart, [name="submit"]')};
        try {
          document.querySelectorAll(selector).forEach(el => el.remove());
        } catch(e) {
          document.querySelectorAll('button[type="submit"]').forEach(el => el.remove());
        }
      })();
    `,
  },
  {
    id: 'animation-flood',
    name: 'Visual Chaos',
    description: 'Makes the entire page shake violently for 8 seconds',
    minDifficulty: 'nightmare',
    healthDamage: 15,
    cooldownMs: 25000,
    generatePayload: () => `
      (function() {
        const id = '__bb_chaos_style';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '* { animation: __bb_shake 0.12s infinite !important; } @keyframes __bb_shake { 0%,100%{transform:translate(0,0) rotate(0)} 25%{transform:translate(-3px,-2px) rotate(-0.5deg)} 50%{transform:translate(2px,3px) rotate(0.5deg)} 75%{transform:translate(3px,-1px) rotate(-0.3deg)} }';
        document.head.appendChild(style);
        setTimeout(() => style.remove(), 8000);
      })();
    `,
  },
  {
    id: 'custom-injection',
    name: 'Custom Injection',
    description: 'AI-generated targeted disruption based on current DOM state and attacker behavior',
    minDifficulty: 'medium',
    healthDamage: 15,
    cooldownMs: 20000,
    generatePayload: () => '', // placeholder — real payload comes from generateCustomInjection()
  },
  {
    id: 'coordinated-assault',
    name: 'Coordinated Assault',
    description: 'Hides navigation, fakes a redirect countdown, and blocks all clicks for 10s',
    minDifficulty: 'nightmare',
    healthDamage: 30,
    cooldownMs: 45000,
    generatePayload: () => `
      (function() {
        // Hide nav
        document.querySelectorAll('nav, header, [role="navigation"]').forEach(el => { el.style.setProperty('display','none','important'); });
        // Overlay with countdown
        const overlay = document.createElement('div');
        overlay.id = '__bb_assault';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:2147483647;color:#00ff00;font-family:monospace;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:28px;';
        let count = 8;
        overlay.innerHTML = '<div>REDIRECTING TO SECURE PAGE IN <span id="__bb_cdown">' + count + '</span>s</div><div style="font-size:13px;margin-top:12px;color:#666;">DO NOT CLOSE OR REFRESH THIS TAB</div>';
        document.body.appendChild(overlay);
        const iv = setInterval(() => {
          count--;
          const el = document.getElementById('__bb_cdown');
          if (el) el.textContent = String(count);
          if (count <= 0) {
            clearInterval(iv);
            overlay.remove();
            document.querySelectorAll('nav, header, [role="navigation"]').forEach(el => el.style.removeProperty('display'));
          }
        }, 1000);
        // Block clicks
        const blocker = (e) => { e.preventDefault(); e.stopPropagation(); };
        document.addEventListener('click', blocker, true);
        setTimeout(() => document.removeEventListener('click', blocker, true), 10000);
      })();
    `,
  },
];

export const DIFFICULTY_DISRUPTIONS: Record<string, string[]> = {
  easy:      ['popup-overlay', 'fake-loading-spinner'],
  medium:    ['popup-overlay', 'fake-loading-spinner', 'button-camouflage', 'scroll-hijack', 'custom-injection'],
  hard:      ['popup-overlay', 'fake-loading-spinner', 'button-camouflage', 'scroll-hijack', 'modal-dialog', 'element-removal', 'custom-injection'],
  nightmare: ['popup-overlay', 'fake-loading-spinner', 'button-camouflage', 'scroll-hijack', 'modal-dialog', 'element-removal', 'animation-flood', 'coordinated-assault', 'custom-injection'],
};

export function getDisruptionById(id: string): DisruptionDefinition | undefined {
  return DISRUPTIONS.find(d => d.id === id);
}

export function getDisruptionsForDifficulty(difficulty: string): DisruptionDefinition[] {
  const ids = DIFFICULTY_DISRUPTIONS[difficulty] ?? DIFFICULTY_DISRUPTIONS.easy;
  return DISRUPTIONS.filter(d => ids.includes(d.id));
}
