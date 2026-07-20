/* Tuned Yota — on-site "Shop All AMSOIL" store. Renders the full AMSOIL catalog
   (amsoil-catalog.json, built from AMSOIL's sitemap) with search + category
   filters. Every "Buy" hands off to amsoil.com under the ZO referral (buyUrl
   already carries ?zo=), so the sale is credited to Tuned Yota. */
(function () {
  var CAT = null, ACTIVE = "All", Q = "", grid, cats, count;
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function filtered() {
    var q = Q.toLowerCase();
    return CAT.products.filter(function (p) {
      if (ACTIVE !== "All" && p.category !== ACTIVE) return false;
      if (!q) return true;
      return (p.name + " " + p.code + " " + p.category).toLowerCase().indexOf(q) >= 0;
    });
  }
  function render() {
    var items = filtered(), CAP = 240;
    count.textContent = items.length + " of " + CAT.count + " products";
    grid.innerHTML = items.slice(0, CAP).map(function (p) {
      return '<div class="asx-card"><div class="asx-cat">' + esc(p.category) + "</div>" +
        '<div class="asx-name">' + esc(p.name) + "</div>" +
        '<div class="asx-code">Stock #' + esc(p.code) + "</div>" +
        '<a class="asx-buy" href="' + esc(p.buyUrl) + '" target="_blank" rel="noopener">Buy at AMSOIL &rarr;</a></div>';
    }).join("") +
      (items.length > CAP ? '<p class="asx-more">Showing the first ' + CAP + " — search or pick a category to narrow.</p>"
        : (items.length ? "" : '<p class="asx-more">No products match — try a different term.</p>'));
  }
  function renderCats() {
    var order = Object.keys(CAT.categories).sort(function (a, b) { return CAT.categories[b] - CAT.categories[a]; });
    cats.innerHTML = ["All"].concat(order).map(function (c) {
      var n = c === "All" ? CAT.count : CAT.categories[c];
      return '<button class="asx-chip' + (c === ACTIVE ? " on" : "") + '" type="button" data-c="' + esc(c) + '">' +
        esc(c) + " <span>" + n + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(cats.querySelectorAll(".asx-chip"), function (b) {
      b.addEventListener("click", function () { ACTIVE = b.getAttribute("data-c"); renderCats(); render(); });
    });
  }
  function init() {
    grid = document.getElementById("asx-grid"); cats = document.getElementById("asx-cats"); count = document.getElementById("asx-count");
    if (!grid) return;
    fetch("amsoil-catalog.json").then(function (r) { return r.json(); }).then(function (j) {
      CAT = j; renderCats(); render();
    }).catch(function () {
      grid.innerHTML = '<p class="asx-more">The catalog is unavailable right now — <a href="' +
        (window.amsoilUrl ? window.amsoilUrl("/shop/") : "https://www.amsoil.com/shop/") +
        '" target="_blank" rel="noopener">browse on AMSOIL.com</a>.</p>';
    });
    var s = document.getElementById("ag-search");
    if (s) s.addEventListener("input", function () { Q = this.value.trim(); if (CAT) render(); });
    var btn = document.getElementById("ag-search-btn");
    if (btn) btn.addEventListener("click", function () {
      var st = document.getElementById("store"); if (st) st.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  if (document.readyState !== "loading") init(); else document.addEventListener("DOMContentLoaded", init);
})();
