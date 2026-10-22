(function () {
  "use strict";

  const route = window.ROUTE;
  const points = route.points;
  const $ = (sel) => document.querySelector(sel);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /* ---------- Header ---------- */
  $("#route-title").textContent = route.title;
  $("#route-subtitle").textContent = route.subtitle;
  $("#route-intro").textContent = route.intro;
  document.title = `${route.title} — ${route.subtitle}`;

  $("#toc").innerHTML = points
    .map((p, i) => `<li><a href="#stop-${i + 1}"><b>${String(i + 1).padStart(2, "0")}</b>${esc(p.name)}</a></li>`)
    .join("");

  /* ---------- Sections ---------- */
  function metaRow(label, value) {
    return value ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : "";
  }

  function photoBlock(p) {
    const ph = p.photo || {};
    if (!ph.src) {
      return `<figure class="photo"><div class="photo__frame photo__frame--empty"></div></figure>`;
    }
    const credit = [ph.author && `Фото: ${esc(ph.author)}`, ph.license && esc(ph.license)].filter(Boolean).join(" · ");
    const link = ph.page ? ` · <a href="${esc(ph.page)}" target="_blank" rel="noopener">источник</a>` : "";
    return `
      <figure class="photo">
        <div class="photo__frame">
          <img src="${esc(ph.src)}" alt="${esc(ph.alt || p.name)}" loading="lazy" decoding="async"
               onerror="this.parentNode.classList.add('photo__frame--empty');this.remove();">
        </div>
        ${credit || link ? `<figcaption>${credit}${link}</figcaption>` : ""}
      </figure>`;
  }

  function sectionHtml(p, i) {
    const n = i + 1;
    const travel = p.travel
      ? `<span class="transition__travel">${esc(p.travel.mode)}${p.travel.time ? ", " + esc(p.travel.time) : ""}${p.travel.text ? " — " + esc(p.travel.text) : ""}</span>`
      : "";
    const transitionLabel = i === 0 ? "Почему начинаем здесь" : `Почему от «${esc(points[i - 1].name)}» — сюда`;
    return `
      <section class="stop${i === 0 ? " stop--first" : ""}" id="stop-${n}" data-index="${i}">
        <div class="transition">
          <span class="transition__label">${transitionLabel}</span>
          <p>${esc(p.transition)}</p>
          ${travel}
        </div>

        <div class="stop__head">
          <div class="stop__num">${String(n).padStart(2, "0")}</div>
          <h2 class="stop__name">${esc(p.name)}</h2>
          ${p.originalName ? `<p class="stop__original"><span>Оригинальное название</span>${esc(p.originalName)}</p>` : ""}
        </div>

        <dl class="meta">
          ${metaRow("Годы", p.dates)}
          ${metaRow("Авторы", p.authors)}
          ${metaRow("Адрес", p.address)}
          ${metaRow("Метро", p.metro)}
        </dl>

        ${p.notice ? `<p class="notice" role="note"><b>Внимание</b>${esc(p.notice)}</p>` : ""}

        ${photoBlock(p)}

        ${p.lead ? `<p class="lead">${esc(p.lead)}</p>` : ""}

        ${p.significance ? `<h3 class="block-title">Почему это важно</h3><p class="significance">${esc(p.significance)}</p>` : ""}

        ${p.facts && p.facts.length ? `<h3 class="block-title">Чего не расскажут в путеводителе</h3>
        <ol class="facts">${p.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ol>` : ""}

        ${p.sources && p.sources.length ? `<h3 class="block-title">Источники</h3>
        <ul class="sources">${p.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ul>` : ""}
      </section>`;
  }

  $("#stops").innerHTML = points.map(sectionHtml).join("");
  const sections = [...document.querySelectorAll(".stop")];

  /* ---------- Map ---------- */
  const map = L.map("map", { zoomControl: true, scrollWheelZoom: true, attributionControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    className: "tiles",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">участники OpenStreetMap</a>'
  }).addTo(map);

  const latlngs = points.map((p) => p.coords);
  L.polyline(latlngs, { color: "#161412", weight: 7, opacity: 0.9 }).addTo(map);
  L.polyline(latlngs, { color: "#d2261b", weight: 3, dashArray: "8 8" }).addTo(map);
  const routeBounds = L.latLngBounds(latlngs).pad(0.08);
  map.fitBounds(routeBounds);

  const markers = points.map((p, i) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="pin">${i + 1}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
    const m = L.marker(p.coords, { icon, title: p.name, keyboard: true }).addTo(map);
    m.bindTooltip(`${i + 1}. ${p.name}`, { className: "pin-tip", direction: "top", offset: [0, -18] });
    m.on("click", () => goTo(i));
    return m;
  });

  /* ---------- Active stop ---------- */
  let active = -1;
  let programmaticScroll = false;

  function setActive(i, { fly = true } = {}) {
    if (i === active) return;
    if (active >= 0) {
      sections[active].classList.remove("is-active");
      markers[active].getElement()?.firstElementChild?.classList.remove("is-active");
    }
    active = i;
    sections[i].classList.add("is-active");
    const el = markers[i].getElement()?.firstElementChild;
    el?.classList.add("is-active");
    markers[i].setZIndexOffset(1000);
    markers.forEach((m, k) => k !== i && m.setZIndexOffset(0));
    $("#hud-label").textContent = `${i + 1} / ${points.length}`;
    if (fly) flyTo(points[i].coords, 15);
  }

  // Leaflet's flyTo yields NaN when the map is hidden (zero size, background tab)
  // or already at the target, so fall back to an instant jump in those cases.
  function flyTo(latlng, zoom) {
    const size = map.getSize();
    const here = map.latLngToContainerPoint(latlng).distanceTo(size.divideBy(2));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!size.x || !size.y || document.hidden || reduced || (here < 1 && map.getZoom() === zoom)) {
      map.setView(latlng, zoom, { animate: false });
      return;
    }
    map.flyTo(latlng, zoom, { duration: 0.8 });
  }

  function goTo(i) {
    i = Math.max(0, Math.min(points.length - 1, i));
    programmaticScroll = true;
    setActive(i);
    sections[i].scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    clearTimeout(goTo.t);
    goTo.t = setTimeout(() => (programmaticScroll = false), 900);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (programmaticScroll) return;
      const visible = entries.filter((e) => e.isIntersecting);
      if (!visible.length) return;
      const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      setActive(Number(top.target.dataset.index));
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((s) => observer.observe(s));

  $("#prev-stop").addEventListener("click", () => goTo(active < 0 ? 0 : active - 1));
  $("#next-stop").addEventListener("click", () => goTo(active < 0 ? 0 : active + 1));
  $("#fit-route").addEventListener("click", () => map.flyToBounds(routeBounds, { duration: 0.8 }));

  // Hero links should also move the map.
  document.querySelectorAll('a[href^="#stop-"]').forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      goTo(Number(a.getAttribute("href").replace("#stop-", "")) - 1);
    })
  );

  /* ---------- Start ---------- */
  const start = Number((location.hash.match(/^#stop-(\d+)$/) || [])[1]) - 1;
  if (start >= 0 && start < points.length) setTimeout(() => goTo(start), 50);
})();
