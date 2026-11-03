// Contact form (2026-11-02). Sends the message to Monaidea's contact Worker on Cloudflare
// (https://forms.monaidea.com, source in worker/), which checks Cloudflare Turnstile and emails it
// to support@monaidea.com through Postmark. Turnstile loads only once someone starts using the form.
(() => {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const WORKER_URL = 'https://forms.monaidea.com';
  const SITEKEY = '0x4AAAAAAFxf8Y0qokk1C-_6'; // site key of Monaidea's Turnstile widget (public; owner, 2026-11-02)
  const EMAIL = 'support@monaidea.com';
  const box = form.querySelector('.ts');
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  let widget = null, token = '', loading = null, broken = false, waiters = [];

  const say = (text, state) => { status.textContent = text; status.dataset.state = state || ''; };
  const settle = (value) => { const w = waiters; waiters = []; w.forEach((resolve) => resolve(value)); };

  function load() {
    if (loading) return loading;
    if (!SITEKEY) { broken = true; settle(''); return (loading = Promise.resolve()); }
    loading = new Promise((resolve, reject) => {
      window.monaideaTurnstileReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=monaideaTurnstileReady';
      s.async = true;
      s.onerror = reject;
      document.head.appendChild(s);
    }).then(() => {
      widget = window.turnstile.render(box, {
        sitekey: SITEKEY,
        theme: 'dark',
        size: window.matchMedia('(max-width: 420px)').matches ? 'compact' : 'normal',
        appearance: 'interaction-only',
        callback: (t) => { token = t; broken = false; settle(t); },
        'expired-callback': () => { token = ''; },
        'error-callback': () => { token = ''; broken = true; settle(''); return true; },
      });
    }).catch(() => { broken = true; settle(''); });
    return loading;
  }

  // Resolves with a Turnstile token, or '' if none arrives within `ms` or the check fails.
  function waitForToken(ms) {
    if (token) return Promise.resolve(token);
    if (broken) return Promise.resolve('');
    return new Promise((resolve) => {
      waiters.push(resolve);
      setTimeout(() => resolve(token), ms);
    });
  }

  form.addEventListener('focusin', load, { once: true });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    load();
    button.disabled = true;
    try {
      if (!token) say('One moment: checking that you are not a bot…', 'pending');
      const t = await waitForToken(20000);
      if (!t) {
        say(broken
          ? `Our spam check could not load. Please email ${EMAIL} instead.`
          : 'Please complete the check above the button, then press Send again.', 'error');
        return;
      }
      token = '';
      say('Sending…', 'pending');
      const data = new FormData(form);
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          interest: data.get('topic'),
          message: data.get('message'),
          website: data.get('website'),
          turnstileToken: t,
        }),
      });
      let result = {};
      try { result = await res.json(); } catch { /* not JSON */ }
      if (res.ok && result.ok) {
        form.reset();
        say('Thanks! Your message is on its way. We answer within two business days.', 'success');
      } else {
        const code = result.code ? ` (${result.code})` : '';
        say((result.error || `Something went wrong. Please try again, or email ${EMAIL}.`) + code, 'error');
      }
    } catch {
      say(`We could not reach our server. Please email ${EMAIL} instead.`, 'error');
    } finally {
      // Tokens work once: get a fresh one for the next message.
      if (widget !== null) { try { window.turnstile.reset(widget); } catch { /* ignore */ } }
      button.disabled = false;
    }
  });
})();
