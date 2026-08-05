// National Parks Tracker
// Reads parks-data.json, plots each park on a Leaflet map, and renders a
// diary entry below the map when a pin is clicked.

document.addEventListener('DOMContentLoaded', function () {
  var map = L.map('parks-map', {
    scrollWheelZoom: false
  }).setView([41, -100], 4);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var diaryPanel = document.getElementById('diary-panel');
  var progressEl = document.getElementById('parks-progress-count');

  fetch('parks-data.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var parks = data.parks;
      var visitedCount = parks.filter(function (p) { return p.visited; }).length;

      if (progressEl) {
        progressEl.innerHTML = '<strong>' + visitedCount + '</strong> of ' + parks.length + ' national parks visited';
      }

      parks.forEach(function (park) {
        var marker = L.circleMarker([park.lat, park.lng], {
          radius: 7,
          className: 'park-marker ' + (park.visited ? 'visited' : 'unvisited'),
          fillColor: park.visited ? '#54CA95' : '#cfcfcf',
          color: park.visited ? '#2f9c6e' : '#a9a9a9',
          weight: 2,
          fillOpacity: 0.9
        }).addTo(map);

        marker.bindTooltip(park.name + (park.state ? ' (' + park.state + ')' : ''));

        marker.on('click', function () {
          renderDiaryEntry(park);
        });
      });
    })
    .catch(function (err) {
      console.error('Could not load parks-data.json', err);
      if (diaryPanel) {
        diaryPanel.innerHTML = '<p class="diary-empty">Could not load park data. If you are viewing this file locally (file://), try running a local server instead — fetch() of local JSON is blocked by the browser on GitHub Pages\' actual domain this works fine.</p>';
      }
    });

  function renderDiaryEntry(park) {
    if (!diaryPanel) return;

    var statusClass = park.visited ? 'visited' : 'unvisited';
    var statusLabel = park.visited ? 'Visited' : 'Not visited yet';

    var photoHtml;
    if (park.photo) {
      photoHtml = '<div class="diary-photo"><img src="../img/parks/' + park.photo + '" alt="Photo from ' + park.name + '" ' +
        'onerror="this.parentElement.innerHTML=\'<div class=&quot;diary-photo-placeholder&quot;>Photo not found: ' + park.photo + '</div>\'"></div>';
    } else {
      photoHtml = '<div class="diary-photo"><div class="diary-photo-placeholder">' +
        (park.visited ? 'No photo added yet' : 'No trip yet') + '</div></div>';
    }

    var datesHtml = park.visitDates ? '<span class="diary-dates">' + escapeHtml(park.visitDates) + '</span>' : '';
    var blurbHtml = park.blurb
      ? '<p>' + escapeHtml(park.blurb) + '</p>'
      : '<p class="diary-empty">' + (park.visited ? 'No entry written yet.' : 'Add this one to the list!') + '</p>';

    diaryPanel.innerHTML =
      '<div class="diary-header"><h3>' + escapeHtml(park.name) + (park.state ? ' <small>(' + escapeHtml(park.state) + ')</small>' : '') + '</h3>' + datesHtml + '</div>' +
      '<span class="diary-status ' + statusClass + '">' + statusLabel + '</span>' +
      '<div class="diary-body">' + photoHtml + '<div class="diary-text">' + blurbHtml + '</div></div>';

    diaryPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
