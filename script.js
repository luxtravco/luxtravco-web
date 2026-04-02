const revealItems = document.querySelectorAll('.reveal');
const CONTACT_EMAIL = 'info@luxtravco.com';
const MAPTILER_KEY = 'P5BwAZLxLbVaNx8lbi2W';

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

let bookingMap;
let bookingMarker;

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
        clearList();
        if (feature.center?.length === 2) {
          updateMapLocation(feature.center[0], feature.center[1]);
        }
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
      const header = document.querySelector('.map-header');
      if (header) {
        header.textContent =
          toggle.textContent.trim().toLowerCase() === 'hourly'
            ? 'Create New Inquiry (Hourly)'
            : 'Create New Inquiry (Transfer)';
      }
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
        <input type="text" placeholder="Enter stop location" name="stopLocation${stopIndex}" data-autocomplete="stop-${stopIndex}" data-location-type="all" />
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
      });
    }
  });
};

setupLocationTabs();
setupBookingTabs();
setupStops();

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

const handleBookingEmail = (event) => {
  if (event) event.preventDefault();
  if (!bookingForm) {
    openEmail({
      subject: 'Chauffeured Service Inquiry',
      body:
        'Hi Luxtravco,\n\nI would like to inquire about chauffeured service.\n\nThanks!'
    });
    return;
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
  const travelers = bookingForm
    .querySelector('[name="travelers"]')
    ?.value.trim();
  const kids = bookingForm.querySelector('[name="kids"]')?.value.trim();
  const bags = bookingForm.querySelector('[name="bags"]')?.value.trim();
  const contactNumber = bookingForm
    .querySelector('[name="contactNumber"]')
    ?.value.trim();

  const bodyLines = [
    'Hi Luxtravco,',
    '',
    'I would like to inquire about chauffeured service.',
    `Name: ${fullName || '—'}`,
    `Pickup date: ${pickupDate || '—'}`,
    `Pickup time: ${pickupTime || '—'}`,
    `Pickup location: ${pickupLocation || '—'}`,
    `Dropoff location: ${dropoffLocation || '—'}`,
    `Travelers: ${travelers || '—'}`,
    `Kids: ${kids || '—'}`,
    `Bags: ${bags || '—'}`,
    `Contact number: ${contactNumber || '—'}`,
    '',
    'Thanks!'
  ];

  openEmail({
    subject: 'Chauffeured Service Inquiry',
    body: bodyLines.join('\n')
  });
};

if (bookingButton) {
  bookingButton.addEventListener('click', handleBookingEmail);
}

if (bookingForm) {
  bookingForm.addEventListener('submit', handleBookingEmail);
}
