document.documentElement.dataset.theme = 'dark';
document.documentElement.style.colorScheme = 'dark';

const revealItems = document.querySelectorAll('.reveal');
const CONTACT_EMAIL = 'info@luxtravco.com';
const MAPTILER_KEY = 'P5BwAZLxLbVaNx8lbi2W';
const BOOKING_API_URL = 'https://luxtravco-booking.luxtravco1.workers.dev';
const TURNSTILE_SITE_KEY = '0x4AAAAAADKgEnWwAtX5Nmju';
const HOURLY_RATE = 79;
const ESTIMATE_SPEED_MPH = 28;
const ESTIMATE_MINUTES_BUFFER = 18;
const ESTIMATE_MINUTES_PER_STOP = 8;
const PROMO_CODES = {
  '10OFF': { type: 'percent', amount: 10, label: '10% off' },
  '149LAX': { type: 'fixed_route_total', amountCents: 14900, routeMatch: 'LAX', label: '$149 LAX' },
  '99SNA': { type: 'fixed_route_total', amountCents: 9900, routeMatch: 'SNA', label: '$99 SNA' }
};

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

revealItems.forEach((item) => observer.observe(item));
document.documentElement.classList.add('js-ready');

let bookingMap;
let bookingMarker;
let bookingMode = 'transfer';
let currentEstimateHours = null;
let customerSession = { email: '', userId: '', accessToken: '', profile: null, needsPhone: false };
let bookingAuthReady = false;
let estimateRequestId = 0;
let estimateTimer = null;
let currentEstimateMiles = null;
let bookingButton = null;
let bookingForm = null;
let bookingTurnstile = null;
let appliedPromoCode = '';

const waitForTurnstile = () =>
  new Promise((resolve) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (window.turnstile || Date.now() - startedAt > 10000) {
        window.clearInterval(timer);
        resolve(window.turnstile || null);
      }
    }, 100);
  });

const initBookingTurnstile = async () => {
  const container = document.getElementById('booking-turnstile');
  if (!container || bookingTurnstile?.widgetId) return bookingTurnstile;
  const input = bookingForm?.querySelector('input[name="turnstile_token"]') || null;
  const api = await waitForTurnstile();
  if (!api) return null;

  const widgetId = api.render(container, {
    sitekey: TURNSTILE_SITE_KEY,
    theme: 'dark',
    appearance: 'always',
    callback: (token) => {
      if (input) input.value = token || '';
    },
    'expired-callback': () => {
      if (input) input.value = '';
    },
    'error-callback': () => {
      if (input) input.value = '';
    }
  });

  bookingTurnstile = { widgetId, input };
  return bookingTurnstile;
};

const getBookingTurnstileToken = async () => {
  const widget = await initBookingTurnstile();
  return String(widget?.input?.value || '').trim();
};

const resetBookingTurnstile = () => {
  if (bookingTurnstile?.input) bookingTurnstile.input.value = '';
  if (bookingTurnstile?.widgetId != null && window.turnstile) {
    window.turnstile.reset(bookingTurnstile.widgetId);
  }
};
let pricingState = {
  hourlyRate: HOURLY_RATE,
  serviceTypes: ['Executive Black SUV', 'Black Luxury Sedan'],
  defaultServiceType: 'Executive Black SUV',
  featuredRoutes: [
    { label: 'LGB → Disneyland', price: 98, image_url: '' },
    { label: 'ONT → Palm Springs', price: 399, image_url: '' },
    { label: 'LAX → Palm Springs', price: 599, image_url: '' },
    { label: 'OC → Vegas', price: 1199, image_url: '' }
  ],
  promoCodes: { ...PROMO_CODES }
};

const preferredServiceTypes = ['Executive Black SUV', 'Black Luxury Sedan'];

const getSelectedServiceType = () =>
  bookingForm?.querySelector('[name="serviceType"]')?.value.trim() ||
  pricingState.defaultServiceType ||
  preferredServiceTypes[0];

const serviceMileRate = (serviceType) => {
  const normalized = String(serviceType || '').toLowerCase();
  if (normalized.includes('sedan')) return 3;
  return 4;
};

const calculateTripBaseTotal = ({ hours, miles, serviceType }) => {
  if (!Number.isFinite(hours) || !Number.isFinite(miles)) return null;
  const hourlyTotal = hours * pricingState.hourlyRate;
  const mileageTotal = miles * serviceMileRate(serviceType);
  return Math.round((hourlyTotal + mileageTotal) * 100) / 100;
};

const syncServiceTypeField = () => {
  const fields = document.querySelectorAll('[name="serviceType"]');
  const cards = document.querySelectorAll('[data-service-type]');
  if (!fields.length && !cards.length) return;
  const options = Array.isArray(pricingState.serviceTypes) && pricingState.serviceTypes.length
    ? pricingState.serviceTypes
    : preferredServiceTypes;
  const defaultValue = options.includes(pricingState.defaultServiceType)
    ? pricingState.defaultServiceType
    : preferredServiceTypes.find((option) => options.includes(option)) || options[0];
  const currentValue = options.includes(getSelectedServiceType())
    ? getSelectedServiceType()
    : defaultValue;

  fields.forEach((field) => {
    if (field.tagName === 'SELECT') {
      field.innerHTML = options
        .map((option) => `<option value="${option}">${option}</option>`)
        .join('');
    }
    field.value = currentValue;
  });

  cards.forEach((card) => {
    const isActive = card.dataset.serviceType === currentValue;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
};

const getCustomerContext = async () => {
  const client = window.luxSupabaseReady
    ? await window.luxSupabaseReady
    : window.luxSupabase;
  if (!client) return { email: '', userId: '', accessToken: '' };
  try {
    const { data } = await client.auth.getSession();
    const session = data?.session;
    const accessToken = session?.access_token || '';
    let profile = null;
    let needsPhone = false;
    if (accessToken) {
      try {
        profile = await loadCustomerProfile(accessToken);
        needsPhone = Boolean(profile?.needs_phone);
      } catch (error) {
        needsPhone = true;
      }
    }
    return {
      email: session?.user?.email || '',
      userId: session?.user?.id || '',
      accessToken,
      profile,
      needsPhone
    };
  } catch (error) {
    return { email: '', userId: '', accessToken: '', profile: null, needsPhone: false };
  }
};

const loadCustomerProfile = async (accessToken) => {
  const response = await fetch(`${BOOKING_API_URL}/api/customer/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || 'Unable to load customer profile.');
  }
  return data.profile || null;
};

const applyCustomerDetailsToBooking = (profile = customerSession.profile) => {
  if (!bookingForm || !profile) return;
  const fullNameInput = bookingForm.querySelector('[name="fullName"]');
  const phoneInput = bookingForm.querySelector('[name="contactNumber"]');
  if (fullNameInput && !fullNameInput.value.trim() && profile.full_name) {
    fullNameInput.value = profile.full_name;
  }
  if (phoneInput && !phoneInput.value.trim() && profile.phone) {
    phoneInput.value = profile.phone;
  }
};

const geocodeLocation = async (query, locationType = 'all') => {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 3) return null;

  const filter = locationType === 'all' ? '' : `&types=${encodeURIComponent(locationType)}`;
  const response = await fetch(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(
      trimmed
    )}.json?key=${MAPTILER_KEY}&limit=1${filter}`
  );
  if (!response.ok) return null;

  const data = await response.json();
  return Array.isArray(data.features) && data.features.length ? data.features[0] : null;
};

const resolveRoutePoints = async () => {
  if (!bookingForm) return [];

  const inputs = Array.from(
    bookingForm.querySelectorAll('[data-route-point]')
  ).filter((input) => input instanceof HTMLInputElement);

  const resolved = [];

  for (const input of inputs) {
    const value = input.value.trim();
    if (!value) continue;

    let lat = Number.parseFloat(input.dataset.lat || '');
    let lng = Number.parseFloat(input.dataset.lng || '');

    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && value.length >= 3) {
      const feature = await geocodeLocation(value, input.dataset.locationType || 'all');
      if (feature?.center?.length === 2) {
        lng = Number(feature.center[0]);
        lat = Number(feature.center[1]);
        input.dataset.lat = String(lat);
        input.dataset.lng = String(lng);
        if (input.closest('.autocomplete-field')?.querySelector('.autocomplete-list')) {
          input.closest('.autocomplete-field').querySelector('.autocomplete-list').style.display = 'none';
        }
      }
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      resolved.push({
        name: input.name || '',
        label: input.dataset.routePoint || '',
        value,
        lat,
        lng
      });
    }
  }

  return resolved;
};

const ensureBookingAuthNotice = () => {
  if (!bookingForm) return null;
  let notice = bookingForm.querySelector('.booking-auth-note');
  if (notice) return notice;

  notice = document.createElement('p');
  notice.className = 'booking-auth-note';
  notice.innerHTML = `
    Sign in or create an account to submit a request.
    <a href="customer.html">Customer Sign In</a>
  `;
  const actions = bookingForm.querySelector('.booking-actions') || bookingForm.lastElementChild;
  if (actions && actions.parentElement === bookingForm) {
    bookingForm.insertBefore(notice, actions);
  } else {
    bookingForm.appendChild(notice);
  }
  return notice;
};

const setBookingSubmissionState = (isSignedIn) => {
  const submitButton = bookingForm?.querySelector('[data-action="email-form"]');
  if (!submitButton) return;

  if (!isSignedIn) {
    submitButton.disabled = true;
    submitButton.textContent = 'Sign In to Submit';
    submitButton.dataset.locked = 'true';
  } else if (customerSession.needsPhone) {
    submitButton.disabled = true;
    submitButton.textContent = 'Add Phone to Submit';
    submitButton.dataset.locked = 'true';
  } else {
    submitButton.disabled = false;
    submitButton.dataset.locked = '';
    submitButton.textContent = 'Submit for Review';
  }
};

const formatPriceValue = (value) => {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return '—';
  return amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
};

const applyPricingLabels = () => {
  syncServiceTypeField();
  document.querySelectorAll('[data-price-hourly]').forEach((node) => {
    node.textContent = `$${formatPriceValue(pricingState.hourlyRate)} / hour`;
  });
  const desktopRoutes = document.getElementById('featured-route-list');
  const mobileRoutes = document.getElementById('mobile-route-list');
  const routeMarkup = pricingState.featuredRoutes
    .map((route, index) => {
      const label = String(route.label || '').trim();
      const price = `$${formatPriceValue(route.price)}`;
      const imageUrl = String(route.image_url || route.imageUrl || '').trim();
      const imageMarkup = imageUrl
        ? `<img class="pricing-card-promo" src="${imageUrl.replace(/"/g, '&quot;')}" alt="${label} promo" loading="lazy" />`
        : '';
      const body = `Hi Luxtravco,%0D%0A%0D%0AI would like to reserve chauffeured service for the ${label} route.%0D%0AName:%0D%0APreferred date/time:%0D%0AContact number:%0D%0A%0D%0AThanks!`;
      const isFeatured = index === 0;
      return {
        desktop: `
          <div class="pricing-card${isFeatured ? ' featured' : ''}">
            <h3>${label}</h3>
            <p>Direct chauffeured service for the ${label} route.</p>
            <span class="price">${price}</span>
            ${imageMarkup}
            <ul>
              <li>Chauffeured Suburban for the route</li>
              <li>Professional presentation standard</li>
              <li>Flat rates managed from Luxtravco admin</li>
            </ul>
            <a
              class="${isFeatured ? 'primary-btn' : 'secondary-btn'}"
              href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                `Reserve ${label} Chauffeured Route`
              )}&body=${body}"
            >
              Reserve This Route
            </a>
          </div>
        `,
        mobile: `
          <div class="card">
            <h3>${label}</h3>
            <strong>${price}</strong>
            <p>Direct chauffeured service for the ${label} route.</p>
            ${imageMarkup}
          </div>
        `
      };
    });
  if (desktopRoutes) {
    desktopRoutes.innerHTML = routeMarkup.map((route) => route.desktop).join('');
  }
  if (mobileRoutes) {
    mobileRoutes.innerHTML = routeMarkup.map((route) => route.mobile).join('');
  }
};

const loadPricingSettings = async () => {
  try {
    const response = await fetch(`${BOOKING_API_URL}/api/pricing`);
    const data = await response.json();
    if (!response.ok || !data?.ok) return;
    const hourlyRate = Number.parseFloat(data?.pricing?.hourly_rate);
    const serviceTypes = Array.isArray(data?.pricing?.service_types)
      ? data.pricing.service_types.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const defaultServiceType = String(data?.pricing?.default_service_type || '').trim();
    const featuredRoutes = Array.isArray(data?.pricing?.featured_routes)
      ? data.pricing.featured_routes
          .map((route) => ({
            label: String(route?.label || '').trim(),
            price: Number.parseFloat(route?.price),
            image_url: String(route?.image_url || route?.imageUrl || '').trim()
          }))
          .filter((route) => route.label && Number.isFinite(route.price) && route.price > 0)
      : [];
    const promoCodes = Array.isArray(data?.pricing?.promo_codes)
      ? data.pricing.promo_codes.reduce((map, promo) => {
          const code = String(promo?.code || '').trim().toUpperCase().replace(/\s+/g, '');
          const type = String(promo?.type || '').trim();
          const percent = Number.parseFloat(promo?.percent);
          const amountCents = Number.parseInt(promo?.amount_cents, 10);
          const routeMatch = String(promo?.route_match || '').trim().toUpperCase();
          const pickupMatch = String(promo?.pickup_match || '').trim();
          const dropoffMatch = String(promo?.dropoff_match || '').trim();
          const pickupCities = Array.isArray(promo?.pickup_cities)
            ? promo.pickup_cities.map((city) => String(city || '').trim()).filter(Boolean)
            : [];
          const roundTripOnly = promo?.round_trip_only === true;
          const roundTripPickupMatch = String(promo?.round_trip_pickup_match || '').trim();
          const roundTripDropoffMatch = String(promo?.round_trip_dropoff_match || '').trim();
          if (code && type === 'fixed_route_total' && Number.isFinite(amountCents) && amountCents > 0 && (routeMatch || dropoffMatch || roundTripPickupMatch || roundTripDropoffMatch)) {
            map[code] = { type, amountCents, routeMatch, pickupMatch, dropoffMatch, pickupCities, roundTripOnly, roundTripPickupMatch, roundTripDropoffMatch, label: `$${(amountCents / 100).toFixed(0)} ${routeMatch || 'route'}` };
          } else if (code && type === 'fixed_discount' && Number.isFinite(amountCents) && amountCents > 0) {
            map[code] = { type, amountCents, pickupMatch, dropoffMatch, pickupCities, roundTripOnly, roundTripPickupMatch, roundTripDropoffMatch, label: `$${(amountCents / 100).toFixed(0)} off` };
          } else if (code && Number.isFinite(percent) && percent > 0 && percent <= 100) {
            map[code] = { type: 'percent', amount: percent, pickupMatch, dropoffMatch, pickupCities, roundTripOnly, roundTripPickupMatch, roundTripDropoffMatch, label: `${percent}% off` };
          }
          return map;
        }, {})
      : {};
    if (Number.isFinite(hourlyRate) && hourlyRate > 0) {
      pricingState.hourlyRate = hourlyRate;
    }
    if (serviceTypes.length) {
      pricingState.serviceTypes = serviceTypes;
      pricingState.defaultServiceType = serviceTypes.includes(defaultServiceType)
        ? defaultServiceType
        : serviceTypes[0];
    }
    if (featuredRoutes.length) {
      pricingState.featuredRoutes = featuredRoutes;
    }
    if (Object.keys(promoCodes).length) {
      pricingState.promoCodes = promoCodes;
    }
    applyPricingLabels();
    scheduleEstimateUpdate();
  } catch (error) {
    applyPricingLabels();
  }
};

const refreshBookingAccess = async () => {
  if (!bookingForm) return;
  const customerContext = await getCustomerContext();
  customerSession = customerContext;
  bookingAuthReady = true;
  applyCustomerDetailsToBooking(customerContext.profile);
  ensureBookingAuthNotice();
  const notice = bookingForm.querySelector('.booking-auth-note');
  if (notice && customerContext.needsPhone) {
    notice.innerHTML = `
      Add your phone number to your customer profile before submitting a request.
      <a href="customer.html">Customer Details</a>
    `;
  }
  setBookingSubmissionState(Boolean(customerContext.email || customerContext.userId));
};

const watchBookingAuth = async () => {
  const client = window.luxSupabaseReady
    ? await window.luxSupabaseReady
    : window.luxSupabase;
  if (!client?.auth?.onAuthStateChange) return;
  client.auth.onAuthStateChange(() => {
    refreshBookingAccess();
  });
};

const initBookingMap = () => {
  if (typeof maplibregl === 'undefined') return;
  const mapTarget = document.getElementById('booking-map');
  if (!mapTarget) return;

  // Default to LAX while waiting for live location inputs.
  bookingMap = new maplibregl.Map({
    container: mapTarget,
    style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
    center: [-118.4085, 33.9416],
    zoom: 9
  });

  bookingMap.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    'top-right'
  );

  bookingMap.once('load', () => {
    const fallback = mapTarget.parentElement?.querySelector('.map-fallback');
    if (fallback) fallback.style.display = 'none';
  });
};

initBookingMap();

const updateMapLocation = (lng, lat) => {
  if (!bookingMap) return;
  bookingMap.flyTo({ center: [lng, lat], zoom: 11, speed: 0.9 });
  if (!bookingMarker) {
    bookingMarker = new maplibregl.Marker({ color: '#f0b247' })
      .setLngLat([lng, lat])
      .addTo(bookingMap);
  } else {
    bookingMarker.setLngLat([lng, lat]);
  }
};

const setupAutocomplete = (input) => {
  const wrapper = input.parentElement;
  if (!wrapper) return;

  const useNativeAutocomplete =
    window.matchMedia('(max-width: 900px)').matches ||
    /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  const list = useNativeAutocomplete
    ? document.createElement('datalist')
    : document.createElement('div');
  list.className = useNativeAutocomplete ? '' : 'autocomplete-list';
  const listId = `autocomplete-${input.name || Math.random().toString(36).slice(2)}`;
  list.id = listId;
  wrapper.appendChild(list);
  if (useNativeAutocomplete) {
    input.setAttribute('list', listId);
    input.setAttribute('autocomplete', 'off');
  }

  let debounceTimer;
  let lastQuery = '';
  let latestFeatures = [];

  const getFeatureLabel = (feature) => {
    const address = String(feature?.address || '').trim();
    const text = String(feature?.text || '').trim();
    const placeName = String(feature?.place_name || '').trim();
    if (address && text) {
      const context = placeName
        .replace(new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s*`, 'i'), '')
        .trim();
      return `${address} ${context}`.trim();
    }
    return placeName || text;
  };

  const clearList = () => {
    list.innerHTML = '';
    if (!useNativeAutocomplete) {
      list.style.display = 'none';
    }
  };

  const renderResults = (features) => {
    latestFeatures = Array.isArray(features) ? features : [];
    clearList();
    if (!features.length) return;
    const chooseFeature = (feature) => {
      const value = getFeatureLabel(feature);
      input.value = value;
      input.dataset.lat = String(feature.center?.[1] ?? '');
      input.dataset.lng = String(feature.center?.[0] ?? '');
      clearList();
      if (feature.center?.length === 2) {
        updateMapLocation(feature.center[0], feature.center[1]);
      }
      scheduleEstimateUpdate();
      const nextName = input.dataset.nextFocus || '';
      const nextInput = nextName ? bookingForm?.querySelector(`[name="${nextName}"]`) : null;
      if (nextInput instanceof HTMLInputElement) {
        nextInput.focus();
      } else {
        input.blur();
      }
    };
    if (useNativeAutocomplete) {
      features.forEach((feature) => {
        const option = document.createElement('option');
        option.value = getFeatureLabel(feature);
        list.appendChild(option);
      });
      return;
    }
    features.forEach((feature) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'autocomplete-item';
      button.textContent = getFeatureLabel(feature);
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        chooseFeature(feature);
      });
      list.appendChild(button);
    });
    list.style.display = 'block';
  };

  const fetchResults = async (query) => {
    const type = input.dataset.locationType || 'all';
    try {
      const filter =
        type === 'all' ? '' : `&types=${encodeURIComponent(type)}`;
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(
          query
        )}.json?key=${MAPTILER_KEY}&limit=5${filter}`
      );
      if (!response.ok) return;
      const data = await response.json();
      renderResults(data.features || []);
    } catch (error) {
      clearList();
    }
  };

  input.addEventListener('input', () => {
    const query = input.value.trim();
    input.dataset.lat = '';
    input.dataset.lng = '';
    scheduleEstimateUpdate();
    if (query.length < 3) {
      clearList();
      return;
    }
    if (query === lastQuery) return;
    lastQuery = query;
    if (useNativeAutocomplete) {
      const normalizedValue = query.toLowerCase();
      const exactMatch = latestFeatures.find((feature) => {
        const label = getFeatureLabel(feature).trim().toLowerCase();
        return label === normalizedValue;
      });
      if (exactMatch?.center?.length === 2) {
        input.dataset.lat = String(exactMatch.center[1]);
        input.dataset.lng = String(exactMatch.center[0]);
        clearList();
        updateMapLocation(exactMatch.center[0], exactMatch.center[1]);
        scheduleEstimateUpdate();
        return;
      }
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchResults(query), 300);
  });

  input.addEventListener('change', () => {
    if (!useNativeAutocomplete) return;
    const normalizedValue = input.value.trim().toLowerCase();
    const match = latestFeatures.find((feature) => {
      const label = getFeatureLabel(feature).trim().toLowerCase();
      return label === normalizedValue || label.startsWith(normalizedValue);
    });
    if (match?.center?.length === 2) {
      input.value = getFeatureLabel(match) || input.value;
      input.dataset.lat = String(match.center[1]);
      input.dataset.lng = String(match.center[0]);
      clearList();
      updateMapLocation(match.center[0], match.center[1]);
      scheduleEstimateUpdate();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(clearList, 200);
    const query = input.value.trim();
    if (query.length >= 3 && (!input.dataset.lat || !input.dataset.lng)) {
      geocodeLocation(query, input.dataset.locationType || 'all')
        .then((feature) => {
          if (feature?.center?.length === 2) {
            input.dataset.lat = String(feature.center[1]);
            input.dataset.lng = String(feature.center[0]);
            scheduleEstimateUpdate();
          }
        })
        .catch(() => {});
    }
  });

  input.addEventListener('focus', () => {
    if (!useNativeAutocomplete && list.children.length) list.style.display = 'block';
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      clearList();
      input.blur();
    }
  });

  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target)) {
      clearList();
    }
  });

};

document
  .querySelectorAll('[data-autocomplete]')
  .forEach((input) => setupAutocomplete(input));

const setupLocationTabs = () => {
  document.querySelectorAll('.location-tabs').forEach((group) => {
    const tabs = group.querySelectorAll('.location-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');
        const input = group.parentElement?.querySelector('[data-autocomplete]');
        if (input) {
          input.dataset.locationType = tab.dataset.type || 'all';
          if (input.value.trim().length >= 3) {
            input.dispatchEvent(new Event('input'));
          }
        }
      });
    });
  });
};

const setupBookingTabs = () => {
  const tabs = document.querySelectorAll('.booking-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const toggles = document.querySelectorAll('.mode-toggle .toggle');
  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      toggles.forEach((item) => item.classList.remove('active'));
      toggle.classList.add('active');
      bookingMode =
        toggle.textContent.trim().toLowerCase() === 'round trip'
          ? 'hourly'
          : 'transfer';
      const header = document.querySelector('.map-header');
      if (header) {
        header.textContent =
          bookingMode === 'hourly'
            ? 'Create New Inquiry (Round Trip)'
            : 'Create New Inquiry (One Way)';
      }
      document.body.classList.toggle('booking-hourly', bookingMode === 'hourly');
      const hourlyFields = document.querySelectorAll('.hourly-only');
      hourlyFields.forEach((field) => {
        field.style.display = bookingMode === 'hourly' ? '' : 'none';
      });
      if (bookingMode === 'hourly') {
        ensureAtLeastOneRoundTripLeg();
      } else {
        clearRoundTripLegs();
      }
      const submitButton = bookingForm?.querySelector('[data-action="email-form"]');
      if (submitButton) {
        if (submitButton.dataset.locked !== 'true') {
          submitButton.textContent = 'Submit for Review';
        }
      }
      scheduleEstimateUpdate();
      setBookingSubmissionState(Boolean(customerSession.email || customerSession.userId));
    });
  });
};

const roundTripStopsContainer = () => document.getElementById('roundtrip-stops');

const ordinalWord = (value) => {
  const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  return words[value - 1] || `${value}th`;
};

const primaryScheduleDefaults = () => ({
  date: bookingForm?.querySelector('[name="pickupDate"]')?.value || '',
  time: bookingForm?.querySelector('[name="pickupTime"]')?.value || ''
});

const getSelectedGratuityPercent = () => {
  const selected = bookingForm?.querySelector('[name="gratuityPercent"]:checked')?.value || '0';
  if (selected === 'custom') {
    const custom = Number.parseFloat(bookingForm?.querySelector('[name="customGratuityPercent"]')?.value || '0');
    return Number.isFinite(custom) ? Math.max(15, custom) : 15;
  }
  return ['0', '15', '25', '50'].includes(selected) ? Number(selected) : 0;
};

const normalizePromoCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const routeMatchAliases = (match) => {
  const normalized = String(match || '').trim().toUpperCase();
  if (!normalized) return [];
  if (normalized === 'LAX') {
    return ['LAX', 'LOS ANGELES INTERNATIONAL AIRPORT', '90045'];
  }
  if (normalized === 'SNA') {
    return ['18601 AIRPORT WAY, SANTA ANA, CA 92707'];
  }
  return [normalized];
};

const destinationMatchesPromo = (promo, destinationText) => {
  const text = String(destinationText || '').toUpperCase();
  const aliases = routeMatchAliases(promo?.routeMatch);
  return !aliases.length || aliases.some((alias) => text.includes(alias));
};

const addressMatchesPromoValue = (actualText, expectedText) => {
  const expected = String(expectedText || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!expected) return true;
  const actual = String(actualText || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return actual.includes(expected);
};

const pickupCityMatchesPromo = (promo, pickupText) => {
  const cities = Array.isArray(promo?.pickupCities) ? promo.pickupCities : [];
  if (!cities.length) return true;
  const actual = String(pickupText || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return cities.some((city) => actual.includes(String(city || '').trim().toUpperCase().replace(/\s+/g, ' ')));
};

const currentRoundTripText = () =>
  Array.from(bookingForm?.querySelectorAll('.roundtrip-leg input[type="text"]') || [])
    .map((input) => input.value || '')
    .join(' ');

const roundTripMatchesPromo = (promo) => {
  const text = currentRoundTripText();
  if (promo?.roundTripOnly && (bookingMode !== 'hourly' || !text.trim())) return false;
  return addressMatchesPromoValue(text, promo?.roundTripPickupMatch) &&
    addressMatchesPromoValue(text, promo?.roundTripDropoffMatch);
};

const addressPairMatchesPromo = (promo, pickupText, destinationText) =>
  pickupCityMatchesPromo(promo, pickupText) &&
  addressMatchesPromoValue(pickupText, promo?.pickupMatch) &&
  addressMatchesPromoValue(destinationText, promo?.dropoffMatch) &&
  roundTripMatchesPromo(promo);

const pickupMatchesAirportPromo = (pickupText) => {
  const text = String(pickupText || '').toUpperCase();
  return text.includes('CORONA') || text.includes('RIVERSIDE');
};

const destinationMatches99Sna = (destinationText) => {
  const text = String(destinationText || '').toUpperCase().replace(/\s+/g, ' ');
  return text.includes('18601 AIRPORT WAY') && text.includes('SANTA ANA') && text.includes('92707');
};

const pickupMatchesSnaAirport = (pickupText) => {
  const text = String(pickupText || '').toUpperCase().replace(/\s+/g, ' ');
  return text.includes('18601 AIRPORT WAY') && text.includes('SANTA ANA') && text.includes('92707');
};

const destinationMatchesDisneyland = (destinationText) => {
  const text = String(destinationText || '').toUpperCase().replace(/\s+/g, ' ');
  return text.includes('1313 DISNEYLAND DR') && text.includes('ANAHEIM') && text.includes('92802');
};

const calculateAutomaticRouteDiscount = (subtotal) => {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  const pickupText = bookingForm?.querySelector('[name="pickupLocation"]')?.value || '';
  const destinationText = bookingForm?.querySelector('[name="dropoffLocation"]')?.value || '';
  if (!pickupMatchesSnaAirport(pickupText) || !destinationMatchesDisneyland(destinationText)) return 0;
  return Math.max(0, subtotal - 75);
};

const calculatePromoDiscount = (subtotal, promoCode = appliedPromoCode) => {
  const normalizedCode = normalizePromoCode(promoCode);
  const promo = pricingState.promoCodes[normalizedCode];
  if (!promo || !Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (promo.type === 'percent') {
    const pickupText = bookingForm?.querySelector('[name="pickupLocation"]')?.value || '';
    const destinationText = bookingForm?.querySelector('[name="dropoffLocation"]')?.value || '';
    if (!addressPairMatchesPromo(promo, pickupText, destinationText)) return 0;
    return Math.round(subtotal * promo.amount) / 100;
  }
  if (promo.type === 'fixed_discount') {
    const pickupText = bookingForm?.querySelector('[name="pickupLocation"]')?.value || '';
    const destinationText = bookingForm?.querySelector('[name="dropoffLocation"]')?.value || '';
    if (!addressPairMatchesPromo(promo, pickupText, destinationText)) return 0;
    return Math.min(subtotal, promo.amountCents / 100);
  }
  if (promo.type === 'fixed_route_total') {
    const pickupText = [
      bookingForm?.querySelector('[name="pickupLocation"]')?.value || ''
    ].join(' ').toUpperCase();
    const destinationText = [
      bookingForm?.querySelector('[name="dropoffLocation"]')?.value || '',
      ...Array.from(bookingForm?.querySelectorAll('.roundtrip-leg input[type="text"]') || []).map((input) => input.value || '')
    ].join(' ').toUpperCase();
    if ((normalizedCode === '149LAX' || normalizedCode === '99SNA') && !pickupMatchesAirportPromo(pickupText)) return 0;
    if (normalizedCode === '99SNA' && !destinationMatches99Sna(destinationText)) return 0;
    if (!addressPairMatchesPromo(promo, pickupText, destinationText)) return 0;
    if (!destinationMatchesPromo(promo, destinationText)) return 0;
    return Math.max(0, subtotal - promo.amountCents / 100);
  }
  return 0;
};

const syncPromoStatus = (message = '') => {
  const field = bookingForm?.querySelector('.promo-code-field');
  const button = bookingForm?.querySelector('[data-action="apply-promo"]');
  const status = document.getElementById('promo-status');
  const hasPromo = Boolean(appliedPromoCode);
  field?.classList.toggle('is-applied', hasPromo);
  if (button) button.textContent = hasPromo ? 'Applied' : 'Apply';
  if (status) {
    status.textContent = message || (hasPromo
      ? `${appliedPromoCode} applied. Your estimate includes the discount.`
      : 'Promo code will apply to your trip estimate.');
  }
};

const applyPromoCode = () => {
  const input = bookingForm?.querySelector('[name="promoCode"]');
  const normalizedCode = normalizePromoCode(input?.value || '');
  if (!normalizedCode) {
    appliedPromoCode = '';
    if (input) input.value = '';
    syncPromoStatus();
    updateEstimateDisplay();
    return;
  }
  if (!pricingState.promoCodes[normalizedCode]) {
    appliedPromoCode = '';
    syncPromoStatus('Promo code not active.');
    updateEstimateDisplay();
    return;
  }
  appliedPromoCode = normalizedCode;
  if (input) input.value = normalizedCode;
  syncPromoStatus();
  updateEstimateDisplay();
};

const clearRoundTripLegs = () => {
  const container = roundTripStopsContainer();
  if (container) container.innerHTML = '';
};

const buildRoundTripLeg = (index) => {
  const legNumber = index + 2;
  const pickupLabel = `${ordinalWord(legNumber)} Pickup`;
  const dropoffLabel = `${ordinalWord(legNumber)} Drop Off`;
  const defaults = primaryScheduleDefaults();
  const block = document.createElement('div');
  block.className = 'roundtrip-leg';
  block.innerHTML = `
    <div class="stop-actions">
      <span class="service-tag">${pickupLabel}</span>
      <button class="remove-stop" type="button">Remove</button>
    </div>
    <div class="roundtrip-leg-grid">
      <label class="autocomplete-field">
        ${pickupLabel}
        <input type="text" placeholder="Enter ${pickupLabel.toLowerCase()} address" name="roundTripPickup${index}" data-autocomplete="roundTripPickup-${index}" data-route-point="pickup" data-next-focus="roundTripDropoff${index}" />
      </label>
      <label class="autocomplete-field">
        ${dropoffLabel}
        <input type="text" placeholder="Enter ${dropoffLabel.toLowerCase()} address" name="roundTripDropoff${index}" data-autocomplete="roundTripDropoff-${index}" data-route-point="dropoff" />
      </label>
    </div>
    <div class="field-row">
      <label>
        ${pickupLabel} Date
        <input type="date" name="roundTripPickupDate${index}" value="${defaults.date}" />
      </label>
      <label>
        ${pickupLabel} Time
        <input type="time" name="roundTripPickupTime${index}" value="${defaults.time}" />
      </label>
    </div>
  `;
  block.querySelectorAll('[data-autocomplete]').forEach((input) => setupAutocomplete(input));
  block.querySelector('.remove-stop')?.addEventListener('click', () => {
    block.remove();
    scheduleEstimateUpdate();
  });
  return block;
};

const ensureAtLeastOneRoundTripLeg = () => {
  const container = roundTripStopsContainer();
  if (!container) return;
  if (!container.children.length) {
    container.appendChild(buildRoundTripLeg(0));
  }
};

const setupStops = () => {
  const addStopButton = document.querySelector('[data-action="add-stop"]');
  const container = roundTripStopsContainer();
  if (!addStopButton || !container) return;

  addStopButton.addEventListener('click', () => {
    const index = container.querySelectorAll('.roundtrip-leg').length;
    container.appendChild(buildRoundTripLeg(index));
    container.querySelector(`[name="roundTripPickup${index}"]`)?.focus();
  });
};

setupLocationTabs();
setupBookingTabs();
setupStops();
ensureBookingAuthNotice();
document.body.classList.toggle('booking-hourly', bookingMode === 'hourly');
document.querySelectorAll('.hourly-only').forEach((field) => {
  field.style.display = 'none';
});
clearRoundTripLegs();
scheduleEstimateUpdate();
refreshBookingAccess();
watchBookingAuth();

const openEmail = ({ subject, body }) => {
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
};

document.querySelectorAll('[data-action="email"]').forEach((button) => {
  button.addEventListener('click', () => {
    const subject = button.dataset.subject || 'Luxtravco Request';
    const body = button.dataset.body
      ? decodeURIComponent(button.dataset.body)
      : 'Hi Luxtravco,\n\nI would like more information.\n\nThanks!';
    openEmail({ subject, body });
  });
});

const callButton = document.querySelector('[data-action="call"]');
if (callButton) {
  callButton.addEventListener('click', () => {
    const phone = callButton.dataset.phone || '+19092350670';
    window.location.href = `tel:${phone}`;
  });
}

bookingButton = document.querySelector('[data-action="email-form"]');
bookingForm = bookingButton?.closest('form');
applyPricingLabels();
loadPricingSettings();

const formatUSPhone = (value) => {
  const digits = value.replace(/\D/g, '');
  let cleaned = digits;
  if (cleaned.startsWith('1')) cleaned = cleaned.slice(1);
  cleaned = cleaned.slice(0, 10);
  if (!cleaned) return '';

  const parts = [];
  if (cleaned.length > 0) {
    parts.push(`(${cleaned.slice(0, Math.min(3, cleaned.length))}`);
    if (cleaned.length >= 3) parts[0] += ')';
  }
  if (cleaned.length > 3) {
    parts.push(` ${cleaned.slice(3, Math.min(6, cleaned.length))}`);
  }
  if (cleaned.length > 6) {
    parts.push(`-${cleaned.slice(6, 10)}`);
  }
  return `+1${parts.join('')}`.trim();
};

const setupPhoneMask = () => {
  const phoneInput = bookingForm?.querySelector('[name="contactNumber"]');
  if (!phoneInput) return;

  phoneInput.addEventListener('input', (event) => {
    if (event.inputType && event.inputType.startsWith('delete')) return;
    phoneInput.value = formatUSPhone(phoneInput.value);
  });
};

setupPhoneMask();

const travelersInput = bookingForm?.querySelector('[name="travelers"]');
const kidsInput = bookingForm?.querySelector('[name="kids"]');
const bagsInput = bookingForm?.querySelector('[name="bags"]');

const clampNumber = (value, min, max) =>
  Math.max(min, Math.min(max, value));

const getInt = (input, fallback) => {
  const parsed = Number.parseInt(input?.value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const enforceCounts = (changed) => {
  if (!travelersInput || !kidsInput || !bagsInput) return;

  let travelers = clampNumber(getInt(travelersInput, 1), 1, 6);
  let kids = clampNumber(getInt(kidsInput, 0), 0, 6);

  if (travelers + kids > 6) {
    if (changed === travelersInput) {
      travelers = Math.max(1, 6 - kids);
    } else if (changed === kidsInput) {
      kids = Math.max(0, 6 - travelers);
    } else {
      kids = Math.max(0, 6 - travelers);
    }
  }

  let bags = clampNumber(getInt(bagsInput, 0), 0, 6);

  travelersInput.value = travelers;
  kidsInput.value = kids;
  bagsInput.value = bags;
};

if (travelersInput && kidsInput && bagsInput) {
  ['input', 'blur'].forEach((evt) => {
    travelersInput.addEventListener(evt, () => enforceCounts(travelersInput));
    kidsInput.addEventListener(evt, () => enforceCounts(kidsInput));
    bagsInput.addEventListener(evt, () => enforceCounts(bagsInput));
  });
}

const handleBookingSubmit = async (event) => {
  if (event) event.preventDefault();
  if (!bookingForm) return;
  const typedPromoCode = normalizePromoCode(bookingForm.querySelector('[name="promoCode"]')?.value || '');
  if (typedPromoCode && pricingState.promoCodes[typedPromoCode] && typedPromoCode !== appliedPromoCode) {
    appliedPromoCode = typedPromoCode;
    const promoInput = bookingForm.querySelector('[name="promoCode"]');
    if (promoInput) promoInput.value = typedPromoCode;
    syncPromoStatus();
  }

  const fullName = bookingForm.querySelector('[name="fullName"]')?.value.trim();
  const pickupDate = bookingForm
    .querySelector('[name="pickupDate"]')
    ?.value.trim();
  const pickupTime = bookingForm
    .querySelector('[name="pickupTime"]')
    ?.value.trim();
  const pickupLocation = bookingForm
    .querySelector('[name="pickupLocation"]')
    ?.value.trim();
  const dropoffLocation = bookingForm
    .querySelector('[name="dropoffLocation"]')
    ?.value.trim();
  const verifiedEstimateHours = await updateEstimateDisplay();

  if (!verifiedEstimateHours) {
    alert('Please select pickup and dropoff locations so we can estimate the trip.');
    return;
  }

  const customerContext = bookingAuthReady ? customerSession : await getCustomerContext();
  if (!customerContext.email && !customerContext.userId) {
    ensureBookingAuthNotice();
    setBookingSubmissionState(false);
    alert('Please sign in or create an account before submitting a request.');
    return;
  }
  if (customerContext.needsPhone) {
    ensureBookingAuthNotice();
    setBookingSubmissionState(true);
    alert('Please add your phone number to your customer details before submitting a request.');
    window.location.href = 'customer.html';
    return;
  }

  const turnstileToken = customerContext.accessToken ? '' : await getBookingTurnstileToken();
  if (!customerContext.accessToken && !turnstileToken) {
    alert('Please complete the security check before submitting.');
    return;
  }

  const estimatedBaseTotal = verifiedEstimateHours && Number.isFinite(currentEstimateMiles)
    ? calculateTripBaseTotal({
        hours: verifiedEstimateHours,
        miles: currentEstimateMiles,
        serviceType: getSelectedServiceType()
      })
    : null;
  const estimatedTotalCents = Number.isFinite(estimatedBaseTotal)
    ? Math.round(estimatedBaseTotal * 100)
    : null;

  const payload = {
    full_name: fullName || '',
    pickup_date: pickupDate || '',
    pickup_time: pickupTime || '',
    pickup_location: pickupLocation || '',
    dropoff_location: dropoffLocation || '',
    booking_mode: bookingMode,
    service_type: getSelectedServiceType(),
    estimated_hours: verifiedEstimateHours || '',
    estimated_total_cents: estimatedTotalCents || '',
    customer_email: customerContext.email || '',
    customer_user_id: customerContext.userId || '',
    travelers: bookingForm.querySelector('[name="travelers"]')?.value.trim() || '',
    kids: bookingForm.querySelector('[name="kids"]')?.value.trim() || '',
    bags: bookingForm.querySelector('[name="bags"]')?.value.trim() || '',
    contact_number: bookingForm
      .querySelector('[name="contactNumber"]')
      ?.value.trim() || '',
    promo_code: appliedPromoCode,
    gratuity_percent: getSelectedGratuityPercent(),
    stops: Array.from(bookingForm.querySelectorAll('.roundtrip-leg')).map((leg, index) => {
      const pickup = leg.querySelector(`[name="roundTripPickup${index}"]`);
      const dropoff = leg.querySelector(`[name="roundTripDropoff${index}"]`);
      const pickupDate = leg.querySelector(`[name="roundTripPickupDate${index}"]`);
      const pickupTime = leg.querySelector(`[name="roundTripPickupTime${index}"]`);
      return {
        pickup: pickup?.value.trim() || '',
        pickup_lat: Number.parseFloat(pickup?.dataset.lat || ''),
        pickup_lng: Number.parseFloat(pickup?.dataset.lng || ''),
        pickup_date: pickupDate?.value.trim() || '',
        pickup_time: pickupTime?.value.trim() || '',
        dropoff: dropoff?.value.trim() || '',
        dropoff_lat: Number.parseFloat(dropoff?.dataset.lat || ''),
        dropoff_lng: Number.parseFloat(dropoff?.dataset.lng || ''),
        dropoff_date: '',
        dropoff_time: ''
      };
    }).filter((stop) => stop.pickup || stop.dropoff),
    route_points: await resolveRoutePoints(),
    turnstile_token: turnstileToken
  };

  const submitButton = bookingForm.querySelector('[data-action="email-form"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
  }

  const statusEl = bookingForm.querySelector('.form-status');
  const setStatus = (message) => {
    if (statusEl) statusEl.textContent = message;
  };

  try {
    const response = await fetch(BOOKING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customerContext.accessToken
          ? { Authorization: `Bearer ${customerContext.accessToken}` }
          : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMessage = 'Request failed';
      try {
        const data = await response.json();
        errorMessage = data?.error || errorMessage;
      } catch (error) {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data?.error || 'Request was not accepted');
    }

    setStatus('Request submitted for review. If approved, payment will be emailed to you.');
    bookingForm.reset();
    resetBookingTurnstile();
    setBookingSubmissionState(true);
    return;
  } catch (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit for Review';
    }
    resetBookingTurnstile();
    const message = error?.message || 'Sorry, we could not create your request at this time.';
    setStatus(message);
    alert(
      message
    );
  }
};

if (bookingButton) {
  bookingButton.addEventListener('click', handleBookingSubmit);
}

if (bookingForm) {
  bookingForm.addEventListener('submit', handleBookingSubmit);
  bookingForm.querySelectorAll('[data-service-type]').forEach((card) => {
    card.addEventListener('click', () => {
      const serviceType = card.dataset.serviceType || pricingState.defaultServiceType;
      bookingForm.querySelectorAll('[name="serviceType"]').forEach((field) => {
        field.value = serviceType;
      });
      syncServiceTypeField();
      updateEstimateDisplay();
    });
  });
  bookingForm.querySelectorAll('[name="gratuityPercent"]').forEach((input) => {
    input.addEventListener('change', () => {
      bookingForm.querySelector('.gratuity-field')?.classList.toggle('is-custom', input.value === 'custom' && input.checked);
      if (input.value === 'custom' && input.checked) {
        const customInput = bookingForm.querySelector('[name="customGratuityPercent"]');
        if (customInput && !customInput.value) customInput.value = '15';
      }
      updateEstimateDisplay();
    });
  });
  bookingForm.querySelector('[name="customGratuityPercent"]')?.addEventListener('input', updateEstimateDisplay);
  bookingForm.querySelector('[data-action="apply-promo"]')?.addEventListener('click', applyPromoCode);
  bookingForm.querySelector('[name="promoCode"]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyPromoCode();
    }
  });
  bookingForm.querySelector('[name="promoCode"]')?.addEventListener('input', () => {
    const normalizedCode = normalizePromoCode(bookingForm.querySelector('[name="promoCode"]')?.value || '');
    if (appliedPromoCode && normalizedCode !== appliedPromoCode) {
      appliedPromoCode = '';
      syncPromoStatus();
      updateEstimateDisplay();
    }
  });
  bookingForm.addEventListener('reset', () => {
    currentEstimateHours = null;
    currentEstimateMiles = null;
    appliedPromoCode = '';
    bookingForm.querySelectorAll('[data-route-point]').forEach((input) => {
      input.dataset.lat = '';
      input.dataset.lng = '';
    });
    setTimeout(() => {
      bookingForm.querySelectorAll('[name="serviceType"]').forEach((field) => {
        field.value = pricingState.defaultServiceType;
      });
      syncServiceTypeField();
      document.body.classList.toggle('booking-hourly', bookingMode === 'hourly');
      bookingForm.querySelector('.gratuity-field')?.classList.remove('is-custom');
      syncPromoStatus();
      applyCustomerDetailsToBooking();
      scheduleEstimateUpdate();
      setBookingSubmissionState(Boolean(customerSession.email || customerSession.userId));
    }, 0);
  });
}

const toRad = (value) => (value * Math.PI) / 180;

const haversineMiles = (a, b) => {
  if (!a || !b) return 0;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value =
    sinLat * sinLat +
    sinLng * sinLng * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(value)));
};

const formatEstimateHours = (hours) => {
  if (!Number.isFinite(hours) || hours <= 0) return 'Select locations';
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} min`;
  }
  return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
};

const extractRoutePoints = () => {
  if (!bookingForm) return [];
  const pickupInput = bookingForm.querySelector('[name="pickupLocation"]');
  const dropoffInput = bookingForm.querySelector('[name="dropoffLocation"]');
  const stopInputs = Array.from(bookingForm.querySelectorAll('.roundtrip-leg [data-route-point]'));

  return [pickupInput, ...stopInputs, dropoffInput]
    .filter(Boolean)
    .map((input) => ({
      name: input.name || '',
      label: input.dataset.routePoint || '',
      value: input.value.trim(),
      lat: Number.parseFloat(input.dataset.lat || ''),
      lng: Number.parseFloat(input.dataset.lng || '')
    }))
    .filter((point) => point.value);
};

const calculateEstimateHours = (points) => {
  const metrics = calculateRouteMetrics(points);
  return metrics ? metrics.hours : null;
};

const calculateRouteMetrics = (points) => {
  const usablePoints = points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
  );

  if (usablePoints.length < 2) return null;

  let miles = 0;
  for (let index = 0; index < usablePoints.length - 1; index += 1) {
    miles += haversineMiles(usablePoints[index], usablePoints[index + 1]);
  }

  const stopCount = Math.max(0, usablePoints.length - 2);
  const drivingMinutes = (miles / ESTIMATE_SPEED_MPH) * 60 * 1.28;
  const totalMinutes =
    drivingMinutes + ESTIMATE_MINUTES_BUFFER + stopCount * ESTIMATE_MINUTES_PER_STOP;
  return {
    hours: Math.max(0.25, totalMinutes / 60),
    miles
  };
};

async function updateEstimateDisplay() {
  const estimateHoursEl = document.getElementById('estimated-hours');
  const estimateTotalEl = document.getElementById('estimated-total');
  const originalTotalEl = document.getElementById('original-total');
  if (!estimateHoursEl || !estimateTotalEl) return;

  const requestId = ++estimateRequestId;

  estimateHoursEl.textContent = 'Estimating...';
  estimateTotalEl.textContent = '$0.00';

  const routeMetrics = calculateRouteMetrics(await resolveRoutePoints());
  if (requestId !== estimateRequestId) return routeMetrics?.hours || null;
  currentEstimateHours = routeMetrics?.hours || null;
  currentEstimateMiles = routeMetrics?.miles || null;
  if (!routeMetrics) {
    estimateHoursEl.textContent = 'Select locations';
    estimateTotalEl.textContent = '$0.00';
    if (originalTotalEl) originalTotalEl.textContent = '$0.00';
    document.querySelectorAll('[data-vehicle-price]').forEach((node) => {
      node.textContent = 'Select route';
    });
    return null;
  }

  document.querySelectorAll('[data-vehicle-price]').forEach((node) => {
    const serviceType = node.dataset.vehiclePrice || pricingState.defaultServiceType;
    const vehicleBase = calculateTripBaseTotal({
      hours: routeMetrics.hours,
      miles: routeMetrics.miles,
      serviceType
    });
    node.textContent = Number.isFinite(vehicleBase) ? `$${(vehicleBase * 1.10).toFixed(2)}` : 'Select route';
  });

  const baseTotal = calculateTripBaseTotal({
    hours: routeMetrics.hours,
    miles: routeMetrics.miles,
    serviceType: getSelectedServiceType()
  });
  const automaticRouteDiscount = calculateAutomaticRouteDiscount(baseTotal);
  const promoDiscount = calculatePromoDiscount(baseTotal);
  const totalDiscount = Math.max(automaticRouteDiscount, promoDiscount);
  const discountedBaseTotal = Math.max(0, baseTotal - totalDiscount);
  const gratuityTotal = Math.round(baseTotal * getSelectedGratuityPercent()) / 100;
  const originalTotal = baseTotal * 1.10 + gratuityTotal;
  const estimatedTotal = discountedBaseTotal + gratuityTotal;
  estimateHoursEl.textContent = formatEstimateHours(routeMetrics.hours);
  if (originalTotalEl) originalTotalEl.textContent = `$${originalTotal.toFixed(2)}`;
  estimateTotalEl.textContent = automaticRouteDiscount > 0 && automaticRouteDiscount >= promoDiscount
    ? `$${estimatedTotal.toFixed(2)} (SNA to Disneyland)`
    : promoDiscount > 0
    ? `$${estimatedTotal.toFixed(2)} (${appliedPromoCode})`
    : `$${estimatedTotal.toFixed(2)}`;
  if (bookingMode !== 'hourly') {
    estimateTotalEl.textContent = `${estimateTotalEl.textContent} estimate`;
  }
  return routeMetrics.hours;
}

function scheduleEstimateUpdate() {
  clearTimeout(estimateTimer);
  estimateTimer = window.setTimeout(() => {
    updateEstimateDisplay();
  }, 180);
}

document.addEventListener('click', (event) => {
  if (!bookingForm) return;
  if (event.target.closest('.autocomplete-field')) return;
  bookingForm.querySelectorAll('.autocomplete-list').forEach((list) => {
    list.style.display = 'none';
  });
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.closest('.autocomplete-field')) {
    const nextFocus = String(active.dataset.nextFocus || '').trim();
    if (nextFocus) {
      bookingForm.querySelector(`[name="${nextFocus}"]`)?.focus();
    } else {
      active.blur();
    }
  }
});

void initBookingTurnstile();
