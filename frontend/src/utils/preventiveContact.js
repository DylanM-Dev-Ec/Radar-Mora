/** Normaliza teléfono ecuatoriano para enlaces wa.me (593…). */
export function normalizeEcuadorPhone(telefono) {
  if (!telefono) return '';
  const digits = String(telefono).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('593')) return digits;
  if (digits.startsWith('0')) return `593${digits.slice(1)}`;
  if (digits.length === 9) return `593${digits}`;
  return digits;
}

export function buildPreventiveCuotaSmsMessage(item) {
  const nombre = item?.socio_nombre || 'estimado socio';
  const monto = (item?.monto_esperado || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
  const cuota = item?.num_cuota != null ? `N° ${item.num_cuota}` : '';
  const fecha = item?.fecha_esperada || 'en los próximos días';
  return (
    `Estimado/a *${nombre}*, le saludamos de *Cooperativa Tulcán*. ` +
    `Le recordamos su cuota ${cuota} por $${monto} con vencimiento ${fecha}. ` +
    'Realice su pago a tiempo para mantener su historial al día. ¿Requiere apoyo? Responda este mensaje.'
  );
}

/** Abre WhatsApp (web o app) con mensaje de recordatorio de cuota. */
export function openWhatsAppPreventiva(item) {
  const phone = normalizeEcuadorPhone(item?.socio_telefono);
  if (!phone) {
    window.alert('No hay teléfono registrado para este socio. Use llamada o correo.');
    return false;
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildPreventiveCuotaSmsMessage(item))}`;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.href = url;
  }
  return true;
}

export function whatsAppHref(item) {
  const phone = normalizeEcuadorPhone(item?.socio_telefono);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildPreventiveCuotaSmsMessage(item))}`;
}
