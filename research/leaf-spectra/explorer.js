/* Leaf Spectra Explorer
 * Interactive viewer for the leaf drydown spectral dataset from
 * Allen et al. (2026), New Phytologist. Data source: EcoSIS
 * (doi:10.21232/egGyynzX), pre-processed into data.json.
 */
(function () {
  "use strict";

  var DATA_URL = "/research/leaf-spectra/data.json";

  // Wavelength regions most sensitive to liquid water absorption,
  // used to lightly shade the plot for context.
  var WATER_BANDS = [
    { x0: 960, x1: 990, label: "970 nm" },
    { x0: 1180, x1: 1220, label: "1200 nm" },
    { x0: 1420, x1: 1480, label: "1450 nm" },
    { x0: 1900, x1: 1980, label: "1940 nm" }
  ];

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

    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) { throw new Error("Failed to load data.json (" + res.status + ")"); }
        return res.json();
      })
      .then(function (json) {
        state.data = json;
        populateSpecies();
        buildChart();
        wireControls();
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
      opt.textContent = sp.common + " (" + sp.binomial + ")";
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
      opt.textContent = "Leaf " + (i + 1) + " (" + leaf.points.length + " measurements)";
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
      "<b>" + sp.common + "</b> &mdash; dry mass per area (LMA): " + sp.lma_mg_cm2 +
      " mg/cm&sup2;. Turgor loss point (species mean): " + sp.tlp_mpa + " MPa.";
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

    var shapes = WATER_BANDS.map(function (b) {
      return {
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: b.x0,
        x1: b.x1,
        y0: 0,
        y1: 1,
        fillcolor: "rgba(51, 51, 51, 0.06)",
        line: { width: 0 }
      };
    });

    var annotations = WATER_BANDS.map(function (b) {
      return {
        x: (b.x0 + b.x1) / 2,
        y: 1,
        yref: "paper",
        yanchor: "bottom",
        text: b.label,
        showarrow: false,
        font: { size: 10, color: "#999" }
      };
    });

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
      shapes: shapes,
      annotations: annotations,
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

  function updateReadout() {
    var pt = currentPoint();
    var sp = state.data.species[state.speciesCode];
    var leaf = currentLeaf();

    els.lwpValue.textContent = pt.lwp.toFixed(2) + " MPa";
    els.ewtValue.textContent = pt.lwa_g_cm2.toFixed(4) + " g/cm²";
    els.sliderCaption.textContent =
      "Measurement " + (state.pointIdx + 1) + " of " + leaf.points.length;

    var stressed = pt.lwp <= sp.tlp_mpa;
    els.statusBadge.textContent = stressed ? "Past turgor loss point" : "Hydrated";
    els.statusBadge.className = "lse-status-badge " +
      (stressed ? "lse-status-stressed" : "lse-status-hydrated");
  }

  function wireControls() {
    els.speciesSelect.addEventListener("change", function () {
      stopPlaying();
      state.speciesCode = els.speciesSelect.value;
      populateLeaves();
      redrawTrace();
    });

    els.leafSelect.addEventListener("change", function () {
      stopPlaying();
      state.leafIdx = parseInt(els.leafSelect.value, 10);
      state.pointIdx = 0;
      updateSliderRange();
      redrawTrace();
    });

    els.slider.addEventListener("input", function () {
      stopPlaying();
      state.pointIdx = parseInt(els.slider.value, 10);
      redrawTrace();
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
    }, 450);
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
