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
let bookingButton = null;
let bookingForm = null;
let bookingTurnstile = null;

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
    { label: 'LGB → Disneyland', price: 98 },
    { label: 'ONT → Palm Springs', price: 399 },
    { label: 'LAX → Palm Springs', price: 599 },
    { label: 'OC → Vegas', price: 1199 }
  ]
};

const syncServiceTypeField = () => {
  const selects = document.querySelectorAll('select[name="serviceType"]');
  if (!selects.length) return;
  const options = Array.isArray(pricingState.serviceTypes) && pricingState.serviceTypes.length
    ? pricingState.serviceTypes
    : ['Executive Black SUV', 'Black Luxury Sedan'];
  const defaultValue = options.includes(pricingState.defaultServiceType)
    ? pricingState.defaultServiceType
    : options[0];
  selects.forEach((select) => {
    const currentValue = options.includes(select.value) ? select.value : defaultValue;
    select.innerHTML = options
      .map((option) => `<option value="${option}">${option}</option>`)
      .join('');
    select.value = currentValue;
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
      const body = `Hi Luxtravco,%0D%0A%0D%0AI would like to reserve chauffeured service for the ${label} route.%0D%0AName:%0D%0APreferred date/time:%0D%0AContact number:%0D%0A%0D%0AThanks!`;
      const isFeatured = index === 0;
      return {
        desktop: `
          <div class="pricing-card${isFeatured ? ' featured' : ''}">
            <h3>${label}</h3>
            <p>Direct chauffeured service for the ${label} route.</p>
            <span class="price">${price}</span>
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
            price: Number.parseFloat(route?.price)
          }))
          .filter((route) => route.label && Number.isFinite(route.price) && route.price > 0)
      : [];
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

  const ensurePrefix = () => {
    if (!phoneInput.value.trim()) {
      phoneInput.value = '+1 ';
    }
  };

  phoneInput.addEventListener('focus', ensurePrefix);

  phoneInput.addEventListener('input', () => {
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

  const estimatedTotalCents = verifiedEstimateHours
    ? Math.round(pricingState.hourlyRate * verifiedEstimateHours * 100)
    : null;

  const payload = {
    full_name: fullName || '',
    pickup_date: pickupDate || '',
    pickup_time: pickupTime || '',
    pickup_location: pickupLocation || '',
    dropoff_location: dropoffLocation || '',
    booking_mode: bookingMode,
    service_type: bookingForm.querySelector('[name="serviceType"]')?.value.trim() || pricingState.defaultServiceType,
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
    promo_code: bookingForm
      .querySelector('[name="promoCode"]')
      ?.value.trim() || '',
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
  bookingForm.addEventListener('reset', () => {
    currentEstimateHours = null;
    bookingForm.querySelectorAll('[data-route-point]').forEach((input) => {
      input.dataset.lat = '';
      input.dataset.lng = '';
    });
    setTimeout(() => {
      const serviceSelect = bookingForm.querySelector('[name="serviceType"]');
      if (serviceSelect) {
        serviceSelect.value = pricingState.defaultServiceType;
      }
      document.body.classList.toggle('booking-hourly', bookingMode === 'hourly');
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
  return Math.max(0.25, totalMinutes / 60);
};

async function updateEstimateDisplay() {
  const estimateHoursEl = document.getElementById('estimated-hours');
  const estimateTotalEl = document.getElementById('estimated-total');
  if (!estimateHoursEl || !estimateTotalEl) return;

  const requestId = ++estimateRequestId;

  estimateHoursEl.textContent = 'Estimating...';
  estimateTotalEl.textContent = '$0.00';

  const estimateHours = await calculateEstimateHours(await resolveRoutePoints());
  if (requestId !== estimateRequestId) return estimateHours;
  currentEstimateHours = estimateHours;
  if (!estimateHours) {
    estimateHoursEl.textContent = 'Select locations';
    estimateTotalEl.textContent = '$0.00';
    return estimateHours;
  }

  const estimatedTotal = Math.round(estimateHours * pricingState.hourlyRate * 100) / 100;
  estimateHoursEl.textContent = formatEstimateHours(estimateHours);
  estimateTotalEl.textContent = `$${estimatedTotal.toFixed(2)}`;
  if (bookingMode !== 'hourly') {
    estimateTotalEl.textContent = `${estimateTotalEl.textContent} estimate`;
  }
  return estimateHours;
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
