// The home page's shops (a list with data-live, the shops index's list of
// shops as data): the shops written on the page keep their words; a shop the
// platform has opened since is added from the list, and one it has taken down
// leaves. Its colours come by position (site.css). Without the list, the page
// stays as written.
const shops = document.querySelector('.shops[data-live]');
if (shops && window.fetch) {
  fetch(shops.dataset.live, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.shops)) return;
      const el = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.textContent = text;
        return e;
      };
      const written = new Map([...shops.querySelectorAll('.shop a.btn')].map((a) => [a.href, a.closest('.shop')]));
      const open = new Set();
      for (const s of data.shops) {
        if (!s || typeof s.name !== 'string' || !s.name || typeof s.address !== 'string' || !s.address.startsWith('https://')) continue;
        open.add(s.address);
        if (written.has(s.address)) continue;
        const shop = el('li', 'shop');
        const title = el('h3');
        title.append(el('span', 'tape', s.name));
        shop.append(title);
        const count = Number.isInteger(s.products) && s.products > 0 ? `${s.products} ${s.products === 1 ? 'tool' : 'tools'}` : '';
        const about = typeof s.description === 'string' && s.description ? s.description : count;
        if (about) shop.append(el('p', '', about));
        const examples = Array.isArray(s.examples) ? s.examples.filter((x) => typeof x === 'string' && x).slice(0, 3) : [];
        if (examples.length) shop.append(el('p', 'kinds', `${examples.join(', ')}.`));
        const go = el('a', 'btn', `Open ${s.name}`);
        go.href = s.address;
        shop.append(go);
        shops.append(shop);
      }
      for (const [address, shop] of written) if (!open.has(address)) shop.remove();
    })
    .catch(() => {});
}
