const revealItems = document.querySelectorAll('.reveal');
const CONTACT_EMAIL = 'info@luxtravco.com';

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
      subject: 'Day Rental Request',
      body: 'Hi Luxtravco,\n\nI would like to request a day rental.\n\nThanks!'
    });
    return;
  }

  const fullName = bookingForm.querySelector('[name="fullName"]')?.value.trim();
  const platform = bookingForm.querySelector('[name="platform"]')?.value.trim();
  const rentalDate = bookingForm
    .querySelector('[name="rentalDate"]')
    ?.value.trim();
  const contactNumber = bookingForm
    .querySelector('[name="contactNumber"]')
    ?.value.trim();

  const bodyLines = [
    'Hi Luxtravco,',
    '',
    'I would like to request a day rental.',
    `Name: ${fullName || '—'}`,
    `Platform: ${platform || '—'}`,
    `Rental date: ${rentalDate || '—'}`,
    `Contact number: ${contactNumber || '—'}`,
    '',
    'Thanks!'
  ];

  openEmail({
    subject: 'Day Rental Request',
    body: bodyLines.join('\n')
  });
};

if (bookingButton) {
  bookingButton.addEventListener('click', handleBookingEmail);
}

if (bookingForm) {
  bookingForm.addEventListener('submit', handleBookingEmail);
}
