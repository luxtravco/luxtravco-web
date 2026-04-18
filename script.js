const revealItems = document.querySelectorAll('.reveal');
const CONTACT_EMAIL = 'info@luxtravco.com';
const MAPTILER_KEY = 'P5BwAZLxLbVaNx8lbi2W';
const BOOKING_API_URL = 'https://luxtravco-booking.luxtravco1.workers.dev';
const CHAT_API_URL = `${BOOKING_API_URL}/api/chat`;
const CHAT_STORAGE_KEY = 'luxtravco-chat-history';
const HOURLY_RATE = 79;
const ESTIMATE_SPEED_MPH = 28;
const ESTIMATE_MINUTES_BUFFER = 18;
const ESTIMATE_MINUTES_PER_STOP = 8;
const CHAT_WELCOME_MESSAGE =
  'Hi, I’m LuxAI. I can answer questions about pricing, service area, reservations, and contact details. For contact, use info@luxtravco.com or (909) 235-0670. I’m not a live person, and I do not process payments in chat.';

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

  const list = document.createElement('div');
  list.className = 'autocomplete-list';
  wrapper.appendChild(list);

  let debounceTimer;
  let lastQuery = '';

  const clearList = () => {
    list.innerHTML = '';
    list.style.display = 'none';
  };

  const renderResults = (features) => {
    clearList();
    if (!features.length) return;
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
        updateEstimateDisplay();
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
    updateEstimateDisplay();
    if (query.length < 3) {
      clearList();
      return;
    }
    if (query === lastQuery) return;
    lastQuery = query;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchResults(query), 300);
  });

  input.addEventListener('blur', () => {
    setTimeout(clearList, 200);
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
        submitButton.textContent =
          bookingMode === 'hourly' ? 'Continue to Payment' : 'Submit Request';
      }
      updateEstimateDisplay();
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
        updateEstimateDisplay();
      });
    }
  });
};

setupLocationTabs();
setupBookingTabs();
setupStops();
document.body.classList.toggle('booking-hourly', bookingMode === 'hourly');
document.querySelectorAll('.hourly-only').forEach((field) => {
  field.style.display = 'none';
});
updateEstimateDisplay();

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

const bookingButton = document.querySelector('[data-action="email-form"]');
const bookingForm = bookingButton?.closest('form');

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
  if (bookingMode === 'hourly' && !currentEstimateHours) {
    alert('Please select pickup and dropoff locations so we can estimate the trip.');
    return;
  }

  const customerContext = await getCustomerContext();
  const estimatedTotalCents = currentEstimateHours
    ? Math.round(HOURLY_RATE * currentEstimateHours * 100)
    : null;

  const payload = {
    full_name: fullName || '',
    pickup_date: pickupDate || '',
    pickup_time: pickupTime || '',
    pickup_location: pickupLocation || '',
    dropoff_location: dropoffLocation || '',
    booking_mode: bookingMode,
    estimated_hours: currentEstimateHours || '',
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
    route_points: extractRoutePoints()
  };

  const submitButton = bookingForm.querySelector('[data-action="email-form"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
  }

  try {
    const response = await fetch(BOOKING_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Request failed');
    }

    const data = await response.json();

    if (bookingMode === 'hourly') {
      if (!data.checkout_url) {
        throw new Error('Payment session not created');
      }
      window.location.href = data.checkout_url;
      return;
    }

    if (submitButton) {
      submitButton.textContent =
        bookingMode === 'hourly' ? 'Redirecting...' : 'Request Sent';
    }
    bookingForm.reset();
  } catch (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Request';
    }
    alert(
      bookingMode === 'hourly'
        ? 'Sorry, we could not start payment. Please try again.'
        : 'Sorry, we could not submit your request. Please try again.'
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
      updateEstimateDisplay();
    }, 0);
  });
}

const loadChatHistory = () => {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          item.content.trim().length
      )
      .slice(-20);
  } catch (error) {
    return [];
  }
};

const saveChatHistory = (history) => {
  try {
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history.slice(-20)));
  } catch (error) {
    // Ignore sessionStorage failures.
  }
};

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

const updateEstimateDisplay = () => {
  const estimateHoursEl = document.getElementById('estimated-hours');
  const estimateTotalEl = document.getElementById('estimated-total');
  if (!estimateHoursEl || !estimateTotalEl) return;

  if (bookingMode !== 'hourly') {
    estimateHoursEl.textContent = 'Transfer inquiry';
    estimateTotalEl.textContent = '$0.00';
    currentEstimateHours = null;
    return;
  }

  const estimateHours = calculateEstimateHours(extractRoutePoints());
  currentEstimateHours = estimateHours;
  if (!estimateHours) {
    estimateHoursEl.textContent = 'Select locations';
    estimateTotalEl.textContent = '$0.00';
    return;
  }

  const estimatedTotal = Math.round(estimateHours * HOURLY_RATE * 100) / 100;
  estimateHoursEl.textContent = formatEstimateHours(estimateHours);
  estimateTotalEl.textContent = `$${estimatedTotal.toFixed(2)}`;
};

const createChatBubble = (message) => {
  const bubble = document.createElement('div');
  bubble.className = `lux-chat-message ${message.role}`;

  const label = document.createElement('span');
  label.className = 'lux-chat-label';
      label.textContent = message.role === 'assistant' ? 'LuxAI' : 'You';

  const text = document.createElement('p');
  text.textContent = message.content;

  bubble.appendChild(label);
  bubble.appendChild(text);
  return bubble;
};

const renderChatHistory = (log, history) => {
  log.innerHTML = '';
  history.forEach((message) => {
    log.appendChild(createChatBubble(message));
  });
  log.scrollTop = log.scrollHeight;
};

const initCustomerChat = () => {
  if (document.getElementById('lux-chat-widget')) return;

  const widget = document.createElement('div');
  widget.id = 'lux-chat-widget';
  widget.className = 'lux-chat-widget';
  widget.innerHTML = `
    <button class="lux-chat-launch" type="button" aria-expanded="false" aria-controls="lux-chat-panel">
      <span>LuxAI Chat</span>
      <small>24/7</small>
    </button>
    <section class="lux-chat-panel" id="lux-chat-panel" hidden aria-label="Customer chat">
      <header class="lux-chat-header">
        <div>
          <strong>Luxtravco AI</strong>
          <small>Powered by LuxAI</small>
        </div>
        <button class="lux-chat-close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="lux-chat-log" aria-live="polite"></div>
      <form class="lux-chat-form">
        <input
          type="text"
          name="chatMessage"
          placeholder="Ask about pricing, service area, or booking..."
          autocomplete="off"
        />
        <button type="submit">Send</button>
      </form>
      <div class="lux-chat-actions">
        <a class="lux-chat-action" href="mailto:info@luxtravco.com">Email</a>
        <a class="lux-chat-action" href="tel:+19092350670">Call</a>
      </div>
      <div class="lux-chat-hint">Powered by LuxAI. AI assistance only. No live agent.</div>
    </section>
  `;

  document.body.appendChild(widget);

  const launchButton = widget.querySelector('.lux-chat-launch');
  const panel = widget.querySelector('.lux-chat-panel');
  const closeButton = widget.querySelector('.lux-chat-close');
  const form = widget.querySelector('.lux-chat-form');
  const input = widget.querySelector('[name="chatMessage"]');
  const log = widget.querySelector('.lux-chat-log');
  let closeTimer;

  let history = loadChatHistory();
  if (!history.length) {
    history = [{ role: 'assistant', content: CHAT_WELCOME_MESSAGE }];
  }
  renderChatHistory(log, history);

  const openPanel = () => {
    clearTimeout(closeTimer);
    panel.hidden = false;
    widget.classList.add('open');
    panel.classList.remove('is-closing');
    launchButton.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => input?.focus());
  };

  const closePanel = () => {
    if (panel.hidden) return;
    widget.classList.remove('open');
    panel.classList.add('is-closing');
    launchButton.setAttribute('aria-expanded', 'false');
    closeTimer = window.setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove('is-closing');
    }, 220);
  };

  launchButton.addEventListener('click', () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });

  closeButton.addEventListener('click', closePanel);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    const submitButton = form.querySelector('button[type="submit"]');
    const userMessage = { role: 'user', content: message };
    const requestHistory = history.slice(-12);

    history = [...history, userMessage];
    saveChatHistory(history);
    renderChatHistory(log, history);

    input.value = '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = '...';
    }

    const pending = document.createElement('div');
    pending.className = 'lux-chat-message assistant typing';
    pending.innerHTML = '<span class="lux-chat-label">LuxAI</span><p>Thinking...</p>';
    log.appendChild(pending);
    log.scrollTop = log.scrollHeight;

    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: requestHistory
        })
      });

      const data = await response.json();
      pending.remove();

      if (!response.ok || !data.ok) {
        throw new Error(data?.error || 'Chat request failed');
      }

      const assistantMessage = {
        role: 'assistant',
        content:
          data.reply ||
          'I can help with that. Please use the booking form for reservations.'
      };
      history = [...history, assistantMessage];
      saveChatHistory(history);
      renderChatHistory(log, history);
      openPanel();
    } catch (error) {
      pending.remove();
      const fallbackMessage = {
        role: 'assistant',
        content:
          'I could not connect to the AI assistant. Please call (909) 235-0670 or use the booking form.'
      };
      history = [...history, fallbackMessage];
      saveChatHistory(history);
      renderChatHistory(log, history);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Send';
      }
      openPanel();
    }
  });
};

initCustomerChat();
