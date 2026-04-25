const BOOKING_API_URL = 'https://luxtravco-booking.luxtravco1.workers.dev';

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

let mode = 'sign-in';

const setAuthState = (title, detail) => {
  authState.innerHTML = `
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
};

const renderDashboard = (bookings) => {
  if (!bookings.length) {
    dashboardList.innerHTML = `
      <div class="receipt-card">
        <div class="receipt-top">
          <div>
            <strong>No bookings yet</strong>
            <div class="receipt-no">Receipt not available</div>
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
              <strong>${booking.full_name || 'Booking Receipt'}</strong>
              <div class="receipt-no">Receipt #${booking.id || '—'}</div>
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
    await loadDashboard();
  } else {
    setAuthState('Signed out', 'No customer session is active.');
    dashboardPanel?.classList.add('hidden');
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
    if (mode === 'sign-up') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/customer.html?reset=1`
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
    setAuthState('Auth error', error?.message || 'Unable to complete authentication.');
  } finally {
    authSubmit.disabled = false;
    updateButtonLabel();
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/customer.html?reset=1`
    });
    if (error) throw error;
    setAuthState(
      'Reset email sent',
      'Check your inbox, then open the reset link and choose a new password.'
    );
  } catch (error) {
    setAuthState('Reset error', error?.message || 'Unable to send password reset email.');
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
    setAuthState('Update error', error?.message || 'Unable to update password.');
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
