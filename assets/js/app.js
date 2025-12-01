var map, featureList, kecSearch = [];
// runtime-only state (do NOT persist to localStorage per requirements)
var runtimeLayerStates = {};

$(window).resize(function() {
  sizeLayerControl();
});

$(document).on("click", ".feature-row", function(e) {
  $(document).off("mouseout", ".feature-row", clearHighlight);
  sidebarClick(parseInt($(this).attr("id"), 10));
});

if ( !("ontouchstart" in window) ) {
  $(document).on("mouseover", ".feature-row", function(e) {
    highlight.clearLayers().addLayer(L.circleMarker([$(this).attr("lat"), $(this).attr("lng")], highlightStyle));
  });
}

$(document).on("mouseout", ".feature-row", clearHighlight);

$("#about-btn").click(function() {
  $("#aboutModal").modal("show");
  $(".navbar-collapse.show").collapse("hide");
  return false;
});

$("#full-extent-btn").click(function() {
  if (typeof kecbdg !== 'undefined' && kecbdg.getBounds) {
    map.fitBounds(kecbdg.getBounds());
  }
  $(".navbar-collapse.show").collapse("hide");
  return false;
});

$("#legend-btn").click(function() {
  $("#legendModal").modal("show");
  $(".navbar-collapse.show").collapse("hide");
  return false;
});

$("#login-btn").click(function() {
  $("#loginModal").modal("show");
  $(".navbar-collapse.show").collapse("hide");
  return false;
});

$("#list-btn").click(function() {
  animateSidebar();
  return false;
});

$("#nav-btn").click(function() {
  $(".navbar-collapse").collapse("toggle");
  return false;
});

$("#sidebar-toggle-btn").click(function() {
  animateSidebar();
  return false;
});

$("#sidebar-hide-btn").click(function() {
  animateSidebar();
  return false;
});

function animateSidebar() {
  $("#sidebar").animate({
    width: "toggle"
  }, 350, function() {
    map.invalidateSize();
    // move legend to avoid overlap with sidebar when visible
    var sidebarVisible = $('#sidebar').is(':visible');
    if (sidebarVisible) {
      $('#dynamic-legend').css({ left: $('#sidebar').width() + 20 + 'px' });
    } else {
      $('#dynamic-legend').css({ left: '10px' });
    }
  });
}

function sizeLayerControl() {
  $(".leaflet-control-layers").css("max-height", $("#map").height() - 50);
}

function clearHighlight() {
  highlight.clearLayers();
}

// Disable keyboard focusability for interactive leaflet path/icon elements in a layer
function disableKeyboardFocusForLayer(layer) {
  try {
    layer.eachLayer(function(l){
      try {
        var el = null;
        if (typeof l.getElement === 'function') el = l.getElement();
        el = el || l._path || l._icon || l.getElement && l.getElement();
        if (el && el.setAttribute) {
          el.setAttribute('tabindex', '-1');
          // also remove outline if browser still shows it
          try { el.style.outline = 'none'; } catch(e){}
        }
      } catch(e){}
    });
  } catch(e){}
}

function sidebarClick(id) {
  // Search for a layer with the given stamp id across known layers
  var targetLayer = null;
  var layersToSearch = [kecbdg, pekerjaanPR, pekerjaanLK, goldarLK, goldarPR, pendidikanLK, pendidikanPR, kepalaKeluarga, agamaL, agamaP, jenisKelamin, kepadatanPenduduk, kantorKecamatan];
  for (var i=0;i<layersToSearch.length;i++){
    try{
      layersToSearch[i].eachLayer(function(l){ if (!targetLayer && L.stamp(l) === id) targetLayer = l; });
    } catch(e){}
    if (targetLayer) break;
  }
  if (!targetLayer) return;
  if (targetLayer.getBounds) {
    map.fitBounds(targetLayer.getBounds());
  } else if (targetLayer.getLatLng) {
    map.setView([targetLayer.getLatLng().lat, targetLayer.getLatLng().lng], 17);
  }
  selectedHighlight.clearLayers();
  var feat = targetLayer.feature || targetLayer;
  selectedHighlight.addData(feat);
  // show combined popup for this feature across active layers
  showCombinedPopupForFeature(feat);
  /* Hide sidebar on small screens */
  if (document.body.clientWidth <= 767) {
    $("#sidebar").hide();
    map.invalidateSize();
  }
}

// Show popup composed of features from all active layers that correspond to the given feature (match by WADMKC or geometry)
function showCombinedPopupForFeature(feature, clickedLatLng) {
  // showCombinedPopupForFeature optionally accepts the exact click location
  // (clickedLatLng: L.LatLng). When provided, we use a point-in-polygon test
  // against GeoJSON geometries for accurate matching instead of bbox checks.
  if (!feature || !feature.properties) return;
  var wad = feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD || null;
  var point = clickedLatLng || getFeaturePoint(feature);

  // Use top-level `pointInGeoJSONFeature` helper for polygon containment checks
  var candidateLayers = [kecbdg, pekerjaanPR, pekerjaanLK, goldarLK, goldarPR, pendidikanLK, pendidikanPR, kepalaKeluarga, agamaL, agamaP, jenisKelamin, kepadatanPenduduk, kantorKecamatan];
  var sections = [];
  candidateLayers.forEach(function(ly){
    if (!ly || !map.hasLayer(ly)) return;
    ly.eachLayer(function(l){
      try{
        var p = l.feature && l.feature.properties;
        if (!p) return;
        // match by WADMKC or by geometry equality
        var match = false;
        if (wad && (p.WADMKC === wad || p.NAMOBJ === wad || p.WADMKD === wad)) match = true;
        // Prefer accurate point-in-polygon test if we have the exact clicked location
        if (!match && typeof clickedLatLng !== 'undefined' && clickedLatLng && l.feature && l.feature.geometry && l.feature.geometry.type !== 'Point') {
          if (pointInGeoJSONFeature(clickedLatLng, l.feature)) match = true;
        } else if (!match && l.getBounds && feature.geometry && feature.geometry.type !== 'Point') {
          // legacy fallback: bounding-box containment (less accurate)
          if (l.getBounds().contains(getFeaturePointAsLatLng(feature))) match = true;
        }
        if (match) sections.push({ layer: ly, feature: l.feature, layerName: getLayerNameByLayer(ly), layerStamp: L.stamp(l) });
      } catch(err){}
    });
  });
  if (sections.length === 0) return;
  // If only one area matches (e.g., clicked within kecamatan Andir), restrict to that single area's sections
  var uniqueAreas = {};
  sections.forEach(function(s){ var key = (s.feature.properties && (s.feature.properties.WADMKC || s.feature.properties.NAMOBJ || s.feature.properties.WADMKD)) || ''; uniqueAreas[key] = true; });
  if (Object.keys(uniqueAreas).length === 1) {
    sections = sections.filter(function(s){ var key = (s.feature.properties && (s.feature.properties.WADMKC || s.feature.properties.NAMOBJ || s.feature.properties.WADMKD)) || ''; return uniqueAreas[key]; });
  }

  // Build optimized popup: show up to 6 layer tables, allow scroll inside popup content
  var maxTables = 6;
  var popupHtml = '<div class="combined-popup-wrapper" style="max-height:420px; overflow:auto;">';
  sections.slice(0, maxTables).forEach(function(s, idx){
    var layerKey = getLayerKeyByLayer(s.layer);
    popupHtml += '<div class="popup-layer-section" style="margin-bottom:8px;">';
    popupHtml += '<div class="popup-layer-header" style="font-weight:700; margin-bottom:4px;">' + escapeHtml(s.layerName) + '</div>';
    popupHtml += '<div class="popup-layer-content" style="max-height:120px; overflow:auto; padding:4px; border:1px solid #eee; background:#fff;">' + popupContentForLayer(s.feature, layerKey, s.layerName, s.layerStamp) + '</div>';
    popupHtml += '</div>';
  });
  if (sections.length > maxTables) popupHtml += '<div class="text-muted small">+' + (sections.length - maxTables) + ' more layers hidden. Scroll to view more.</div>';
  popupHtml += '</div>';
  // If a single area name (WADMKC/NAMOBJ/WADMKD) is determined, add Detail button to open details page
  try{
    var detailName = wad || null;
    if (!detailName) {
      var unique = Object.keys(uniqueAreas || {});
      if (unique.length === 1) detailName = unique[0];
    }
    if (detailName) {
      popupHtml += '<div class="text-end mt-2"><button class="btn btn-sm btn-primary open-detail-btn" data-wad="'+ escapeHtml(detailName) +'">Detail</button></div>';
    }
  }catch(e){}
  L.popup({ maxWidth:700, className:'combined-popup' }).setLatLng(point).setContent(popupHtml).openOn(map);
}

function getFeaturePoint(feature) {
  try{
    if (feature.geometry && feature.geometry.type === 'Point') return L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
    if (feature.geometry) return L.geoJson(feature).getBounds().getCenter();
  }catch(e){}
  return map.getCenter();
}

function getFeaturePointAsLatLng(feature) {
  var p = getFeaturePoint(feature);
  if (p && p.lat !== undefined) return p;
  return L.latLng(p[0], p[1]);
}

// Robust point-in-polygon for GeoJSON Polygon/MultiPolygon features.
// Returns true if the given L.LatLng `latlng` lies within `feat` geometry.
function pointInGeoJSONFeature(latlng, feat) {
  try{
    if (!latlng || !feat || !feat.geometry) return false;
    var geom = feat.geometry;
    var x = latlng.lng, y = latlng.lat;
    var rayCast = function(pt, ring){
      var inside = false;
      for (var i=0,j=ring.length-1;i<ring.length;j=i++){
        var xi = ring[i][0], yi = ring[i][1];
        var xj = ring[j][0], yj = ring[j][1];
        var intersect = ((yi>pt[1]) !== (yj>pt[1])) && (pt[0] < (xj - xi) * (pt[1]-yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    };
    if (geom.type === 'Polygon'){
      if (!geom.coordinates || !geom.coordinates.length) return false;
      if (!rayCast([x,y], geom.coordinates[0])) return false;
      for (var h=1; h<geom.coordinates.length; h++){
        if (rayCast([x,y], geom.coordinates[h])) return false;
      }
      return true;
    }
    if (geom.type === 'MultiPolygon'){
      for (var m=0; m<geom.coordinates.length; m++){
        var poly = geom.coordinates[m];
        if (poly && poly.length && rayCast([x,y], poly[0])){
          var inHole = false;
          for (var hh=1; hh<poly.length; hh++){
            if (rayCast([x,y], poly[hh])) { inHole = true; break; }
          }
          if (!inHole) return true;
        }
      }
      return false;
    }
  }catch(e){ return false; }
  return false;
}

// NOTE: map dblclick handler moved later (after map initialization) to avoid calling .on on undefined

function syncSidebar() {
  /* Empty sidebar features */
  $("#feature-list tbody").empty();
  /* Loop through kecamatan layer and add only features which are in the map bounds */
  /* If kantorKecamatan is present and visible, populate sidebar from point layer; otherwise fall back to kecbdg */
  if (typeof kantorKecamatan !== 'undefined' && map.hasLayer(kantorKecamatan)) {
    kantorKecamatan.eachLayer(function (layer) {
      try {
        var latlng = layer.getLatLng ? layer.getLatLng() : null;
        if (!latlng) return;
        if (map.getBounds().contains(latlng)) {
          var name = (layer.feature && layer.feature.properties && (layer.feature.properties.Kantor_Kec)) || 'Kantor';
          $("#feature-list tbody").append('<tr class="feature-row" id="' + L.stamp(layer) + '" lat="' + latlng.lat + '" lng="' + latlng.lng + '"><td style="vertical-align: middle;"><i class="fa-solid fa-building fa-lg"></i></td><td class="feature-name">' + name + '</td><td style="vertical-align: middle;"><i class="fa-solid fa-chevron-right flex-end"></i></td></tr>');
        }
      } catch (e) {}
    });
  } else if (typeof kecbdg !== 'undefined') {
    kecbdg.eachLayer(function (layer) {
      try {
        var bounds = layer.getBounds ? layer.getBounds() : null;
        if (!bounds) return;
        if (map.getBounds().intersects(bounds)) {
          var center = bounds.getCenter();
          var name = (layer.feature && (layer.feature.properties.WADMKC || layer.feature.properties.NAMOBJ || layer.feature.properties.WADMKD)) || 'Feature';
          $("#feature-list tbody").append('<tr class="feature-row" id="' + L.stamp(layer) + '" lat="' + center.lat + '" lng="' + center.lng + '"><td style="vertical-align: middle;"><i class="fa-solid fa-map fa-lg"></i></td><td class="feature-name">' + name + '</td><td style="vertical-align: middle;"><i class="fa-solid fa-chevron-right flex-end"></i></td></tr>');
        }
      } catch (e) {
        // ignore non-geometry layers
      }
    });
  }
  /* Update list.js featureList */
  featureList = new List("features", {
    valueNames: ["feature-name"]
  });
  featureList.sort("feature-name", {
    order: "asc"
  });
}

/* Basemap Layers */
var cartoLight = L.tileLayer("https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://cartodb.com/attributions">CartoDB</a>'
});
// OpenStreetMap Standard
var osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});
var usgsImagery = L.layerGroup([L.tileLayer("http://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 15,
}), L.tileLayer.wms("http://raster.nationalmap.gov/arcgis/services/Orthoimagery/USGS_EROS_Ortho_SCALE/ImageServer/WMSServer?", {
  minZoom: 16,
  maxZoom: 19,
  layers: "0",
  format: 'image/jpeg',
  transparent: true,
  attribution: "Aerial Imagery courtesy USGS"
})]);

/* Overlay Layers */
var highlight = L.geoJson(null);
var highlightStyle = {
  stroke: true,
  fillColor: "#00FFFF",
  fillOpacity: 0.7,
  radius: 10
};

// Selected highlight layer for clicked features (bright yellow)
var selectedHighlight = L.geoJson(null, {
  style: function(feature){
    return { color: '#ffeb3b', fillColor: '#fff59d', fillOpacity: 0.9, weight: 2 };
  }
});

// Per-layer runtime-only configuration (do NOT use localStorage)
function saveLayerState(layerId, state) {
  runtimeLayerStates[layerId] = Object.assign({}, runtimeLayerStates[layerId] || {}, state);
}

function getLayerState(layerId) {
  return runtimeLayerStates[layerId] || null;
}

// Kecamatan Bandung layer (kecbdg)
var kecbdg = L.geoJson(null, {
  style: function(feature) {
    return {
      color: '#2b7cff',
      weight: 1,
      fillColor: '#7fb3ff',
      fillOpacity: 0.4
    };
  },
  onEachFeature: function(feature, layer){
    var name = feature.properties && (feature.properties.NAMOBJ || feature.properties.WADMKD || feature.properties.WADMKC) || 'Kecamatan';
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show tooltip with area name on hover
    try{ if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true}); }catch(e){}
    kecSearch.push({
      name: name,
      source: 'Kecamatan Bandung',
      id: L.stamp(layer),
      bounds: layer.getBounds()
    });
  }
});
$.getJSON('data/kecbgd.geojson', function(data) {
  kecbdg.addData(data);
  try{ disableKeyboardFocusForLayer(kecbdg); }catch(e){}
});

// Load pekerjaan perempuan and laki-laki (updated filenames)
var pekerjaanPR = L.geoJson(null, {
  style: function(feature) { return { color: '#b30059', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    // Use combined popup on single click
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Pekerjaan_P_2025.geojson', function(data){ pekerjaanPR.addData(data); try{ disableKeyboardFocusForLayer(pekerjaanPR); }catch(e){} });

var pekerjaanLK = L.geoJson(null, {
  style: function(feature) { return { color: '#006d2c', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Pekerjaan_L_2025.geojson', function(data){ pekerjaanLK.addData(data); try{ disableKeyboardFocusForLayer(pekerjaanLK); }catch(e){} });

// Golongan darah (L/P)
var goldarLK = L.geoJson(null, {
  style: function(feature) { return { color: '#7a0177', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Goldar_L_2025.geojson', function(data){ goldarLK.addData(data); try{ disableKeyboardFocusForLayer(goldarLK); }catch(e){} });

var goldarPR = L.geoJson(null, {
  style: function(feature) { return { color: '#fb6a4a', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Goldar_P_2025.geojson', function(data){ goldarPR.addData(data); try{ disableKeyboardFocusForLayer(goldarPR); }catch(e){} });

// Pendidikan
var pendidikanLK = L.geoJson(null, {
  style: function(feature) { return { color: '#2b8cbe', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Pendidikan_L_2025.geojson', function(data){ pendidikanLK.addData(data); try{ disableKeyboardFocusForLayer(pendidikanLK); }catch(e){} });

var pendidikanPR = L.geoJson(null, {
  style: function(feature) { return { color: '#f03b20', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Pendidikan_P_2025.geojson', function(data){ pendidikanPR.addData(data); try{ disableKeyboardFocusForLayer(pendidikanPR); }catch(e){} });

// Kepala Keluarga
var kepalaKeluarga = L.geoJson(null, {
  style: function(feature) { return { color: '#6a51a3', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/KepalaKeluarga_2025.geojson', function(data){ kepalaKeluarga.addData(data); try{ disableKeyboardFocusForLayer(kepalaKeluarga); }catch(e){} });

// Agama L/P
var agamaL = L.geoJson(null, {
  style: function(feature) { return { color: '#238b45', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Agama_L_2025.geojson', function(data){ agamaL.addData(data); try{ disableKeyboardFocusForLayer(agamaL); }catch(e){} });

var agamaP = L.geoJson(null, {
  style: function(feature) { return { color: '#2ca25f', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/Agama_P_2025.geojson', function(data){ agamaP.addData(data); try{ disableKeyboardFocusForLayer(agamaP); }catch(e){} });

// Jenis Kelamin
var jenisKelamin = L.geoJson(null, {
  style: function(feature) { return { color: '#88419d', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on hover (WADMKC preferred)
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/JenisKelamin_2025.geojson', function(data){ jenisKelamin.addData(data); try{ disableKeyboardFocusForLayer(jenisKelamin); }catch(e){} });

// Kepadatan Penduduk
var kepadatanPenduduk = L.geoJson(null, {
  style: function(feature) { return { color: '#08519c', weight:1, fillOpacity:0.6 }; },
  onEachFeature: function(feature, layer){
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
    // show area name tooltip on polygon hover
    try{
      var name = feature.properties && (feature.properties.WADMKC || feature.properties.NAMOBJ || feature.properties.WADMKD) || '';
      if (name) layer.bindTooltip(name, {direction:'center', className:'area-tooltip', sticky:true});
    }catch(e){}
  }
});
$.getJSON('data/KepadatanPenduduk_2025.geojson', function(data){ kepadatanPenduduk.addData(data); try{ disableKeyboardFocusForLayer(kepadatanPenduduk); }catch(e){} });

// Point layer: Kantor Kecamatan (pointkantorkecamatan.geojson)
var kantorIcon = L.icon({
  iconUrl: 'assets/img/kantor.png',
  iconSize: [40,40],
  iconAnchor: [20,40],
  popupAnchor: [0,-40]
});

var kantorKecamatan = L.geoJson(null, {
  pointToLayer: function(feature, latlng){
    return L.marker(latlng, { icon: kantorIcon, title: feature.properties && feature.properties.Kantor_Kec || 'Kantor Kecamatan', riseOnHover:true });
  },
  onEachFeature: function(feature, layer){
    // Tooltip: show name when hovering the marker
    try{ var label = feature.properties && feature.properties.Kantor_Kec || ''; if (label) layer.bindTooltip(label, {permanent:false, direction:'top', offset:[0,-10], className:'point-tooltip'}); }catch(e){}
    // Click behavior: single-click show combined popup and highlight
    layer.on('click', function(e){
      try{ if (e && e.originalEvent) e.originalEvent.stopPropagation(); }catch(err){}
      selectedHighlight.clearLayers();
      selectedHighlight.addData(feature);
      showCombinedPopupForFeature(feature, e.latlng);
    });
  }
});
$.getJSON('data/pointkantorkecamatan.geojson', function(data){ try{ kantorKecamatan.addData(data); }catch(e){} try{ disableKeyboardFocusForLayer(kantorKecamatan); }catch(e){} });
// add kantorKecamatan to map by default
try{ map.addLayer(kantorKecamatan); }catch(e){}

//Create a color dictionary based off of subway route_id
var subwayColors = {"1":"#ff3135", "2":"#ff3135", "3":"ff3135", "4":"#009b2e",
    "5":"#009b2e", "6":"#009b2e", "7":"#ce06cb", "A":"#fd9a00", "C":"#fd9a00",
    "E":"#fd9a00", "SI":"#fd9a00","H":"#fd9a00", "Air":"#ffff00", "B":"#ffff00",
    "D":"#ffff00", "F":"#ffff00", "M":"#ffff00", "G":"#9ace00", "FS":"#6e6e6e",
    "GS":"#6e6e6e", "J":"#976900", "Z":"#976900", "L":"#969696", "N":"#ffff00",
    "Q":"#ffff00", "R":"#ffff00" };

var subwayLines = L.geoJson(null, {
  style: function (feature) {
      return {
        color: subwayColors[feature.properties.route_id],
        weight: 3,
        opacity: 1
      };
  },
  onEachFeature: function (feature, layer) {
    if (feature.properties) {
      var content = "<table class='table table-striped table-bordered table-condensed'>" + "<tr><th>Division</th><td>" + feature.properties.Division + "</td></tr>" + "<tr><th>Line</th><td>" + feature.properties.Line + "</td></tr>" + "<table>";
      layer.on({
        click: function (e) {
          $("#feature-title").html(feature.properties.Line);
          $("#feature-info").html(content);
          $("#featureModal").modal("show");

        }
      });
    }
    layer.on({
      mouseover: function (e) {
        var layer = e.target;
        layer.setStyle({
          weight: 3,
          color: "#00FFFF",
          opacity: 1
        });
        if (!L.Browser.ie && !L.Browser.opera) {
          layer.bringToFront();
        }
      },
      mouseout: function (e) {
        subwayLines.resetStyle(e.target);
      }
    });
  }
});
// NOTE: subwayLines loading intentionally disabled per request (not displayed)

/* Single marker cluster layer to hold all clusters */
var markerClusters = new L.MarkerClusterGroup({
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  zoomToBoundsOnClick: true,
  disableClusteringAtZoom: 16
});

/* Empty layer placeholder to add to layer control for listening when to add/remove theaters to markerClusters layer */
var theaterLayer = L.geoJson(null);
var theaters = L.geoJson(null, {
  pointToLayer: function (feature, latlng) {
    return L.marker(latlng, {
      icon: L.icon({
        iconUrl: "assets/img/theater.png",
        iconSize: [24, 28],
        iconAnchor: [12, 28],
        popupAnchor: [0, -25]
      }),
      title: feature.properties.NAME,
      riseOnHover: true
    });
  },
  onEachFeature: function (feature, layer) {
    if (feature.properties) {
      var content = "<table class='table table-striped table-bordered table-condensed'>" + "<tr><th>Name</th><td>" + feature.properties.NAME + "</td></tr>" + "<tr><th>Phone</th><td>" + feature.properties.TEL + "</td></tr>" + "<tr><th>Address</th><td>" + feature.properties.ADDRESS1 + "</td></tr>" + "<tr><th>Website</th><td><a class='url-break' href='" + feature.properties.URL + "' target='_blank'>" + feature.properties.URL + "</a></td></tr>" + "<table>";
      layer.on({
        click: function (e) {
          $("#feature-title").html(feature.properties.NAME);
          $("#feature-info").html(content);
          $("#featureModal").modal("show");
          highlight.clearLayers().addLayer(L.circleMarker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], highlightStyle));
        }
      });
      $("#feature-list tbody").append('<tr class="feature-row" id="' + L.stamp(layer) + '" lat="' + layer.getLatLng().lat + '" lng="' + layer.getLatLng().lng + '"><td style="vertical-align: middle;"><img width="16" height="18" src="assets/img/theater.png"></td><td class="feature-name">' + layer.feature.properties.NAME + '</td><td style="vertical-align: middle;"><i class="fa-solid fa-chevron-right flex-end"></i></td></tr>');
      theaterSearch.push({
        name: layer.feature.properties.NAME,
        address: layer.feature.properties.ADDRESS1,
        source: "Theaters",
        id: L.stamp(layer),
        lat: layer.feature.geometry.coordinates[1],
        lng: layer.feature.geometry.coordinates[0]
      });
    }
  }
});
// Theaters loading intentionally disabled per request

/* Empty layer placeholder to add to layer control for listening when to add/remove museums to markerClusters layer */
var museumLayer = L.geoJson(null);
var museums = L.geoJson(null, {
  pointToLayer: function (feature, latlng) {
    return L.marker(latlng, {
      icon: L.icon({
        iconUrl: "assets/img/museum.png",
        iconSize: [24, 28],
        iconAnchor: [12, 28],
        popupAnchor: [0, -25]
      }),
      title: feature.properties.NAME,
      riseOnHover: true
    });
  },
  onEachFeature: function (feature, layer) {
    if (feature.properties) {
      var content = "<table class='table table-striped table-bordered table-condensed'>" + "<tr><th>Name</th><td>" + feature.properties.NAME + "</td></tr>" + "<tr><th>Phone</th><td>" + feature.properties.TEL + "</td></tr>" + "<tr><th>Address</th><td>" + feature.properties.ADRESS1 + "</td></tr>" + "<tr><th>Website</th><td><a class='url-break' href='" + feature.properties.URL + "' target='_blank'>" + feature.properties.URL + "</a></td></tr>" + "<table>";
      layer.on({
        click: function (e) {
          $("#feature-title").html(feature.properties.NAME);
          $("#feature-info").html(content);
          $("#featureModal").modal("show");
          highlight.clearLayers().addLayer(L.circleMarker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], highlightStyle));
        }
      });
      $("#feature-list tbody").append('<tr class="feature-row" id="' + L.stamp(layer) + '" lat="' + layer.getLatLng().lat + '" lng="' + layer.getLatLng().lng + '"><td style="vertical-align: middle;"><img width="16" height="18" src="assets/img/museum.png"></td><td class="feature-name">' + layer.feature.properties.NAME + '</td><td style="vertical-align: middle;"><i class="fa-solid fa-chevron-right flex-end"></i></td></tr>');
      museumSearch.push({
        name: layer.feature.properties.NAME,
        address: layer.feature.properties.ADRESS1,
        source: "Museums",
        id: L.stamp(layer),
        lat: layer.feature.geometry.coordinates[1],
        lng: layer.feature.geometry.coordinates[0]
      });
    }
  }
});
// Museums loading intentionally disabled per request

// Initialize map centered on Jawa Barat (Bandung area)
map = L.map("map", {
  zoom: 8,
  center: [-6.914744, 107.609810], // approx Bandung, Jawa Barat
  layers: [cartoLight, kecbdg, highlight],
  zoomControl: false,
  attributionControl: false
});

// add selected highlight layer to map
selectedHighlight.addTo(map);

// When user double-clicks the selectedHighlight, only show data for that highlighted area
map.on('dblclick', function(e){
  // find feature in selectedHighlight that contains this point
  var found = null;
  selectedHighlight.eachLayer(function(l){
    try{
      if (l.getBounds && l.getBounds().contains && l.getBounds().contains(e.latlng)) { found = l.feature; }
      else if (l.getLatLng) {
        var d = map.distance(e.latlng, l.getLatLng()); if (d < 10) found = l.feature;
      }
    } catch(err){}
  });
  if (found) {
    selectedHighlight.clearLayers(); selectedHighlight.addData(found); showCombinedPopupForFeature(found, e.latlng);
  }
});

/* Layer control listeners for adding/removing point layers directly (no cross-layer clustering) */
map.on("overlayadd", function(e) {
  if (e.layer === theaterLayer) {
    try { map.addLayer(theaters); } catch(err){}
    syncSidebar();
  }
  if (e.layer === museumLayer) {
    try { map.addLayer(museums); } catch(err){}
    syncSidebar();
  }
  // reset highlights and popups when layer visibility changes
  resetHighlightsAndPopups();
  // refresh legend to reflect active layers
  updateLegendForActiveLayers();
});

map.on("overlayremove", function(e) {
  if (e.layer === theaterLayer) {
    try { map.removeLayer(theaters); } catch(err){}
    syncSidebar();
  }
  if (e.layer === museumLayer) {
    try { map.removeLayer(museums); } catch(err){}
    syncSidebar();
  }
  // reset highlights and popups when layer visibility changes
  resetHighlightsAndPopups();
  // remove any labelLayer associated with this layer
  try{
    var key = getLayerNameByLayer(e.layer).replace(/\s+/g,'_');
    if (labelLayers[key]) { map.removeLayer(labelLayers[key]); delete labelLayers[key]; }
  }catch(err){}
  // refresh legend to reflect active layers
  updateLegendForActiveLayers();
});

function resetHighlightsAndPopups() {
  try{ selectedHighlight.clearLayers(); }catch(e){}
  try{ highlight.clearLayers(); }catch(e){}
  try{ map.closePopup(); }catch(e){}
}

/* Filter sidebar feature list to only show features in current map bounds */
map.on("moveend", function (e) {
  syncSidebar();
});

/* Clear feature highlight when map is clicked */
map.on("click", function(e) {
  highlight.clearLayers();
});

/* Attribution control */
function updateAttribution(e) {
  $.each(map._layers, function(index, layer) {
    if (layer.getAttribution) {
      $("#attribution").html((layer.getAttribution()));
    }
  });
}
map.on("layeradd", updateAttribution);
map.on("layerremove", updateAttribution);

var attributionControl = L.control({
  position: "bottomright"
});
attributionControl.onAdd = function (map) {
  var div = L.DomUtil.create("div", "leaflet-control-attribution d-inline-flex");
  div.innerHTML = "";
  return div;
};
map.addControl(attributionControl);

var zoomControl = L.control.zoom({
  position: "bottomright"
}).addTo(map);

/* GPS enabled geolocation control set to follow the user's location */
var locateControl = L.control.locate({
  position: "bottomright",
  drawCircle: true,
  follow: true,
  setView: true,
  keepCurrentZoomLevel: true,
  markerStyle: {
    weight: 1,
    opacity: 0.8,
    fillOpacity: 0.8
  },
  circleStyle: {
    weight: 1,
    clickable: false
  },
  icon: "fa-solid fa-location-arrow",
  metric: false,
  strings: {
    title: "My location",
    popup: "You are within {distance} {unit} from this point",
    outsideMapBoundsMsg: "You seem located outside the boundaries of the map"
  },
  locateOptions: {
    maxZoom: 18,
    watch: true,
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 10000
  }
}).addTo(map);

/* Larger screens get expanded layer control and visible sidebar */
if (document.body.clientWidth <= 767) {
  var isCollapsed = true;
} else {
  var isCollapsed = false;
}

var baseLayers = {
  "Street Map (Carto)": cartoLight,
  "Street Map (OSM)": osmStandard,
  "Esri Street": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
  "Esri Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' })
};

var groupedOverlays = {
  "Administrative": {
    "<i class='fa-solid fa-map'></i>&nbsp;Kecamatan Bandung": kecbdg
  }
};

// add Kantor Kecamatan point layer to Administrative group
groupedOverlays['Administrative']['<i class="fa-solid fa-building"></i>&nbsp;Kantor Kecamatan'] = kantorKecamatan;

// Add pekerjaan layers to grouped overlays
groupedOverlays['Demografi'] = {
  "<i class='fa-solid fa-venus'></i>&nbsp;Pekerjaan Perempuan": pekerjaanPR,
  "<i class='fa-solid fa-mars'></i>&nbsp;Pekerjaan Pria": pekerjaanLK
};

// Add newly provided demographic layers to grouped overlays
groupedOverlays['Demografi']['<i class="fa-solid fa-droplet"></i>&nbsp;Gol. Darah Laki-laki'] = goldarLK;
groupedOverlays['Demografi']['<i class="fa-solid fa-droplet"></i>&nbsp;Gol. Darah Perempuan'] = goldarPR;
groupedOverlays['Demografi']['<i class="fa-solid fa-graduation-cap"></i>&nbsp;Pendidikan Laki-laki'] = pendidikanLK;
groupedOverlays['Demografi']['<i class="fa-solid fa-graduation-cap"></i>&nbsp;Pendidikan Perempuan'] = pendidikanPR;
groupedOverlays['Demografi']['<i class="fa-solid fa-user"></i>&nbsp;Kepala Keluarga'] = kepalaKeluarga;
groupedOverlays['Demografi']['<i class="fa-solid fa-pray"></i>&nbsp;Agama (L)'] = agamaL;
groupedOverlays['Demografi']['<i class="fa-solid fa-pray"></i>&nbsp;Agama (P)'] = agamaP;
groupedOverlays['Demografi']['<i class="fa-solid fa-venus-mars"></i>&nbsp;Jenis Kelamin'] = jenisKelamin;
groupedOverlays['Demografi']['<i class="fa-solid fa-layer-group"></i>&nbsp;Kepadatan Penduduk'] = kepadatanPenduduk;

var layerControl = L.control.groupedLayers(baseLayers, groupedOverlays, {
  collapsed: isCollapsed
}).addTo(map);

// Label layers registry
var labelLayers = {};

function toggleLabelsForLayer(layer, enabled, labelStyle) {
  // remove existing
  var key = getLayerNameByLayer(layer).replace(/\s+/g,'_');
  if (labelLayers[key]) { map.removeLayer(labelLayers[key]); delete labelLayers[key]; }
  if (!enabled) return;
  var group = L.layerGroup();
  layer.eachLayer(function(l){
    try{
      var props = l.feature && l.feature.properties;
      if (!props) return;
      // label text
      var text = props.WADMKC || '';
      if (!text) return;
      var center = l.getBounds ? l.getBounds().getCenter() : (l.getLatLng && l.getLatLng());
      if (!center) return;
      // create styled divIcon using labelStyle (color/font/size)
      var style = labelStyle || {};
      var color = style.color || '#000';
      var font = style.font || 'Arial';
      var size = style.size || 12;
      var html = '<span style="color:'+color+'; font-family:'+font+'; font-size:'+size+'px;">'+text+'</span>';
      var icon = L.divIcon({ className: 'wadmkc-label', html: html });
      group.addLayer(L.marker(center, { icon: icon, interactive: false }));
    } catch(e){}
  });
  labelLayers[key] = group.addTo(map);
}

/* Highlight search box text on click */
$("#searchbox").click(function () {
  $(this).select();
});

/* Prevent hitting enter from refreshing the page */
$("#searchbox").keypress(function (e) {
  if (e.which == 13) {
    e.preventDefault();
  }
});

$("#featureModal").on("hidden.bs.modal", function (e) {
  $(document).on("mouseout", ".feature-row", clearHighlight);
});

/* Typeahead search functionality */
$(document).one("ajaxStop", function () {
  $("#loading").hide();
  sizeLayerControl();
  /* Fit map to kecbdg bounds if available */
  if (typeof kecbdg !== 'undefined' && kecbdg.getBounds && !kecbdg.getBounds().isValid()) {
    // if bounds not valid yet, try setting center (kecbdg will load shortly)
  }
  if (typeof kecbdg !== 'undefined' && kecbdg.getBounds && kecbdg.getBounds().isValid()) {
    map.fitBounds(kecbdg.getBounds());
  }
  featureList = new List("features", {valueNames: ["feature-name"]});
  featureList.sort("feature-name", {order:"asc"});
  var kecBH = new Bloodhound({
    name: "Kecamatan",
    datumTokenizer: function (d) { return Bloodhound.tokenizers.whitespace(d.name); },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    local: kecSearch,
    limit: 10
  });

  var geonamesBH = new Bloodhound({
    name: "GeoNames",
    datumTokenizer: function (d) { return Bloodhound.tokenizers.whitespace(d.name); },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    remote: {
      url: "https://secure.geonames.org/searchJSON?username=demo&featureClass=P&maxRows=10&name_startsWith=%QUERY",
      wildcard: "%QUERY",
      replace: function(url, query) {
        return url.replace("%QUERY", encodeURIComponent(query));
      },
      ajax: {
        beforeSend: function (jqXhr, settings) {
          settings.url += "&east=" + map.getBounds().getEast() + "&west=" + map.getBounds().getWest() + "&north=" + map.getBounds().getNorth() + "&south=" + map.getBounds().getSouth();
          $("#searchicon").removeClass("fa-magnifying-glass").addClass("fa-rotate fa-spin");
        },
        complete: function (jqXHR, status) {
          $('#searchicon').removeClass("fa-rotate fa-spin").addClass("fa-magnifying-glass");
        }
      }
    },
    limit: 10
  });

  kecBH.initialize();
  geonamesBH.initialize();

  /* instantiate the typeahead UI */
  $("#searchbox").typeahead({
    minLength: 3,
    highlight: true,
    hint: false
  }, {
    name: "Kecamatan",
    displayKey: "name",
    source: kecBH.ttAdapter(),
    templates: {
      header: "<h4 class='typeahead-header'>Kecamatan Bandung</h4>"
    }
  }, {
    name: "GeoNames",
    displayKey: "name",
    source: geonamesBH.ttAdapter(),
    templates: {
      header: "<h4 class='typeahead-header'><img src='assets/img/globe.png' width='25' height='25'>&nbsp;GeoNames</h4>"
    }
  }).on("typeahead:selected", function (obj, datum) {
    if (datum.source === "Kecamatan Bandung") {
      if (datum.bounds) {
        map.fitBounds(datum.bounds);
      }
    } else if (datum.source === "GeoNames") {
      map.setView([datum.lat, datum.lng], 14);
    }
    if ($(".navbar-collapse").height() > 50) {
      $(".navbar-collapse.show").collapse("hide");
    }
  }).on("typeahead:opened", function () {
    $(".navbar-collapse.show").css("max-height", $(document).height() - $(".navbar-brand").height());
    $(".navbar-collapse.show").css("height", $(document).height() - $(".navbar-brand").height());
  }).on("typeahead:closed", function () {
    $(".navbar-collapse.show").css("max-height", "");
    $(".navbar-collapse.show").css("height", "");
  });
  $(".twitter-typeahead").css("position", "static");
  $(".twitter-typeahead").css("display", "block");
});

// Leaflet patch to make layer control scrollable on touch browsers
var container = $(".leaflet-control-layers")[0];
if (!L.Browser.touch) {
  L.DomEvent
  .disableClickPropagation(container)
  .disableScrollPropagation(container);
} else {
  L.DomEvent.disableClickPropagation(container);
}

/* ----------------- Helper functions for popups, classification, legend, and downloads ----------------- */

function popupContentFromProperties(props) {
  var html = '<table class="table table-sm table-bordered">';
  for (var k in props) {
    if (!props.hasOwnProperty(k)) continue;
    html += '<tr><th>' + k + '</th><td>' + props[k] + '</td></tr>';
  }
  html += '</table>';
  return html;
}

// Build popup content based on popup mode
function popupContentForLayer(feature, layerKey, layerName, layerStamp) {
  var props = feature.properties || {};
  // Determine per-layer saved popup mode if available
  var layerObj = layerKey; // may be layer id or key
  var mode = $('input[name="lp-popup-mode"]:checked').val() || 'all';
  var selectedField = $('#lp-field').val();
  var alwaysShow = ['WADMKC','KDCPUM','JenisKel'];
  // Build a compact summary that shows key fields (WADMKC + selectedField or first available)
  var uid = 'p_' + (Math.random().toString(36).substr(2,8));
  var compactHtml = '<table class="table table-sm compact-table">';
  // Priority fields
  var shown = {};
  // Always include WADMKC if present
  if (props.WADMKC || props.NAMOBJ || props.WADMKD) {
    var areaLabel = props.WADMKC || props.NAMOBJ || props.WADMKD;
    compactHtml += '<tr><th>Nama</th><td>' + escapeHtml(String(areaLabel)) + '</td></tr>';
    shown['WADMKC'] = true;
  }
  // Include selectedField if provided and exists
  if (selectedField && selectedField.length && props.hasOwnProperty(selectedField)) {
    compactHtml += '<tr><th>' + selectedField + '</th><td>' + summarizeValue(props[selectedField]) + '</td></tr>';
    shown[selectedField] = true;
  } else {
    // include first available non-area field
    for (var k0 in props) {
      if (!props.hasOwnProperty(k0)) continue;
      if (k0 === 'WADMKC' || k0 === 'NAMOBJ' || k0 === 'WADMKD') continue;
      compactHtml += '<tr><th>' + k0 + '</th><td>' + summarizeValue(props[k0]) + '</td></tr>';
      shown[k0] = true;
      break;
    }
  }
  compactHtml += '</table>';

  // Build full details table (hidden by default)
  var detailsHtml = '<div class="details-wrapper" style="display:none;"><div class="details-scroll"><table class="table table-sm table-bordered details-table">';
  for (var k in props) {
    if (!props.hasOwnProperty(k)) continue;
    detailsHtml += '<tr><th>' + k + '</th><td>' + escapeHtml(String(props[k] === null || props[k] === undefined ? '' : props[k])) + '</td></tr>';
  }
  detailsHtml += '</table></div></div>';

  // Toggle button with icon
  var toggleBtn = '<div class="text-end mt-1"><a href="#" class="toggle-details-btn btn btn-sm btn-link" data-target="' + uid + '"><i class="fa-solid fa-plus me-1 toggle-icon"></i><span class="toggle-text">Tampilkan detail</span></a></div>';

  // Small inline progress/chart: if we can detect a numeric selectedField and a population total, show a small progress bar
  var progressHtml = '';
  try{
    var totalKeys = ['POP_TOTAL','POP_TOT','POP','JML_PEND','JML_PENDUDUK','POP_TOTAL_2025'];
    var totalVal = null;
    for (var ti=0; ti<totalKeys.length; ti++){ var tk = totalKeys[ti]; if (props[tk] !== undefined && !isNaN(Number(props[tk]))) { totalVal = Number(props[tk]); break; } }
    var numericField = null;
    if (selectedField && props[selectedField] !== undefined && !isNaN(Number(props[selectedField]))) numericField = selectedField;
    else {
      // find first numeric property that's not the total
      for (var kk in props){ if (!props.hasOwnProperty(kk)) continue; if (totalKeys.indexOf(kk) !== -1) continue; if (!isNaN(Number(props[kk]))) { numericField = kk; break; } }
    }
    if (numericField && totalVal && totalVal>0) {
      var val = Number(props[numericField]);
      var pct = Math.min(100, Math.round((val/totalVal)*100));
      progressHtml = '<div class="mt-1"><small>' + escapeHtml(numericField) + ': ' + escapeHtml(String(val)) + ' ('+ pct + '% dari total)</small><div class="progress mt-1" style="height:8px;"><div class="progress-bar" role="progressbar" style="width:'+pct+'%" aria-valuenow="'+pct+'" aria-valuemin="0" aria-valuemax="100"></div></div></div>';
    }
  }catch(e){ progressHtml=''; }

  var out = '<div id="' + uid + '" class="popup-compact-wrapper">' + compactHtml + progressHtml + toggleBtn + detailsHtml + '</div>';
  return out;
}

// summarize long values: arrays or long comma/newline-separated strings -> show first 5 entries with scroll
function summarizeValue(val) {
  if (val === null || val === undefined) return '';
  // if it's an object/array
  if (Array.isArray(val)) {
    var items = val.slice(0,5);
    var out = '<div style="max-height:120px;overflow:auto;">' + items.map(function(i){ return '<div>'+escapeHtml(String(i))+'</div>'; }).join('') + (val.length>5?'<div class="text-muted">...('+ (val.length-5) +' more)</div>':'') + '</div>';
    return out;
  }
  // if string long or contains separators
  var s = String(val);
  if (s.length > 200 || s.indexOf('\n') !== -1 || s.indexOf(',') !== -1) {
    var parts = s.split(/\n|,/) .map(function(p){ return p.trim(); }).filter(Boolean);
    if (parts.length <= 5) return '<div style="max-height:120px;overflow:auto;">' + parts.map(function(p){ return '<div>'+escapeHtml(p)+'</div>'; }).join('') + '</div>';
    var items = parts.slice(0,5);
    return '<div style="max-height:120px;overflow:auto;">' + items.map(function(p){ return '<div>'+escapeHtml(p)+'</div>'; }).join('') + '<div class="text-muted">...(' + (parts.length-5) + ' more)</div></div>';
  }
  return escapeHtml(s);
}

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Simplified click: when user clicks the map, find a single feature (first match) and show combined popup for that area's feature only.
map.on('click', function(e){
  var point = e.latlng;
  var candidateLayers = [kecbdg, pekerjaanPR, pekerjaanLK, goldarLK, goldarPR, pendidikanLK, pendidikanPR, kepalaKeluarga, agamaL, agamaP, jenisKelamin, kepadatanPenduduk, kantorKecamatan];
  var foundFeature = null;
  candidateLayers.forEach(function(ly){
    if (foundFeature) return;
    try{
      if (!ly || !map.hasLayer(ly)) return;
      ly.eachLayer(function(fl){
        if (foundFeature) return;
        try{
          var contains = false;
          try {
            // Prefer accurate geometric test for polygon features
            if (fl.feature && fl.feature.geometry && fl.feature.geometry.type && fl.feature.geometry.type !== 'Point') {
              if (pointInGeoJSONFeature(point, fl.feature)) contains = true;
            } else {
              if (fl.getLatLng) {
                var latlng = fl.getLatLng();
                if (latlng && latlng.lat === point.lat && latlng.lng === point.lng) contains = true;
                if (latlng) {
                  var dist = map.distance(point, latlng); if (dist < 5) contains = true;
                }
              }
              if (fl.getBounds) {
                if (fl.getBounds().contains(point)) contains = true;
              }
            }
          } catch(e){}
          if (contains && fl.feature) {
            foundFeature = fl.feature;
            return;
          }
        } catch(e){}
      });
    } catch(e){}
  });
  if (foundFeature) {
    // show combined popup but restrict to features sharing the same WAD/area
    selectedHighlight.clearLayers(); selectedHighlight.addData(foundFeature);
    showCombinedPopupForFeature(foundFeature, point);
  }
});

// Attach click handler for Detail button when any popup opens
map.on('popupopen', function(e){
  try{
    // use delegated click on document for popup button(s)
    $(document).off('click', '.open-detail-btn').on('click', '.open-detail-btn', function(evt){
      evt.preventDefault();
      var wad = $(this).data('wad');
      if (!wad) return;
      var url = 'details.html?wad=' + encodeURIComponent(wad);
      window.open(url, '_blank');
    });
    // toggle details inside compact popup (delegated)
    $(document).off('click', '.toggle-details-btn').on('click', '.toggle-details-btn', function(evt){
      evt.preventDefault();
      var tgt = $(this).data('target');
      if (!tgt) return;
      var $wrap = $('#' + tgt);
      if (!$wrap.length) return;
      var $details = $wrap.find('.details-wrapper');
      var $icon = $(this).find('.toggle-icon');
      var $text = $(this).find('.toggle-text');
      if ($details.is(':visible')) {
        $details.slideUp(120);
        $icon.removeClass('fa-minus').addClass('fa-plus');
        $text.text('Tampilkan detail');
      } else {
        $details.slideDown(150);
        $icon.removeClass('fa-plus').addClass('fa-minus');
        $text.text('Sembunyikan detail');
      }
    });
    
  }catch(e){}
});

// helper to determine simple layer name mapping
function getLayerNameByLayer(layer) {
  if (layer === kecbdg) return 'Kecamatan';
  if (layer === pekerjaanPR) return 'Pekerjaan Perempuan';
  if (layer === pekerjaanLK) return 'Pekerjaan Pria';
  if (layer === goldarLK) return 'Gol. Darah Laki-laki';
  if (layer === goldarPR) return 'Gol. Darah Perempuan';
  if (layer === pendidikanLK) return 'Pendidikan Laki-laki';
  if (layer === pendidikanPR) return 'Pendidikan Perempuan';
  if (layer === kepalaKeluarga) return 'Kepala Keluarga';
  if (layer === agamaL) return 'Agama (Laki-laki)';
  if (layer === agamaP) return 'Agama (Perempuan)';
  if (layer === jenisKelamin) return 'Jenis Kelamin';
  if (layer === kepadatanPenduduk) return 'Kepadatan Penduduk';
  if (layer === kantorKecamatan) return 'Kantor Kecamatan';
  return 'Layer';
}

// inverse mapping: return short key used in UI for a given layer object
function getLayerKeyByLayer(layer) {
  if (layer === kecbdg) return 'kecbdg';
  if (layer === pekerjaanPR) return 'pekerjaanpr';
  if (layer === pekerjaanLK) return 'pekerjaanlk';
  if (layer === goldarLK) return 'GOLDARLK';
  if (layer === goldarPR) return 'GOLDARPR';
  if (layer === pendidikanLK) return 'PENDIDIKANLK';
  if (layer === pendidikanPR) return 'PENDIDIKANPR';
  if (layer === kepalaKeluarga) return 'KEPALA_KELUARGA';
  if (layer === agamaL) return 'AGAMALK';
  if (layer === agamaP) return 'AGAMAPR';
  if (layer === jenisKelamin) return 'JENISKEL';
  if (layer === kepadatanPenduduk) return 'KEPADATAN';
  if (layer === kantorKecamatan) return 'kantorKecamatan';
  return null;
}

function getLayerZIndex(layer) {
  try{ return map._layers[L.stamp(layer)] && map._layers[L.stamp(layer)].options && map._layers[L.stamp(layer)].options.zIndex || L.stamp(layer); }catch(e){ return L.stamp(layer); }
}

// Download feature buttons removed (non-functional).

function findLayerByShortName(short) {
  short = short.toString().toLowerCase();
  if (short.indexOf('kecamatan') !== -1) return kecbdg;
  if (short.indexOf('pekerjaan') !== -1 && short.indexOf('perempuan') !== -1) return pekerjaanPR;
  if (short.indexOf('pekerjaan') !== -1 && short.indexOf('pria') !== -1) return pekerjaanLK;
  if (short.indexOf('gol') !== -1 && short.indexOf('laki') !== -1) return goldarLK;
  if (short.indexOf('gol') !== -1 && short.indexOf('perempuan') !== -1) return goldarPR;
  if (short.indexOf('pendidikan') !== -1 && short.indexOf('laki') !== -1) return pendidikanLK;
  if (short.indexOf('pendidikan') !== -1 && short.indexOf('perempuan') !== -1) return pendidikanPR;
  if (short.indexOf('kepala') !== -1 || short.indexOf('kepala keluarga') !== -1) return kepalaKeluarga;
  if (short.indexOf('agama') !== -1 && short.indexOf('laki') !== -1) return agamaL;
  if (short.indexOf('agama') !== -1 && short.indexOf('perempuan') !== -1) return agamaP;
  if (short.indexOf('jenis') !== -1 || short.indexOf('kelamin') !== -1) return jenisKelamin;
  if (short.indexOf('kepadatan') !== -1 || short.indexOf('jumlah') !== -1) return kepadatanPenduduk;
  return null;
}

// Download single feature as XLSX using SheetJS
function downloadFeatureAsXLSX(feature, layerName) {
  var props = feature.properties || {};
  // determine fields according to popup mode
  var mode = $('input[name="lp-popup-mode"]:checked').val() || 'all';
  var selectedField = $('#lp-field').val();
  var alwaysShow = ['WADMKC','KDCPUM','JenisKel'];
  var out = {};
  for (var k in props) {
    if (!props.hasOwnProperty(k)) continue;
    if (mode === 'only') {
      if (k === selectedField || alwaysShow.indexOf(k) !== -1) out[k] = props[k];
    } else {
      out[k] = props[k];
    }
  }
  // ensure always present
  alwaysShow.forEach(function(k){ if (!out[k] && props[k]) out[k] = props[k]; });
  // coerce numbers
  for (var kk in out) {
    if (!out.hasOwnProperty(kk)) continue;
    var n = Number(out[kk]);
    if (!isNaN(n)) out[kk] = n;
  }
  var ws = XLSX.utils.json_to_sheet([out]);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Feature');
  var id = feature.id || feature.properties && (feature.properties.id || feature.properties.ID || feature.properties.OBJECTID) || '';
  var wad = feature.properties && feature.properties.WADMKC ? feature.properties.WADMKC.replace(/\s+/g,'_') : '';
  var fname = (layerName || 'layer') + '_' + id + '_' + wad + '.xlsx';
  // write to blob and trigger download
  var wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  try {
    var blob = new Blob([wbout], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  } catch (e) {
    // fallback
    XLSX.writeFile(wb, fname);
  }
}

// Simple numeric array extractor
function valuesFromFeatureCollection(layer, field) {
  var vals = [];
  layer.eachLayer(function(l){
    var v = l.feature && l.feature.properties ? Number(l.feature.properties[field]) : NaN;
    if (!isNaN(v)) vals.push(v);
  });
  return vals;
}

// Jenks (Natural Breaks) implementation (simple) - uses simple iterative algorithm for small datasets
function jenks(data, n_classes) {
  if (!data || data.length === 0) return [];
  data = data.slice().sort(function(a,b){return a-b;});
  var matrices = {
    lower: [],
    variance: []
  };
  var i,j;
  for (i=0;i<data.length+1;i++){
    var temp1 = [], temp2 = [];
    for (j=0;j<n_classes+1;j++){
      temp1.push(0);
      temp2.push(Infinity);
    }
    matrices.lower.push(temp1);
    matrices.variance.push(temp2);
  }
  for (i=1;i<n_classes+1;i++){
    matrices.lower[0][i]=1;
    matrices.variance[0][i]=0;
    for (j=1;j<data.length+1;j++){
      matrices.variance[j][i]=Infinity;
    }
  }
  var v=0.0;
  for (var l=2;l<data.length+1;l++){
    var s1=0.0, s2=0.0, w=0.0;
    for (var m=1;m<l+1;m++){
      var i3 = l-m+1;
      var val = data[i3-1];
      s2 += val*val;
      s1 += val;
      w += 1;
      v = s2 - (s1*s1)/w;
      var i4 = i3-1;
      if (i4 !== 0) {
        for (var p=2;p<n_classes+1;p++){
          if (matrices.variance[l][p] >= (v + matrices.variance[i4][p-1])){
            matrices.lower[l][p] = i3;
            matrices.variance[l][p] = v + matrices.variance[i4][p-1];
          }
        }
      }
    }
    matrices.lower[l][1] = 1;
    matrices.variance[l][1] = v;
  }
  var k = data.length;
  var kclass = [];
  for (i=0;i<n_classes+1;i++){
    kclass.push(0);
  }
  kclass[n_classes] = data[data.length-1];
  var countNum = n_classes;
  while (countNum >= 2) {
    var idx = parseInt((matrices.lower[k][countNum]) - 2);
    kclass[countNum-1] = data[idx];
    k = parseInt((matrices.lower[k][countNum]-1));
    countNum -= 1;
  }
  kclass[0] = data[0];
  return kclass;
}

function equalInterval(values, n) {
  var min = Math.min.apply(null, values);
  var max = Math.max.apply(null, values);
  var step = (max - min) / n;
  var breaks = [min];
  for (var i=1;i<=n;i++) breaks.push(min + step*i);
  return breaks;
}

function quantile(values, n) {
  values = values.slice().sort(function(a,b){return a-b;});
  var breaks = [values[0]];
  for (var i=1;i<=n;i++){
    var q = i/n;
    var pos = (values.length - 1) * q;
    var base = Math.floor(pos);
    var rest = pos - base;
    var val = values[base] + rest * (values[base+1] - values[base] || 0);
    breaks.push(val);
  }
  return breaks;
}

// simple color ramp between two hex colors
function colorRamp(hex1, hex2, steps) {
  function hexToRgb(hex) { return [parseInt(hex.substr(1,2),16), parseInt(hex.substr(3,2),16), parseInt(hex.substr(5,2),16)]; }
  function rgbToHex(r,g,b){ return '#' + [r,g,b].map(function(x){ var s = x.toString(16); return s.length==1? '0'+s : s; }).join(''); }
  var c1 = hexToRgb(hex1), c2 = hexToRgb(hex2);
  var out = [];
  for (var i=0;i<steps;i++){
    var t = steps===1 ? 0 : i/(steps-1);
    var r = Math.round(c1[0] + (c2[0]-c1[0])*t);
    var g = Math.round(c1[1] + (c2[1]-c1[1])*t);
    var b = Math.round(c1[2] + (c2[2]-c1[2])*t);
    out.push(rgbToHex(r,g,b));
  }
  return out;
}

function applyClassification(layer, field, classes, method, colorFrom, colorTo) {
  var values = valuesFromFeatureCollection(layer, field);
  if (!values || values.length === 0) {
    alert('Tidak ada nilai numerik pada field yang dipilih.');
    return;
  }
  var breaks;
  if (method === 'jenks') breaks = jenks(values, classes);
  else if (method === 'equal') breaks = equalInterval(values, classes);
  else breaks = quantile(values, classes);

  // generate colors
  var colors = colorRamp(colorFrom, colorTo, classes);

  // Assign style per feature
  layer.eachLayer(function(l){
    var v = Number(l.feature.properties[field]);
    if (isNaN(v)) return;
    // find class index
    var idx = 0;
    for (var i=0;i<breaks.length-1;i++){
      if (v >= breaks[i] && v <= breaks[i+1]) { idx = i; break; }
    }
    l.setStyle({ fillColor: colors[idx], color: colors[idx], fillOpacity: 0.7, weight:1 });
    // remove any per-feature bound popup to ensure combined popup is used on single click
    try{ if (typeof l.unbindPopup === 'function') l.unbindPopup(); }catch(e){}
  });

  // store classification into layer state
  var id = layer._leaflet_id || (layer.options && layer.options.layerId) || null;
  if (id) {
    saveLayerState(id, { field: field, classes: classes, method: method, colorFrom: colorFrom, colorTo: colorTo, breaks: breaks, colors: colors });
  }

  updateLegendForActiveLayers();
}

function updateLegend(breaks, colors) {
  // Deprecated: use updateLegendForActiveLayers
}

function fmt(v) { return (Math.round(v*100)/100); }

function generateLegendHtmlForLayer(layerId, state, layerName) {
  if (!state || !state.breaks || !state.colors) return '';
  var breaks = state.breaks;
  var colors = state.colors;
  var html = '<div class="legend-layer" data-layerid="'+layerId+'"><div class="legend-layer-header"><strong>' + (layerName||'Layer') + '</strong></div><div class="legend-list">';
  for (var i=0;i<colors.length;i++){
    var left = (breaks[i] !== undefined) ? fmt(breaks[i]) : '';
    var right = (breaks[i+1] !== undefined) ? fmt(breaks[i+1]) : '';
    var label = left + ' – ' + right;
    html += '<div class="legend-row"><span class="legend-swatch" style="background:' + colors[i] + '"></span> <div class="legend-label">' + label + '</div></div>';
  }
  html += '</div></div>';
  return html;
}

function updateLegendForActiveLayers() {
  // Build legend content from all visible layers that have classification state
  var content = '';
  var any = false;
  var layerMap = {
    'kecbdg': kecbdg,
    'pekerjaanpr': pekerjaanPR,
    'pekerjaanlk': pekerjaanLK,
    'GOLDARLK': goldarLK,
    'GOLDARPR': goldarPR,
    'PENDIDIKANLK': pendidikanLK,
    'PENDIDIKANPR': pendidikanPR,
    'KEPALA_KELUARGA': kepalaKeluarga,
    'AGAMALK': agamaL,
    'AGAMAPR': agamaP,
    'JENISKEL': jenisKelamin,
    'KEPADATAN': kepadatanPenduduk
  };
  for (var key in layerMap) {
    var ly = layerMap[key];
    if (!ly) continue;
    if (!map.hasLayer(ly)) continue; // only visible layers
    var st = getLayerState(ly._leaflet_id || ly.options && ly.options.layerId || key);
    if (st && st.breaks && st.colors) {
      any = true;
      content += generateLegendHtmlForLayer(ly._leaflet_id || key, st, key);
    }
  }
  if (!any) {
    $('#dynamic-legend').hide().empty();
    $('#lp-legend-preview').empty();
    $('#legendModal .modal-body').html('<p>Legenda kosong</p>');
    return;
  }
  $('#dynamic-legend').html('<strong>Legenda</strong><br/>' + content).css({display:'block'}).show();
  $('#lp-legend-preview').html(content);
  $('#legendModal .modal-body').html(content);
}

// Layer Properties modal handlers
$('#layer-properties-btn').click(function(){ $('#layerPropertiesModal').modal('show'); });

// Populate field autosuggest when opening the modal
$('#layerPropertiesModal').on('show.bs.modal', function(){
  var layerKey = $('#lp-layer-select').val();
  var layer = null;
  if (layerKey === 'kecbdg') layer = kecbdg;
  else if (layerKey === 'pekerjaanpr') layer = pekerjaanPR;
  else if (layerKey === 'pekerjaanlk') layer = pekerjaanLK;
  else if (layerKey === 'GOLDARLK') layer = goldarLK;
  else if (layerKey === 'GOLDARPR') layer = goldarPR;
  else if (layerKey === 'PENDIDIKANLK') layer = pendidikanLK;
  else if (layerKey === 'PENDIDIKANPR') layer = pendidikanPR;
  else if (layerKey === 'KEPALA_KELUARGA') layer = kepalaKeluarga;
  else if (layerKey === 'AGAMALK') layer = agamaL;
  else if (layerKey === 'AGAMAPR') layer = agamaP;
  else if (layerKey === 'JENISKEL') layer = jenisKelamin;
  else if (layerKey === 'KEPADATAN') layer = kepadatanPenduduk;
  var fields = [];
  if (layer) {
    layer.eachLayer(function(l){
      if (l.feature && l.feature.properties) {
        for (var k in l.feature.properties) {
          if (fields.indexOf(k) === -1) fields.push(k);
        }
      }
    });
  }
  // populate datalist
  var $list = $('#lp-field-list');
  $list.empty();
  fields.sort();
  fields.forEach(function(f){ $list.append('<option value="'+f+'">'); });
  // Populate per-field styling area
  var $styles = $('#lp-field-styles');
  $styles.empty();
  if (fields.length === 0) { $styles.text('No fields available'); }
  else {
    fields.forEach(function(f){
      var id = 'fieldstyle-' + f;
      var html = '<div class="d-flex align-items-center mb-1" data-field="'+f+'">'
        + '<div class="me-2" style="width:38%"><strong>'+f+'</strong></div>'
        + '<select class="form-select form-select-sm me-2 field-style-select" id="'+id+'" data-field="'+f+'">'
        + '<option value="label">Inline label (visible with data)</option>'
        + '<option value="label-always">Inline label (always visible)</option>'
        + '<option value="nolabel">No label</option>'
        + '<option value="hidden">Hidden</option>'
        + '</select>'
        + '</div>';
      $styles.append(html);
    });
  }
  // load saved layer state into modal controls
  var selKey = $('#lp-layer-select').val();
  var layer = layerForKey(selKey);
  if (layer) {
    var st = getLayerState(layer._leaflet_id || selKey) || {};
    if (st.field) $('#lp-field').val(st.field);
    if (st.classes) $('#lp-classes').val(st.classes);
    if (st.method) $('#lp-method').val(st.method);
    if (st.colorFrom) $('#lp-color-from').val(st.colorFrom);
    if (st.colorTo) $('#lp-color-to').val(st.colorTo);
    if (st.opacity !== undefined) $('#lp-opacity').val(st.opacity);
    // custom class labels
    if (st.customLabels && Array.isArray(st.customLabels)) {
      var $labels = $('#lp-class-labels'); $labels.empty();
      st.customLabels.forEach(function(lab, idx){ $labels.append('<input class="form-control form-control-sm mb-1 lp-class-label" data-idx="'+idx+'" value="'+lab+'" />'); });
    } else { $('#lp-class-labels').empty(); }
    // per-field styles
    if (st.fieldStyles) {
      for (var k in st.fieldStyles) { $('#fieldstyle-' + k).val(st.fieldStyles[k]); }
    }
    // label toggle
    $('#lp-label-toggle').prop('checked', !!(st.labelsEnabled));
    if (st.labelStyle) {
      $('#lp-label-color').val(st.labelStyle.color || '#000');
      $('#lp-label-font').val(st.labelStyle.font || 'Arial');
      $('#lp-label-size').val(st.labelStyle.size || 12);
    }
  }
});

// Fallback: also populate when button clicked (for compatibility)
$('#layer-properties-btn').on('click', function(){
  // small timeout to allow modal DOM to be available
  setTimeout(function(){ $('#layerPropertiesModal').trigger('show.bs.modal'); }, 50);
});

$('#lp-apply').click(function(){
  var layerKey = $('#lp-layer-select').val();
  var field = $('#lp-field').val();
  var classes = parseInt($('#lp-classes').val(),10) || 5;
  var method = $('#lp-method').val();
  var colorFrom = $('#lp-color-from').val();
  var colorTo = $('#lp-color-to').val();
  var layer = null;
  if (layerKey === 'kecbdg') layer = kecbdg;
  else if (layerKey === 'pekerjaanpr') layer = pekerjaanPR;
  else if (layerKey === 'pekerjaanlk') layer = pekerjaanLK;
  else if (layerKey === 'GOLDARLK') layer = goldarLK;
  else if (layerKey === 'GOLDARPR') layer = goldarPR;
  else if (layerKey === 'PENDIDIKANLK') layer = pendidikanLK;
  else if (layerKey === 'PENDIDIKANPR') layer = pendidikanPR;
  else if (layerKey === 'KEPALA_KELUARGA') layer = kepalaKeluarga;
  else if (layerKey === 'AGAMALK') layer = agamaL;
  else if (layerKey === 'AGAMAPR') layer = agamaP;
  else if (layerKey === 'JENISKEL') layer = jenisKelamin;
  else if (layerKey === 'KEPADATAN') layer = kepadatanPenduduk;
  if (!layer) { alert('Layer tidak ditemukan'); return; }
  if (!field) { alert('Masukkan nama field properti untuk klasifikasi'); return; }
  applyClassification(layer, field, classes, method, colorFrom, colorTo);
  // save additional UI state: custom class labels + per-field styles + label toggles
  var st = getLayerState(layer._leaflet_id || layerKey) || {};
  // custom labels
  var labels = [];
  $('.lp-class-label').each(function(){ labels.push($(this).val()); });
  if (labels.length) st.customLabels = labels;
  // field styles
  st.fieldStyles = st.fieldStyles || {};
  $('.field-style-select').each(function(){ var f = $(this).data('field'); st.fieldStyles[f] = $(this).val(); });
  // opacity
  st.opacity = parseFloat($('#lp-opacity').val());
  // label toggle
  st.labelsEnabled = !!$('#lp-label-toggle').prop('checked');
  // label style options
  st.labelStyle = {
    color: $('#lp-label-color').val() || '#000',
    font: $('#lp-label-font').val() || 'Arial',
    size: parseInt($('#lp-label-size').val(),10) || 12
  };
  saveLayerState(layer._leaflet_id || layerKey, st);
  // apply label rendering if requested
  toggleLabelsForLayer(layer, st.labelsEnabled, st.labelStyle);
  // If there's a currently selected feature, refresh its popup so classification/field changes are reflected
  try{
    var openedFeature = null;
    selectedHighlight.eachLayer(function(l){ if (!openedFeature) openedFeature = (l.feature || l); });
    if (openedFeature) showCombinedPopupForFeature(openedFeature);
  }catch(e){}
  $('#layerPropertiesModal').modal('hide');
});

// Reset style to default per layer
$('#lp-reset').click(function(){
  var layerKey = $('#lp-layer-select').val();
  var layer = null;
  if (layerKey === 'kecbdg') layer = kecbdg;
  else if (layerKey === 'pekerjaanpr') layer = pekerjaanPR;
  else if (layerKey === 'pekerjaanlk') layer = pekerjaanLK;
  else if (layerKey === 'GOLDARLK') layer = goldarLK;
  else if (layerKey === 'GOLDARPR') layer = goldarPR;
  else if (layerKey === 'PENDIDIKANLK') layer = pendidikanLK;
  else if (layerKey === 'PENDIDIKANPR') layer = pendidikanPR;
  else if (layerKey === 'KEPALA_KELUARGA') layer = kepalaKeluarga;
  else if (layerKey === 'AGAMALK') layer = agamaL;
  else if (layerKey === 'AGAMAPR') layer = agamaP;
  else if (layerKey === 'JENISKEL') layer = jenisKelamin;
  else if (layerKey === 'KEPADATAN') layer = kepadatanPenduduk;
  if (!layer) return;
  // Reset styling: re-apply default style based on layer identity
  layer.eachLayer(function(l){
    try{
      if (layer === kecbdg) l.setStyle({ color: '#2b7cff', weight:1, fillColor:'#7fb3ff', fillOpacity:0.4 });
      else if (layer === pekerjaanPR) l.setStyle({ color: '#b30059', weight:1, fillOpacity:0.6 });
      else if (layer === pekerjaanLK) l.setStyle({ color: '#006d2c', weight:1, fillOpacity:0.6 });
      else if (layer === goldarLK) l.setStyle({ color: '#7a0177', weight:1, fillOpacity:0.6 });
      else if (layer === goldarPR) l.setStyle({ color: '#fb6a4a', weight:1, fillOpacity:0.6 });
      else if (layer === pendidikanLK) l.setStyle({ color: '#2b8cbe', weight:1, fillOpacity:0.6 });
      else if (layer === pendidikanPR) l.setStyle({ color: '#f03b20', weight:1, fillOpacity:0.6 });
  else if (layer === kepalaKeluarga) l.setStyle({ color: '#6a51a3', weight:1, fillOpacity:0.6 });
  else if (layer === agamaL) l.setStyle({ color: '#238b45', weight:1, fillOpacity:0.6 });
  else if (layer === agamaP) l.setStyle({ color: '#2ca25f', weight:1, fillOpacity:0.6 });
  else if (layer === kepadatanPenduduk) l.setStyle({ color: '#08519c', weight:1, fillOpacity:0.6 });
    } catch(e){}
  });
  // clear legend preview
  $('#lp-legend-preview').empty();
  // clear stored state for this layer
  var layerKey = $('#lp-layer-select').val();
  var layer = layerForKey(layerKey);
  if (layer) {
    var id = layer._leaflet_id || layerKey;
    delete layerStates[id];
    localStorage.setItem(LAYER_STATE_KEY, JSON.stringify(layerStates));
    toggleLabelsForLayer(layer, false, 0);
  }
});

// Update field list when user changes selected layer without closing modal
$('#lp-layer-select').on('change', function(){
  // If there are unsaved changes in modal, prompt confirmation
  var currentLayer = layerForKey($(this).data('previous') || $('#lp-layer-select').data('previous'));
  var newKey = $(this).val();
  var newLayer = layerForKey(newKey);
  // simple check: if modal has unsaved inputs (any .lp-class-label or field changed) then prompt
  var unsaved = false;
  $('.lp-class-label, .field-style-select, #lp-label-toggle, #lp-label-threshold').each(function(){ if ($(this).val() && $(this).val().toString().length>0) unsaved = true; });
  if (unsaved) {
    // show confirmation modal
    $('#layer-switch-confirm').remove();
    var modalHtml = '<div class="modal fade" id="layer-switch-confirm" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Reset Layer Properties?</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">Layer Properties akan di-reset mengikuti layer aktif. Lanjutkan?</div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" id="layer-switch-confirm-yes">Yes, Reset</button></div></div></div></div>';
    $('body').append(modalHtml);
    var m = new bootstrap.Modal(document.getElementById('layer-switch-confirm'));
    m.show();
    $('#layer-switch-confirm-yes').on('click', function(){
      // clear modal inputs and load new layer
      $('.lp-class-label').remove();
      $('.field-style-select').val('label');
      $('#lp-label-toggle').prop('checked', false);
      $('#lp-label-threshold').val(0);
      $('#lp-layer-select').val(newKey).data('previous', newKey);
      m.hide();
      $('#layerPropertiesModal').trigger('show.bs.modal');
    });
  } else {
    $('#layerPropertiesModal').trigger('show.bs.modal');
  }
  // remember previous
  $('#lp-layer-select').data('previous', newKey);
});

// helper to map key to layer object
function layerForKey(key) {
  if (key === 'kecbdg') return kecbdg;
  if (key === 'pekerjaanpr') return pekerjaanPR;
  if (key === 'pekerjaanlk') return pekerjaanLK;
  if (key === 'GOLDARLK') return goldarLK;
  if (key === 'GOLDARPR') return goldarPR;
  if (key === 'PENDIDIKANLK') return pendidikanLK;
  if (key === 'PENDIDIKANPR') return pendidikanPR;
  if (key === 'KEPALA_KELUARGA') return kepalaKeluarga;
  if (key === 'AGAMALK') return agamaL;
  if (key === 'AGAMAPR') return agamaP;
  if (key === 'JENISKEL') return jenisKelamin;
  if (key === 'KEPADATAN') return kepadatanPenduduk;
  return null;
}

// On page load, try to restore saved styles for visible layers
$(document).ready(function(){
  var layerMap = {
    'kecbdg': kecbdg,
    'pekerjaanpr': pekerjaanPR,
    'pekerjaanlk': pekerjaanLK,
    'GOLDARLK': goldarLK,
    'GOLDARPR': goldarPR,
    'PENDIDIKANLK': pendidikanLK,
    'PENDIDIKANPR': pendidikanPR,
    'KEPALA_KELUARGA': kepalaKeluarga,
    'AGAMALK': agamaL,
    'AGAMAPR': agamaP,
    'JENISKEL': jenisKelamin,
    'KEPADATAN': kepadatanPenduduk
  };
  for (var k in layerMap) {
    var ly = layerMap[k];
    if (!ly) continue;
    var st = getLayerState(ly._leaflet_id || k);
    if (st) {
      // apply classification colors if present
      if (st.field && st.breaks && st.colors) {
        applyClassification(ly, st.field, st.classes || 5, st.method || 'jenks', st.colorFrom || '#f7fbff', st.colorTo || '#08306b');
      }
      // apply opacity
      if (st.opacity !== undefined) {
        ly.eachLayer(function(l){ try{ l.setStyle && l.setStyle({fillOpacity: st.opacity, opacity: st.opacity}); }catch(e){} });
      }
      // labels
      if (st.labelsEnabled) toggleLabelsForLayer(ly, true, st.labelStyle || { color:'#000', font:'Arial', size:12 });
    }
  }
});

// Opacity control: apply to currently selected layer
$('#lp-opacity').on('input change', function(){
  var v = parseFloat($(this).val());
  var layerKey = $('#lp-layer-select').val();
  var layer = null;
  if (layerKey === 'kecbdg') layer = kecbdg;
  else if (layerKey === 'pekerjaanpr') layer = pekerjaanPR;
  else if (layerKey === 'pekerjaanlk') layer = pekerjaanLK;
  else if (layerKey === 'GOLDARLK') layer = goldarLK;
  else if (layerKey === 'GOLDARPR') layer = goldarPR;
  else if (layerKey === 'PENDIDIKANLK') layer = pendidikanLK;
  else if (layerKey === 'PENDIDIKANPR') layer = pendidikanPR;
  else if (layerKey === 'KEPALA_KELUARGA') layer = kepalaKeluarga;
  else if (layerKey === 'AGAMALK') layer = agamaL;
  else if (layerKey === 'AGAMAPR') layer = agamaP;
  else if (layerKey === 'JENISKEL') layer = jenisKelamin;
  else if (layerKey === 'KEPADATAN') layer = kepadatanPenduduk;
  if (!layer) return;
  layer.eachLayer(function(l){
    try{ l.setStyle && l.setStyle({fillOpacity: v, opacity: v}); }catch(e){}
  });
  // also adjust highlight opacity
  highlight.eachLayer(function(h){ try{ h.setStyle && h.setStyle({fillOpacity: v}); }catch(e){} });
  selectedHighlight.eachLayer(function(h){ try{ h.setStyle && h.setStyle({fillOpacity: Math.min(0.95, v + 0.2)}); }catch(e){} });
});

// Download handlers (updated to match new layers/files)
$('#download-kecamatan-xlsx').click(function(){ downloadXLSXFromLayer(kecbdg, 'kecamatan.xlsx'); });
$('#download-agama-l-xlsx').click(function(){ downloadXLSXFromLayer(agamaL, 'agama_laki_laki.xlsx'); });
$('#download-agama-p-xlsx').click(function(){ downloadXLSXFromLayer(agamaP, 'agama_perempuan.xlsx'); });
$('#download-goldar-l-xlsx').click(function(){ downloadXLSXFromLayer(goldarLK, 'goldar_laki_laki.xlsx'); });
$('#download-goldar-p-xlsx').click(function(){ downloadXLSXFromLayer(goldarPR, 'goldar_perempuan.xlsx'); });
$('#download-jenis-kelamin-xlsx').click(function(){ downloadXLSXFromLayer(jenisKelamin, 'jenis_kelamin.xlsx'); });
$('#download-kepadatan-xlsx').click(function(){ downloadXLSXFromLayer(kepadatanPenduduk, 'kepadatan_penduduk.xlsx'); });
$('#download-kepalakeluarga-xlsx').click(function(){ downloadXLSXFromLayer(kepalaKeluarga, 'kepala_keluarga.xlsx'); });
$('#download-pekerjaan-l-xlsx').click(function(){ downloadXLSXFromLayer(pekerjaanLK, 'pekerjaan_laki_laki.xlsx'); });
$('#download-pekerjaan-p-xlsx').click(function(){ downloadXLSXFromLayer(pekerjaanPR, 'pekerjaan_perempuan.xlsx'); });
$('#download-pendidikan-l-xlsx').click(function(){ downloadXLSXFromLayer(pendidikanLK, 'pendidikan_laki_laki.xlsx'); });
$('#download-pendidikan-p-xlsx').click(function(){ downloadXLSXFromLayer(pendidikanPR, 'pendidikan_perempuan.xlsx'); });

// Automatic synchronization: periodically re-fetch GeoJSON sources and update layers in-place
function refreshLayerData() {
  try {
  $.getJSON('data/kecbgd.geojson', function(data){ try{ kecbdg.clearLayers(); kecbdg.addData(data); try{ disableKeyboardFocusForLayer(kecbdg); }catch(e){} }catch(e){} });
  $.getJSON('data/Pekerjaan_P_2025.geojson', function(data){ try{ pekerjaanPR.clearLayers(); pekerjaanPR.addData(data); try{ disableKeyboardFocusForLayer(pekerjaanPR); }catch(e){} }catch(e){} });
  $.getJSON('data/Pekerjaan_L_2025.geojson', function(data){ try{ pekerjaanLK.clearLayers(); pekerjaanLK.addData(data); try{ disableKeyboardFocusForLayer(pekerjaanLK); }catch(e){} }catch(e){} });
  $.getJSON('data/Goldar_L_2025.geojson', function(data){ try{ goldarLK.clearLayers(); goldarLK.addData(data); try{ disableKeyboardFocusForLayer(goldarLK); }catch(e){} }catch(e){} });
  $.getJSON('data/Goldar_P_2025.geojson', function(data){ try{ goldarPR.clearLayers(); goldarPR.addData(data); try{ disableKeyboardFocusForLayer(goldarPR); }catch(e){} }catch(e){} });
  $.getJSON('data/Pendidikan_L_2025.geojson', function(data){ try{ pendidikanLK.clearLayers(); pendidikanLK.addData(data); try{ disableKeyboardFocusForLayer(pendidikanLK); }catch(e){} }catch(e){} });
  $.getJSON('data/Pendidikan_P_2025.geojson', function(data){ try{ pendidikanPR.clearLayers(); pendidikanPR.addData(data); try{ disableKeyboardFocusForLayer(pendidikanPR); }catch(e){} }catch(e){} });
  $.getJSON('data/KepalaKeluarga_2025.geojson', function(data){ try{ kepalaKeluarga.clearLayers(); kepalaKeluarga.addData(data); try{ disableKeyboardFocusForLayer(kepalaKeluarga); }catch(e){} }catch(e){} });
  $.getJSON('data/Agama_L_2025.geojson', function(data){ try{ agamaL.clearLayers(); agamaL.addData(data); try{ disableKeyboardFocusForLayer(agamaL); }catch(e){} }catch(e){} });
  $.getJSON('data/Agama_P_2025.geojson', function(data){ try{ agamaP.clearLayers(); agamaP.addData(data); try{ disableKeyboardFocusForLayer(agamaP); }catch(e){} }catch(e){} });
  $.getJSON('data/JenisKelamin_2025.geojson', function(data){ try{ jenisKelamin.clearLayers(); jenisKelamin.addData(data); try{ disableKeyboardFocusForLayer(jenisKelamin); }catch(e){} }catch(e){} });
  $.getJSON('data/KepadatanPenduduk_2025.geojson', function(data){ try{ kepadatanPenduduk.clearLayers(); kepadatanPenduduk.addData(data); try{ disableKeyboardFocusForLayer(kepadatanPenduduk); }catch(e){} }catch(e){} });
    // After refresh, update sidebar and legend
    setTimeout(function(){ syncSidebar(); updateLegendForActiveLayers(); }, 300);
  } catch (e) {
    console.warn('Error while refreshing layers', e);
  }
}

// Start periodic polling for updates (every 3 hours). Adjust interval as needed.
setInterval(refreshLayerData, 3 * 60 * 60 * 1000);

// XLSX download handlers using SheetJS
function geojsonToSheetData(layer) {
  var rows = [];
  var bounds = map.getBounds();
  layer.eachLayer(function(l){
    if (!l.feature || !l.feature.properties) return;
    var include = true;
    try {
      var featBounds = l.getBounds ? l.getBounds() : null;
      if (featBounds && !bounds.intersects(featBounds)) include = false;
      // for points
      if (l.getLatLng && l.getLatLng()) {
        var latlng = l.getLatLng();
        if (!bounds.contains(latlng)) include = false;
      }
    } catch (e) {
      // ignore geometry checks
    }
    if (include) rows.push(l.feature.properties);
  });
  return rows;
}

function downloadXLSXFromLayer(layer, filename) {
  var rows = geojsonToSheetData(layer);
  if (rows.length === 0) { alert('Tidak ada data untuk di-download'); return; }
  var ws = XLSX.utils.json_to_sheet(rows);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}

$('#download-kecamatan-xlsx').click(function(){ downloadXLSXFromLayer(kecbdg, 'kecamatan.xlsx'); });
$('#download-pekerjaanpr-xlsx').click(function(){ downloadXLSXFromLayer(pekerjaanPR, 'pekerjaan_perempuan.xlsx'); });
$('#download-pekerjaanlk-xlsx').click(function(){ downloadXLSXFromLayer(pekerjaanLK, 'pekerjaan_pria.xlsx'); });

// Make popup show full properties when clicked on map for any active layer
map.on('click', function(e){
  // Nothing extra here; popups bound to each feature will show on click
});

// Charts removed per request. Crossfilter/chart code cleaned up.

// Fallbacks: if Ajax calls are blocked (for example when opening the file via file://)
// the initial $(document).one("ajaxStop", ...) handler above may never fire. Ensure
// the loading overlay is hidden and provide some diagnostic logging for Ajax errors.
// This prevents the app from appearing to 'hang' with the loading spinner forever.

// Fallback: set atribut SVG pointer-events pada path Leaflet agar event pointer
// hanya terjadi pada area yang dicat (mengurangi klik yang terdeteksi pada bbox)
function enforceSvgPointerEvents() {
  try{
    document.querySelectorAll('.leaflet-container svg path.leaflet-interactive').forEach(function(p){
      try { p.setAttribute('pointer-events', 'visiblePainted'); } catch(e){}
    });
  }catch(e){}
}
// Jalankan sekali setelah inisialisasi dan juga saat peta/layanan dirender ulang
setTimeout(enforceSvgPointerEvents, 500);
try{ map.on('zoomend layeradd layerremove', enforceSvgPointerEvents); }catch(e){}
$(document).ajaxError(function(event, jqxhr, settings, thrownError) {
  try {
    console.warn('AJAX error for', settings && settings.url, thrownError || jqxhr && jqxhr.statusText);
  } catch (e) {}
});

// Ensure the loading indicator is hidden either when the page finishes loading
// or after a short timeout (5s). This is a safety net when some AJAX calls
// don't complete (blocked by CORS or file:// restrictions).
$(window).on('load', function() { try { $('#loading').hide(); } catch(e){} });
setTimeout(function() { try { $('#loading').hide(); } catch(e){} }, 5000);