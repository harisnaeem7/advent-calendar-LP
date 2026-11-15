/* Twelve Days of Framar · Advent Calendar section behaviour.
   Progressive enhancement only: without JS the page still shows, the
   accordion works (<details>) and the product form posts to /cart/add. */
if (!customElements.get('advent-calendar')) {
  class AdventCalendar extends HTMLElement {
    connectedCallback() {
      this.initGallery();
      this.initQuantity();
      this.initCartForm();
      this.initCountdown();
      this.initVideos();
    }

    disconnectedCallback() {
      clearInterval(this.countdownTimer);
    }

    /* ---------- gallery thumbnails ---------- */
    initGallery() {
      const main = this.querySelector('[data-gallery-main]');
      const thumbs = [...this.querySelectorAll('[data-gallery-thumb]')];
      if (!main || !thumbs.length) return;
      thumbs.forEach((btn) => {
        btn.addEventListener('click', () => {
          thumbs.forEach((t) => t.setAttribute('aria-pressed', String(t === btn)));
          main.src = btn.dataset.src;
          main.srcset = btn.dataset.srcset || '';
          main.alt = btn.dataset.alt || '';
        });
      });
    }

    /* ---------- quantity stepper ---------- */
    initQuantity() {
      const input = this.querySelector('[data-qty-input]');
      if (!input) return;
      const label = this.querySelector('[data-cart-label]');
      const unit = Number(label?.dataset.unitPrice || 0);
      const min = Number(input.min) || 1;
      const max = Number(input.max) || 10;
      const update = (v) => {
        input.value = Math.max(min, Math.min(max, v || min));
        if (label && unit) label.textContent = `${label.dataset.prefix} · ${this.money(unit * Number(input.value))}`;
      };
      this.querySelector('[data-qty-dec]')?.addEventListener('click', () => update(Number(input.value) - 1));
      this.querySelector('[data-qty-inc]')?.addEventListener('click', () => update(Number(input.value) + 1));
      input.addEventListener('change', () => update(Number(input.value)));
    }

    money(cents) {
      const fmt = this.dataset.moneyFormat || '${{amount}}';
      const amount = (cents / 100).toFixed(2);
      return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
        if (key === 'amount_no_decimals') return Math.round(cents / 100).toLocaleString('en-US');
        if (key === 'amount_with_comma_separator') return amount.replace('.', ',');
        return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
      });
    }

    /* ---------- add to cart via AJAX (falls back to normal form post) ---------- */
    initCartForm() {
      const form = this.querySelector('form[data-advent-cart]');
      if (!form || !window.fetch) return;
      const submit = form.querySelector('[type="submit"]');
      const label = form.querySelector('[data-cart-label]');
      const error = form.querySelector('[data-cart-error]');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submit.disabled) return;
        const before = label.textContent;
        submit.disabled = true;
        if (error) error.hidden = true;
        try {
          const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
          const body = new FormData(form);
          // Dawn (and Dawn-based themes): use the theme's own cart drawer / notification,
          // exactly like its product form does: ask for its sections, then let it render + open.
          const cart = document.querySelector('cart-drawer') || document.querySelector('cart-notification');
          const themeCart = cart && typeof cart.getSectionsToRender === 'function' && typeof cart.renderContents === 'function';
          const bubble = document.getElementById('cart-icon-bubble');
          if (themeCart) {
            body.append('sections', cart.getSectionsToRender().map((s) => s.id));
            body.append('sections_url', window.location.pathname);
            if (typeof cart.setActiveElement === 'function') cart.setActiveElement(submit);
          } else if (bubble) {
            body.append('sections', 'cart-icon-bubble');
          }
          const res = await fetch(`${root}cart/add.js`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body,
          });
          const data = await res.json();
          if (!res.ok || data.status) throw new Error(data.description || data.message || window.cartStrings?.error);
          label.textContent = form.dataset.addedLabel;
          if (themeCart && data.sections) {
            cart.renderContents(data); // updates the drawer + cart count and opens the drawer
            if (cart.classList.contains('is-empty')) cart.classList.remove('is-empty');
          } else if (!cart && window.routes && window.routes.cart_url) {
            // Dawn with cart type "Page": go to the cart, like the theme's own button does
            window.location = window.routes.cart_url;
            return;
          } else if (bubble && data.sections && data.sections['cart-icon-bubble']) {
            // other themes without a drawer: just refresh the cart count in the header
            const html = new DOMParser().parseFromString(data.sections['cart-icon-bubble'], 'text/html');
            const fresh = html.querySelector('.shopify-section');
            if (fresh) bubble.innerHTML = fresh.innerHTML;
          }
          if (typeof window.publish === 'function' && window.PUB_SUB_EVENTS) {
            window.publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'advent-calendar', productVariantId: body.get('id'), cartData: data });
          }
          // other themes: let them refresh their cart bubble/drawer
          document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
          document.documentElement.dispatchEvent(new CustomEvent('cart:item-added', { bubbles: true, detail: data }));
          setTimeout(() => { label.textContent = before; submit.disabled = false; }, 2200);
        } catch (err) {
          label.textContent = before;
          submit.disabled = false;
          if (error) { error.textContent = err.message; error.hidden = false; }
        }
      });
    }

    /* ---------- "order within …" countdown ---------- */
    initCountdown() {
      const el = this.querySelector('[data-ship-countdown]');
      if (!el) return;
      const cutoff = Date.parse(el.dataset.cutoff);
      if (Number.isNaN(cutoff)) return;
      const tick = () => {
        const ms = cutoff - Date.now();
        const box = el.closest('.adv-ship');
        if (ms <= 0) { if (box) box.hidden = true; clearInterval(this.countdownTimer); return; }
        const m = Math.floor(ms / 60000);
        el.textContent = `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h ${m % 60}m`;
      };
      tick();
      this.countdownTimer = setInterval(tick, 30000);
    }

    /* ---------- video cards: swap the poster for the video in place ---------- */
    initVideos() {
      this.querySelectorAll('[data-video-src]').forEach((card) => {
        const src = card.dataset.videoSrc;
        const trigger = card.querySelector('.adv-video__trigger');
        if (!src || !trigger) return;
        trigger.addEventListener('click', () => {
          if (card.classList.contains('is-playing')) return;
          this.querySelectorAll('.adv-video.is-playing video').forEach((v) => v.pause());
          const video = document.createElement('video');
          video.src = src;
          video.controls = true;
          video.playsInline = true;
          video.muted = true;
          video.autoplay = true;
          card.appendChild(video);
          card.classList.add('is-playing');
          video.focus();
        });
      });
    }
  }
  customElements.define('advent-calendar', AdventCalendar);
}

/* Swipe rows (reviews, videos) already scroll with a finger. This lets a mouse drag them too,
   e.g. when the phone layout is viewed in a narrow desktop window. */
if (!window.advDragScroll) {
  window.advDragScroll = true;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const row = e.target.closest('[data-drag-scroll]');
    if (!row || row.scrollWidth <= row.clientWidth) return;
    e.preventDefault();
    const startX = e.clientX;
    const startLeft = row.scrollLeft;
    let moved = false;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        row.classList.add('is-dragging');
      }
      if (moved) row.scrollLeft = startLeft - dx;
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (!moved) return;
      row.classList.remove('is-dragging');
      // a drag shouldn't also count as a click on a card (e.g. play a video)
      const stop = (c) => { c.preventDefault(); c.stopPropagation(); };
      row.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => row.removeEventListener('click', stop, { capture: true }), 0);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
}
