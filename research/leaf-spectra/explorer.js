/* Leaf Spectra Explorer
 * Interactive viewer for the leaf drydown spectral dataset from
 * Allen et al. (2026), New Phytologist. Data source: EcoSIS
 * (doi:10.21232/egGyynzX), pre-processed into data.json.
 */
(function () {
  "use strict";

  // Bump this whenever data.json's contents change -- browsers otherwise
  // happily serve a stale cached copy of a same-URL fetch() indefinitely.
  var DATA_VERSION = 3;
  var DATA_URL = "/research/leaf-spectra/data.json?v=" + DATA_VERSION;

  var state = {
    data: null,
    speciesCode: null,
    leafIdx: 0,
    pointIdx: 0,
    playing: false,
    timer: null
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  // <option> elements can't render nested markup (like <em>), so italics for
  // binomial names are faked using the Unicode "Mathematical Italic" letter
  // block -- these are distinct codepoints, not a font style, so they render
  // slanted in any font/browser without needing CSS on the option itself.
  function toItalicUnicode(str) {
    var out = "";
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      var code = str.charCodeAt(i);
      if (code >= 65 && code <= 90) { // A-Z
        out += String.fromCodePoint(0x1D434 + (code - 65));
      } else if (code >= 97 && code <= 122) { // a-z
        out += (ch === "h") ? "ℎ" : String.fromCodePoint(0x1D44E + (code - 97));
      } else {
        out += ch;
      }
    }
    return out;
  }

  function init() {
    els.speciesSelect = $("lse-species-select");
    els.leafSelect = $("lse-leaf-select");
    els.slider = $("lse-slider");
    els.sliderCaption = $("lse-slider-caption");
    els.playBtn = $("lse-play-btn");
    els.lwpValue = $("lse-lwp-value");
    els.ewtValue = $("lse-ewt-value");
    els.statusBadge = $("lse-status-badge");
    els.speciesInfo = $("lse-species-info");
    els.chart = $("lse-chart");
    els.controlsPanel = $("lse-controls-panel");
    els.chartPanel = $("lse-chart-panel");
    els.pvChart = $("lse-pv-chart");
    els.ewtChart = $("lse-ewt-chart");
    els.ewtLegend = $("lse-ewt-legend");

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) { throw new Error("Failed to load data.json (" + res.status + ")"); }
        return res.json();
      })
      .then(function (json) {
        state.data = json;
        populateSpecies();
        buildChart();
        buildPvChart();
        buildEwtChart();
        buildEwtLegend();
        wireControls();
        syncPanelHeights();
        syncBottomPanelHeights();
        // Poppins may finish loading/swapping just after this runs, which can
        // shift text heights slightly -- re-sync once more after a beat.
        setTimeout(function () {
          syncPanelHeights();
          syncBottomPanelHeights();
        }, 300);
        var resizeTimer = null;
        window.addEventListener("resize", function () {
          if (resizeTimer) { clearTimeout(resizeTimer); }
          resizeTimer = setTimeout(function () {
            syncPanelHeights();
            syncBottomPanelHeights();
          }, 150);
        });
      })
      .catch(function (err) {
        els.chart.innerHTML = '<div class="lse-loading">Could not load the spectral dataset (' +
          err.message + '). Please try reloading the page.</div>';
        console.error(err);
      });
  }

  function populateSpecies() {
    var order = state.data.species_order;
    els.speciesSelect.innerHTML = "";
    order.forEach(function (code) {
      var sp = state.data.species[code];
      if (!sp) { return; }
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = sp.common + " (" + toItalicUnicode(sp.binomial) + ")";
      els.speciesSelect.appendChild(opt);
    });
    var preferred = state.data.default_species;
    state.speciesCode = (preferred && state.data.species[preferred]) ?
      preferred : order.find(function (c) { return state.data.species[c]; });
    els.speciesSelect.value = state.speciesCode;
    populateLeaves();
  }

  function populateLeaves() {
    var sp = state.data.species[state.speciesCode];
    els.leafSelect.innerHTML = "";
    sp.leaves.forEach(function (leaf, i) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = "Leaf " + (i + 1);
      els.leafSelect.appendChild(opt);
    });
    state.leafIdx = 0;
    els.leafSelect.value = 0;
    state.pointIdx = 0;
    updateSliderRange();
    updateSpeciesInfo();
  }

  function updateSliderRange() {
    var leaf = currentLeaf();
    els.slider.max = leaf.points.length - 1;
    els.slider.value = state.pointIdx;
  }

  function updateSpeciesInfo() {
    var sp = state.data.species[state.speciesCode];
    els.speciesInfo.innerHTML =
      "<b>" + sp.common + "</b> &mdash; dry leaf mass per area: " + sp.lma_mg_cm2 +
      " mg/cm&sup2;; turgor loss point: " + sp.tlp_mpa + " MPa";
  }

  function currentLeaf() {
    return state.data.species[state.speciesCode].leaves[state.leafIdx];
  }

  function currentPoint() {
    return currentLeaf().points[state.pointIdx];
  }

  function buildChart() {
    var wavelengths = state.data.wavelengths;
    var pt = currentPoint();

    var trace = {
      x: wavelengths,
      y: pt.refl,
      mode: "lines",
      line: { color: "#54CA95", width: 2.5 },
      fill: "tozeroy",
      fillcolor: "rgba(84, 202, 149, 0.12)",
      hovertemplate: "%{x} nm<br>reflectance %{y:.3f}<extra></extra>",
      name: "Reflectance"
    };

    var layout = {
      margin: { t: 30, r: 20, b: 55, l: 55 },
      xaxis: {
        title: "Wavelength (nm)",
        range: [350, 2500],
        gridcolor: "#eee"
      },
      yaxis: {
        title: "Reflectance",
        range: [0, 0.7],
        gridcolor: "#eee"
      },
      font: { family: "Poppins, Helvetica, sans-serif", color: "#555", size: 12 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      showlegend: false
    };

    var config = { responsive: true, displayModeBar: false };

    // The chart div starts with a "Loading..." placeholder in the page HTML;
    // Plotly.newPlot doesn't reliably clear pre-existing content on its own,
    // so clear it explicitly before creating the plot.
    els.chart.innerHTML = "";
    Plotly.newPlot(els.chart, [trace], layout, config);
    updateReadout();
  }

  function redrawTrace() {
    var pt = currentPoint();
    Plotly.restyle(els.chart, { y: [pt.refl] });
    updateReadout();
  }

  function padRange(min, max, frac) {
    var span = max - min;
    if (span <= 0) { span = Math.abs(max) || 1; }
    var pad = span * frac;
    return [min - pad, max + pad];
  }

  // ---- Pressure-volume curve panel (bottom left) ----
  // Rebuilt on every leaf/species change, since the axis range, raw
  // measurements, and modeled curve are all specific to the selected leaf.
  function buildPvChart() {
    var leaf = currentLeaf();
    var pt = currentPoint();

    var rawLwa = leaf.raw_points.map(function (p) { return p.lwa; });
    var rawLwp = leaf.raw_points.map(function (p) { return p.lwp; });
    var modLwa = leaf.points.map(function (p) { return p.lwa_g_cm2; });
    var modLwp = leaf.points.map(function (p) { return p.lwp; });

    var lwaRange = padRange(
      Math.min.apply(null, rawLwa.concat(modLwa)),
      Math.max.apply(null, rawLwa.concat(modLwa)), 0.06);
    var lwpRange = padRange(
      Math.min.apply(null, rawLwp.concat(modLwp)),
      Math.max.apply(null, rawLwp.concat(modLwp)), 0.08);

    var rawTrace = {
      x: rawLwa, y: rawLwp, mode: "markers",
      marker: { color: "rgba(84, 202, 149, 0.45)", size: 7, line: { width: 0 } },
      hoverinfo: "skip",
      name: "Measurements",
      showlegend: true
    };
    var modelTrace = {
      x: modLwa, y: modLwp, mode: "lines",
      line: { color: "#2a2a2a", width: 1.25 },
      hoverinfo: "skip",
      name: "Modeled fit",
      showlegend: true
    };
    var dotTrace = {
      x: [pt.lwa_g_cm2], y: [pt.lwp], mode: "markers",
      marker: { color: "#54CA95", size: 12, line: { color: "#2a2a2a", width: 2 } },
      hoverinfo: "skip",
      showlegend: false
    };

    var layout = {
      margin: { t: 10, r: 20, b: 55, l: 60 },
      xaxis: { title: "Leaf Water per Area (g/cm²)", range: lwaRange, gridcolor: "#eee" },
      yaxis: { title: "Water Potential (MPa)", range: lwpRange, gridcolor: "#eee" },
      font: { family: "Poppins, Helvetica, sans-serif", color: "#555", size: 12 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      showlegend: true,
      legend: {
        x: 0.02, y: 0.98, xanchor: "left", yanchor: "top",
        bgcolor: "rgba(255,255,255,0.75)",
        bordercolor: "#e3e8e6", borderwidth: 1,
        font: { size: 11 }
      }
    };

    Plotly.react(els.pvChart, [rawTrace, modelTrace, dotTrace], layout,
      { responsive: true, displayModeBar: false });
  }

  function updatePvDot() {
    var pt = currentPoint();
    Plotly.restyle(els.pvChart, { x: [[pt.lwa_g_cm2]], y: [[pt.lwp]] }, [2]);
  }

  // ---- LWA vs. EWT panel (bottom right, recreation of paper Fig. 3c) ----
  // The background (per-leaf raw points + regression lines + pooled fit) is
  // identical for every leaf/species, so it's built once; only the black dot
  // marking the current leaf/point moves after that.
  function buildEwtChart() {
    var panelData = state.data.ewt_panel;
    var colors = panelData.species_colors;
    var traces = [];

    state.data.species_order.forEach(function (code) {
      var pts = panelData.points_by_species[code];
      if (!pts || !pts.length) { return; }
      traces.push({
        x: pts.map(function (p) { return p.lwa; }),
        y: pts.map(function (p) { return p.ewt; }),
        mode: "markers",
        marker: { color: colors[code], size: 5, opacity: 0.25, line: { width: 0 } },
        hoverinfo: "skip"
      });
    });

    state.data.species_order.forEach(function (code) {
      var sp = state.data.species[code];
      if (!sp) { return; }
      sp.leaves.forEach(function (leaf) {
        var fit = leaf.ewt_fit;
        if (!fit) { return; }
        var x0 = fit.lwa_min, x1 = fit.lwa_max;
        traces.push({
          x: [x0, x1],
          y: [fit.slope * x0 + fit.intercept, fit.slope * x1 + fit.intercept],
          mode: "lines",
          line: { color: colors[code], width: 1.3 },
          hoverinfo: "skip"
        });
      });
    });

    var pooled = panelData.pooled;
    var xr = panelData.x_range;
    traces.push({
      x: [0, xr[1]],
      y: [pooled.intercept, pooled.slope * xr[1] + pooled.intercept],
      mode: "lines",
      line: { color: "#222", width: 1.6, dash: "dash" },
      hoverinfo: "skip"
    });

    var pt = currentPoint();
    var fit0 = currentLeaf().ewt_fit;
    var dotEwt = fit0 ? (fit0.slope * pt.lwa_g_cm2 + fit0.intercept) : null;
    els.ewtDotTraceIndex = traces.length;
    traces.push({
      x: [pt.lwa_g_cm2], y: [dotEwt], mode: "markers",
      marker: { color: "#111111", size: 11, line: { color: "#fff", width: 1.5 } },
      hoverinfo: "skip"
    });

    var layout = {
      margin: { t: 10, r: 20, b: 55, l: 60 },
      xaxis: { title: "Leaf Water per Area (g/cm²)", range: xr, gridcolor: "#eee" },
      yaxis: { title: "EWT (g/cm²)", range: panelData.y_range, gridcolor: "#eee" },
      font: { family: "Poppins, Helvetica, sans-serif", color: "#555", size: 12 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      showlegend: false
    };

    Plotly.newPlot(els.ewtChart, traces, layout, { responsive: true, displayModeBar: false });
  }

  function updateEwtDot() {
    var fit = currentLeaf().ewt_fit;
    if (!fit || els.ewtDotTraceIndex == null) { return; }
    var pt = currentPoint();
    var ewt = fit.slope * pt.lwa_g_cm2 + fit.intercept;
    Plotly.restyle(els.ewtChart, { x: [[pt.lwa_g_cm2]], y: [[ewt]] }, [els.ewtDotTraceIndex]);
  }

  function buildEwtLegend() {
    var panelData = state.data.ewt_panel;
    var colors = panelData.species_colors;
    var html = "";
    state.data.species_order.forEach(function (code) {
      if (!colors[code]) { return; }
      html += '<span class="lse-ewt-legend-item"><span class="lse-ewt-legend-swatch" style="background:' +
        colors[code] + '"></span>' + code.toUpperCase() + '</span>';
    });
    html += '<span class="lse-ewt-legend-item"><span class="lse-ewt-legend-swatch lse-ewt-legend-line">' +
      '</span>Lin. Reg. (All Data)</span>';
    els.ewtLegend.innerHTML = html;
  }

  // Keep the chart panel's height matched to the controls panel's actual
  // rendered height. This is done in JS rather than CSS because the chart
  // panel's height needs to feed back into Plotly's own pixel sizing, which
  // creates a height:100% circularity that flexbox can't resolve on its own.
  var MOBILE_BREAKPOINT = 768;

  function syncPanelHeights() {
    if (!els.controlsPanel || !els.chartPanel) { return; }

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      // Panels stack on mobile; let CSS handle sizing naturally.
      els.chartPanel.style.height = "";
      els.chart.style.height = "";
      if (window.Plotly && els.chart.data) { Plotly.Plots.resize(els.chart); }
      return;
    }

    var targetHeight = els.controlsPanel.offsetHeight;
    els.chartPanel.style.height = targetHeight + "px";

    var cs = window.getComputedStyle(els.chartPanel);
    var verticalChrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    var chartHeight = Math.max(targetHeight - verticalChrome, 300);
    els.chart.style.height = chartHeight + "px";

    if (window.Plotly && els.chart.data) {
      Plotly.Plots.resize(els.chart);
    }
  }

  // Both bottom panels share a single target height. That height is pinned
  // to a fixed fraction of the row's width -- rather than read live off
  // either panel's own column width -- so it stays put even though the two
  // columns have since gone back to an even 50/50 split. (The fraction
  // matches what a 46.67%-wide column used to produce, which is the height
  // that looked right.)
  var BOTTOM_PANEL_HEIGHT_FRACTION = 0.4667;

  function syncBottomPanelHeights() {
    var row = $("lse-row2");
    var pvPanel = $("lse-pv-panel");
    var ewtPanel = $("lse-ewt-panel");
    if (!row || !pvPanel || !ewtPanel) { return; }

    if (window.innerWidth < MOBILE_BREAKPOINT) {
      pvPanel.style.height = "";
      ewtPanel.style.height = "";
      if (window.Plotly && els.pvChart.data) { Plotly.Plots.resize(els.pvChart); }
      if (window.Plotly && els.ewtChart.data) { Plotly.Plots.resize(els.ewtChart); }
      return;
    }

    // -30 accounts for the ~15px Bootstrap column gutter on each side, which
    // the old 46.67%-wide column's own rendered width would have subtracted.
    var targetHeight = Math.round(row.offsetWidth * BOTTOM_PANEL_HEIGHT_FRACTION) - 30;
    ewtPanel.style.height = targetHeight + "px";
    pvPanel.style.height = targetHeight + "px";

    if (window.Plotly && els.pvChart.data) { Plotly.Plots.resize(els.pvChart); }
    if (window.Plotly && els.ewtChart.data) { Plotly.Plots.resize(els.ewtChart); }
  }

  function updateReadout() {
    var pt = currentPoint();
    var sp = state.data.species[state.speciesCode];
    var leaf = currentLeaf();

    els.lwpValue.textContent = pt.lwp.toFixed(2) + " MPa";
    els.ewtValue.textContent = pt.lwa_g_cm2.toFixed(4) + " g/cm²";
    els.sliderCaption.textContent =
      "Step " + (state.pointIdx + 1) + " of " + leaf.points.length + " (modeled)";

    var stressed = pt.lwp <= sp.tlp_mpa;
    els.statusBadge.textContent = stressed ? "Post turgor loss" : "Pre turgor loss";
    els.statusBadge.className = "lse-status-badge " +
      (stressed ? "lse-status-stressed" : "lse-status-hydrated");
  }

  function wireControls() {
    els.speciesSelect.addEventListener("change", function () {
      stopPlaying();
      state.speciesCode = els.speciesSelect.value;
      populateLeaves();
      redrawTrace();
      buildPvChart();
      updateEwtDot();
      syncPanelHeights();
    });

    els.leafSelect.addEventListener("change", function () {
      stopPlaying();
      state.leafIdx = parseInt(els.leafSelect.value, 10);
      state.pointIdx = 0;
      updateSliderRange();
      redrawTrace();
      buildPvChart();
      updateEwtDot();
      syncPanelHeights();
    });

    els.slider.addEventListener("input", function () {
      stopPlaying();
      state.pointIdx = parseInt(els.slider.value, 10);
      redrawTrace();
      updatePvDot();
      updateEwtDot();
    });

    els.playBtn.addEventListener("click", function () {
      if (state.playing) {
        stopPlaying();
      } else {
        startPlaying();
      }
    });
  }

  function startPlaying() {
    state.playing = true;
    els.playBtn.innerHTML = "&#10074;&#10074;";
    var leaf = currentLeaf();
    if (state.pointIdx >= leaf.points.length - 1) {
      state.pointIdx = 0;
    }
    state.timer = setInterval(function () {
      var leaf = currentLeaf();
      state.pointIdx += 1;
      if (state.pointIdx >= leaf.points.length) {
        stopPlaying();
        return;
      }
      els.slider.value = state.pointIdx;
      redrawTrace();
      updatePvDot();
      updateEwtDot();
    }, 90);
  }

  function stopPlaying() {
    state.playing = false;
    els.playBtn.innerHTML = "&#9654;";
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
