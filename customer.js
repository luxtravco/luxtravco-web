document.documentElement.dataset.theme = 'dark';
document.documentElement.style.colorScheme = 'dark';

const BOOKING_API_URL = 'https://luxtravco-booking.luxtravco1.workers.dev';
const TURNSTILE_SITE_KEY = '0x4AAAAAADKgEnWwAtX5Nmju';

const authState = document.getElementById('auth-state');
const authForm = document.getElementById('auth-form');
const authSubmit = document.getElementById('auth-submit');
const authSignout = document.getElementById('auth-signout');
const authTabs = document.querySelectorAll('.auth-tab');
const sendResetButton = document.getElementById('send-reset');
const showResetPanelButton = document.getElementById('show-reset-panel');
const resetPanel = document.getElementById('reset-panel');
const passwordForm = document.getElementById('password-form');
const dashboardPanel = document.getElementById('dashboard-panel');
const dashboardList = document.getElementById('dashboard-list');
const googleOAuthButton = document.getElementById('google-oauth');
const appleOAuthButton = document.getElementById('apple-oauth');
const profilePanel = document.getElementById('profile-panel');
const profileForm = document.getElementById('profile-form');
const profileSubmit = document.getElementById('profile-submit');
const supportForm = document.getElementById('support-form');
const supportBooking = document.getElementById('support-booking');
const supportName = document.getElementById('support-name');
const supportPhone = document.getElementById('support-phone');
const supportState = document.getElementById('support-state');
const supportSubmit = document.getElementById('support-submit');
const supportPolicyToggle = document.getElementById('support-policy-toggle');
const supportPolicy = document.getElementById('support-policy');

let mode = 'sign-in';
let latestBookings = [];

let authTurnstile = null;

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

const initAuthTurnstile = async () => {
  const container = document.getElementById('auth-turnstile');
  if (!container || authTurnstile?.widgetId) return authTurnstile;
  const input = authForm?.querySelector('input[name="turnstile_token"]') || null;
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

  authTurnstile = { widgetId, input };
  return authTurnstile;
};

const getAuthTurnstileToken = async () => {
  const widget = await initAuthTurnstile();
  return String(widget?.input?.value || '').trim();
};

const resetAuthTurnstile = () => {
  if (authTurnstile?.input) authTurnstile.input.value = '';
  if (authTurnstile?.widgetId != null && window.turnstile) {
    window.turnstile.reset(authTurnstile.widgetId);
  }
};

const verifyAuthTurnstile = async () => {
  const token = await getAuthTurnstileToken();
  if (!token) {
    throw new Error('Please complete the security check.');
  }

  const response = await fetch(`${BOOKING_API_URL}/api/turnstile/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || 'Security check failed. Please try again.');
  }

  return token;
};

const setAuthState = (title, detail) => {
  authState.innerHTML = `
    <strong>${title}</strong>
    <span>${detail}</span>
  `;
};

const setSupportState = (title, detail) => {
  if (!supportState) return;
  supportState.innerHTML = `
    <strong>${title}</strong>
    <span>${detail}</span>
  `;
};

const getSupabaseClient = async () => {
  const client = window.luxSupabaseReady
    ? await window.luxSupabaseReady
    : window.luxSupabase;
  if (!client) {
    setAuthState(
      'Auth unavailable',
      'Supabase did not load. Refresh the page and try again.'
    );
  }
  return client;
};

const updateButtonLabel = () => {
  authSubmit.textContent = mode === 'sign-in' ? 'Sign In' : 'Create Account';
  if (authForm) authForm.dataset.mode = mode;
};

const formatAuthError = (error, fallback) => {
  const message = String(error?.message || fallback || 'Unable to complete authentication.');
  const status = Number(error?.status || error?.code || 0);
  if (status === 422 || /weak_password/i.test(message)) {
    return 'Weak password. Use at least one uppercase letter, one lowercase letter, one number, and one special character.';
  }
  return message;
};

const beginOAuth = async (provider, button) => {
  const supabase = await getSupabaseClient();
  if (!supabase || !button) return;

  const label = button.querySelector('span:last-child');
  const originalLabel = label?.textContent || 'Continue';
  button.disabled = true;
  if (label) label.textContent = 'Working...';

  try {
    await verifyAuthTurnstile();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/customer.html`
      }
    });
    if (error) throw error;
    if (data?.url) {
      window.location.href = data.url;
      return;
    }
    throw new Error('Unable to start social sign in.');
  } catch (error) {
    setAuthState('OAuth error', error?.message || 'Unable to start social sign in.');
    resetAuthTurnstile();
    button.disabled = false;
    if (label) label.textContent = originalLabel;
  }
};

const renderDashboard = (bookings) => {
  latestBookings = bookings || [];
  renderSupportBookings(latestBookings);

  if (!bookings.length) {
    dashboardList.innerHTML = `
      <div class="receipt-card">
        <div class="receipt-top">
          <div>
            <strong>No bookings yet</strong>
          </div>
        </div>
        <div class="receipt-note">
          Your recent bookings will appear here after you sign in and book on this account.
        </div>
      </div>
    `;
    return;
  }

  dashboardList.innerHTML = bookings
    .map((booking) => {
      const modeLabel = booking.booking_mode || 'transfer';
      const total =
        booking.estimated_total_cents != null && booking.estimated_total_cents !== ''
          ? `$${(Number(booking.estimated_total_cents) / 100).toFixed(2)}`
          : '—';
      return `
        <div class="receipt-card">
          <div class="receipt-top">
            <div>
              <strong>${booking.full_name || 'Booking'}</strong>
            </div>
            <div class="receipt-no">${booking.payment_status || 'inquiry'}</div>
          </div>
          <div class="receipt-grid">
            <div class="receipt-cell">
              <span>Booked For</span>
              <strong>${booking.pickup_date || '—'}${booking.pickup_time ? ` • ${booking.pickup_time}` : ''}</strong>
            </div>
            <div class="receipt-cell">
              <span>Service</span>
              <strong>${modeLabel}${booking.estimated_hours ? ` • ${booking.estimated_hours} hrs` : ''}</strong>
            </div>
            <div class="receipt-cell">
              <span>Travelers</span>
              <strong>${booking.travelers || '—'}${booking.kids ? ` + ${booking.kids} kids` : ''}</strong>
            </div>
            <div class="receipt-cell">
              <span>Bags</span>
              <strong>${booking.bags || '—'}</strong>
            </div>
          </div>
          <div class="receipt-total">
            <span>Total Due</span>
            <strong>${total}</strong>
          </div>
          <div class="receipt-note">
            Status: ${booking.payment_status || 'inquiry'}${booking.contact_number ? ` • Contact ${booking.contact_number}` : ''}
          </div>
        </div>
      `;
    })
    .join('');
};

const renderSupportBookings = (bookings) => {
  if (!supportBooking) return;
  const currentValue = supportBooking.value;
  supportBooking.innerHTML = '<option value="">General support</option>';
  (bookings || []).forEach((booking) => {
    const option = document.createElement('option');
    option.value = String(booking.id || '');
    option.textContent = `#${booking.id || '—'} • ${booking.pickup_date || 'No date'} • ${booking.full_name || 'Booking'}`;
    supportBooking.appendChild(option);
  });
  if ([...supportBooking.options].some((option) => option.value === currentValue)) {
    supportBooking.value = currentValue;
  }
};

const loadCustomerProfile = async (accessToken) => {
  if (!accessToken) return null;
  const response = await fetch(`${BOOKING_API_URL}/api/customer/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || 'Unable to load customer details.');
  }
  return data.profile || null;
};

const fillProfileForm = (profile, session) => {
  if (!profileForm) return;
  const metadata = session?.user?.user_metadata || {};
  const fullName = profile?.full_name || metadata.full_name || metadata.name || '';
  const phone = profile?.phone || metadata.phone || '';
  const nameInput = profileForm.querySelector('[name="full_name"]');
  const phoneInput = profileForm.querySelector('[name="phone"]');
  if (nameInput && !nameInput.value) nameInput.value = fullName;
  if (phoneInput && !phoneInput.value) phoneInput.value = phone;
};

const syncCustomerProfilePanel = async (session) => {
  if (!profilePanel || !session?.access_token) return null;
  const profile = await loadCustomerProfile(session.access_token);
  fillProfileForm(profile, session);
  profilePanel.classList.toggle('hidden', !profile?.needs_phone);
  return profile;
};

const fillSupportContactFromBooking = () => {
  const bookingId = Number.parseInt(String(supportBooking?.value || ''), 10);
  const booking = latestBookings.find((item) => Number(item.id) === bookingId);
  if (!booking) return;
  if (supportName && !supportName.value) supportName.value = booking.full_name || '';
  if (supportPhone && !supportPhone.value) supportPhone.value = booking.contact_number || '';
};

const loadDashboard = async () => {
  const supabase = await getSupabaseClient();
  if (!supabase || !dashboardPanel) return;
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.access_token) return;

  dashboardPanel.classList.remove('hidden');

  try {
    const response = await fetch(`${BOOKING_API_URL}/api/customer/history`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data?.error || 'Unable to load bookings.');
    }
    renderDashboard(data.bookings || []);
  } catch (error) {
    dashboardList.innerHTML = `
      <div class="dashboard-item">
        <strong>Unable to load bookings</strong>
        <span>${error?.message || 'Try again later.'}</span>
      </div>
    `;
  }
};

const syncSession = async () => {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (session?.user?.email) {
    setAuthState('Signed in', `You are logged in as ${session.user.email}.`);
    setSupportState('Support ready', 'Choose a booking, add details, and send it to Luxtravco support.');
    try {
      const profile = await syncCustomerProfilePanel(session);
      if (profile?.needs_phone) {
        setAuthState('Phone number needed', 'Add your phone number below before submitting a booking.');
      }
    } catch (error) {
      setAuthState('Profile sync issue', error?.message || 'Unable to load customer details.');
    }
    await loadDashboard();
  } else {
    setAuthState('Signed out', 'No customer session is active.');
    setSupportState('Sign in required', 'Sign in first so we can connect the request to your account.');
    profilePanel?.classList.add('hidden');
    dashboardPanel?.classList.add('hidden');
    renderSupportBookings([]);
  }
};

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    authTabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    mode = tab.dataset.mode === 'sign-up' ? 'sign-up' : 'sign-in';
    updateButtonLabel();
    setAuthState(
      mode === 'sign-in' ? 'Sign in ready' : 'Create account ready',
      mode === 'sign-in'
        ? 'Sign in with your email and password.'
        : 'Create your customer account with email and password.'
    );
  });
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const supabase = await getSupabaseClient();
  if (!supabase) return;

  const formData = new FormData(authForm);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  authSubmit.disabled = true;
  authSubmit.textContent = 'Working...';

  try {
    await verifyAuthTurnstile();

    if (mode === 'sign-up') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/customer.html?reset=1`,
          data: {
            full_name: String(formData.get('full_name') || '').trim()
          }
        }
      });
      if (error) throw error;
      setAuthState(
        'Account created',
        'Check your email if confirmation is required, then sign in.'
      );
      authTabs.forEach((item) => item.classList.remove('active'));
      authTabs[0].classList.add('active');
      mode = 'sign-in';
      updateButtonLabel();
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      await syncSession();
    }
  } catch (error) {
    setAuthState('Auth error', formatAuthError(error, 'Unable to complete authentication.'));
  } finally {
    resetAuthTurnstile();
    authSubmit.disabled = false;
    updateButtonLabel();
  }
});

googleOAuthButton?.addEventListener('click', () => beginOAuth('google', googleOAuthButton));
appleOAuthButton?.addEventListener('click', () => beginOAuth('apple', appleOAuthButton));

profileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.access_token) {
    setAuthState('Sign in required', 'Sign in first, then save your phone number.');
    return;
  }

  const formData = new FormData(profileForm);
  const phone = String(formData.get('phone') || '').trim();
  if (!phone) {
    setAuthState('Phone required', 'Enter your phone number before booking.');
    return;
  }

  profileSubmit.disabled = true;
  profileSubmit.textContent = 'Saving...';
  try {
    const response = await fetch(`${BOOKING_API_URL}/api/customer/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        full_name: String(formData.get('full_name') || '').trim(),
        phone
      })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || 'Unable to save customer details.');
    }
    profilePanel.classList.add('hidden');
    setAuthState('Details saved', 'Your customer profile is ready for booking.');
  } catch (error) {
    setAuthState('Profile error', error?.message || 'Unable to save customer details.');
  } finally {
    profileSubmit.disabled = false;
    profileSubmit.textContent = 'Save Details';
  }
});

supportBooking?.addEventListener('change', fillSupportContactFromBooking);

supportPolicyToggle?.addEventListener('click', () => {
  supportPolicy?.classList.toggle('hidden');
});

supportForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const supabase = await getSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.access_token) {
    setSupportState('Sign in required', 'Sign in first, then send your support request.');
    return;
  }

  const formData = new FormData(supportForm);
  const details = String(formData.get('details') || '').trim();
  if (!details) {
    setSupportState('Details needed', 'Add a short explanation before sending.');
    return;
  }

  supportSubmit.disabled = true;
  supportSubmit.textContent = 'Sending...';

  try {
    const response = await fetch(`${BOOKING_API_URL}/api/customer/support`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        booking_id: formData.get('booking_id') || null,
        customer_name: String(formData.get('customer_name') || '').trim(),
        customer_email: session.user?.email || '',
        customer_phone: String(formData.get('customer_phone') || '').trim(),
        issue_type: String(formData.get('issue_type') || 'General support').trim(),
        details
      })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || 'Unable to send support request.');
    }
    supportForm.reset();
    renderSupportBookings(latestBookings);
    setSupportState('Support request sent', result?.id ? `Case #${result.id} was sent to Luxtravco.` : 'Your request was sent to Luxtravco.');
  } catch (error) {
    setSupportState('Support error', error?.message || 'Unable to send support request.');
  } finally {
    supportSubmit.disabled = false;
    supportSubmit.textContent = 'Send Support Request';
  }
});

authSignout.addEventListener('click', async () => {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  authSignout.disabled = true;
  try {
    await supabase.auth.signOut();
    await syncSession();
  } catch (error) {
    setAuthState('Sign out error', error?.message || 'Unable to sign out.');
  } finally {
    authSignout.disabled = false;
  }
});

sendResetButton.addEventListener('click', async () => {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const email = String(new FormData(authForm).get('email') || '').trim();
  if (!email) {
    setAuthState('Reset email needed', 'Enter your email address first, then request a reset.');
    return;
  }

  try {
    await verifyAuthTurnstile();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/customer.html?reset=1`
    });
    if (error) throw error;
    setAuthState(
      'Reset email sent',
      'Check your inbox, then open the reset link and choose a new password.'
    );
  } catch (error) {
    setAuthState('Reset error', formatAuthError(error, 'Unable to send password reset email.'));
  } finally {
    resetAuthTurnstile();
  }
});

showResetPanelButton.addEventListener('click', async () => {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.user?.email) {
    setAuthState('Sign in required', 'Sign in first, then use the reset panel to update your password.');
    resetPanel?.classList.remove('hidden');
    return;
  }
  resetPanel?.classList.remove('hidden');
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const supabase = await getSupabaseClient();
  if (!supabase) return;

  const formData = new FormData(passwordForm);
  const newPassword = String(formData.get('newPassword') || '');
  if (newPassword.length < 8) {
    setAuthState('Password too short', 'Use at least 8 characters.');
    return;
  }

  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setAuthState('Password updated', 'Your password has been changed.');
    passwordForm.reset();
    resetPanel?.classList.add('hidden');
  } catch (error) {
    setAuthState('Update error', formatAuthError(error, 'Unable to update password.'));
  }
});

getSupabaseClient().then((supabase) => {
  if (supabase) {
    supabase.auth.onAuthStateChange(() => {
      syncSession();
    });
  }
});

if (new URLSearchParams(window.location.search).get('reset') === '1') {
  resetPanel?.classList.remove('hidden');
}

updateButtonLabel();
syncSession();

void initAuthTurnstile();
