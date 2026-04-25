const revealItems = document.querySelectorAll('.reveal');
const CONTACT_EMAIL = 'info@luxtravco.com';
const MAPTILER_KEY = 'P5BwAZLxLbVaNx8lbi2W';
const BOOKING_API_URL = 'https://luxtravco-booking.luxtravco1.workers.dev';
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
let customerSession = { email: '', userId: '' };
let bookingAuthReady = false;
let estimateRequestId = 0;
let estimateTimer = null;
let bookingButton = null;
let bookingForm = null;

const getCustomerContext = async () => {
  const client = window.luxSupabaseReady
    ? await window.luxSupabaseReady
    : window.luxSupabase;
  if (!client) return { email: '', userId: '' };
  try {
    const { data } = await client.auth.getSession();
    const session = data?.session;
    return {
      email: session?.user?.email || '',
      userId: session?.user?.id || ''
    };
  } catch (error) {
    return { email: '', userId: '' };
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
  } else {
    submitButton.disabled = false;
    submitButton.dataset.locked = '';
    submitButton.textContent = 'Submit for Review';
  }
};

const refreshBookingAccess = async () => {
  if (!bookingForm) return;
  const customerContext = await getCustomerContext();
  customerSession = customerContext;
  bookingAuthReady = true;
  ensureBookingAuthNotice();
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
    if (useNativeAutocomplete) {
      features.forEach((feature) => {
        const option = document.createElement('option');
        option.value = feature.place_name || feature.text || '';
        list.appendChild(option);
      });
      return;
    }
    features.forEach((feature) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'autocomplete-item';
      button.textContent = feature.place_name || feature.text;
      button.addEventListener('click', () => {
        input.value = feature.place_name || feature.text;
        input.dataset.lat = String(feature.center?.[1] ?? '');
        input.dataset.lng = String(feature.center?.[0] ?? '');
        clearList();
        if (feature.center?.length === 2) {
          updateMapLocation(feature.center[0], feature.center[1]);
        }
        scheduleEstimateUpdate();
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
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchResults(query), 300);
  });

  input.addEventListener('change', () => {
    if (!useNativeAutocomplete) return;
    const match = latestFeatures.find(
      (feature) =>
        (feature.place_name || feature.text || '').trim() === input.value.trim()
    );
    if (match?.center?.length === 2) {
      input.dataset.lat = String(match.center[1]);
      input.dataset.lng = String(match.center[0]);
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
    if (list.children.length) list.style.display = 'block';
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
        toggle.textContent.trim().toLowerCase() === 'hourly'
          ? 'hourly'
          : 'transfer';
      const header = document.querySelector('.map-header');
      if (header) {
        header.textContent =
          bookingMode === 'hourly'
            ? 'Create New Inquiry (Hourly)'
            : 'Create New Inquiry (Transfer)';
      }
      document.body.classList.toggle('booking-hourly', bookingMode === 'hourly');
      const hourlyFields = document.querySelectorAll('.hourly-only');
      hourlyFields.forEach((field) => {
        field.style.display = bookingMode === 'hourly' ? '' : 'none';
      });
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

const setupStops = () => {
  const addStopButton = document.querySelector('[data-action="add-stop"]');
  const locationStack = document.querySelector('.location-stack');
  if (!addStopButton || !locationStack) return;

  addStopButton.addEventListener('click', () => {
    const stopIndex =
      locationStack.querySelectorAll('.location-block.stop').length + 1;
    const stopBlock = document.createElement('div');
    stopBlock.className = 'location-block stop';
    stopBlock.innerHTML = `
      <div class="stop-actions">
        <span class="service-tag">Stop ${stopIndex}</span>
        <button class="remove-stop" type="button">Remove</button>
      </div>
      <label class="autocomplete-field">
        Stop Location
        <input type="text" placeholder="Enter stop location" name="stopLocation${stopIndex}" data-autocomplete="stop-${stopIndex}" data-location-type="all" data-route-point="stop" />
      </label>
    `;
    locationStack.insertBefore(
      stopBlock,
      locationStack.lastElementChild.nextSibling
    );

    const input = stopBlock.querySelector('[data-autocomplete]');
    if (input) setupAutocomplete(input);

    const removeButton = stopBlock.querySelector('.remove-stop');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        stopBlock.remove();
        scheduleEstimateUpdate();
      });
    }
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
  const estimatedTotalCents = verifiedEstimateHours
    ? Math.round(HOURLY_RATE * verifiedEstimateHours * 100)
    : null;

  const payload = {
    full_name: fullName || '',
    pickup_date: pickupDate || '',
    pickup_time: pickupTime || '',
    pickup_location: pickupLocation || '',
    dropoff_location: dropoffLocation || '',
    booking_mode: bookingMode,
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
    stops: Array.from(
      bookingForm.querySelectorAll('input[name^="stopLocation"]')
    )
      .map((input) => ({
        name: input.name,
        value: input.value.trim(),
        lat: input.dataset.lat || '',
        lng: input.dataset.lng || ''
      }))
      .filter((stop) => stop.value)
      .map((stop) => ({
        name: stop.name,
        value: stop.value,
        lat: Number.parseFloat(stop.lat),
        lng: Number.parseFloat(stop.lng)
      })),
    route_points: await resolveRoutePoints()
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
      headers: { 'Content-Type': 'application/json' },
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
    setBookingSubmissionState(true);
    return;
  } catch (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit for Review';
    }
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
  const stopInputs = Array.from(
    bookingForm.querySelectorAll('input[name^="stopLocation"]')
  );

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

  const estimatedTotal = Math.round(estimateHours * HOURLY_RATE * 100) / 100;
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
