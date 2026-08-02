/* ============================================================
   UNBOUND SHIPPING MODULE
   ------------------------------------------------------------
   ARCHITECTURE OVERVIEW

   1. CUSTOMER-FACING FEES -> UB_SHIPPING_ZONES (below) is the ONLY
      place delivery prices are defined. Every UI element reads
      from it. Update prices here, nowhere else.

   2. COURIER / PROVIDER COST -> UB_COURIER_COST_PLACEHOLDER exists
      only as a shape reference for a future backend. It is never
      rendered to the customer and holds no real data yet.

   3. ZONE CLASSIFICATION -> getDeliveryZone(lat, lon, addressText)
      is the single reusable function that turns a location into
      a zone. Nothing else in the app should contain zone logic.

      Per the current launch scope, classification is NOT polygon/
      geofence based. It uses:
        a) curated neighbourhood keyword matching (high confidence)
        b) nearest-centroid distance as a fallback (medium/low confidence)
      This is intentionally simple and modular -- real polygon
      boundaries can replace step (b) later without touching
      any calling code, since the function signature/return
      shape stays the same.

   4. GEOCODING -> uses OpenStreetMap Nominatim (free, no API key,
      fine for launch volume). Swap ubGeocodeSearch / ubReverseGeocode
      for a paid provider (Google/Mapbox/etc.) later if volume or
      accuracy requires it -- nothing else in this file needs to change.

   5. PRIVACY -> precise lat/lon is kept only in memory during the
      session for classification. It is never written to
      localStorage. Only the normalized address, zone, fee, and
      a timestamp are stored, and only once the customer actively
      confirms a location.
   ============================================================ */

const UB_SHIPPING_ZONES = [
  {
    id: 'zone1',
    name: 'Zone 1 — Nearby',
    areas: ['Isheri', 'Magodo', 'Omole', 'Ojodu', 'Berger'],
    minFee: 2000,
    maxFee: 2000,
    displayFee: '₦2,000',
    estimatedDelivery: 'Same day / 1 business day'
  },
  {
    id: 'zone2',
    name: 'Zone 2 — Mainland',
    areas: ['Ikeja', 'Ogba', 'Maryland', 'Anthony', 'Yaba', 'Surulere', 'Gbagada', 'Agege', 'Egbeda'],
    minFee: 3500,
    maxFee: 4000,
    displayFee: '₦3,500–₦4,000',
    estimatedDelivery: '1–2 business days'
  },
  {
    id: 'zone3',
    name: 'Zone 3 — Island',
    areas: ['Lagos Island', 'CMS', 'Victoria Island', 'Ikoyi'],
    minFee: 5500,
    maxFee: 5500,
    displayFee: '₦5,500',
    estimatedDelivery: '1–2 business days'
  },
  {
    id: 'zone4',
    name: 'Zone 4 — Lekki',
    areas: ['Lekki Phase 1', 'Chevron', 'Jakande'],
    minFee: 6000,
    maxFee: 6500,
    displayFee: '₦6,000–₦6,500',
    estimatedDelivery: '1–2 business days'
  },
  {
    id: 'zone5',
    name: 'Zone 5 — Far East',
    areas: ['Ajah', 'Sangotedo', 'Awoyaya'],
    minFee: 7000,
    maxFee: 8000,
    displayFee: '₦7,000–₦8,000',
    estimatedDelivery: '2–3 business days'
  },
  {
    id: 'zone6',
    name: 'Zone 6 — Far Lagos',
    areas: ['Ikorodu', 'Festac', 'Amuwo', 'Apapa'],
    minFee: 8000,
    maxFee: null,
    displayFee: 'From ₦8,000',
    estimatedDelivery: '2–4 business days'
  }
];

const UB_SHIPPING_NOTE = 'Delivery fees are based on your delivery location and may vary depending on the exact address, courier availability, package size, and delivery conditions.';

/* Reference shape only -- not populated yet. A future backend service
   would store real per-order courier cost here, kept internal, so
   shippingMargin (customer fee minus courier cost) can be computed
   without ever exposing courier cost to the frontend. */
const UB_COURIER_COST_PLACEHOLDER = {
  provider: null,      // e.g. 'GIGL' | 'Kwik' | ...
  cost: null,          // actual amount Unbound pays the courier
  quotedAt: null
};
function ubCalculateShippingMargin(_orderId){
  // Not implemented -- requires a backend with real courier cost data.
  return null;
}

/* Approximate centroids for zones 1-5, used only as a distance-based
   fallback when keyword matching finds nothing. Zone 6 is a scattered
   catch-all (Ikorodu, Festac, Amuwo, Apapa aren't geographically
   contiguous) so it's handled by keyword match + bounding-box fallback
   rather than a centroid. */
const UB_ZONE_CENTROIDS = {
  zone1: {lat: 6.6350, lon: 3.3800},
  zone2: {lat: 6.5940, lon: 3.3450},
  zone3: {lat: 6.4500, lon: 3.4100},
  zone4: {lat: 6.4400, lon: 3.4700},
  zone5: {lat: 6.4650, lon: 3.5700}
};

/* Rough Lagos metro bounding box -- used only to decide between
   "Far Lagos" (zone6) and OUT_OF_AREA when no keyword or nearby
   centroid match is found. */
const LAGOS_BOUNDS = {latMin: 6.35, latMax: 6.75, lonMin: 3.05, lonMax: 3.75};

function ubGetShippingZone(zoneId){
  return UB_SHIPPING_ZONES.find(z => z.id === zoneId) || null;
}

function ubHaversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ============================================================
   getDeliveryZone(latitude, longitude, addressText)
   The single reusable classification function. Returns:
     {zoneId, zoneName, estimatedFee, estimatedDeliveryTime, confidence}
   or {zoneId: 'OUT_OF_AREA'}
   confidence: 'high' | 'medium' | 'low'
   ============================================================ */
function getDeliveryZone(latitude, longitude, addressText){
  const text = (addressText || '').toLowerCase();

  // Step 1: curated keyword match against each zone's known areas.
  for(const zone of UB_SHIPPING_ZONES){
    const hit = zone.areas.some(area => text.includes(area.toLowerCase()));
    if(hit){
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        estimatedFee: zone.displayFee,
        estimatedDeliveryTime: zone.estimatedDelivery,
        confidence: 'high'
      };
    }
  }

  // Step 2: no keyword match -- fall back to nearest centroid (zones 1-5).
  if(typeof latitude === 'number' && typeof longitude === 'number'){
    let nearest = null, nearestDist = Infinity, secondDist = Infinity;
    for(const zoneId in UB_ZONE_CENTROIDS){
      const c = UB_ZONE_CENTROIDS[zoneId];
      const d = ubHaversineKm(latitude, longitude, c.lat, c.lon);
      if(d < nearestDist){
        secondDist = nearestDist;
        nearestDist = d;
        nearest = zoneId;
      }else if(d < secondDist){
        secondDist = d;
      }
    }

    const withinLagos =
      latitude >= LAGOS_BOUNDS.latMin && latitude <= LAGOS_BOUNDS.latMax &&
      longitude >= LAGOS_BOUNDS.lonMin && longitude <= LAGOS_BOUNDS.lonMax;

    if(nearest && nearestDist <= 6){
      const zone = ubGetShippingZone(nearest);
      return {
        zoneId: zone.id, zoneName: zone.name, estimatedFee: zone.displayFee,
        estimatedDeliveryTime: zone.estimatedDelivery, confidence: 'high'
      };
    }
    if(nearest && nearestDist <= 12){
      // close, but ambiguous if two zones are nearly equidistant
      const ambiguous = (secondDist - nearestDist) < 2.5;
      const zone = ubGetShippingZone(nearest);
      return {
        zoneId: zone.id, zoneName: zone.name, estimatedFee: zone.displayFee,
        estimatedDeliveryTime: zone.estimatedDelivery,
        confidence: ambiguous ? 'low' : 'medium'
      };
    }
    if(withinLagos){
      const zone = ubGetShippingZone('zone6');
      return {
        zoneId: zone.id, zoneName: zone.name, estimatedFee: zone.displayFee,
        estimatedDeliveryTime: zone.estimatedDelivery, confidence: 'low'
      };
    }
    return {zoneId: 'OUT_OF_AREA'};
  }

  return {zoneId: 'OUT_OF_AREA'};
}

/* ============================================================
   GEOCODING (OpenStreetMap Nominatim -- free, no API key)
   ============================================================ */
async function ubGeocodeSearch(query){
  if(!query || query.trim().length < 3) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ng&q=${encodeURIComponent(query + ', Lagos, Nigeria')}`;
  try{
    const res = await fetch(url, {headers: {'Accept-Language': 'en'}});
    if(!res.ok) return [];
    return await res.json();
  }catch(e){
    return [];
  }
}

async function ubReverseGeocode(lat, lon){
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
  try{
    const res = await fetch(url, {headers: {'Accept-Language': 'en'}});
    if(!res.ok) return null;
    return await res.json();
  }catch(e){
    return null;
  }
}

/* ============================================================
   UI -- address entry, autocomplete, geolocation, confirmation
   ============================================================ */
function ubRenderShippingUI(containerSelector){
  const container = document.querySelector(containerSelector);
  if(!container) return;

  const rows = UB_SHIPPING_ZONES.map(z => `
    <tr data-zone="${z.id}">
      <th scope="row" data-label="Zone">${z.name}</th>
      <td data-label="Areas">${z.areas.join(', ')}</td>
      <td data-label="Delivery Fee" class="ship-fee">${z.displayFee}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="sticker">Unbound Delivery</div>

    <div class="ship-locate">
      <p class="ship-locate-copy">Enter your delivery address, or share your location so we can find your delivery zone automatically. We only use this to calculate your delivery fee — nothing is tracked or stored unless you confirm an order.</p>

      <div class="ship-addr-row">
        <div class="field" style="position:relative; flex:1; margin:0;">
          <label for="shipAddrInput">Delivery address</label>
          <input id="shipAddrInput" type="text" autocomplete="off" placeholder="e.g. 14 Admiralty Way, Lekki Phase 1">
          <div class="ship-suggestions" id="shipSuggestions"></div>
        </div>
        <button type="button" class="btn btn-ghost ship-locate-btn" id="shipLocateBtn">📍 Use my current location</button>
      </div>

      <div class="ship-confirm" id="shipConfirm"></div>
      <div class="ship-result" id="shipResult"></div>
    </div>

    <details class="ship-table-details">
      <summary>Browse all delivery zones</summary>
      <div class="ship-table-wrap">
        <table class="ship-table">
          <thead>
            <tr><th scope="col">Zone</th><th scope="col">Areas</th><th scope="col">Delivery Fee</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>

    <p class="ship-note">${UB_SHIPPING_NOTE}</p>
  `;

  ubWireShippingUI(container);
}

function ubWireShippingUI(container){
  const input = container.querySelector('#shipAddrInput');
  const suggestions = container.querySelector('#shipSuggestions');
  const locateBtn = container.querySelector('#shipLocateBtn');
  const confirmBox = container.querySelector('#shipConfirm');
  const resultBox = container.querySelector('#shipResult');

  let debounceTimer = null;

  function clearSuggestions(){
    suggestions.innerHTML = '';
    suggestions.classList.remove('show');
  }

  function ubFinalizeZone(zoneResult, label){
    confirmBox.innerHTML = '';
    resultBox.innerHTML = `
      <div class="ship-msg ship-msg-ok">✓ Delivery location confirmed</div>
      <div class="ship-result-card">
        <div class="ship-result-row">📍 <b>${zoneResult.zoneName.replace(/^Zone \d+ — /, '')}</b></div>
        <div class="ship-result-row">🚚 Standard Delivery — <span class="ship-result-fee">${zoneResult.estimatedFee}</span></div>
        <div class="ship-result-row">⏱️ Estimated delivery: ${zoneResult.estimatedDeliveryTime}</div>
        <p class="ship-final-note">Your final delivery fee will be confirmed before dispatch.</p>
      </div>
    `;
    resultBox.classList.add('show');

    if(window.gsap){
      gsap.fromTo(resultBox, {opacity:0, y:10}, {opacity:1, y:0, duration:0.4, ease:'power2.out'});
    }

    // Store only what's needed, and only now that the customer confirmed.
    // No raw lat/lon is persisted -- session-only, in-memory reference.
    window.ubSelectedShipping = {
      address: label,
      zoneId: zoneResult.zoneId,
      zoneName: zoneResult.zoneName,
      fee: zoneResult.estimatedFee,
      estimatedDeliveryTime: zoneResult.estimatedDeliveryTime,
      confirmedAt: new Date().toISOString()
    };
  }

  function showConfidenceState(zoneResult, label){
    confirmBox.innerHTML = '';
    resultBox.innerHTML = '';
    resultBox.classList.remove('show');

    if(zoneResult.zoneId === 'OUT_OF_AREA'){
      resultBox.innerHTML = `<div class="ship-msg ship-msg-warn">Sorry, we don't currently deliver to this location automatically. Please contact Unbound for a custom delivery quote.</div>`;
      resultBox.classList.add('show');
      return;
    }

    if(zoneResult.confidence === 'low'){
      confirmBox.innerHTML = `
        <div class="ship-msg ship-msg-warn">We're not completely sure which delivery zone this address falls into. Please confirm your location or contact Unbound for an exact delivery quote.</div>
        <div class="ship-confirm-actions">
          <button type="button" class="btn btn-primary" id="shipConfirmLowBtn">Use "${zoneResult.zoneName}" anyway</button>
          <button type="button" class="btn btn-ghost" id="shipRetryBtn">Enter Address Manually</button>
        </div>
      `;
      container.querySelector('#shipConfirmLowBtn').addEventListener('click', () => {
        ubFinalizeZone(zoneResult, label);
      });
      container.querySelector('#shipRetryBtn').addEventListener('click', () => {
        confirmBox.innerHTML = '';
        input.value = '';
        input.focus();
      });
      return;
    }

    ubFinalizeZone(zoneResult, label);
  }

  // ---- address autocomplete ----
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value;
    if(q.trim().length < 3){ clearSuggestions(); return; }
    debounceTimer = setTimeout(async () => {
      const results = await ubGeocodeSearch(q);
      if(results.length === 0){ clearSuggestions(); return; }
      suggestions.innerHTML = results.map((r, i) => `
        <div class="ship-suggestion" data-i="${i}">${r.display_name}</div>
      `).join('');
      suggestions.classList.add('show');

      suggestions.querySelectorAll('.ship-suggestion').forEach((el, i) => {
        el.addEventListener('click', () => {
          const r = results[i];
          input.value = r.display_name;
          clearSuggestions();
          const zoneResult = getDeliveryZone(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
          showConfidenceState(zoneResult, r.display_name);
        });
      });
    }, 400); // debounced to respect Nominatim's rate limits
  });

  document.addEventListener('click', (e) => {
    if(!container.contains(e.target)) return;
    if(e.target !== input) clearSuggestions();
  });

  // ---- "use my current location" ----
  locateBtn.addEventListener('click', () => {
    if(!('geolocation' in navigator)){
      resultBox.innerHTML = `<div class="ship-msg ship-msg-warn">Your browser doesn't support location access. Please enter your address manually above.</div>`;
      resultBox.classList.add('show');
      return;
    }
    locateBtn.disabled = true;
    const originalText = locateBtn.textContent;
    locateBtn.textContent = 'Requesting permission...';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        locateBtn.textContent = 'Locating you...';
        const {latitude, longitude} = pos.coords;
        const geo = await ubReverseGeocode(latitude, longitude);
        const label = geo && geo.display_name ? geo.display_name : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

        confirmBox.innerHTML = `
          <div class="ship-msg">📍 Detected: <b>${label}</b></div>
          <p class="ship-confirm-q">Is this your delivery location?</p>
          <div class="ship-confirm-actions">
            <button type="button" class="btn btn-primary" id="shipConfirmGeoBtn">Confirm Location</button>
            <button type="button" class="btn btn-ghost" id="shipManualBtn">Enter Address Manually</button>
          </div>
        `;
        container.querySelector('#shipConfirmGeoBtn').addEventListener('click', () => {
          const zoneResult = getDeliveryZone(latitude, longitude, label);
          showConfidenceState(zoneResult, label);
        });
        container.querySelector('#shipManualBtn').addEventListener('click', () => {
          confirmBox.innerHTML = '';
          input.focus();
        });

        locateBtn.disabled = false;
        locateBtn.textContent = originalText;
      },
      (err) => {
        locateBtn.disabled = false;
        locateBtn.textContent = originalText;
        const msg = err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Please enter your address manually above.'
          : 'Could not detect your location. Please enter your address manually above.';
        resultBox.innerHTML = `<div class="ship-msg ship-msg-warn">${msg}</div>`;
        resultBox.classList.add('show');
      },
      {enableHighAccuracy: false, timeout: 10000}
    );
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ubRenderShippingUI('#shippingSection');
});
